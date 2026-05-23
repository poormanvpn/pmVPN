// SFTP host — owns the forked SFTP workers (one per session)
// MIT License
//
// When the server runs as root, every authenticated session gets a child
// process that setuid()s to its Linux user before doing any fs work. That
// gives us real ownership / permission / quota enforcement on top of the
// existing path sandboxing in sftp.ts.
//
// When the server runs unprivileged (single-user dev), we skip the fork
// and call the in-process sftp.ts functions directly.

import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import readline from 'node:readline';
import { canDropPrivileges, lookupUser } from '../utils/userinfo.js';
import { sftpLs, sftpGet, sftpPut, sftpMkdir, sftpRm, sftpStat } from './sftp.js';
import type { SftpResult } from './sftp.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the worker module. tsx (dev) runs .ts directly; node (prod) runs the
// compiled .js. We try both.
function resolveWorker(): { runner: string; args: string[] } | null {
  const tsCandidate = join(__dirname, 'sftp-worker.ts');
  const jsCandidate = join(__dirname, 'sftp-worker.js');
  if (existsSync(jsCandidate)) {
    return { runner: process.execPath, args: [jsCandidate] };
  }
  if (existsSync(tsCandidate)) {
    // Locate tsx in our local node_modules
    const tsxBin = join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'tsx');
    if (existsSync(tsxBin)) return { runner: tsxBin, args: [tsCandidate] };
    // Fallback to ts-node loader via the current node
    return { runner: process.execPath, args: ['--import', 'tsx', tsCandidate] };
  }
  return null;
}

export type SftpCmd = 'ls' | 'get' | 'put' | 'mkdir' | 'rm' | 'stat';

export interface SftpHost {
  exec(cmd: SftpCmd, path: string, data?: string): Promise<SftpResult>;
  close(): void;
}

interface PendingReply {
  resolve: (value: SftpResult) => void;
  reject: (err: Error) => void;
}

class WorkerHost implements SftpHost {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, PendingReply>();
  private nextId = 1;
  private closed = false;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const { id, result } = JSON.parse(line);
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        p.resolve(result as SftpResult);
      } catch (err: any) {
        logger.warn({ err: err.message, line }, 'sftp-host: bad worker reply');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      logger.warn({ stderr: chunk.toString().trim() }, 'sftp-worker stderr');
    });
    child.on('exit', (code) => {
      this.closed = true;
      for (const p of this.pending.values()) {
        p.reject(new Error(`sftp worker exited (code ${code})`));
      }
      this.pending.clear();
    });
  }

  private send(payload: object): Promise<SftpResult> {
    if (this.closed) return Promise.reject(new Error('sftp worker closed'));
    const id = this.nextId++;
    return new Promise<SftpResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
    });
  }

  init(uid: number, gid: number, homeDir: string): Promise<SftpResult> {
    return this.send({ setuid: { uid, gid, homeDir } });
  }

  exec(cmd: SftpCmd, path: string, data?: string): Promise<SftpResult> {
    return this.send({ cmd, path, data });
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      try { this.child.stdin.end(); } catch {}
      try { this.child.kill(); } catch {}
    }
  }
}

class InProcessHost implements SftpHost {
  constructor(private homeDir: string) {}
  exec(cmd: SftpCmd, path: string, data?: string): Promise<SftpResult> {
    switch (cmd) {
      case 'ls':    return sftpLs   (this.homeDir, path);
      case 'get':   return sftpGet  (this.homeDir, path);
      case 'put':   return sftpPut  (this.homeDir, path, data || '');
      case 'mkdir': return sftpMkdir(this.homeDir, path);
      case 'rm':    return sftpRm   (this.homeDir, path);
      case 'stat':  return sftpStat (this.homeDir, path);
    }
  }
  close(): void { /* nothing to do */ }
}

/**
 * Create an SFTP host for an authenticated session.
 *
 * If we can drop privileges (root + Linux user exists), returns a worker-
 * backed host. Otherwise returns an in-process host using sftp.ts directly.
 */
export async function createSftpHost(username: string, homeDir: string): Promise<SftpHost> {
  const drop = canDropPrivileges();
  const userInfo = drop ? lookupUser(username) : null;

  if (!drop || !userInfo) {
    return new InProcessHost(homeDir);
  }

  const resolved = resolveWorker();
  if (!resolved) {
    logger.warn('sftp worker missing — falling back to in-process (no privilege drop)');
    return new InProcessHost(homeDir);
  }

  const child = spawn(resolved.runner, resolved.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  const host = new WorkerHost(child);
  const initResult = await host.init(userInfo.uid, userInfo.gid, homeDir);
  if (!initResult.ok) {
    host.close();
    logger.warn({ username, error: initResult.error }, 'sftp worker setuid failed — falling back in-process');
    return new InProcessHost(homeDir);
  }
  logger.info({ username, uid: userInfo.uid, gid: userInfo.gid, pid: child.pid }, 'sftp worker started');
  return host;
}

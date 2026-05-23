// SFTP worker — forked child that drops privileges before filesystem access
// MIT License
//
// The parent (running as root) forks this script for each authenticated
// session. The child setuid()s to the session's Linux user and then
// performs every fs operation, so file ownership and Unix permissions are
// actually enforced. Operations come in via JSON-over-IPC on stdin/stdout.
//
// Wire format (one JSON message per line):
//   parent → child: { id, cmd, path, data? }
//   child  → parent: { id, result }
//
// First message is { setuid: { uid, gid, homeDir } } — the child applies it
// once and refuses further uid changes.

import readline from 'node:readline';
import { sftpLs, sftpGet, sftpPut, sftpMkdir, sftpRm, sftpStat } from './sftp.js';

interface IPCRequest {
  id?: number;
  setuid?: { uid: number; gid: number; homeDir: string };
  cmd?: 'ls' | 'get' | 'put' | 'mkdir' | 'rm' | 'stat';
  path?: string;
  data?: string;
}

let homeDir: string | null = null;
let dropped = false;

function send(id: number | undefined, result: unknown): void {
  process.stdout.write(JSON.stringify({ id, result }) + '\n');
}

async function handle(req: IPCRequest): Promise<void> {
  if (req.setuid) {
    if (dropped) {
      send(req.id, { ok: false, error: 'already dropped' });
      return;
    }
    homeDir = req.setuid.homeDir;
    try {
      // gid must drop first — otherwise we lose the privilege to set it.
      if (typeof process.setgroups === 'function') {
        try { process.setgroups([req.setuid.gid]); } catch {}
      }
      if (typeof process.setgid === 'function') process.setgid(req.setuid.gid);
      if (typeof process.setuid === 'function') process.setuid(req.setuid.uid);
      dropped = true;
      send(req.id, { ok: true, uid: process.getuid?.(), gid: process.getgid?.() });
    } catch (err: any) {
      send(req.id, { ok: false, error: err.message });
      process.exit(1);
    }
    return;
  }

  if (!homeDir || !req.cmd) {
    send(req.id, { ok: false, error: 'worker not initialized' });
    return;
  }

  const path = req.path || '/';
  let result;
  switch (req.cmd) {
    case 'ls':    result = await sftpLs   (homeDir, path); break;
    case 'get':   result = await sftpGet  (homeDir, path); break;
    case 'put':   result = await sftpPut  (homeDir, path, req.data || ''); break;
    case 'mkdir': result = await sftpMkdir(homeDir, path); break;
    case 'rm':    result = await sftpRm   (homeDir, path); break;
    case 'stat':  result = await sftpStat (homeDir, path); break;
    default:      result = { ok: false, error: `unknown cmd: ${req.cmd}` };
  }
  send(req.id, result);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let req: IPCRequest;
  try { req = JSON.parse(line); } catch {
    process.stderr.write(`sftp-worker: invalid JSON: ${line}\n`);
    return;
  }
  handle(req).catch((err) => {
    process.stderr.write(`sftp-worker: ${err?.message || err}\n`);
  });
});
rl.on('close', () => process.exit(0));

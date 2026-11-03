// SPDX-License-Identifier: GPL-3.0-only
// PTY shell spawner via node-pty
// MIT License
//
// Spawns a real PTY shell for authenticated users.
// Thank OpenBSD: restricted PATH, explicit environment.

import * as pty from 'node-pty';
import { StringDecoder } from 'node:string_decoder';
import type { ServerChannel } from 'ssh2';
import { logger } from '../utils/logger.js';
import { lookupUser, canDropPrivileges, sessionIdentity } from '../utils/userinfo.js';
import { sessionPath } from '../config/settings.js';

const DEFAULT_SHELL = process.env.PMVPN_SHELL || '/bin/bash';

interface PtyOptions {
  username: string;
  homeDir: string;
  cols?: number;
  rows?: number;
  /** TERM the client asked for. */
  term?: string;
  /** Client variables that passed PMVPN_ACCEPT_ENV. */
  env?: Record<string, string>;
  /** Run this instead of an interactive shell (`ssh -t host cmd`). */
  command?: string;
}

export interface PtySession {
  resize(cols: number, rows: number): void;
  kill(): void;
}

/**
 * Spawn a PTY shell and pipe it to an SSH channel.
 */
export function spawnShell(channel: ServerChannel, opts: PtyOptions): PtySession {
  const { username, homeDir, cols = 80, rows = 24, command } = opts;
  const termName = opts.term && /^[A-Za-z0-9._+-]{1,64}$/.test(opts.term) ? opts.term : 'xterm-256color';

  // Privilege drop: when running as root, run the PTY as the jailed user
  // (uid/gid from /etc/passwd). Refuse to spawn as root if the user exists
  // — running an SSH session as root would defeat the jail.
  const userInfo = lookupUser(username);
  const drop = canDropPrivileges();
  const id = sessionIdentity(username);
  if (!id.ok) {
    logger.error({ username, error: id.error }, 'refusing shell');
    try { channel.stderr.write(`pmvpn: ${id.error}\r\n`); } catch {}
    try { channel.exit(1); channel.close(); } catch {}
    return { resize() {}, kill() {} };
  }

  let term: pty.IPty;
  try {
    term = pty.spawn(userInfo?.shell || DEFAULT_SHELL, command ? ['-c', command] : [], {
    name: termName,
    cols,
    rows,
    cwd: homeDir,
    uid: id.uid,
    gid: id.gid,
    env: {
      ...opts.env,
      TERM: termName,
      USER: username,
      HOME: homeDir,
      SHELL: userInfo?.shell || DEFAULT_SHELL,
      PATH: sessionPath(homeDir),
      LANG: opts.env?.LANG ?? 'en_US.UTF-8',
      PMVPN_JAIL: drop ? '1' : '0',
    },
  });
  } catch (err: any) {
    logger.error({ username, err: err.message }, 'pty spawn failed');
    try { channel.stderr.write('pmvpn: could not start a terminal\r\n'); channel.exit(1); channel.close(); } catch {}
    return { resize() {}, kill() {} };
  }

  logger.info({ username, pid: term.pid, uid: userInfo?.uid, dropped: drop && !!userInfo }, 'shell spawned');

  // PTY → SSH channel
  term.onData((data) => {
    try {
      channel.write(data);
    } catch {
      // Channel closed
    }
  });

  // SSH channel → PTY
  // The decoder holds back a UTF-8 character split across two SSH packets.
  const decoder = new StringDecoder('utf8');
  channel.on('data', (data: Buffer) => {
    term.write(decoder.write(data));
  });

  // Cleanup on either end closing
  let exited = false;
  term.onExit(({ exitCode }) => {
    logger.info({ username, exitCode }, 'shell exited');
    exited = true;
    try { channel.exit(exitCode); channel.close(); } catch {}
  });

  channel.on('close', () => {
    logger.debug({ username }, 'channel closed, killing PTY');
    term.kill();
  });

  channel.on('eof', () => {
    term.kill();
  });

  return {
    resize(c, r) {
      if (exited) return;
      try { term.resize(c, r); } catch {}
    },
    kill() { term.kill(); },
  };
}

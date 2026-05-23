// PTY shell spawner via node-pty
// MIT License
//
// Spawns a real PTY shell for authenticated users.
// Thank OpenBSD: restricted PATH, explicit environment.

import * as pty from 'node-pty';
import type { ServerChannel } from 'ssh2';
import { logger } from '../utils/logger.js';
import { lookupUser, canDropPrivileges } from '../utils/userinfo.js';

const DEFAULT_SHELL = process.env.PMVPN_SHELL || '/bin/bash';

// Restricted PATH — only safe system binaries
const RESTRICTED_PATH = '/usr/local/bin:/usr/bin:/bin';

interface PtyOptions {
  username: string;
  homeDir: string;
  cols?: number;
  rows?: number;
}

/**
 * Spawn a PTY shell and pipe it to an SSH channel.
 * Returns a cleanup function.
 */
export function spawnShell(channel: ServerChannel, opts: PtyOptions): () => void {
  const { username, homeDir, cols = 80, rows = 24 } = opts;

  // Privilege drop: when running as root, run the PTY as the jailed user
  // (uid/gid from /etc/passwd). Refuse to spawn as root if the user exists
  // — running an SSH session as root would defeat the jail.
  const userInfo = lookupUser(username);
  const drop = canDropPrivileges();
  if (drop && !userInfo) {
    logger.error({ username }, 'refusing shell — user not provisioned (jail warden never ran?)');
    try { channel.stderr.write(`pmvpn: user ${username} not provisioned on host\r\n`); } catch {}
    try { channel.exit(1); channel.close(); } catch {}
    return () => {};
  }

  const term = pty.spawn(userInfo?.shell || DEFAULT_SHELL, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: homeDir,
    uid: drop && userInfo ? userInfo.uid : undefined,
    gid: drop && userInfo ? userInfo.gid : undefined,
    env: {
      TERM: 'xterm-256color',
      USER: username,
      HOME: homeDir,
      SHELL: userInfo?.shell || DEFAULT_SHELL,
      PATH: RESTRICTED_PATH,
      LANG: 'en_US.UTF-8',
      PMVPN_JAIL: drop ? '1' : '0',
    },
  });

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
  channel.on('data', (data: Buffer) => {
    term.write(data.toString());
  });

  // Handle window resize
  channel.on('window-change' as string, (
    _accept: unknown,
    _reject: unknown,
    info: { cols: number; rows: number },
  ) => {
    term.resize(info.cols, info.rows);
  });

  // Cleanup on either end closing
  term.onExit(({ exitCode }) => {
    logger.info({ username, exitCode }, 'shell exited');
    try { channel.close(); } catch {}
  });

  channel.on('close', () => {
    logger.debug({ username }, 'channel closed, killing PTY');
    term.kill();
  });

  channel.on('eof', () => {
    term.kill();
  });

  return () => {
    term.kill();
  };
}

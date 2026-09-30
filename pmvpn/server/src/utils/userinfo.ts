// SPDX-License-Identifier: GPL-3.0-only
// Linux user uid/gid lookup
// MIT License
//
// Used by SSH shell, exec, SFTP, and WS bridge to drop privileges before
// running anything on behalf of an authenticated wallet.

import { execFileSync } from 'node:child_process';
import { logger } from './logger.js';

export interface UserInfo {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
}

const cache = new Map<string, UserInfo>();

/**
 * Look up a Linux user by name. Returns null if the user doesn't exist.
 *
 * Reads /etc/passwd via `getent` so it sees NSS users (LDAP, SSSD) too,
 * not just local accounts.
 */
export function lookupUser(username: string): UserInfo | null {
  const cached = cache.get(username);
  if (cached) return cached;

  try {
    const line = execFileSync('getent', ['passwd', username], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!line) return null;
    // name:x:uid:gid:gecos:home:shell
    const parts = line.split(':');
    if (parts.length < 7) return null;
    const info: UserInfo = {
      username: parts[0],
      uid: parseInt(parts[2], 10),
      gid: parseInt(parts[3], 10),
      home: parts[5],
      shell: parts[6] || '/bin/bash',
    };
    if (!Number.isFinite(info.uid) || !Number.isFinite(info.gid)) return null;
    cache.set(username, info);
    return info;
  } catch (err: any) {
    logger.debug({ username, err: err.message }, 'getent lookup failed');
    return null;
  }
}

/**
 * Invalidate cache for a user — call this right after the jail warden
 * provisions a new account so the next lookup picks up the new uid/gid.
 */
export function forgetUser(username: string): void {
  cache.delete(username);
}

/**
 * Are we able to drop privileges? Only root can setuid to another user.
 */
export function canDropPrivileges(): boolean {
  if (process.platform !== 'linux') return false;
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

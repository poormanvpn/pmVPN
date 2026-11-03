// SPDX-License-Identifier: GPL-3.0-only
// Connection and session settings for external clients. Every value is listed
// in server/.env.example.

import './env.js';

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer in ${min}..${max} (got "${raw}")`);
  }
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${name} must be true or false (got "${raw}")`);
}

/** When false, only wallets in WALLET_USER_MAP or wallets.json may log in. */
export const AUTO_REGISTER = bool('PMVPN_AUTO_REGISTER', true);

/** Sockets one SSH port accepts at a time, counted before authentication. */
export const MAX_CONNECTIONS_PER_PORT = int('PMVPN_MAX_CONNECTIONS_PER_PORT', 256, 1, 65535);
/** Authenticated connections one wallet may hold across all ports. */
export const MAX_CONNECTIONS_PER_WALLET = int('PMVPN_MAX_CONNECTIONS_PER_WALLET', 32, 1, 65535);
/** Channels on one SSH connection; this is what ControlMaster multiplexing uses. */
export const MAX_SESSIONS_PER_CONNECTION = int('PMVPN_MAX_SESSIONS_PER_CONNECTION', 16, 1, 1024);

/** Challenges one client address may request per minute, across every port that issues them. */
export const CHALLENGES_PER_MINUTE = int('PMVPN_CHALLENGES_PER_MINUTE', 30, 1, 100000);

/** Seconds an SSH client has to authenticate before it is disconnected. */
export const LOGIN_GRACE_SECONDS = int('PMVPN_LOGIN_GRACE_SECONDS', 30, 5, 600);
/** Failed authentication attempts allowed on one SSH connection. Key probes don't count. */
export const MAX_AUTH_FAILURES = int('PMVPN_MAX_AUTH_FAILURES', 6, 1, 100);

/** Seconds between SSH keepalive probes. 0 turns them off. */
export const KEEPALIVE_SECONDS = int('PMVPN_KEEPALIVE_SECONDS', 30, 0, 86400);
/** Unanswered probes before the connection is dropped. */
export const KEEPALIVE_COUNT_MAX = int('PMVPN_KEEPALIVE_COUNT_MAX', 3, 0, 1000);

/** Name clients should dial, for servers behind NAT or a reverse proxy. */
export const PUBLIC_HOST = (() => {
  const host = process.env.PMVPN_PUBLIC_HOST?.trim() || '';
  if (host && !/^[A-Za-z0-9.:_-]+$/.test(host)) throw new Error(`PMVPN_PUBLIC_HOST is not a hostname: "${host}"`);
  return host;
})();

const SESSION_PATH = process.env.PMVPN_SESSION_PATH?.trim() || '/usr/local/bin:/usr/bin:/bin';

/** PATH for a session. A leading ~/ in an entry resolves to the user's home. */
export function sessionPath(homeDir: string): string {
  return SESSION_PATH.split(':').map((p) => (p.startsWith('~/') ? `${homeDir}/${p.slice(2)}` : p)).join(':');
}

// Never settable by a client, whatever PMVPN_ACCEPT_ENV says: these change what
// runs inside the session or who it claims to be.
const ENV_DENIED = /^(PATH|HOME|USER|LOGNAME|SHELL|IFS|ENV|BASH_ENV|BASH_FUNC_.*|LD_.*|NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONSTARTUP|PERL5OPT|PERL5LIB|RUBYOPT|GIT_.*|PMVPN_.*)$/;

const ACCEPT_ENV = (process.env.PMVPN_ACCEPT_ENV ?? 'LANG,LC_*,COLORTERM')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** May a client set this variable with ssh SendEnv / SetEnv? */
export function acceptsEnv(name: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || ENV_DENIED.test(name)) return false;
  return ACCEPT_ENV.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : name === p));
}

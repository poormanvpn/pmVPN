// SPDX-License-Identifier: GPL-3.0-only
// SSH connection handler — per-connection auth and session lifecycle
// MIT License

import ssh2 from 'ssh2';
type Connection = ssh2.Connection;
type ServerChannel = ssh2.ServerChannel;
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { verifyWalletSignature } from '../auth/verifier.js';
import { consumeChallenge } from '../auth/challenge.js';
import { provisionWallet } from '../auth/provision.js';
import { findByBlob } from '../auth/keyring.js';
import { spawnShell, type PtySession } from './shell.js';
import { createSftpHost } from './sftp-host.js';
import { attachSftpSubsystem } from './sftp-subsystem.js';
import { startTunnelServer } from '../tunnel/server.js';
import { logger } from '../utils/logger.js';
import { getSessionsForWallet, registerSession, removeSession, touchSession } from '../utils/sessions.js';
import { canDropPrivileges, sessionIdentity } from '../utils/userinfo.js';
import { LOGIN_DEADLINE } from './server.js';
import { acceptsEnv, MAX_AUTH_FAILURES, MAX_CONNECTIONS_PER_WALLET, MAX_SESSIONS_PER_CONNECTION, sessionPath } from '../config/settings.js';
import type { WalletMap } from '../config/wallets.js';
import type { AuthPayload } from '../shared.js';

const BASE_HOME = process.env.PMVPN_HOME_BASE || '/home';

interface SessionState {
  username: string | null;
  address: string | null;
  authenticated: boolean;
  sessionId: string | null;
}

const AUTH_METHODS: ssh2.AuthenticationType[] = ['publickey', 'password'];

/**
 * End a request this port does not serve. Accepting and exiting is deliberate: with a
 * bare rejection the session channel stays open, and a multiplexed OpenSSH client
 * waits on it forever.
 */
function refuse(channel: ServerChannel, message: string): void {
  try {
    channel.stderr.write(`pmvpn: ${message}\r\n`);
    channel.exit(1);
    channel.close();
  } catch {}
}

/**
 * Handle a single SSH connection.
 * Two ways in, same outcome:
 *   password  — JSON { address, signature, nonce } signed by the wallet (the pmVPN client)
 *   publickey — an enrolled keyring key whose index equals this port's offset
 *               (stock OpenSSH, paramiko, rsync, git — anything that speaks SSH)
 * Both end in provisionWallet(), so the session always runs as the bound user.
 */
export function handleConnection(
  client: Connection,
  clientInfo: { ip: string; port: number },
  walletMap: WalletMap,
  portRole: 'shell' | 'sftp' | 'exec' | 'tunnel',
  portIndex: number = 0,
): void {
  const session: SessionState = {
    username: null,
    address: null,
    authenticated: false,
    sessionId: null,
  };

  const clientLabel = `${clientInfo.ip}:${clientInfo.port}`;
  logger.info({ client: clientLabel, role: portRole }, 'new connection');

  const sessionType = portRole === 'shell' ? 'ssh-shell' : portRole === 'sftp' ? 'ssh-sftp' : portRole === 'exec' ? 'ssh-exec' : 'tunnel';

  // The login deadline (OpenSSH LoginGraceTime) was set on the raw socket at accept
  // time in server.ts; it is cleared once authentication succeeds.
  const deadline = (client as any)._sock?.[LOGIN_DEADLINE] as NodeJS.Timeout | undefined;

  let failures = 0;
  const reject = (ctx: ssh2.AuthContext): void => {
    ctx.reject(AUTH_METHODS);
    // 'none' is every client's opening probe, and a publickey query carries no signature.
    const counted = ctx.method !== 'none' && !(ctx.method === 'publickey' && !(ctx as any).signature);
    if (counted && ++failures >= MAX_AUTH_FAILURES) {
      logger.warn({ client: clientLabel, failures }, 'too many failed authentication attempts');
      client.end();
    }
  };

  client.on('authentication', (ctx) => {
    authenticate(ctx).catch((err) => {
      logger.error({ client: clientLabel, err: err?.message }, 'authentication handler failed');
      try { ctx.reject(AUTH_METHODS); } catch {}
    });
  });

  const authenticate = async (ctx: ssh2.AuthContext): Promise<void> => {
    // ── publickey: enrolled keyring key, scoped to this port ──
    if (ctx.method === 'publickey') {
      if (ctx.key.algo !== 'ssh-ed25519') {
        logger.debug({ client: clientLabel, algo: ctx.key.algo }, 'publickey: unsupported algorithm');
        return reject(ctx);
      }
      const entry = findByBlob(ctx.key.data);
      if (!entry) {
        logger.debug({ client: clientLabel }, 'publickey: key not enrolled');
        return reject(ctx);
      }
      if (entry.index !== portIndex) {
        // The whole point of the ring: key i opens port +i and nothing else.
        logger.warn({ client: clientLabel, address: entry.address, keyIndex: entry.index, portIndex, fingerprint: entry.fingerprint }, 'publickey: key index does not match this port');
        return reject(ctx);
      }
      const prov = provisionWallet(entry.address, walletMap);
      if (!prov.ok || !prov.entry || !prov.homeDir) {
        logger.warn({ client: clientLabel, address: entry.address, error: prov.error }, 'publickey: provisioning rejected auth');
        return reject(ctx);
      }
      // The key already identifies the wallet; the username just has to be one of its names.
      const wanted = ctx.username.toLowerCase();
      if (wanted !== prov.entry.user.toLowerCase() && wanted !== entry.address && wanted !== 'pmvpn') {
        logger.warn({ client: clientLabel, address: entry.address, username: ctx.username, bound: prov.entry.user }, 'publickey: username does not belong to this wallet');
        return reject(ctx);
      }
      if (!ctx.signature || !ctx.blob) {
        // Probe: the client asks whether this key would be acceptable. Say yes; it signs next.
        return ctx.accept();
      }
      const parsed = ssh2.utils.parseKey(ctx.key.data);
      if (parsed instanceof Error || Array.isArray(parsed)) {
        logger.warn({ client: clientLabel }, 'publickey: unparseable key blob');
        return reject(ctx);
      }
      const ok = parsed.verify(ctx.blob, ctx.signature, ctx.hashAlgo);
      if (ok !== true) {
        logger.warn({ client: clientLabel, address: entry.address, keyIndex: entry.index }, 'publickey: signature verification failed');
        return reject(ctx);
      }
      if (getSessionsForWallet(entry.address).length >= MAX_CONNECTIONS_PER_WALLET) {
        logger.warn({ client: clientLabel, address: entry.address, limit: MAX_CONNECTIONS_PER_WALLET }, 'publickey: wallet is at its connection limit');
        return reject(ctx);
      }

      session.username = prov.entry.user;
      session.address = entry.address;
      session.authenticated = true;
      session.sessionId = registerSession(entry.address, prov.entry.user, prov.entry.role, sessionType, clientInfo.ip, clientInfo.port, () => client.end());
      logger.info({ client: clientLabel, user: prov.entry.user, address: entry.address, keyIndex: entry.index, fingerprint: entry.fingerprint, sessionId: session.sessionId }, 'authenticated (keyring)');
      if (deadline) clearTimeout(deadline);
      return ctx.accept();
    }

    // ── password: wallet signature JSON ──
    if (ctx.method !== 'password') {
      logger.debug({ client: clientLabel, method: ctx.method }, 'rejected auth method');
      return reject(ctx);
    }

    // Parse JSON payload from password field
    let payload: AuthPayload;
    try {
      payload = JSON.parse(ctx.password);
    } catch {
      logger.warn({ client: clientLabel }, 'malformed auth payload');
      return reject(ctx);
    }

    const { address, signature, nonce } = (payload && typeof payload === 'object' ? payload : {}) as Partial<AuthPayload>;
    if (typeof address !== 'string' || typeof signature !== 'string' || typeof nonce !== 'string'
      || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      logger.warn({ client: clientLabel }, 'incomplete auth payload');
      return reject(ctx);
    }

    // Consume nonce (single-use, prevents replay)
    const message = consumeChallenge(nonce);
    if (!message) {
      logger.warn({ client: clientLabel, address }, 'invalid or expired nonce');
      return reject(ctx);
    }

    // Verify wallet signature (viem — pure local crypto)
    const valid = await verifyWalletSignature(address, message, signature);
    if (!valid) {
      logger.warn({ client: clientLabel, address }, 'invalid signature');
      return reject(ctx);
    }

    // Provision the Linux user (or refuse if the wallet does not own this account)
    const prov = provisionWallet(address, walletMap);
    if (!prov.ok || !prov.entry || !prov.homeDir) {
      logger.warn({ client: clientLabel, address, error: prov.error }, 'provisioning rejected auth');
      return reject(ctx);
    }

    if (getSessionsForWallet(address).length >= MAX_CONNECTIONS_PER_WALLET) {
      logger.warn({ client: clientLabel, address, limit: MAX_CONNECTIONS_PER_WALLET }, 'wallet is at its connection limit');
      return reject(ctx);
    }

    // Authentication successful
    session.username = prov.entry.user;
    session.address = address.toLowerCase();
    session.authenticated = true;

    // Register in active session registry
    session.sessionId = registerSession(session.address, prov.entry.user, prov.entry.role, sessionType, clientInfo.ip, clientInfo.port, () => client.end());

    logger.info({ client: clientLabel, user: prov.entry.user, address: session.address, newUser: prov.newUser, sessionId: session.sessionId }, 'authenticated');
    if (deadline) clearTimeout(deadline);
    ctx.accept();
 };

  client.on('ready', () => {
    if (!session.authenticated || !session.username) return;

    const username = session.username;

    // Ensure user home directory exists
    const homeDir = join(BASE_HOME, username);
    if (!existsSync(homeDir)) {
      try {
        mkdirSync(homeDir, { recursive: true });
        logger.info({ user: username, home: homeDir }, 'created home directory');
      } catch (err) {
        logger.error({ err, user: username }, 'failed to create home directory');
      }
    }

    let openSessions = 0;

    client.on('session', (acceptSession, rejectSession) => {
      // Stock clients multiplex many channels over one connection (ControlMaster).
      if (openSessions >= MAX_SESSIONS_PER_CONNECTION) {
        logger.warn({ user: username, limit: MAX_SESSIONS_PER_CONNECTION }, 'session limit reached on this connection');
        rejectSession();
        return;
      }
      openSessions++;
      const sshSession = acceptSession();
      sshSession.once('close', () => { openSessions--; });

      let ptyInfo: { cols: number; rows: number; term?: string } | null = null;
      let pty_: PtySession | null = null;
      const clientEnv: Record<string, string> = {};

      sshSession.on('env', (accept, reject, info) => {
        if (acceptsEnv(info.key) && info.val.length <= 4096) {
          clientEnv[info.key] = info.val;
          accept?.();
        } else {
          logger.debug({ user: username, name: info.key }, 'client env refused');
          reject?.();
        }
      });

      sshSession.on('pty', (accept, reject, info) => {
        // The exec port stays non-interactive. Interactive programs use the shell port.
        if (portRole !== 'shell') {
          reject?.();
          return;
        }
        ptyInfo = { cols: info.cols, rows: info.rows, term: info.term };
        accept?.();
      });

      sshSession.on('window-change', (accept, _reject, info) => {
        if (ptyInfo) { ptyInfo.cols = info.cols; ptyInfo.rows = info.rows; }
        pty_?.resize(info.cols, info.rows);
        accept?.();
      });

      sshSession.on('shell', (accept) => {
        if (portRole === 'tunnel') {
          // Tunnel mode: the shell channel becomes the mux transport
          const channel = accept();
          startTunnelServer(channel, username);
          return;
        }
        if (portRole !== 'shell') {
          logger.warn({ user: username, role: portRole }, 'shell request on non-shell port');
          refuse(accept(), `this ${portRole} port has no interactive shell; use the shell port`);
          return;
        }
        const channel = accept();
        pty_ = spawnShell(channel, {
          username,
          homeDir,
          cols: ptyInfo?.cols,
          rows: ptyInfo?.rows,
          term: ptyInfo?.term,
          env: clientEnv,
        });
      });

      sshSession.on('exec', (accept, _reject, info) => {
        if (portRole !== 'exec' && portRole !== 'shell') {
          logger.warn({ user: username, role: portRole }, 'exec request on wrong port');
          refuse(accept(), `this ${portRole} port does not run commands; for scp use \`scp -s\` or the sync port`);
          return;
        }
        const channel = accept();

        // `ssh -t host cmd`: the command gets a terminal, as interactive tools expect.
        if (ptyInfo) {
          pty_ = spawnShell(channel, {
            username,
            homeDir,
            cols: ptyInfo.cols,
            rows: ptyInfo.rows,
            term: ptyInfo.term,
            env: clientEnv,
            command: info.command,
          });
          return;
        }

        // Privilege drop: run the command as the jailed user when we're root.
        const drop = canDropPrivileges();
        const id = sessionIdentity(username);
        if (!id.ok) {
          logger.error({ username, error: id.error }, 'refusing exec');
          refuse(channel, id.error);
          return;
        }

        const proc = spawn('bash', ['-c', info.command], {
          cwd: homeDir,
          uid: id.uid,
          gid: id.gid,
          env: {
            ...clientEnv,
            USER: username,
            HOME: homeDir,
            PATH: sessionPath(homeDir),
            PMVPN_JAIL: drop ? '1' : '0',
          },
        });
        // pipe() carries EOF and backpressure: without them `cmd | ssh host cat`
        // never ends, and rsync, git and stdio MCP servers stall.
        proc.stdout.pipe(channel, { end: false });
        proc.stderr.pipe(channel.stderr, { end: false });
        channel.pipe(proc.stdin);
        proc.stdin.on('error', () => {}); // the command exited without reading its input
        proc.on('error', (err) => {
          logger.error({ err: err.message, username }, 'exec failed to start');
          try { channel.stderr.write(`pmvpn: ${err.message}\r\n`); channel.exit(127); channel.close(); } catch {}
        });
        proc.on('close', (code: number | null) => {
          // A null code means a signal ended it, which must not read as success.
          try { channel.exit(code ?? 255); channel.close(); } catch {}
        });
        channel.on('close', () => proc.kill());
      });

      sshSession.on('sftp', async (accept) => {
        if (portRole !== 'sftp') {
          logger.warn({ user: username, role: portRole }, 'sftp request on non-sftp port');
          // Accept then end, for the same reason as refuse(): a rejection hangs a multiplexed client.
          accept().end();
          return;
        }
        const sftpStream = accept();
        try {
          const host = await createSftpHost(username, homeDir);
          attachSftpSubsystem(sftpStream, host, username);
          // When the client sends EOF (sftp `bye`), answer with our own EOF/close so
          // stock OpenSSH sftp exits instead of waiting for the channel to drain.
          // scp in SFTP mode, the default since OpenSSH 9, reports failure when the channel
          // closes with no exit status. ssh2 has no public call for this on an SFTP stream.
          sftpStream.on('end' as any, () => {
            try {
              const raw = sftpStream as any;
              raw._protocol.exitStatus(raw.outgoing.id, 0);
              sftpStream.end();
            } catch {}
          });
          sftpStream.on('close' as any, () => host.close());
          logger.info({ user: username }, 'SFTP session opened');
        } catch (err: any) {
          logger.error({ err: err.message, user: username }, 'SFTP session failed');
          try { sftpStream.end(); } catch {}
        }
      });
    });
  });

  client.on('close', () => {
    if (deadline) clearTimeout(deadline);
    if (session.sessionId) removeSession(session.sessionId);
    logger.info({ client: clientLabel, user: session.username }, 'connection closed');
  });

  client.on('error', (err) => {
    logger.error({ err, client: clientLabel }, 'connection error');
  });
}

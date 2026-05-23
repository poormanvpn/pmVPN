// SSH connection handler — per-connection auth and session lifecycle
// MIT License

import type ssh2 from 'ssh2';
type Connection = ssh2.Connection;
type ServerChannel = ssh2.ServerChannel;
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { verifyWalletSignature } from '../auth/verifier.js';
import { consumeChallenge } from '../auth/challenge.js';
import { provisionWallet } from '../auth/provision.js';
import { spawnShell } from './shell.js';
import { createSftpHost } from './sftp-host.js';
import { attachSftpSubsystem } from './sftp-subsystem.js';
import { startTunnelServer } from '../tunnel/server.js';
import { logger } from '../utils/logger.js';
import { registerSession, removeSession, touchSession } from '../utils/sessions.js';
import { lookupUser, canDropPrivileges } from '../utils/userinfo.js';
import type { WalletMap } from '../config/wallets.js';
import type { AuthPayload } from '../shared.js';

const BASE_HOME = process.env.PMVPN_HOME_BASE || '/home';

interface SessionState {
  username: string | null;
  address: string | null;
  authenticated: boolean;
  sessionId: string | null;
}

/**
 * Handle a single SSH connection.
 * Authenticates via wallet signature, then provisions shell/sftp.
 */
export function handleConnection(
  client: Connection,
  clientInfo: { ip: string; port: number },
  walletMap: WalletMap,
  portRole: 'shell' | 'sftp' | 'exec' | 'tunnel',
): void {
  const session: SessionState = {
    username: null,
    address: null,
    authenticated: false,
    sessionId: null,
  };

  const clientLabel = `${clientInfo.ip}:${clientInfo.port}`;
  logger.info({ client: clientLabel, role: portRole }, 'new connection');

  client.on('authentication', async (ctx) => {
    // Only accept password method (wallet signature JSON)
    if (ctx.method !== 'password') {
      logger.debug({ client: clientLabel, method: ctx.method }, 'rejected auth method');
      return ctx.reject(['password']);
    }

    // Parse JSON payload from password field
    let payload: AuthPayload;
    try {
      payload = JSON.parse(ctx.password);
    } catch {
      logger.warn({ client: clientLabel }, 'malformed auth payload');
      return ctx.reject(['password']);
    }

    const { address, signature, nonce } = payload;
    if (!address || !signature || !nonce) {
      logger.warn({ client: clientLabel }, 'incomplete auth payload');
      return ctx.reject(['password']);
    }

    // Consume nonce (single-use, prevents replay)
    const message = consumeChallenge(nonce);
    if (!message) {
      logger.warn({ client: clientLabel, address }, 'invalid or expired nonce');
      return ctx.reject(['password']);
    }

    // Verify wallet signature (viem — pure local crypto)
    const valid = await verifyWalletSignature(address, message, signature);
    if (!valid) {
      logger.warn({ client: clientLabel, address }, 'invalid signature');
      return ctx.reject(['password']);
    }

    // Provision the Linux user (or refuse if the wallet does not own this account)
    const prov = provisionWallet(address, walletMap);
    if (!prov.ok || !prov.entry || !prov.homeDir) {
      logger.warn({ client: clientLabel, address, error: prov.error }, 'provisioning rejected auth');
      return ctx.reject(['password']);
    }

    // Authentication successful
    session.username = prov.entry.user;
    session.address = address.toLowerCase();
    session.authenticated = true;

    // Register in active session registry
    const sessionType = portRole === 'shell' ? 'ssh-shell' : portRole === 'sftp' ? 'ssh-sftp' : portRole === 'exec' ? 'ssh-exec' : 'tunnel';
    session.sessionId = registerSession(session.address, prov.entry.user, prov.entry.role, sessionType, clientInfo.ip, clientInfo.port);

    logger.info({ client: clientLabel, user: prov.entry.user, address: session.address, newUser: prov.newUser, sessionId: session.sessionId }, 'authenticated');
    ctx.accept();
  });

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

    client.on('session', (accept, _reject) => {
      const sshSession = accept();
      let ptyInfo = { cols: 80, rows: 24 };

      sshSession.on('pty', (accept, _reject, info) => {
        ptyInfo = { cols: info.cols, rows: info.rows };
        accept?.();
      });

      sshSession.on('shell', (accept, _reject) => {
        if (portRole === 'tunnel') {
          // Tunnel mode: the shell channel becomes the mux transport
          const channel = accept();
          startTunnelServer(channel, username);
          return;
        }
        if (portRole !== 'shell') {
          logger.warn({ user: username, role: portRole }, 'shell request on non-shell port');
          return;
        }
        const channel = accept();
        spawnShell(channel, {
          username,
          homeDir,
          cols: ptyInfo.cols,
          rows: ptyInfo.rows,
        });
      });

      sshSession.on('exec', (accept, _reject, info) => {
        if (portRole !== 'exec' && portRole !== 'shell') {
          logger.warn({ user: username, role: portRole }, 'exec request on wrong port');
          return;
        }
        const channel = accept();

        // Privilege drop: run the command as the jailed user when we're root.
        const userInfo = lookupUser(username);
        const drop = canDropPrivileges();
        if (drop && !userInfo) {
          logger.error({ username }, 'refusing exec — user not provisioned');
          try { channel.stderr.write(`pmvpn: user ${username} not provisioned\r\n`); } catch {}
          try { channel.exit(1); channel.close(); } catch {}
          return;
        }

        const proc = spawn('bash', ['-c', info.command], {
          cwd: homeDir,
          uid: drop && userInfo ? userInfo.uid : undefined,
          gid: drop && userInfo ? userInfo.gid : undefined,
          env: {
            USER: username,
            HOME: homeDir,
            PATH: '/usr/local/bin:/usr/bin:/bin',
            PMVPN_JAIL: drop ? '1' : '0',
          },
        });
        proc.stdout.on('data', (data: Buffer) => channel.write(data));
        proc.stderr.on('data', (data: Buffer) => channel.stderr.write(data));
        proc.on('close', (code: number) => {
          channel.exit(code ?? 0);
          channel.close();
        });
        channel.on('data', (data: Buffer) => proc.stdin.write(data));
        channel.on('close', () => proc.kill());
      });

      sshSession.on('sftp', async (accept, _reject) => {
        if (portRole !== 'sftp') {
          logger.warn({ user: username, role: portRole }, 'sftp request on non-sftp port');
          return;
        }
        const sftpStream = accept();
        try {
          const host = await createSftpHost(username, homeDir);
          attachSftpSubsystem(sftpStream, host, username);
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
    if (session.sessionId) removeSession(session.sessionId);
    logger.info({ client: clientLabel, user: session.username }, 'connection closed');
  });

  client.on('error', (err) => {
    logger.error({ err, client: clientLabel }, 'connection error');
  });
}

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
import { spawnShell } from './shell.js';
import { startTunnelServer } from '../tunnel/server.js';
import { logger } from '../utils/logger.js';
import type { WalletMap } from '../config/wallets.js';
import type { AuthPayload } from '../shared.js';

const BASE_HOME = process.env.PMVPN_HOME_BASE || '/home';

interface SessionState {
  username: string | null;
  address: string | null;
  authenticated: boolean;
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

    // Check wallet-user mapping
    const addrLower = address.toLowerCase();
    const entry = walletMap.get(addrLower);
    if (!entry) {
      logger.warn({ client: clientLabel, address: addrLower }, 'unknown wallet address');
      return ctx.reject(['password']);
    }

    // Authentication successful
    session.username = entry.user;
    session.address = addrLower;
    session.authenticated = true;

    logger.info({ client: clientLabel, user: entry.user, address: addrLower }, 'authenticated');
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
        // For exec, spawn a one-shot command
        const proc = spawn('bash', ['-c', info.command], {
          cwd: homeDir,
          env: {
            USER: username,
            HOME: homeDir,
            PATH: '/usr/local/bin:/usr/bin:/bin',
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

      sshSession.on('sftp', (accept, _reject) => {
        if (portRole !== 'sftp') {
          logger.warn({ user: username, role: portRole }, 'sftp request on non-sftp port');
          return;
        }
        // SFTP handled in Phase 3
        logger.info({ user: username }, 'SFTP session requested (not yet implemented)');
      });
    });
  });

  client.on('close', () => {
    logger.info({ client: clientLabel, user: session.username }, 'connection closed');
  });

  client.on('error', (err) => {
    logger.error({ err, client: clientLabel }, 'connection error');
  });
}

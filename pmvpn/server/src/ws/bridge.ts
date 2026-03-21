// pmVPN WebSocket Bridge — browser terminal + file browser
// MIT License
//
// Accepts WebSocket connections from the browser client.
// First message: auth payload (wallet signature).
// After auth: multiplexes shell I/O and SFTP commands.
//
// Protocol:
//   → { type: "auth", payload: { address, signature, nonce } }
//   ← { type: "auth", ok: true, user: "..." }
//   → { type: "shell", data: "ls\n" }
//   ← { type: "shell", data: "file.txt\n" }
//   → { type: "sftp", id: 1, cmd: "ls", path: "/" }
//   ← { type: "sftp", id: 1, result: { ok: true, entries: [...] } }

import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import * as pty from 'node-pty';
import { verifyWalletSignature } from '../auth/verifier.js';
import { consumeChallenge } from '../auth/challenge.js';
import { sftpLs, sftpGet, sftpPut, sftpMkdir, sftpRm, sftpStat } from '../ssh/sftp.js';
import { logger } from '../utils/logger.js';
import type { WalletMap } from '../config/wallets.js';
import type { AuthPayload } from '../shared.js';

const BASE_HOME = process.env.PMVPN_HOME_BASE || '/home';
const DEFAULT_SHELL = process.env.PMVPN_SHELL || '/bin/bash';

interface Session {
  username: string;
  homeDir: string;
  address: string;
  shell: ReturnType<typeof pty.spawn> | null;
}

/**
 * Create the WebSocket bridge server.
 * Returns an http.Server that can be .listen()'d.
 */
export function createWsBridge(walletMap: WalletMap) {
  const httpServer = createServer((_req, res) => {
    // CORS preflight for WebSocket upgrade
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    logger.info({ client: clientIp }, 'ws: new connection');

    let session: Session | null = null;
    let authenticated = false;

    // Auth timeout — 30 seconds to authenticate
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'auth timeout' }));
        ws.close();
      }
    }, 30000);

    ws.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', error: 'invalid JSON' }));
        return;
      }

      // ── Auth ──
      if (msg.type === 'auth' && !authenticated) {
        clearTimeout(authTimeout);

        const payload = msg.payload as AuthPayload;
        if (!payload?.address || !payload?.signature || !payload?.nonce) {
          ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'incomplete payload' }));
          ws.close();
          return;
        }

        // Consume nonce
        const message = consumeChallenge(payload.nonce);
        if (!message) {
          ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'invalid or expired nonce' }));
          ws.close();
          return;
        }

        // Verify signature
        const valid = await verifyWalletSignature(payload.address, message, payload.signature);
        if (!valid) {
          ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'invalid signature' }));
          ws.close();
          return;
        }

        // Check wallet map
        const addrLower = payload.address.toLowerCase();
        const entry = walletMap.get(addrLower);
        if (!entry) {
          ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'wallet not registered' }));
          ws.close();
          return;
        }

        // Auth success
        const homeDir = join(BASE_HOME, entry.user);
        if (!existsSync(homeDir)) {
          mkdirSync(homeDir, { recursive: true });
        }

        session = { username: entry.user, homeDir, address: addrLower, shell: null };
        authenticated = true;

        logger.info({ client: clientIp, user: entry.user, address: addrLower }, 'ws: authenticated');
        ws.send(JSON.stringify({ type: 'auth', ok: true, user: entry.user, home: '/' }));
        return;
      }

      if (!authenticated || !session) {
        ws.send(JSON.stringify({ type: 'error', error: 'not authenticated' }));
        return;
      }

      // ── Shell ──
      if (msg.type === 'shell') {
        if (!session.shell) {
          // Spawn PTY on first shell message
          session.shell = pty.spawn(DEFAULT_SHELL, [], {
            name: 'xterm-256color',
            cols: msg.cols || 80,
            rows: msg.rows || 24,
            cwd: session.homeDir,
            env: {
              TERM: 'xterm-256color',
              USER: session.username,
              HOME: session.homeDir,
              SHELL: DEFAULT_SHELL,
              PATH: '/usr/local/bin:/usr/bin:/bin',
              LANG: 'en_US.UTF-8',
            },
          });

          logger.info({ user: session.username, pid: session.shell.pid }, 'ws: shell spawned');

          // PTY output → WebSocket
          session.shell.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'shell', data }));
            }
          });

          session.shell.onExit(({ exitCode }) => {
            logger.info({ user: session!.username, exitCode }, 'ws: shell exited');
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'shell', data: `\r\n[shell exited: ${exitCode}]\r\n` }));
            }
          });
        }

        // Client input → PTY
        if (msg.data && session.shell) {
          session.shell.write(msg.data);
        }

        // Resize
        if (msg.resize && session.shell) {
          session.shell.resize(msg.cols || 80, msg.rows || 24);
        }
        return;
      }

      // ── SFTP ──
      if (msg.type === 'sftp') {
        const id = msg.id || 0;
        const path = msg.path || '/';

        let result;
        switch (msg.cmd) {
          case 'ls':
            result = await sftpLs(session.homeDir, path);
            break;
          case 'get':
            result = await sftpGet(session.homeDir, path);
            break;
          case 'put':
            result = await sftpPut(session.homeDir, path, msg.data || '');
            break;
          case 'mkdir':
            result = await sftpMkdir(session.homeDir, path);
            break;
          case 'rm':
            result = await sftpRm(session.homeDir, path);
            break;
          case 'stat':
            result = await sftpStat(session.homeDir, path);
            break;
          default:
            result = { ok: false, error: `unknown command: ${msg.cmd}` };
        }

        ws.send(JSON.stringify({ type: 'sftp', id, result }));
        return;
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (session?.shell) {
        session.shell.kill();
        logger.info({ user: session.username }, 'ws: shell killed on disconnect');
      }
      logger.info({ client: clientIp, user: session?.username }, 'ws: disconnected');
    });

    ws.on('error', (err) => {
      logger.error({ err, client: clientIp }, 'ws: error');
    });
  });

  return httpServer;
}

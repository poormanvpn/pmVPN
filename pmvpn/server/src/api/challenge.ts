// HTTP challenge endpoint — Node built-in http (no Express)
// MIT License
//
// Minimal attack surface. No framework. Manual routing.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createChallenge } from '../auth/challenge.js';
import { logger } from '../utils/logger.js';
import { PROTOCOL_VERSION } from '../shared.js';
import type { WalletMap } from '../config/wallets.js';

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

/**
 * Create the challenge HTTP server.
 *
 * Routes:
 *   GET /challenge?address=0x...  → { nonce, message, expires }
 *   GET /status                   → { version, uptime }
 */
export function createChallengeServer(walletMap: WalletMap) {
  const startTime = Date.now();

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for Tauri webview
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // GET /challenge?address=0x...
    if (req.method === 'GET' && url.pathname === '/challenge') {
      const address = url.searchParams.get('address');
      if (!address || !address.startsWith('0x')) {
        return sendJSON(res, 400, { error: 'missing or invalid address parameter' });
      }

      // Auto-register: any wallet that signs gets access.
      // Username = 'w' + first 8 hex chars of address.
      // Persisted to wallets.json so subsequent logins are instant.
      const addrLower = address.toLowerCase();
      if (!walletMap.has(addrLower)) {
        const username = `w${addrLower.slice(2, 10)}`;
        walletMap.set(addrLower, { user: username, role: 'user' });
        logger.info({ address: addrLower, user: username }, 'auto-registered new wallet');
        try {
          const walletsPath = join(homedir(), '.pmvpn', 'wallets.json');
          const existing: Record<string, any> = {};
          try {
            Object.assign(existing, JSON.parse(readFileSync(walletsPath, 'utf-8')));
          } catch {}
          existing[addrLower] = { user: username, role: 'user' };
          writeFileSync(walletsPath, JSON.stringify(existing, null, 2));
        } catch (err) {
          logger.warn({ err }, 'failed to persist wallet registration');
        }
      }

      const challenge = createChallenge(address.toLowerCase());
      if (!challenge) {
        return sendJSON(res, 503, { error: 'server busy, try again' });
      }

      logger.info({ address: address.slice(0, 10) }, 'challenge issued');
      return sendJSON(res, 200, challenge);
    }

    // GET /status
    if (req.method === 'GET' && url.pathname === '/status') {
      return sendJSON(res, 200, {
        version: PROTOCOL_VERSION,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        wallets: walletMap.size,
      });
    }

    // 404 everything else
    sendJSON(res, 404, { error: 'not found' });
  });
}

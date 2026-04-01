// Fleet Events — WebSocket server for real-time fleet monitoring
// MIT License
//
// Port 2601: Pushes real-time events to subscribed clients.
// Protocol mirrors the existing WS bridge pattern from ws/bridge.ts.
//
// Protocol:
//   → { type: "auth", payload: { address, signature, nonce } }
//   ← { type: "auth", ok: true }
//   → { type: "subscribe", channels: ["health", "deploy", "alerts"] }
//   ← { type: "subscribed", channels: ["health", "deploy", "alerts"] }
//   ← { type: "event", channel: "health", data: {...}, timestamp: 123 }

import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../../server/src/utils/logger.js';
import { verifyWalletSignature } from '../../server/src/auth/verifier.js';
import { consumeChallenge } from '../../server/src/auth/challenge.js';
import type { WalletMap } from '../../server/src/config/wallets.js';
import type ModuleRegistry from '../registry.js';
import type { FleetConfig } from '../../server/src/fleet-shared.js';

type EventChannel = 'health' | 'deploy' | 'alerts' | 'member' | 'metrics';

const VALID_CHANNELS: EventChannel[] = ['health', 'deploy', 'alerts', 'member', 'metrics'];

interface AuthenticatedClient {
  ws: WebSocket;
  wallet: string;
  username: string;
  channels: Set<EventChannel>;
}

// Global client registry for broadcasting
const clients = new Map<WebSocket, AuthenticatedClient>();

// Health check interval handle
let healthInterval: ReturnType<typeof setInterval> | null = null;

export function createFleetEvents(
  moduleRegistry: ModuleRegistry,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
) {
  const httpServer = createServer((_req, res) => {
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
    logger.info({ client: clientIp }, 'fleet-events: new connection');

    let authenticated = false;

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (!authenticated) {
          // First message must be auth
          if (msg.type !== 'auth' || !msg.payload) {
            ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'Auth required' }));
            ws.close(4001, 'Auth required');
            return;
          }

          const { address, signature, nonce } = msg.payload;

          // Consume and verify nonce
          const message = consumeChallenge(nonce);
          if (!message) {
            ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'Invalid nonce' }));
            ws.close(4001, 'Invalid nonce');
            return;
          }

          const valid = await verifyWalletSignature(address, message, signature);
          if (!valid) {
            ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'Invalid signature' }));
            ws.close(4001, 'Invalid signature');
            return;
          }

          const walletEntry = walletMap.get(address.toLowerCase());
          if (!walletEntry) {
            ws.send(JSON.stringify({ type: 'auth', ok: false, error: 'Wallet not registered' }));
            ws.close(4001, 'Not registered');
            return;
          }

          authenticated = true;
          clients.set(ws, {
            ws,
            wallet: address,
            username: walletEntry.user,
            channels: new Set(),
          });

          ws.send(JSON.stringify({ type: 'auth', ok: true, user: walletEntry.user }));
          logger.info({ user: walletEntry.user, client: clientIp }, 'fleet-events: authenticated');
          return;
        }

        // Handle subscribe/unsubscribe
        if (msg.type === 'subscribe' && Array.isArray(msg.channels)) {
          const client = clients.get(ws)!;
          const subscribed: string[] = [];

          for (const ch of msg.channels) {
            if (VALID_CHANNELS.includes(ch)) {
              client.channels.add(ch);
              subscribed.push(ch);
            }
          }

          ws.send(JSON.stringify({ type: 'subscribed', channels: subscribed }));
          logger.debug({ user: client.username, channels: subscribed }, 'fleet-events: subscribed');
          return;
        }

        if (msg.type === 'unsubscribe' && Array.isArray(msg.channels)) {
          const client = clients.get(ws)!;
          for (const ch of msg.channels) {
            client.channels.delete(ch);
          }
          ws.send(JSON.stringify({ type: 'unsubscribed', channels: msg.channels }));
          return;
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }

      } catch (error) {
        logger.error({ error: error.message }, 'fleet-events: message error');
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.debug({ client: clientIp }, 'fleet-events: disconnected');
    });

    ws.on('error', (err) => {
      logger.error({ error: err.message, client: clientIp }, 'fleet-events: ws error');
      clients.delete(ws);
    });

    // Auth timeout: close if not authenticated within 10 seconds
    setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'Auth timeout');
      }
    }, 10000);
  });

  // Start periodic health broadcasts
  healthInterval = setInterval(() => {
    broadcastHealthStatus(fleetConfig);
  }, fleetConfig.settings.healthCheckIntervalMs);

  // Cleanup on server close
  httpServer.on('close', () => {
    if (healthInterval) {
      clearInterval(healthInterval);
      healthInterval = null;
    }
    for (const [ws] of clients) {
      ws.close(1001, 'Server shutting down');
    }
    clients.clear();
  });

  return httpServer;
}

// --- Broadcasting ---

/**
 * Broadcast an event to all clients subscribed to the given channel.
 */
export function broadcastEvent(channel: EventChannel, data: any): void {
  const event = JSON.stringify({
    type: 'event',
    channel,
    data,
    timestamp: Date.now(),
  });

  for (const client of clients.values()) {
    if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(event);
    }
  }
}

/**
 * Broadcast fleet health status to subscribed clients.
 */
function broadcastHealthStatus(fleetConfig: FleetConfig): void {
  const healthData = {
    nodeId: fleetConfig.nodeId,
    role: fleetConfig.role,
    uptime: process.uptime(),
    members: fleetConfig.members.map(m => ({
      id: m.id,
      name: m.name,
      host: m.host,
      status: 'unknown',
    })),
    checkedAt: Date.now(),
  };

  broadcastEvent('health', healthData);
}

/**
 * Get count of connected clients.
 */
export function getConnectedClientCount(): number {
  return clients.size;
}

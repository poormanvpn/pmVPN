// Fleet Mesh — inter-node coordination server
// MIT License
//
// Port 2602: Handles heartbeats and state synchronization between
// fleet members. Uses mutual wallet-based authentication.

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '../../server/src/utils/logger.js';
import { verifyWalletSignature } from '../../server/src/auth/verifier.js';
import type { WalletMap } from '../../server/src/config/wallets.js';
import type { FleetConfig } from '../../server/src/fleet-shared.js';

interface PeerState {
  nodeId: string;
  walletAddress: string;
  host: string;
  lastHeartbeat: number;
  status: 'connected' | 'stale' | 'disconnected';
  uptimeSeconds: number;
  version?: string;
}

// In-memory peer state
const peers = new Map<string, PeerState>();

// Stale timeout: peer is stale if no heartbeat for 2x healthCheck interval
let staleTimeoutMs = 60000;

export function createFleetMesh(
  walletMap: WalletMap,
  fleetConfig: FleetConfig
) {
  staleTimeoutMs = fleetConfig.settings.healthCheckIntervalMs * 2;

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const path = url.pathname;

      if (path === '/heartbeat' && req.method === 'POST') {
        return await handleHeartbeat(req, res, walletMap, fleetConfig);
      }
      if (path === '/sync' && req.method === 'POST') {
        return await handleSync(req, res, walletMap, fleetConfig);
      }
      if (path === '/peers' && req.method === 'GET') {
        return await handleListPeers(res);
      }
      if (path === '/status' && req.method === 'GET') {
        return await handleMeshStatus(res, fleetConfig);
      }

      await sendJson(res, 404, { error: 'Not Found' });
    } catch (error) {
      logger.error({ error: error.message }, 'Fleet mesh error');
      await sendJson(res, 500, { error: 'Internal Server Error' });
    }
  });

  // Periodic peer cleanup
  const cleanupInterval = setInterval(() => {
    cleanupStalePeers();
  }, staleTimeoutMs);

  server.on('close', () => {
    clearInterval(cleanupInterval);
    peers.clear();
  });

  return server;
}

// --- Route handlers ---

async function handleHeartbeat(
  req: IncomingMessage,
  res: ServerResponse,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
): Promise<void> {
  const body = await readBody(req);
  const heartbeat = JSON.parse(body);

  // Validate required fields
  if (!heartbeat.nodeId || !heartbeat.walletAddress || !heartbeat.signature) {
    await sendJson(res, 400, { error: 'Missing heartbeat fields' });
    return;
  }

  // Verify the sender is a known fleet member
  const member = fleetConfig.members.find(
    m => m.walletAddress.toLowerCase() === heartbeat.walletAddress.toLowerCase()
  );
  if (!member) {
    await sendJson(res, 403, { error: 'Unknown fleet member' });
    return;
  }

  // Verify wallet signature (simple signature of nodeId for heartbeats)
  const valid = await verifyWalletSignature(
    heartbeat.walletAddress,
    `PMVPN-HEARTBEAT:${heartbeat.nodeId}:${heartbeat.timestamp}`,
    heartbeat.signature
  );
  if (!valid) {
    await sendJson(res, 401, { error: 'Invalid heartbeat signature' });
    return;
  }

  // Update peer state
  peers.set(heartbeat.nodeId, {
    nodeId: heartbeat.nodeId,
    walletAddress: heartbeat.walletAddress,
    host: member.host,
    lastHeartbeat: Date.now(),
    status: 'connected',
    uptimeSeconds: heartbeat.uptime || 0,
    version: heartbeat.version,
  });

  logger.debug(
    { peer: heartbeat.nodeId, host: member.host },
    'fleet-mesh: heartbeat received'
  );

  // Respond with our own state
  await sendJson(res, 200, {
    ack: true,
    nodeId: fleetConfig.nodeId,
    role: fleetConfig.role,
    uptime: process.uptime(),
    peers: peers.size,
    timestamp: Date.now(),
  });
}

async function handleSync(
  req: IncomingMessage,
  res: ServerResponse,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
): Promise<void> {
  const body = await readBody(req);
  const syncPayload = JSON.parse(body);

  // Verify sender is a known member
  if (!syncPayload.walletAddress || !syncPayload.signature) {
    await sendJson(res, 400, { error: 'Missing auth fields' });
    return;
  }

  const member = fleetConfig.members.find(
    m => m.walletAddress.toLowerCase() === syncPayload.walletAddress.toLowerCase()
  );
  if (!member) {
    await sendJson(res, 403, { error: 'Unknown fleet member' });
    return;
  }

  logger.debug(
    { peer: syncPayload.nodeId, type: syncPayload.syncType },
    'fleet-mesh: sync received'
  );

  // Respond with our state for bidirectional sync
  await sendJson(res, 200, {
    nodeId: fleetConfig.nodeId,
    role: fleetConfig.role,
    members: fleetConfig.members.length,
    groups: Object.keys(fleetConfig.groups),
    timestamp: Date.now(),
  });
}

async function handleListPeers(res: ServerResponse): Promise<void> {
  const peerList = Array.from(peers.values()).map(p => ({
    nodeId: p.nodeId,
    host: p.host,
    status: p.status,
    lastHeartbeat: p.lastHeartbeat,
    uptimeSeconds: p.uptimeSeconds,
  }));

  await sendJson(res, 200, { peers: peerList, total: peerList.length });
}

async function handleMeshStatus(
  res: ServerResponse,
  fleetConfig: FleetConfig
): Promise<void> {
  const connected = Array.from(peers.values()).filter(p => p.status === 'connected').length;
  const stale = Array.from(peers.values()).filter(p => p.status === 'stale').length;

  await sendJson(res, 200, {
    nodeId: fleetConfig.nodeId,
    role: fleetConfig.role,
    peers: {
      total: peers.size,
      connected,
      stale,
      disconnected: peers.size - connected - stale,
    },
    staleTimeoutMs,
    uptime: process.uptime(),
  });
}

// --- Peer maintenance ---

function cleanupStalePeers(): void {
  const now = Date.now();
  for (const [nodeId, peer] of peers) {
    const elapsed = now - peer.lastHeartbeat;
    if (elapsed > staleTimeoutMs * 2) {
      peers.delete(nodeId);
      logger.info({ peer: nodeId }, 'fleet-mesh: peer removed (disconnected)');
    } else if (elapsed > staleTimeoutMs) {
      peer.status = 'stale';
    }
  }
}

// --- Utilities ---

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { resolve(body); });
    req.on('error', reject);
  });
}

async function sendJson(res: ServerResponse, statusCode: number, data: any): Promise<void> {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

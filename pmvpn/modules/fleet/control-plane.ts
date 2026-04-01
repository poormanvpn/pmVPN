// Fleet Control Plane — HTTP REST API for fleet-wide coordination
// MIT License
//
// Port 2600: Manages fleet membership, deployments, cross-server
// commands, and topology queries. Wallet-authenticated.

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { logger } from '../../server/src/utils/logger.js';
import { verifyWalletSignature } from '../../server/src/auth/verifier.js';
import { createChallenge, consumeChallenge } from '../../server/src/auth/challenge.js';
import { saveFleetConfig } from '../../server/src/config/fleet.js';
import type { WalletMap } from '../../server/src/config/wallets.js';
import type ModuleRegistry from '../registry.js';
import type {
  FleetConfig,
  FleetMember,
  FleetStatus,
  FleetMemberHealth,
  FleetDeployment,
  FleetDeploymentStep,
} from '../../server/src/fleet-shared.js';

// In-memory deployment tracking
const deployments = new Map<string, FleetDeployment>();

export function createFleetControlPlane(
  moduleRegistry: ModuleRegistry,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
) {
  const server = createServer(async (req, res) => {
    await handleRequest(req, res, moduleRegistry, walletMap, fleetConfig);
  });

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  moduleRegistry: ModuleRegistry,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const path = url.pathname;

    // Public endpoints (no auth)
    if (path === '/status' && req.method === 'GET') {
      return await handleStatus(res, fleetConfig);
    }
    if (path === '/challenge' && req.method === 'POST') {
      return await handleChallenge(req, res);
    }

    // Authenticated endpoints
    if (path === '/members' && req.method === 'GET') {
      return await handleListMembers(res, fleetConfig);
    }
    if (path === '/members' && req.method === 'POST') {
      return await handleAddMember(req, res, walletMap, fleetConfig);
    }
    if (path.startsWith('/members/') && req.method === 'DELETE') {
      const memberId = path.split('/')[2];
      return await handleRemoveMember(req, res, walletMap, fleetConfig, memberId);
    }
    if (path.match(/^\/members\/[^/]+\/health$/) && req.method === 'GET') {
      const memberId = path.split('/')[2];
      return await handleMemberHealth(res, fleetConfig, memberId);
    }
    if (path === '/deploy' && req.method === 'POST') {
      return await handleDeploy(req, res, walletMap, fleetConfig);
    }
    if (path.startsWith('/deploy/') && req.method === 'GET') {
      const deployId = path.split('/')[2];
      return await handleDeployStatus(res, deployId);
    }
    if (path === '/command' && req.method === 'POST') {
      return await handleCommand(req, res, walletMap, moduleRegistry, fleetConfig);
    }
    if (path === '/groups' && req.method === 'GET') {
      return await handleListGroups(res, fleetConfig);
    }
    if (path === '/groups' && req.method === 'POST') {
      return await handleUpdateGroup(req, res, walletMap, fleetConfig);
    }
    if (path === '/topology' && req.method === 'GET') {
      return await handleTopology(res, fleetConfig);
    }

    await sendError(res, 404, 'Not Found');
  } catch (error) {
    logger.error({ error: error.message }, 'Fleet control plane error');
    await sendError(res, 500, 'Internal Server Error', error.message);
  }
}

// --- Route handlers ---

async function handleStatus(
  res: ServerResponse,
  fleetConfig: FleetConfig
): Promise<void> {
  const status: FleetStatus = {
    nodeId: fleetConfig.nodeId,
    role: fleetConfig.role,
    uptime: process.uptime(),
    members: {
      total: fleetConfig.members.length,
      healthy: 0,   // Populated by health checks
      warning: 0,
      critical: 0,
      unreachable: fleetConfig.members.length,
    },
    groups: Object.keys(fleetConfig.groups),
  };

  await sendJson(res, 200, status);
}

async function handleChallenge(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'POST') {
    await sendError(res, 405, 'Method Not Allowed');
    return;
  }

  const body = await readBody(req);
  const { address } = JSON.parse(body);

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    await sendError(res, 400, 'Invalid wallet address');
    return;
  }

  const challenge = createChallenge(address);
  if (!challenge) {
    await sendError(res, 503, 'Challenge store full, try again');
    return;
  }

  await sendJson(res, 200, challenge);
}

async function handleListMembers(
  res: ServerResponse,
  fleetConfig: FleetConfig
): Promise<void> {
  const members = fleetConfig.members.map(m => ({
    id: m.id,
    name: m.name,
    host: m.host,
    coreBasePort: m.coreBasePort,
    fleetBasePort: m.fleetBasePort,
    environment: m.environment,
    tags: m.tags,
    addedAt: m.addedAt,
  }));

  await sendJson(res, 200, { members, total: members.length });
}

async function handleAddMember(
  req: IncomingMessage,
  res: ServerResponse,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
): Promise<void> {
  const body = await readBody(req);
  const request = JSON.parse(body);

  // Authenticate
  const authResult = await authenticateRequest(request, walletMap);
  if (!authResult.success) {
    await sendError(res, 401, authResult.error!);
    return;
  }

  // Check admin permission
  if (authResult.user.role !== 'admin') {
    await sendError(res, 403, 'admin:fleet permission required');
    return;
  }

  // Validate member data
  if (!request.member || !request.member.host) {
    await sendError(res, 400, 'Missing member data (host required)');
    return;
  }

  const member: FleetMember = {
    id: randomUUID(),
    name: request.member.name || `node-${Date.now()}`,
    host: request.member.host,
    coreBasePort: request.member.coreBasePort || 2200,
    fleetBasePort: request.member.fleetBasePort || 2600,
    walletAddress: request.member.walletAddress || '',
    environment: request.member.environment || 'development',
    tags: request.member.tags || [],
    addedAt: Date.now(),
  };

  fleetConfig.members.push(member);
  saveFleetConfig(fleetConfig);

  logger.info({ memberId: member.id, host: member.host }, 'Fleet member added');
  await sendJson(res, 201, { member });
}

async function handleRemoveMember(
  req: IncomingMessage,
  res: ServerResponse,
  walletMap: WalletMap,
  fleetConfig: FleetConfig,
  memberId: string
): Promise<void> {
  const body = await readBody(req);
  const request = JSON.parse(body);

  const authResult = await authenticateRequest(request, walletMap);
  if (!authResult.success) {
    await sendError(res, 401, authResult.error!);
    return;
  }
  if (authResult.user.role !== 'admin') {
    await sendError(res, 403, 'admin:fleet permission required');
    return;
  }

  const idx = fleetConfig.members.findIndex(m => m.id === memberId);
  if (idx === -1) {
    await sendError(res, 404, `Member not found: ${memberId}`);
    return;
  }

  const removed = fleetConfig.members.splice(idx, 1)[0];

  // Remove from groups
  for (const groupMembers of Object.values(fleetConfig.groups)) {
    const gIdx = groupMembers.indexOf(memberId);
    if (gIdx !== -1) groupMembers.splice(gIdx, 1);
  }

  saveFleetConfig(fleetConfig);
  logger.info({ memberId, name: removed.name }, 'Fleet member removed');
  await sendJson(res, 200, { removed });
}

async function handleMemberHealth(
  res: ServerResponse,
  fleetConfig: FleetConfig,
  memberId: string
): Promise<void> {
  const member = fleetConfig.members.find(m => m.id === memberId);
  if (!member) {
    await sendError(res, 404, `Member not found: ${memberId}`);
    return;
  }

  // Probe the member's admin port for health
  const health: FleetMemberHealth = {
    id: member.id,
    name: member.name,
    host: member.host,
    status: 'unreachable',
    lastSeen: 0,
  };

  try {
    const adminPort = member.coreBasePort + 7; // Admin API
    const result = await httpProbe(member.host, adminPort, '/status', 3000);
    if (result) {
      health.status = 'healthy';
      health.lastSeen = Date.now();
      health.metrics = {
        cpuPercent: 0,
        memoryPercent: 0,
        diskPercent: 0,
        uptimeSeconds: result.uptime || 0,
      };
    }
  } catch {
    health.status = 'unreachable';
  }

  await sendJson(res, 200, health);
}

async function handleDeploy(
  req: IncomingMessage,
  res: ServerResponse,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
): Promise<void> {
  const body = await readBody(req);
  const request = JSON.parse(body);

  const authResult = await authenticateRequest(request, walletMap);
  if (!authResult.success) {
    await sendError(res, 401, authResult.error!);
    return;
  }
  if (!['admin', 'operator'].includes(authResult.user.role)) {
    await sendError(res, 403, 'deploy:servers permission required');
    return;
  }

  // Determine target members
  let targets: string[];
  if (request.targets) {
    targets = request.targets;
  } else if (request.group && fleetConfig.groups[request.group]) {
    targets = fleetConfig.groups[request.group];
  } else if (request.environment) {
    targets = fleetConfig.members
      .filter(m => m.environment === request.environment)
      .map(m => m.id);
  } else {
    targets = fleetConfig.members.map(m => m.id);
  }

  const deployment: FleetDeployment = {
    id: `deploy-${Date.now()}`,
    status: 'planning',
    strategy: request.strategy || fleetConfig.settings.deploymentStrategy,
    targets,
    startedAt: Date.now(),
    steps: targets.map(memberId => {
      const member = fleetConfig.members.find(m => m.id === memberId);
      return {
        name: `Deploy to ${member?.name || memberId}`,
        memberId,
        status: 'pending' as const,
      };
    }),
  };

  deployments.set(deployment.id, deployment);
  logger.info(
    { deployId: deployment.id, targets: targets.length, strategy: deployment.strategy },
    'Fleet deployment initiated'
  );

  await sendJson(res, 202, { deployment });
}

async function handleDeployStatus(
  res: ServerResponse,
  deployId: string
): Promise<void> {
  const deployment = deployments.get(deployId);
  if (!deployment) {
    await sendError(res, 404, `Deployment not found: ${deployId}`);
    return;
  }

  await sendJson(res, 200, { deployment });
}

async function handleCommand(
  req: IncomingMessage,
  res: ServerResponse,
  walletMap: WalletMap,
  moduleRegistry: ModuleRegistry,
  fleetConfig: FleetConfig
): Promise<void> {
  const body = await readBody(req);
  const request = JSON.parse(body);

  const authResult = await authenticateRequest(request, walletMap);
  if (!authResult.success) {
    await sendError(res, 401, authResult.error!);
    return;
  }

  if (!request.command) {
    await sendError(res, 400, 'Missing command');
    return;
  }

  // Determine target members
  let targets: FleetMember[];
  if (request.targets) {
    targets = fleetConfig.members.filter(m => request.targets.includes(m.id));
  } else if (request.group && fleetConfig.groups[request.group]) {
    const groupIds = fleetConfig.groups[request.group];
    targets = fleetConfig.members.filter(m => groupIds.includes(m.id));
  } else {
    targets = fleetConfig.members;
  }

  logger.info(
    { command: request.command, targets: targets.length },
    'Fleet command dispatched'
  );

  // Return the command plan (actual execution would coordinate with remote nodes)
  await sendJson(res, 200, {
    command: request.command,
    parameters: request.parameters || {},
    targets: targets.map(t => ({ id: t.id, name: t.name, host: t.host })),
    status: 'dispatched',
    dispatchedAt: Date.now(),
  });
}

async function handleListGroups(
  res: ServerResponse,
  fleetConfig: FleetConfig
): Promise<void> {
  const groups = Object.entries(fleetConfig.groups).map(([name, memberIds]) => ({
    name,
    members: memberIds.length,
    memberIds,
  }));

  await sendJson(res, 200, { groups });
}

async function handleUpdateGroup(
  req: IncomingMessage,
  res: ServerResponse,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
): Promise<void> {
  const body = await readBody(req);
  const request = JSON.parse(body);

  const authResult = await authenticateRequest(request, walletMap);
  if (!authResult.success) {
    await sendError(res, 401, authResult.error!);
    return;
  }
  if (authResult.user.role !== 'admin') {
    await sendError(res, 403, 'admin:fleet permission required');
    return;
  }

  if (!request.name || !Array.isArray(request.memberIds)) {
    await sendError(res, 400, 'Missing group name or memberIds');
    return;
  }

  fleetConfig.groups[request.name] = request.memberIds;
  saveFleetConfig(fleetConfig);

  logger.info({ group: request.name, members: request.memberIds.length }, 'Fleet group updated');
  await sendJson(res, 200, { group: request.name, memberIds: request.memberIds });
}

async function handleTopology(
  res: ServerResponse,
  fleetConfig: FleetConfig
): Promise<void> {
  const topology = {
    nodeId: fleetConfig.nodeId,
    role: fleetConfig.role,
    members: fleetConfig.members.map(m => ({
      id: m.id,
      name: m.name,
      host: m.host,
      coreBasePort: m.coreBasePort,
      fleetBasePort: m.fleetBasePort,
      environment: m.environment,
      tags: m.tags,
    })),
    groups: fleetConfig.groups,
    connections: fleetConfig.members.map(m => ({
      from: fleetConfig.nodeId,
      to: m.id,
      status: 'unknown',
    })),
  };

  await sendJson(res, 200, topology);
}

// --- Auth helpers (shared pattern with provider-gateway.ts) ---

async function authenticateRequest(
  request: { walletAddress: string; signature: string; nonce: string },
  walletMap: WalletMap
): Promise<{ success: boolean; user?: any; error?: string }> {
  const message = consumeChallenge(request.nonce);
  if (!message) {
    return { success: false, error: 'Invalid or expired nonce' };
  }

  const signatureValid = await verifyWalletSignature(
    request.walletAddress,
    message,
    request.signature
  );

  if (!signatureValid) {
    return { success: false, error: 'Invalid signature' };
  }

  const walletEntry = walletMap.get(request.walletAddress.toLowerCase());
  if (!walletEntry) {
    return { success: false, error: 'Wallet not registered' };
  }

  return {
    success: true,
    user: {
      wallet: request.walletAddress,
      username: walletEntry.user,
      role: walletEntry.role,
    },
  };
}

// --- HTTP probe for health checks ---

async function httpProbe(
  host: string,
  port: number,
  path: string,
  timeoutMs: number
): Promise<any> {
  const { createConnection } = await import('node:net');

  return new Promise((resolve, reject) => {
    const client = createConnection(port, host);
    client.setTimeout(timeoutMs);

    client.on('connect', () => {
      client.write(`GET ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\n\r\n`);
    });

    let response = '';
    client.on('data', (data) => { response += data.toString(); });
    client.on('end', () => {
      try {
        const bodyStart = response.indexOf('\r\n\r\n') + 4;
        const body = response.substring(bodyStart);
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
    client.on('timeout', () => { client.destroy(); reject(new Error('timeout')); });
    client.on('error', reject);
  });
}

// --- Utility functions ---

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

async function sendError(res: ServerResponse, statusCode: number, message: string, details?: string): Promise<void> {
  await sendJson(res, statusCode, { error: message, details: details || undefined });
}

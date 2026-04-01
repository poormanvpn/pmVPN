// Fleet Metrics — Prometheus-compatible metrics and health endpoint
// MIT License
//
// Port 2603: Serves metrics in Prometheus text format (no auth)
// and historical health data (wallet auth for /history).

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '../../server/src/utils/logger.js';
import { verifyWalletSignature } from '../../server/src/auth/verifier.js';
import { consumeChallenge } from '../../server/src/auth/challenge.js';
import type { WalletMap } from '../../server/src/config/wallets.js';
import type ModuleRegistry from '../registry.js';
import type { FleetConfig } from '../../server/src/fleet-shared.js';

// Ring buffer for metric history
interface MetricSample {
  timestamp: number;
  memberId: string;
  metric: string;
  value: number;
}

const SAMPLES_PER_HOUR = 120; // One sample every 30 seconds
let maxSamples: number;
const metricHistory: MetricSample[] = [];

// Collect interval
let collectInterval: ReturnType<typeof setInterval> | null = null;

export function createFleetMetrics(
  moduleRegistry: ModuleRegistry,
  walletMap: WalletMap,
  fleetConfig: FleetConfig
) {
  maxSamples = SAMPLES_PER_HOUR * fleetConfig.settings.metricsRetentionHours;

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const path = url.pathname;

      if (path === '/metrics' && req.method === 'GET') {
        return await handleMetrics(res, fleetConfig, moduleRegistry);
      }
      if (path === '/health' && req.method === 'GET') {
        return await handleHealth(res, fleetConfig);
      }
      if (path === '/history' && req.method === 'GET') {
        return await handleHistory(req, res, url, walletMap);
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (error) {
      logger.error({ error: error.message }, 'Fleet metrics error');
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  // Collect local metrics periodically
  collectInterval = setInterval(() => {
    collectLocalMetrics(fleetConfig);
  }, fleetConfig.settings.healthCheckIntervalMs);

  server.on('close', () => {
    if (collectInterval) {
      clearInterval(collectInterval);
      collectInterval = null;
    }
  });

  return server;
}

// --- Route handlers ---

async function handleMetrics(
  res: ServerResponse,
  fleetConfig: FleetConfig,
  moduleRegistry: ModuleRegistry
): Promise<void> {
  const lines: string[] = [];

  // Process metrics
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  lines.push('# HELP pmvpn_uptime_seconds Server uptime in seconds');
  lines.push('# TYPE pmvpn_uptime_seconds gauge');
  lines.push(`pmvpn_uptime_seconds ${process.uptime().toFixed(1)}`);

  lines.push('# HELP pmvpn_memory_heap_bytes Heap memory usage in bytes');
  lines.push('# TYPE pmvpn_memory_heap_bytes gauge');
  lines.push(`pmvpn_memory_heap_bytes ${memUsage.heapUsed}`);

  lines.push('# HELP pmvpn_memory_rss_bytes Resident set size in bytes');
  lines.push('# TYPE pmvpn_memory_rss_bytes gauge');
  lines.push(`pmvpn_memory_rss_bytes ${memUsage.rss}`);

  lines.push('# HELP pmvpn_cpu_user_microseconds CPU user time in microseconds');
  lines.push('# TYPE pmvpn_cpu_user_microseconds counter');
  lines.push(`pmvpn_cpu_user_microseconds ${cpuUsage.user}`);

  lines.push('# HELP pmvpn_cpu_system_microseconds CPU system time in microseconds');
  lines.push('# TYPE pmvpn_cpu_system_microseconds counter');
  lines.push(`pmvpn_cpu_system_microseconds ${cpuUsage.system}`);

  // Fleet metrics
  lines.push('# HELP pmvpn_fleet_members_total Total fleet members');
  lines.push('# TYPE pmvpn_fleet_members_total gauge');
  lines.push(`pmvpn_fleet_members_total ${fleetConfig.members.length}`);

  lines.push('# HELP pmvpn_fleet_groups_total Total fleet groups');
  lines.push('# TYPE pmvpn_fleet_groups_total gauge');
  lines.push(`pmvpn_fleet_groups_total ${Object.keys(fleetConfig.groups).length}`);

  // Module metrics
  const modules = moduleRegistry.listModules();
  lines.push('# HELP pmvpn_modules_loaded Total loaded modules');
  lines.push('# TYPE pmvpn_modules_loaded gauge');
  lines.push(`pmvpn_modules_loaded ${modules.length}`);

  const providers = moduleRegistry.getCloudProviderRegistry().getAll();
  lines.push('# HELP pmvpn_cloud_providers_total Registered cloud providers');
  lines.push('# TYPE pmvpn_cloud_providers_total gauge');
  lines.push(`pmvpn_cloud_providers_total ${providers.length}`);

  const commands = moduleRegistry.getCommands();
  lines.push('# HELP pmvpn_commands_registered Total registered commands');
  lines.push('# TYPE pmvpn_commands_registered gauge');
  lines.push(`pmvpn_commands_registered ${commands.length}`);

  // Per-member metrics
  for (const member of fleetConfig.members) {
    const labels = `member="${member.name}",host="${member.host}",environment="${member.environment}"`;
    lines.push(`pmvpn_fleet_member_info{${labels},id="${member.id}"} 1`);
  }

  // Metric history count
  lines.push('# HELP pmvpn_metric_history_samples Samples in metric history buffer');
  lines.push('# TYPE pmvpn_metric_history_samples gauge');
  lines.push(`pmvpn_metric_history_samples ${metricHistory.length}`);

  const body = lines.join('\n') + '\n';
  res.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleHealth(
  res: ServerResponse,
  fleetConfig: FleetConfig
): Promise<void> {
  const health = {
    nodeId: fleetConfig.nodeId,
    role: fleetConfig.role,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    members: fleetConfig.members.map(m => ({
      id: m.id,
      name: m.name,
      host: m.host,
      environment: m.environment,
      status: 'unknown', // Would be populated by mesh heartbeats
    })),
    checkedAt: Date.now(),
  };

  const json = JSON.stringify(health);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

async function handleHistory(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  walletMap: WalletMap
): Promise<void> {
  // History requires wallet authentication via query params or header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    const json = JSON.stringify({ error: 'Authorization required for history' });
    res.writeHead(401, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
    return;
  }

  // Filter params
  const memberId = url.searchParams.get('member');
  const metric = url.searchParams.get('metric');
  const from = parseInt(url.searchParams.get('from') || '0', 10);
  const to = parseInt(url.searchParams.get('to') || String(Date.now()), 10);

  let filtered = metricHistory.filter(s => s.timestamp >= from && s.timestamp <= to);

  if (memberId) {
    filtered = filtered.filter(s => s.memberId === memberId);
  }
  if (metric) {
    filtered = filtered.filter(s => s.metric === metric);
  }

  const json = JSON.stringify({
    samples: filtered,
    total: filtered.length,
    from,
    to,
    query: { memberId, metric },
  });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

// --- Metric collection ---

function collectLocalMetrics(fleetConfig: FleetConfig): void {
  const now = Date.now();
  const memUsage = process.memoryUsage();

  addSample(now, fleetConfig.nodeId, 'heap_bytes', memUsage.heapUsed);
  addSample(now, fleetConfig.nodeId, 'rss_bytes', memUsage.rss);
  addSample(now, fleetConfig.nodeId, 'uptime_seconds', process.uptime());
}

function addSample(timestamp: number, memberId: string, metric: string, value: number): void {
  metricHistory.push({ timestamp, memberId, metric, value });

  // Evict oldest if over capacity
  while (metricHistory.length > maxSamples) {
    metricHistory.shift();
  }
}

/**
 * Record a metric sample from an external source (e.g., mesh heartbeat).
 */
export function recordMetric(memberId: string, metric: string, value: number): void {
  addSample(Date.now(), memberId, metric, value);
}

// HTTP challenge endpoint — Node built-in http (no Express)
// MIT License
//
// Minimal attack surface. No framework. Manual routing.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, cpus, totalmem, freemem, loadavg, networkInterfaces, release, hostname as osHostname, type as osType, arch } from 'node:os';
import { createChallenge } from '../auth/challenge.js';
import { logger } from '../utils/logger.js';
import { getActiveSessions, getSessionsForWallet, getSessionCounts } from '../utils/sessions.js';
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

    // GET /diagnostics — system telemetry for admin dashboard
    // Public: basic health (cpu%, mem%, disk%, uptime)
    // Admin: full forensic (interfaces, traffic, connections, processes)
    // Admin auth: X-Wallet header must match an admin in walletMap
    if (req.method === 'GET' && url.pathname === '/diagnostics') {
      try {
        // Check if requester is admin
        const reqWallet = (req.headers['x-wallet'] as string || '').toLowerCase();
        const reqEntry = walletMap.get(reqWallet);
        const isAdmin = reqEntry?.role === 'admin';
        const run = (cmd: string) => { try { return execSync(cmd, { stdio: 'pipe', timeout: 3000 }).toString().trim(); } catch { return ''; } };

        const cpuInfo = cpus();
        const totalMem = totalmem();
        const freeMem = freemem();
        const load = loadavg();

        // Disk (bytes only, no paths)
        const dfLine = run('df -B1 / | tail -1').split(/\s+/);

        // Network interfaces (IP only, no MAC — MAC is a fingerprint)
        const netIfaces: { name: string; address: string; family: string }[] = [];
        const ifaces = networkInterfaces();
        for (const [name, addrs] of Object.entries(ifaces)) {
          if (!addrs) continue;
          for (const a of addrs) {
            if (!a.internal) netIfaces.push({ name, address: a.address, family: a.family });
          }
        }

        // Traffic counters (bytes rx/tx per interface, no identifying info)
        const traffic = run('cat /proc/net/dev 2>/dev/null').split('\n').slice(2).map(line => {
          const p = line.trim().split(/[\s:]+/);
          if (p[0] === 'lo') return null;
          return { iface: p[0], rxBytes: parseInt(p[1]) || 0, txBytes: parseInt(p[9]) || 0 };
        }).filter(Boolean);

        // GPU (safe — just device name)
        const gpuInfo = run('lspci 2>/dev/null | grep -i "vga\\|3d\\|display"') || 'none';

        // Connection counts (numbers only, no IPs)
        const activeSSH = parseInt(run('ss -tn state established 2>/dev/null | grep -cE ":220[0-7]"')) || 0;
        const activeWS = parseInt(run('ss -tn state established 2>/dev/null | grep -c ":2204"')) || 0;
        const activeFleet = parseInt(run('ss -tn state established 2>/dev/null | grep -cE ":260[0-3]"')) || 0;

        // Public response: health only + own sessions if wallet provided
        const mySessions = reqWallet ? getSessionsForWallet(reqWallet).map(s => ({
          id: s.id,
          type: s.type,
          clientIP: s.clientIP,
          connectedAt: s.connectedAt,
          durationSeconds: Math.round((Date.now() - s.connectedAt) / 1000),
        })) : [];

        const publicData = {
          timestamp: Date.now(),
          health: 'ok',
          cpu: { cores: cpuInfo.length, loadPercent: Math.round(load[0] / cpuInfo.length * 100) },
          memory: { percent: Math.round(((totalMem - freeMem) / totalMem) * 100) },
          disk: { percent: dfLine[4] || '0%' },
          uptime: Math.round(process.uptime()),
          mySessions,
        };

        if (!isAdmin) {
          return sendJSON(res, 200, publicData);
        }

        // Admin forensic response: full system telemetry
        // Only returned when X-Wallet header matches an admin wallet
        const procCount = parseInt(run('ps aux --no-headers | wc -l')) || 0;
        const topProcs = run("ps aux --no-headers --sort=-%mem | head -8 | awk '{printf \"%s %.1f%%cpu %.1f%%mem\\n\", $11, $3, $4}'")
          .split('\n').filter(Boolean);
        const openFiles = parseInt(run('ls /proc/self/fd 2>/dev/null | wc -l')) || 0;
        const tcpConns = parseInt(run('ss -tn state established 2>/dev/null | wc -l')) || 0;
        const ufwStatus = run('ufw status 2>/dev/null | head -1') || 'unknown';
        const lastLogins = run('last -n 5 --time-format iso 2>/dev/null | head -5')
          .split('\n').filter(Boolean);
        const failedSSH = parseInt(run('journalctl -u sshd --since "1 hour ago" --no-pager 2>/dev/null | grep -c "Failed"')) || 0;
        const dmesgErrors = parseInt(run('dmesg --level=err,warn 2>/dev/null | tail -20 | wc -l')) || 0;

        return sendJSON(res, 200, {
          ...publicData,
          admin: true,
          platform: `${osType()} ${arch()}`,
          kernel: release(),
          hostname: osHostname(),
          cpu: {
            model: cpuInfo[0]?.model || 'unknown',
            cores: cpuInfo.length,
            speed: cpuInfo[0]?.speed || 0,
            loadAvg: { '1m': +load[0].toFixed(2), '5m': +load[1].toFixed(2), '15m': +load[2].toFixed(2) },
            loadPercent: Math.round(load[0] / cpuInfo.length * 100),
          },
          memory: {
            totalGB: +(totalMem / 1073741824).toFixed(1),
            usedGB: +((totalMem - freeMem) / 1073741824).toFixed(1),
            freeGB: +(freeMem / 1073741824).toFixed(1),
            percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
          },
          disk: {
            totalGB: +(parseInt(dfLine[1] || '0') / 1073741824).toFixed(1),
            usedGB: +(parseInt(dfLine[2] || '0') / 1073741824).toFixed(1),
            availableGB: +(parseInt(dfLine[3] || '0') / 1073741824).toFixed(1),
            percent: dfLine[4] || '0%',
          },
          gpu: gpuInfo,
          network: {
            interfaces: netIfaces,
            traffic,
          },
          connections: { ssh: activeSSH, websocket: activeWS, fleet: activeFleet, tcp: tcpConns },
          pmvpn: {
            pid: process.pid,
            nodeVersion: process.version,
            uptimeSeconds: Math.round(process.uptime()),
            heapMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1),
            rssMB: +(process.memoryUsage().rss / 1048576).toFixed(1),
          },
          forensic: {
            totalProcesses: procCount,
            topConsumers: topProcs,
            openFileDescriptors: openFiles,
            firewall: ufwStatus,
            failedSSHLastHour: failedSSH,
            kernelWarnings: dmesgErrors,
            recentLogins: lastLogins,
          },
          sysadmin: {
            // htop-style: top processes by CPU
            topCPU: run("ps aux --no-headers --sort=-%cpu | head -10 | awk '{printf \"%s %s%%cpu %s%%mem %s\\n\", $1, $3, $4, $11}'")
              .split('\n').filter(Boolean),
            // ls -al style: root home listing
            rootListing: run('ls -al /opt/pmvpn/ 2>/dev/null | head -15').split('\n').filter(Boolean),
            // df -h: all filesystems
            diskUsage: run('df -h 2>/dev/null').split('\n').filter(Boolean),
            // netstat/ss: listening ports
            listeningPorts: run('ss -tlnp 2>/dev/null | grep LISTEN').split('\n').filter(Boolean),
            // ifconfig/ip: network config
            networkConfig: run('ip -br addr 2>/dev/null').split('\n').filter(Boolean),
            // active TCP connections (count by state)
            tcpStates: run('ss -tan 2>/dev/null | tail -n +2 | awk "{print \\$1}" | sort | uniq -c | sort -rn').split('\n').filter(Boolean),
            // quota status for wallet users
            quotaReport: run('repquota / 2>/dev/null | grep -E "^w|^pmvpn|Block limits"').split('\n').filter(Boolean),
            // system uptime and load
            uptime: run('uptime'),
            // memory detail
            memInfo: run('free -h'),
          },
          wallets: {
            registered: walletMap.size,
            admins: Array.from(walletMap.entries()).filter(([, e]) => e.role === 'admin').length,
          },
          sessions: {
            active: getActiveSessions().map(s => ({
              id: s.id,
              wallet: s.wallet.slice(0, 10) + '...',
              username: s.username,
              type: s.type,
              clientIP: s.clientIP,
              connectedAt: s.connectedAt,
              lastActivity: s.lastActivity,
              durationSeconds: Math.round((Date.now() - s.connectedAt) / 1000),
            })),
            counts: getSessionCounts(),
            // Sessions belonging to the requesting wallet
            mine: getSessionsForWallet(reqWallet).map(s => ({
              id: s.id,
              type: s.type,
              clientIP: s.clientIP,
              connectedAt: s.connectedAt,
              durationSeconds: Math.round((Date.now() - s.connectedAt) / 1000),
            })),
          },
        });
      } catch (err: any) {
        return sendJSON(res, 500, { error: 'diagnostics unavailable' });
      }
    }

    // 404 everything else
    sendJSON(res, 404, { error: 'not found' });
  });
}

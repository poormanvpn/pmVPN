// SPDX-License-Identifier: GPL-3.0-only
// Fleet configuration loader
// MIT License
//
// Loads fleet config from ~/.pmvpn/fleet.json (or PMVPN_FLEET_CONFIG env var).
// Returns null if no fleet config exists — server runs in single-server mode.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { FleetConfig, FleetMember, FleetSettings } from '../fleet-shared.js';
import { DEFAULT_FLEET_SETTINGS } from '../fleet-shared.js';

const DEFAULT_CONFIG_PATH = join(homedir(), '.pmvpn', 'fleet.json');

function getConfigPath(): string {
  return process.env.PMVPN_FLEET_CONFIG || DEFAULT_CONFIG_PATH;
}

/**
 * Load fleet configuration.
 * Returns null if no fleet config file exists (single-server mode).
 */
export function loadFleetConfig(): FleetConfig | null {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const data = JSON.parse(raw) as Partial<FleetConfig>;

    // Ensure nodeId exists
    if (!data.nodeId) {
      data.nodeId = generateNodeId();
    }

    // Apply defaults
    const config: FleetConfig = {
      nodeId: data.nodeId,
      role: data.role || 'standalone',
      members: (data.members || []).map(normalizeMember),
      settings: { ...DEFAULT_FLEET_SETTINGS, ...data.settings },
      groups: data.groups || {},
    };

    // Persist if we generated a nodeId
    if (!data.nodeId) {
      saveFleetConfig(config);
    }

    return config;
  } catch (err) {
    console.error(
      `[pmvpn] failed to parse ${configPath}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Save fleet configuration to disk.
 */
export function saveFleetConfig(config: FleetConfig): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Generate a unique node ID for this fleet member.
 */
export function generateNodeId(): string {
  return randomUUID();
}

/**
 * Normalize a fleet member entry, filling in defaults.
 */
function normalizeMember(member: Partial<FleetMember>): FleetMember {
  return {
    id: member.id || randomUUID(),
    name: member.name || `node-${(member.id || 'unknown').slice(0, 8)}`,
    host: member.host || 'localhost',
    coreBasePort: member.coreBasePort || 2200,
    fleetBasePort: member.fleetBasePort || 2600,
    walletAddress: member.walletAddress || '',
    environment: member.environment || 'development',
    tags: member.tags || [],
    addedAt: member.addedAt || Date.now(),
  };
}

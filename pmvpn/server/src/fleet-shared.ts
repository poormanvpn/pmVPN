// SPDX-License-Identifier: GPL-3.0-only
// Fleet shared constants and types
// MIT License
//
// Defines the fleet port architecture (2600+) for multi-server
// coordination, separate from the core 8-port range (2200-2207).

// --- constants ---

export const DEFAULT_FLEET_BASE_PORT = 2600;

export const FLEET_PORT_OFFSET = {
  CONTROL: 0,    // Fleet Control Plane (HTTP REST)
  EVENTS: 1,     // Fleet Events (WebSocket)
  MESH: 2,       // Inter-node mesh coordination
  METRICS: 3,    // Prometheus metrics + health
} as const;

export type FleetPortOffset = typeof FLEET_PORT_OFFSET[keyof typeof FLEET_PORT_OFFSET];

export const FLEET_PORT_NAMES: Record<number, string> = {
  0: 'Fleet Control',
  1: 'Fleet Events',
  2: 'Fleet Mesh',
  3: 'Fleet Metrics',
};

export const NUM_FLEET_PORTS = 4;

// --- types ---

export type FleetNodeRole = 'coordinator' | 'member' | 'standalone';

export interface FleetConfig {
  nodeId: string;                                      // Auto-generated UUID
  role: FleetNodeRole;                                 // This node's role in the fleet

  members: FleetMember[];                              // Known fleet members

  settings: FleetSettings;

  groups: Record<string, string[]>;                    // Group name → member IDs
}

export interface FleetSettings {
  healthCheckIntervalMs: number;                       // Default 30000
  deploymentStrategy: 'rolling' | 'blue-green' | 'canary';
  meshEnabled: boolean;                                // Whether port 2602 is active
  metricsEnabled: boolean;                             // Whether port 2603 is active
  metricsRetentionHours: number;                       // Default 168 (7 days)
}

export interface FleetMember {
  id: string;                                          // Unique member ID
  name: string;                                        // Human-readable name
  host: string;                                        // IP or hostname
  coreBasePort: number;                                // Core port base (usually 2200)
  fleetBasePort: number;                               // Fleet port base (usually 2600)
  walletAddress: string;                               // Wallet address for auth on that node
  environment: 'production' | 'staging' | 'development';
  tags: string[];                                      // Arbitrary tags for filtering
  addedAt: number;                                     // Unix timestamp ms
}

export interface FleetStatus {
  nodeId: string;
  role: FleetNodeRole;
  uptime: number;
  members: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    unreachable: number;
  };
  groups: string[];
}

export interface FleetMemberHealth {
  id: string;
  name: string;
  host: string;
  status: 'healthy' | 'warning' | 'critical' | 'unreachable';
  lastSeen: number;                                    // Unix timestamp ms
  metrics?: {
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
    uptimeSeconds: number;
  };
}

export interface FleetDeployment {
  id: string;
  status: 'planning' | 'deploying' | 'completed' | 'failed' | 'rolled-back';
  strategy: FleetSettings['deploymentStrategy'];
  targets: string[];                                   // Member IDs
  startedAt: number;
  completedAt?: number;
  steps: FleetDeploymentStep[];
}

export interface FleetDeploymentStep {
  name: string;
  memberId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export const DEFAULT_FLEET_SETTINGS: FleetSettings = {
  healthCheckIntervalMs: 30000,
  deploymentStrategy: 'rolling',
  meshEnabled: true,
  metricsEnabled: true,
  metricsRetentionHours: 168,
};

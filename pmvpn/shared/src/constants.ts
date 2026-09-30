// SPDX-License-Identifier: GPL-3.0-only
// PMVPN protocol constants
// MIT License — shared between client and server

export const PROTOCOL_VERSION = '0.1.2';
export const PROTOCOL_PREFIX = 'PMVPN';

// Default base port — all 8 services offset from this
export const DEFAULT_BASE_PORT = 2200;

// Port offsets from base
export const PORT_OFFSET = {
  SSH_SHELL: 0,    // Interactive terminal
  SFTP: 1,         // File transfer
  SSH_EXEC: 2,     // Non-interactive commands
  CHALLENGE: 3,    // HTTP nonce endpoint
  TUNNEL: 4,       // VPN tunnel (multiplexed TCP/UDP/DNS)
  FILE_SYNC: 5,    // Bidirectional sync
  CLAUDE_AI: 6,    // Claude proxy channel
  ADMIN: 7,        // Server management
} as const;

export type PortOffset = typeof PORT_OFFSET[keyof typeof PORT_OFFSET];

export const PORT_NAMES: Record<number, string> = {
  0: 'SSH Shell',
  1: 'SFTP',
  2: 'SSH Exec',
  3: 'Challenge API',
  4: 'VPN Tunnel',
  5: 'File Sync',
  6: 'Claude AI',
  7: 'Admin',
};

export const NUM_PORTS = 8;

// --- keyring: one wallet signature → N port-scoped Ed25519 keys ---
// Mirrors crypto-ssh/src/keyring.ts. Index i is valid on port base+i only.

export const KEYRING_VERSION = 1;
export const KEYRING_MESSAGE_PREFIX = 'PMVPN-KEYRING:v1:';
export const KEYRING_SALT = 'pmvpn-keyring';
export const DEFAULT_KEYRING_SIZE = NUM_PORTS;
export const MAX_KEYRING_SIZE = 64;

export const PORT_SLUGS: readonly string[] = [
  'shell', 'sftp', 'exec', 'challenge', 'tunnel', 'sync', 'claude', 'admin',
];

export function portSlug(index: number): string {
  return PORT_SLUGS[index] ?? `k${index}`;
}

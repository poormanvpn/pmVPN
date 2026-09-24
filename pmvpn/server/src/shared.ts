// Inline shared constants and types (from @pmvpn/shared)
// MIT License
//
// These are duplicated here for standalone server operation.
// The canonical source is ../shared/src/

// --- constants ---

export const PROTOCOL_VERSION = '0.1.1';
export const PROTOCOL_PREFIX = 'PMVPN';
export const DEFAULT_BASE_PORT = 2200;

export const PORT_OFFSET = {
  SSH_SHELL: 0,
  SFTP: 1,
  SSH_EXEC: 2,
  CHALLENGE: 3,
  TUNNEL: 4,
  FILE_SYNC: 5,
  CLAUDE_AI: 6,
  ADMIN: 7,
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

// --- types ---

export interface ChallengeRequest {
  address: string;
}

export interface ChallengeResponse {
  nonce: string;
  message: string;
  expires: number;
}

export interface AuthPayload {
  address: string;
  signature: string;
  nonce: string;
}

export interface WalletEntry {
  user: string;
  role: 'admin' | 'user';
}

export interface ServerStatus {
  version: string;
  uptime: number;
  ports: Record<number, { offset: number; service: string; active: boolean }>;
  connections: number;
}

export interface KeyringEntry {
  index: number;
  slug: string;
  publicKey: string;
  fingerprint: string;
}

export interface KeyringEnrolRequest extends AuthPayload {
  hostFingerprint: string;
  keys: Array<{ index: number; publicKey: string }>;
}

export interface KeyringEnrolResponse {
  enrolled: number;
  address: string;
  user: string;
  hostFingerprint: string;
  hostKey: string;
  basePort: number;
  keyringSize: number;
  keys: KeyringEntry[];
  sshConfig: string;
  knownHosts: string;
}

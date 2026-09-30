// SPDX-License-Identifier: GPL-3.0-only
// PMVPN shared types
// MIT License — shared between client and server

/** Challenge request: client asks server for a nonce */
export interface ChallengeRequest {
  address: string;  // 0x-prefixed Ethereum address
}

/** Challenge response: server returns nonce to sign */
export interface ChallengeResponse {
  nonce: string;     // hex-encoded random bytes
  message: string;   // "PMVPN:<nonce>:<timestamp>" — the string to sign
  expires: number;   // Unix timestamp (seconds)
}

/** Auth payload: sent as SSH password (JSON-encoded) */
export interface AuthPayload {
  address: string;    // 0x-prefixed Ethereum address
  signature: string;  // 0x-prefixed secp256k1 signature
  nonce: string;      // Must match a valid challenge nonce
}

/** Wallet-to-user mapping entry */
export interface WalletEntry {
  user: string;
  role: 'admin' | 'user';
}

/** Server status response */
export interface ServerStatus {
  version: string;
  uptime: number;
  ports: Record<number, { offset: number; service: string; active: boolean }>;
  connections: number;
}

/** One enrolled keyring key — public material only */
export interface KeyringEntry {
  index: number;       // port offset the key is valid for
  slug: string;        // shell | sftp | exec | … | k<i>
  publicKey: string;   // "ssh-ed25519 AAAA… pmvpn:<wallet>:k<i>:<slug>"
  fingerprint: string; // "SHA256:…"
}

/** POST /keyring — enrol a ring after signing a challenge nonce */
export interface KeyringEnrolRequest extends AuthPayload {
  hostFingerprint: string;                       // must equal the server's host-key fingerprint
  keys: Array<{ index: number; publicKey: string }>;
}

/** POST /keyring response — everything a client needs to write ssh_config */
export interface KeyringEnrolResponse {
  enrolled: number;
  address: string;
  user: string;
  hostFingerprint: string;
  hostKey: string;          // "ssh-ed25519 AAAA…"
  basePort: number;
  keyringSize: number;
  keys: KeyringEntry[];
  sshConfig: string;
  knownHosts: string;
}

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

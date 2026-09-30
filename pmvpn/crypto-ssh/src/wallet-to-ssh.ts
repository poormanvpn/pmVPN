// SPDX-License-Identifier: GPL-3.0-only
// crypto-ssh: Wallet → SSH Key Derivation
// MIT License
//
// Three approaches to derive SSH credentials from cryptocurrency wallets:
//   1. HKDF derivation: secp256k1 private key → Ed25519 SSH keypair
//   2. secp256k1 native: use the wallet key directly as SSH public key auth
//   3. SSH agent bridge: wallet acts as SSH agent, signs challenges on demand
//
// Heritage: cryptoAGI/csshd — the world's first wallet-login SSH server

import { createHash, createHmac, createPrivateKey, createPublicKey, randomBytes } from 'node:crypto';
import { encodeOpenSSHPrivateKey } from './keyring.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DerivedSSHKeyPair {
  /** Ed25519 private key as PKCS#8 PEM (Node crypto, ssh2). Kept for back-compat. */
  privateKeyPEM: string;
  /** Ed25519 private key as unencrypted openssh-key-v1 — what OpenSSH and paramiko load. */
  privateKeyOpenSSH: string;
  /** Ed25519 public key in OpenSSH authorized_keys format */
  publicKeySSH: string;
  /** The wallet address this key was derived from */
  sourceAddress: string;
  /** Derivation path/context used */
  context: string;
  /** Fingerprint (SHA-256) of the public key */
  fingerprint: string;
}

export interface Secp256k1SSHIdentity {
  /** Compressed secp256k1 public key (33 bytes, hex) */
  publicKey: string;
  /** Wallet address (checksummed) */
  address: string;
  /** SSH public key line for authorized_keys (custom key type) */
  authorizedKeysLine: string;
}

export interface SSHAgentChallenge {
  /** Random challenge bytes (hex) */
  challenge: string;
  /** Session identifier */
  sessionId: string;
  /** Timestamp */
  timestamp: number;
}

export interface SSHAgentResponse {
  /** EIP-191 signature of the challenge */
  signature: string;
  /** Wallet address of the signer */
  address: string;
}

// ─── Approach 1: HKDF Derivation (secp256k1 → Ed25519) ──────────────────────
//
// The most practical approach. Deterministically derives an Ed25519 SSH keypair
// from a secp256k1 wallet private key using HKDF (RFC 5869).
//
// Properties:
//   - Deterministic: same wallet key always produces same SSH key
//   - One-way: cannot recover wallet key from SSH key
//   - Standard: Ed25519 keys work with all modern SSH implementations
//   - Portable: derived key can be exported to authorized_keys
//
// Cryptographic flow:
//   wallet_privkey (32 bytes, secp256k1)
//     → HKDF-SHA256(ikm=wallet_privkey, salt="pmvpn-crypto-ssh", info=context)
//     → 32 bytes of key material
//     → Ed25519 seed (the 32-byte seed IS the Ed25519 private key)
//     → Ed25519 keypair
//
// Security note:
//   The derived Ed25519 key is cryptographically independent from the wallet key.
//   Compromising the SSH key does NOT compromise the wallet. However, compromising
//   the wallet key allows re-derivation of the SSH key.

/**
 * HKDF-Extract: RFC 5869 Section 2.2
 * PRK = HMAC-Hash(salt, IKM)
 */
function hkdfExtract(ikm: Buffer, salt: Buffer): Buffer {
  return createHmac('sha256', salt).update(ikm).digest();
}

/**
 * HKDF-Expand: RFC 5869 Section 2.3
 * Produces output keying material of desired length.
 */
function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  const hashLen = 32; // SHA-256 output length
  const n = Math.ceil(length / hashLen);
  const okm = Buffer.alloc(n * hashLen);
  let prev = Buffer.alloc(0);

  for (let i = 1; i <= n; i++) {
    prev = createHmac('sha256', prk)
      .update(prev)
      .update(info)
      .update(Buffer.from([i]))
      .digest();
    prev.copy(okm, (i - 1) * hashLen);
  }

  return okm.subarray(0, length);
}

/**
 * Full HKDF: RFC 5869
 * Derives key material from input keying material.
 */
function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  const prk = hkdfExtract(ikm, salt);
  return hkdfExpand(prk, info, length);
}

/**
 * Derive an Ed25519 SSH keypair from a secp256k1 wallet private key.
 *
 * @param walletPrivateKey - The wallet's private key (32 bytes, hex with or without 0x)
 * @param address - The wallet's Ethereum address (for labeling)
 * @param context - Derivation context string (default: "ssh-auth")
 *                  Different contexts produce different keys, allowing
 *                  per-server or per-purpose derivation.
 * @returns DerivedSSHKeyPair with PEM private key and OpenSSH public key
 */
export function deriveEd25519FromWallet(
  walletPrivateKey: string,
  address: string,
  context: string = 'ssh-auth'
): DerivedSSHKeyPair {
  // Normalize private key input
  const keyHex = walletPrivateKey.startsWith('0x')
    ? walletPrivateKey.slice(2)
    : walletPrivateKey;

  if (keyHex.length !== 64) {
    throw new Error('wallet private key must be 32 bytes (64 hex chars)');
  }

  const ikm = Buffer.from(keyHex, 'hex');
  const salt = Buffer.from('pmvpn-crypto-ssh', 'utf8');
  const info = Buffer.from(`ed25519-derivation:${context}`, 'utf8');

  // Derive 32 bytes of key material — this becomes the Ed25519 seed
  const seed = hkdf(ikm, salt, info, 32);

  // Generate Ed25519 keypair from the deterministic seed
  const { privateKey, publicKey } = generateKeyPairFromSeed(seed);

  // Format as OpenSSH public key
  const comment = `pmvpn:${address.toLowerCase()}:${context}`;
  const publicKeySSH = formatOpenSSHPublicKey(publicKey, comment);
  const privateKeyOpenSSH = encodeOpenSSHPrivateKey(new Uint8Array(seed), new Uint8Array(publicKey), comment);

  // Compute fingerprint
  const fingerprint = computeFingerprint(publicKey);

  // Zero the seed after use
  seed.fill(0);
  ikm.fill(0);

  return {
    privateKeyPEM: privateKey,
    privateKeyOpenSSH,
    publicKeySSH,
    sourceAddress: address,
    context,
    fingerprint,
  };
}

/**
 * Generate Ed25519 keypair from a 32-byte seed.
 * Constructs the PKCS#8 DER encoding and imports via Node crypto.
 */
function generateKeyPairFromSeed(seed: Buffer): { privateKey: string; publicKey: Buffer } {
  // Ed25519 PKCS#8 DER encoding
  const pkcs8Prefix = Buffer.from(
    '302e020100300506032b657004220420',
    'hex'
  );
  const pkcs8DER = Buffer.concat([pkcs8Prefix, seed]);

  // Import as crypto KeyObject
  const privateKeyObj = createPrivateKey({
    key: pkcs8DER,
    format: 'der',
    type: 'pkcs8',
  });

  // Export private key as PEM
  const privateKeyPEM = privateKeyObj.export({ type: 'pkcs8', format: 'pem' }) as string;

  // Derive public key from private key
  const publicKeyObj = createPublicKey(privateKeyObj);
  const publicKeyRaw = publicKeyObj.export({ type: 'spki', format: 'der' });

  // Extract the 32-byte public key from SPKI DER
  // SPKI for Ed25519: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32 bytes>
  const pubKeyBytes = (publicKeyRaw as Buffer).subarray(-32);

  return { privateKey: privateKeyPEM, publicKey: pubKeyBytes };
}

/**
 * Format a 32-byte Ed25519 public key as an OpenSSH authorized_keys line.
 *
 * Format: ssh-ed25519 <base64-encoded-key-blob> <comment>
 *
 * The key blob is: length-prefixed "ssh-ed25519" + length-prefixed public key bytes
 */
function formatOpenSSHPublicKey(pubKeyBytes: Buffer, comment: string): string {
  const keyType = Buffer.from('ssh-ed25519');
  const keyTypeLen = Buffer.alloc(4);
  keyTypeLen.writeUInt32BE(keyType.length);

  const pubKeyLen = Buffer.alloc(4);
  pubKeyLen.writeUInt32BE(pubKeyBytes.length);

  const blob = Buffer.concat([keyTypeLen, keyType, pubKeyLen, pubKeyBytes]);
  return `ssh-ed25519 ${blob.toString('base64')} ${comment}`;
}

/**
 * Compute SHA-256 fingerprint of a public key (OpenSSH-style).
 */
function computeFingerprint(pubKeyBytes: Buffer): string {
  const keyType = Buffer.from('ssh-ed25519');
  const keyTypeLen = Buffer.alloc(4);
  keyTypeLen.writeUInt32BE(keyType.length);
  const pubKeyLen = Buffer.alloc(4);
  pubKeyLen.writeUInt32BE(pubKeyBytes.length);
  const blob = Buffer.concat([keyTypeLen, keyType, pubKeyLen, pubKeyBytes]);

  // No '=' padding — identical to `ssh-keygen -lf`.
  const hash = createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
  return `SHA256:${hash}`;
}

/**
 * Derive multiple SSH keys for different purposes from a single wallet.
 *
 * Example contexts:
 *   "ssh-auth"       — default login key
 *   "ssh-auth:prod"  — production server key
 *   "ssh-auth:dev"   — development server key
 *   "git-signing"    — git commit signing key
 */
export function deriveMultipleKeys(
  walletPrivateKey: string,
  address: string,
  contexts: string[]
): DerivedSSHKeyPair[] {
  return contexts.map((ctx) => deriveEd25519FromWallet(walletPrivateKey, address, ctx));
}


// ─── Approach 2: secp256k1 Native SSH ────────────────────────────────────────
//
// Uses the wallet's secp256k1 public key directly as an SSH identity.
// This is the purest form of crypto-ssh — the wallet key IS the SSH key.
//
// Challenge: Standard OpenSSH does not support secp256k1 as a key type.
// The SSH protocol (RFC 4253) allows custom public key algorithms, but
// both client and server must agree on the algorithm name and signature format.
//
// pmVPN's ssh2 library (JavaScript) can implement custom key types because
// it handles the protocol in userspace. Standard OpenSSH cannot.
//
// This approach works within the pmVPN ecosystem but not with standard SSH.
//
// Wire format for the custom key type "ecdsa-sha2-secp256k1":
//   Key blob:
//     string    "ecdsa-sha2-secp256k1"
//     string    "secp256k1"
//     string    Q  (compressed or uncompressed public key point)
//
//   Signature blob:
//     string    "ecdsa-sha2-secp256k1"
//     string    signature (DER-encoded ECDSA r,s pair)

/**
 * Create an SSH identity from a secp256k1 compressed public key.
 * The resulting authorized_keys line uses a custom key type "ecdsa-sha2-secp256k1".
 *
 * This key type is recognized by pmVPN's ssh2-based server but NOT by OpenSSH.
 */
export function createSecp256k1SSHIdentity(
  compressedPubKey: string,
  address: string
): Secp256k1SSHIdentity {
  const pubKeyBytes = Buffer.from(
    compressedPubKey.startsWith('0x') ? compressedPubKey.slice(2) : compressedPubKey,
    'hex'
  );

  if (pubKeyBytes.length !== 33) {
    throw new Error('compressed secp256k1 public key must be 33 bytes');
  }

  // Build SSH key blob: key_type + curve_name + public_key_point
  const keyType = Buffer.from('ecdsa-sha2-secp256k1');
  const curveName = Buffer.from('secp256k1');

  const blob = Buffer.concat([
    uint32BE(keyType.length), keyType,
    uint32BE(curveName.length), curveName,
    uint32BE(pubKeyBytes.length), pubKeyBytes,
  ]);

  const authorizedKeysLine = `ecdsa-sha2-secp256k1 ${blob.toString('base64')} pmvpn:${address}`;

  return {
    publicKey: compressedPubKey,
    address,
    authorizedKeysLine,
  };
}

/**
 * Verify a secp256k1 SSH signature against a challenge.
 *
 * In the SSH protocol, the server sends a session_id + message for the client
 * to sign. Here we verify the ECDSA signature using the secp256k1 curve.
 *
 * Uses EIP-191 personal_sign format for wallet compatibility:
 *   sign(keccak256("\x19Ethereum Signed Message:\n" + len(challenge) + challenge))
 *
 * This allows MetaMask and hardware wallets to act as SSH agents.
 */
// Note: secp256k1 SSH signature verification delegates to viem.verifyMessage()
// in the pmVPN server (server/src/auth/verifier.ts). This function documents
// the interface but is not exported — use viem directly.
function verifySecp256k1SSHSignature(
  challenge: Buffer,
  signature: string,
  expectedAddress: string
): boolean {
  // This would use viem.verifyMessage() in the actual pmVPN integration.
  // Here we define the interface — the verifier is already implemented
  // in server/src/auth/verifier.ts
  //
  // The key insight: the SSH protocol's public key authentication challenge
  // is functionally identical to EIP-191 personal_sign. Both are:
  //   1. A message to sign (session_id + data in SSH, arbitrary text in EIP-191)
  //   2. A signature proving possession of the private key
  //   3. A verification step using the public key / recovered address
  //
  // The difference is encoding, not security properties.
  throw new Error('use viem.verifyMessage() from server/src/auth/verifier.ts');
}


// ─── Approach 3: SSH Agent Bridge ────────────────────────────────────────────
//
// A bridge between the SSH agent protocol (RFC 4253 Section 7) and a
// cryptocurrency wallet. The wallet acts as the signing backend.
//
// Flow:
//   1. SSH client asks the agent for available keys
//   2. Agent returns the wallet's secp256k1 public key (or derived Ed25519)
//   3. SSH client sends a sign request with the session challenge
//   4. Agent forwards the challenge to the wallet for signing
//   5. Wallet signs (MetaMask popup, hardware wallet button press, etc.)
//   6. Agent returns the signature to the SSH client
//   7. SSH server verifies the signature against the registered public key
//
// This is the most flexible approach because:
//   - Standard SSH clients work unmodified (they talk to the agent)
//   - The private key never touches disk (wallet holds it)
//   - Hardware wallet support comes for free (Ledger, Trezor)
//   - Multiple wallets = multiple SSH identities
//
// Implementation: Unix domain socket implementing SSH agent protocol
// Messages: SSH_AGENTC_REQUEST_IDENTITIES, SSH_AGENTC_SIGN_REQUEST

/** SSH Agent protocol message types */
export const SSH_AGENT = {
  // Client → Agent
  REQUEST_IDENTITIES: 11,
  SIGN_REQUEST: 13,
  ADD_IDENTITY: 17,
  REMOVE_IDENTITY: 18,
  REMOVE_ALL_IDENTITIES: 19,

  // Agent → Client
  IDENTITIES_ANSWER: 12,
  SIGN_RESPONSE: 14,
  FAILURE: 5,
  SUCCESS: 6,
} as const;

/**
 * Represents a wallet-backed SSH agent identity.
 * The agent holds public keys and delegates signing to the wallet.
 */
export interface WalletAgentIdentity {
  /** The SSH key blob (for IDENTITIES_ANSWER) */
  keyBlob: Buffer;
  /** Human-readable comment (wallet address + context) */
  comment: string;
  /** The wallet address that owns this identity */
  walletAddress: string;
  /** Function to sign a challenge — calls into the wallet */
  sign: (data: Buffer) => Promise<Buffer>;
}

/**
 * Create an SSH agent challenge for wallet signing.
 * The challenge includes entropy and session binding to prevent replay.
 */
export function createAgentChallenge(sessionId: string): SSHAgentChallenge {
  const challengeBytes = randomBytes(32);
  return {
    challenge: challengeBytes.toString('hex'),
    sessionId,
    timestamp: Date.now(),
  };
}

/**
 * Build an SSH_AGENTC_IDENTITIES_ANSWER message from wallet identities.
 *
 * Wire format:
 *   byte      SSH_AGENT_IDENTITIES_ANSWER (12)
 *   uint32    num_identities
 *   For each identity:
 *     string    key_blob
 *     string    comment
 */
export function buildIdentitiesAnswer(identities: WalletAgentIdentity[]): Buffer {
  const parts: Buffer[] = [];

  // Message type
  parts.push(Buffer.from([SSH_AGENT.IDENTITIES_ANSWER]));

  // Number of identities
  parts.push(uint32BE(identities.length));

  for (const id of identities) {
    // Key blob (length-prefixed)
    parts.push(uint32BE(id.keyBlob.length));
    parts.push(id.keyBlob);

    // Comment (length-prefixed)
    const commentBuf = Buffer.from(id.comment, 'utf8');
    parts.push(uint32BE(commentBuf.length));
    parts.push(commentBuf);
  }

  const payload = Buffer.concat(parts);

  // Wrap in agent message frame (uint32 length prefix)
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);

  return frame;
}

/**
 * Parse an SSH_AGENTC_SIGN_REQUEST message.
 *
 * Wire format:
 *   byte      SSH_AGENTC_SIGN_REQUEST (13)
 *   string    key_blob
 *   string    data (the challenge to sign)
 *   uint32    flags
 */
export function parseSignRequest(message: Buffer): {
  keyBlob: Buffer;
  data: Buffer;
  flags: number;
} | null {
  let offset = 0;

  // Skip message type byte
  if (message[offset] !== SSH_AGENT.SIGN_REQUEST) return null;
  offset += 1;

  // Read key blob
  const keyBlobLen = message.readUInt32BE(offset);
  offset += 4;
  const keyBlob = message.subarray(offset, offset + keyBlobLen);
  offset += keyBlobLen;

  // Read data to sign
  const dataLen = message.readUInt32BE(offset);
  offset += 4;
  const data = message.subarray(offset, offset + dataLen);
  offset += dataLen;

  // Read flags
  const flags = message.readUInt32BE(offset);

  return { keyBlob, data, flags };
}


// ─── Utilities ───────────────────────────────────────────────────────────────

function uint32BE(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n);
  return buf;
}

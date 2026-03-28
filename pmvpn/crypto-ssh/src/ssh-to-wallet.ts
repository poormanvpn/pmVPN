// crypto-ssh: SSH Key → Wallet Derivation (The Reverse Direction)
// MIT License
//
// Exploration of using existing SSH keys to store and manage crypto assets.
// Three approaches:
//   1. Ed25519 SSH key → secp256k1 wallet key via HKDF
//   2. SSH key as HD wallet seed material
//   3. SSH key as transaction signer (direct EVM signing with SSH key material)
//
// WARNING: These approaches are EXPERIMENTAL. Using SSH keys for crypto custody
// introduces risks not present in purpose-built wallet software.
// See security analysis in CRYPTO-SSH.md.

import { createHash, createHmac, createPrivateKey, KeyObject } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SSHDerivedWallet {
  /** Ethereum address (checksummed) */
  address: string;
  /** secp256k1 private key (hex, 32 bytes) — SENSITIVE */
  privateKey: string;
  /** secp256k1 compressed public key (hex, 33 bytes) */
  publicKey: string;
  /** Source SSH key fingerprint */
  sourceFingerprint: string;
  /** Derivation context */
  context: string;
  /** Warning: this is a derived wallet, not a native wallet */
  warning: string;
}

export interface HDWalletSeed {
  /** BIP-39 compatible seed (64 bytes, hex) */
  seed: string;
  /** Source SSH key fingerprint */
  sourceFingerprint: string;
  /** Derivation path for Ethereum: m/44'/60'/0'/0/0 */
  derivationPath: string;
  /** Warning about key custody */
  warning: string;
}

export interface SSHTransactionSigner {
  /** Sign an EVM transaction hash with SSH key material */
  signHash: (hash: Buffer) => Promise<{ r: string; s: string; v: number }>;
  /** The derived address for this signer */
  address: string;
  /** The SSH key fingerprint */
  fingerprint: string;
}

// ─── Approach 1: Ed25519 SSH Key → secp256k1 Wallet ─────────────────────────
//
// Derives an Ethereum wallet from an existing Ed25519 SSH private key.
//
// Why this is interesting:
//   - Billions of SSH keys already exist worldwide
//   - System administrators already protect their SSH keys
//   - SSH keys on hardware tokens (YubiKey) get hardware-backed crypto custody
//   - Every server already has a host key — it could hold assets
//
// Cryptographic flow:
//   ssh_privkey (Ed25519 seed, 32 bytes)
//     → HKDF-SHA256(ikm=ssh_seed, salt="crypto-ssh-reverse", info=context)
//     → 32 bytes of key material
//     → secp256k1 private key
//     → Derive public key (EC point multiplication)
//     → Keccak256(uncompressed_pubkey[1:]) → last 20 bytes = Ethereum address
//
// Security properties:
//   - One-way: cannot recover SSH key from wallet key
//   - Deterministic: same SSH key always produces same wallet
//   - SSH key compromise = wallet compromise (the derived wallet)
//   - Wallet compromise does NOT compromise the SSH key

/**
 * HKDF implementation (duplicated here to keep module self-contained)
 */
function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  // Extract
  const prk = createHmac('sha256', salt).update(ikm).digest();
  // Expand
  const hashLen = 32;
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
 * Extract the 32-byte seed from an Ed25519 SSH private key PEM.
 *
 * Ed25519 PKCS#8 DER structure:
 *   SEQUENCE {
 *     INTEGER 0
 *     SEQUENCE { OID 1.3.101.112 }
 *     OCTET STRING {
 *       OCTET STRING { <32 bytes seed> }
 *     }
 *   }
 *
 * The seed is the last 32 bytes of the DER encoding.
 */
export function extractEd25519Seed(privateKeyPEM: string): Buffer {
  const keyObj = createPrivateKey({
    key: privateKeyPEM,
    format: 'pem',
  });

  if (keyObj.asymmetricKeyType !== 'ed25519') {
    throw new Error(`expected Ed25519 key, got ${keyObj.asymmetricKeyType}`);
  }

  // Export as PKCS#8 DER to access raw bytes
  const der = keyObj.export({ type: 'pkcs8', format: 'der' });

  // Ed25519 PKCS#8 DER is exactly 48 bytes, seed is the last 32
  if (der.length !== 48) {
    throw new Error(`unexpected Ed25519 PKCS#8 DER length: ${der.length}`);
  }

  return Buffer.from(der.subarray(16, 48));
}

/**
 * Extract seed from an OpenSSH-format private key.
 *
 * OpenSSH format is different from PEM/PKCS#8. The key is:
 *   "-----BEGIN OPENSSH PRIVATE KEY-----"
 *   base64-encoded binary blob
 *   "-----END OPENSSH PRIVATE KEY-----"
 *
 * The binary contains:
 *   AUTH_MAGIC ("openssh-key-v1\0")
 *   cipher, kdfname, kdf, number_of_keys
 *   public_key_blob
 *   private_key_blob (if unencrypted):
 *     check1, check2 (random, must match)
 *     key_type ("ssh-ed25519")
 *     public_key (32 bytes)
 *     private_key (64 bytes — first 32 is seed, last 32 is public key copy)
 *     comment
 */
export function extractOpenSSHEd25519Seed(opensshKey: string): Buffer {
  const lines = opensshKey.trim().split('\n');
  const b64 = lines
    .filter(l => !l.startsWith('-----'))
    .join('');
  const raw = Buffer.from(b64, 'base64');

  // Verify magic
  const magic = 'openssh-key-v1\0';
  if (raw.subarray(0, magic.length).toString() !== magic) {
    throw new Error('not a valid OpenSSH private key');
  }

  let offset = magic.length;

  // Read string helper
  const readString = (): Buffer => {
    const len = raw.readUInt32BE(offset);
    offset += 4;
    const data = raw.subarray(offset, offset + len);
    offset += len;
    return data;
  };

  const cipherName = readString().toString();
  const kdfName = readString().toString();
  const kdfOptions = readString(); // kdf options blob
  const numKeys = raw.readUInt32BE(offset);
  offset += 4;

  if (cipherName !== 'none' || kdfName !== 'none') {
    throw new Error(
      'encrypted OpenSSH keys not supported — decrypt first with ssh-keygen -p'
    );
  }

  // Skip public key blob
  readString();

  // Read private key blob
  const privBlob = readString();
  let pOffset = 0;

  // check1, check2 (must match for integrity)
  const check1 = privBlob.readUInt32BE(pOffset); pOffset += 4;
  const check2 = privBlob.readUInt32BE(pOffset); pOffset += 4;
  if (check1 !== check2) {
    throw new Error('private key integrity check failed (check1 !== check2)');
  }

  // Read key type string
  const keyTypeLen = privBlob.readUInt32BE(pOffset); pOffset += 4;
  const keyType = privBlob.subarray(pOffset, pOffset + keyTypeLen).toString();
  pOffset += keyTypeLen;

  if (keyType !== 'ssh-ed25519') {
    throw new Error(`expected ssh-ed25519, got ${keyType}`);
  }

  // Read public key (32 bytes, length-prefixed)
  const pubLen = privBlob.readUInt32BE(pOffset); pOffset += 4;
  pOffset += pubLen; // Skip public key

  // Read private key (64 bytes, length-prefixed)
  // First 32 bytes = seed, last 32 bytes = public key copy
  const privLen = privBlob.readUInt32BE(pOffset); pOffset += 4;
  if (privLen !== 64) {
    throw new Error(`unexpected Ed25519 private key length: ${privLen}`);
  }
  const seed = Buffer.from(privBlob.subarray(pOffset, pOffset + 32));

  return seed;
}

/**
 * Derive a secp256k1 wallet private key from an Ed25519 SSH key seed.
 *
 * @param sshSeed - 32-byte Ed25519 seed (from extractEd25519Seed or extractOpenSSHEd25519Seed)
 * @param context - Derivation context (default: "eth-wallet")
 * @returns 32-byte secp256k1 private key as hex
 */
export function deriveSecp256k1FromSSH(sshSeed: Buffer, context: string = 'eth-wallet'): Buffer {
  const salt = Buffer.from('crypto-ssh-reverse', 'utf8');
  const info = Buffer.from(`secp256k1-derivation:${context}`, 'utf8');

  // Derive 32 bytes of key material
  const rawKey = hkdf(sshSeed, salt, info, 32);

  // Validate: secp256k1 private key must be in range [1, n-1]
  // n = FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
  // For practical purposes, random 256-bit numbers are almost always valid.
  // If not, we could increment or re-derive, but the probability is ~2^-128.
  const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  let keyBigInt = BigInt('0x' + rawKey.toString('hex'));
  if (keyBigInt === 0n || keyBigInt >= n) {
    // Extremely unlikely (~2^-128), but handle it: hash again
    const rehash = createHash('sha256').update(rawKey).update(Buffer.from('retry')).digest();
    rehash.copy(rawKey);
    keyBigInt = BigInt('0x' + rawKey.toString('hex'));
    // If still invalid after rehash (astronomically unlikely), throw
    if (keyBigInt === 0n || keyBigInt >= n) {
      rawKey.fill(0);
      throw new Error('failed to derive valid secp256k1 key after retry');
    }
  }

  return rawKey;
}

/**
 * Compute Ethereum address from a secp256k1 private key.
 *
 * This is the standard derivation:
 *   private_key → EC multiply on secp256k1 → uncompressed public key (65 bytes)
 *   → drop the 0x04 prefix → keccak256 → last 20 bytes → address
 *
 * Note: requires the secp256k1 curve operations from viem or ethers.
 * Here we define the interface — actual implementation uses viem.
 */
// Note: Ethereum address derivation requires secp256k1 point multiplication
// and Keccak-256 hashing. Use viem's privateKeyToAddress() for production.
// This function documents the algorithm but is not exported.
function privateKeyToAddress(privateKey: Buffer): string {
  // In production, use:
  //   import { privateKeyToAddress } from 'viem/accounts';
  //   return privateKeyToAddress(`0x${privateKey.toString('hex')}`);
  //
  // Placeholder that documents the algorithm:
  //
  // 1. Compute public key: Q = d * G (EC point multiplication on secp256k1)
  // 2. Uncompressed format: 0x04 || x (32 bytes) || y (32 bytes) = 65 bytes
  // 3. Hash: keccak256(x || y) — note: hash the 64 bytes WITHOUT the 0x04 prefix
  // 4. Address: last 20 bytes of the hash, prepend "0x"
  // 5. Checksum: EIP-55 mixed-case encoding
  //
  // The keccak256 is Ethereum-specific (NOT SHA-3/FIPS 202, but the original
  // Keccak submission before NIST modified the padding).

  throw new Error(
    'use viem privateKeyToAddress() — this module defines the interface, ' +
    'viem provides the secp256k1 implementation'
  );
}

/**
 * Full pipeline: Ed25519 SSH private key → Ethereum wallet.
 *
 * @param privateKeyPEM - Ed25519 private key in PEM format
 * @param context - Derivation context
 * @returns SSHDerivedWallet with address and private key
 */
export function deriveWalletFromSSHKey(
  privateKeyPEM: string,
  context: string = 'eth-wallet'
): Omit<SSHDerivedWallet, 'address' | 'publicKey'> & { rawPrivateKey: Buffer } {
  const seed = extractEd25519Seed(privateKeyPEM);
  const walletKey = deriveSecp256k1FromSSH(seed, context);

  // Compute fingerprint of the SSH key
  const keyObj = createPrivateKey({ key: privateKeyPEM, format: 'pem' });
  const pubDer = keyObj.export({ type: 'spki', format: 'der' });
  // Not used directly - we need createPublicKey, but let's compute fingerprint from the public
  const pubKeyBytes = (pubDer as Buffer).subarray(-32);
  const fingerprint = computeSSHFingerprint(pubKeyBytes);

  // Zero the seed
  seed.fill(0);

  return {
    privateKey: `0x${walletKey.toString('hex')}`,
    sourceFingerprint: fingerprint,
    context,
    warning: 'DERIVED WALLET — SSH key compromise = wallet compromise. Do not use for high-value custody.',
    rawPrivateKey: walletKey,
  };
}


// ─── Approach 2: SSH Key as HD Wallet Seed ───────────────────────────────────
//
// Uses the SSH key's entropy as seed material for a BIP-32 hierarchical
// deterministic wallet. This produces a full wallet tree from a single SSH key.
//
// Why this is interesting:
//   - An SSH key on a YubiKey or TPM becomes a hardware-backed HD wallet
//   - System host keys could deterministically derive per-service wallets
//   - Backup the SSH key = backup the wallet (and vice versa)
//
// BIP-32 derivation:
//   SSH seed (32 bytes)
//     → HMAC-SHA512("Bitcoin seed", ssh_seed) = 64 bytes
//     → First 32 bytes = master private key
//     → Last 32 bytes = master chain code
//     → Derive child keys: m/44'/60'/0'/0/0 (Ethereum)
//
// Security consideration:
//   Standard BIP-39 uses 128-256 bits of entropy from a mnemonic phrase.
//   An Ed25519 SSH key provides 256 bits of entropy — equivalent to a
//   24-word mnemonic. The entropy quality is at least as good.

/**
 * Derive a BIP-32 master key from an SSH key seed.
 *
 * BIP-32 specifies: HMAC-SHA512(Key="Bitcoin seed", Data=S)
 * where S is the seed. The result is split:
 *   - First 32 bytes: master secret key (IL)
 *   - Last 32 bytes: master chain code (IR)
 */
export function deriveBIP32MasterKey(sshSeed: Buffer): {
  masterKey: Buffer;
  chainCode: Buffer;
} {
  const I = createHmac('sha512', Buffer.from('Bitcoin seed'))
    .update(sshSeed)
    .digest();

  return {
    masterKey: Buffer.from(I.subarray(0, 32)),
    chainCode: Buffer.from(I.subarray(32, 64)),
  };
}

/**
 * Perform BIP-32 hardened child key derivation.
 *
 * For hardened derivation (index >= 0x80000000):
 *   HMAC-SHA512(Key=cpar, Data=0x00 || ser256(kpar) || ser32(i))
 *
 * @param parentKey - 32-byte parent private key
 * @param parentChainCode - 32-byte parent chain code
 * @param index - Child index (add 0x80000000 for hardened)
 */
export function deriveHardenedChild(
  parentKey: Buffer,
  parentChainCode: Buffer,
  index: number
): { childKey: Buffer; childChainCode: Buffer } {
  // Hardened index
  const hardenedIndex = (index | 0x80000000) >>> 0;

  // Data: 0x00 || parent_key (32 bytes) || index (4 bytes, big-endian)
  const data = Buffer.alloc(37);
  data[0] = 0x00;
  parentKey.copy(data, 1);
  data.writeUInt32BE(hardenedIndex, 33);

  const I = createHmac('sha512', parentChainCode).update(data).digest();

  const IL = I.subarray(0, 32);
  const IR = I.subarray(32, 64);

  // Child key = (IL + parent_key) mod n
  const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  const ilBigInt = BigInt('0x' + Buffer.from(IL).toString('hex'));
  const parentBigInt = BigInt('0x' + parentKey.toString('hex'));
  const childBigInt = (ilBigInt + parentBigInt) % n;

  if (childBigInt === 0n || ilBigInt >= n) {
    throw new Error('derived key is invalid (astronomically unlikely)');
  }

  const childKeyHex = childBigInt.toString(16).padStart(64, '0');
  const childKey = Buffer.from(childKeyHex, 'hex');

  return {
    childKey,
    childChainCode: Buffer.from(IR),
  };
}

/**
 * Derive the Ethereum account key from an SSH seed using BIP-44 path.
 *
 * Path: m/44'/60'/0'/0/0
 *   44'  = BIP-44 (multi-account)
 *   60'  = Ethereum coin type
 *   0'   = Account 0
 *   0    = External chain (non-hardened, but we use hardened throughout for safety)
 *   0    = Address index 0
 *
 * Note: We use all-hardened derivation for maximum security.
 * Standard BIP-44 uses non-hardened for the last two levels,
 * but since we don't need xpub-based address generation, hardened is safer.
 */
export function deriveEthereumKeyFromSSH(sshSeed: Buffer): {
  privateKey: Buffer;
  path: string;
} {
  const { masterKey, chainCode } = deriveBIP32MasterKey(sshSeed);

  // m/44'
  const level1 = deriveHardenedChild(masterKey, chainCode, 44);
  // m/44'/60'
  const level2 = deriveHardenedChild(level1.childKey, level1.childChainCode, 60);
  // m/44'/60'/0'
  const level3 = deriveHardenedChild(level2.childKey, level2.childChainCode, 0);
  // m/44'/60'/0'/0'
  const level4 = deriveHardenedChild(level3.childKey, level3.childChainCode, 0);
  // m/44'/60'/0'/0'/0'
  const level5 = deriveHardenedChild(level4.childKey, level4.childChainCode, 0);

  // Zero intermediate keys
  masterKey.fill(0);
  chainCode.fill(0);
  level1.childKey.fill(0); level1.childChainCode.fill(0);
  level2.childKey.fill(0); level2.childChainCode.fill(0);
  level3.childKey.fill(0); level3.childChainCode.fill(0);
  level4.childKey.fill(0); level4.childChainCode.fill(0);

  return {
    privateKey: level5.childKey,
    path: "m/44'/60'/0'/0'/0'",
  };
}

/**
 * Full pipeline: SSH key → HD wallet with Ethereum account.
 */
export function deriveHDWalletFromSSH(privateKeyPEM: string): HDWalletSeed {
  const seed = extractEd25519Seed(privateKeyPEM);
  const { masterKey, chainCode } = deriveBIP32MasterKey(seed);

  // The "seed" in BIP-39 terms is the 64-byte output of PBKDF2(mnemonic).
  // Here we use the SSH seed directly through BIP-32's HMAC-SHA512.
  const fullSeed = Buffer.concat([masterKey, chainCode]);

  const fingerprint = computeSSHFingerprint(
    (createPrivateKey({ key: privateKeyPEM, format: 'pem' })
      .export({ type: 'spki', format: 'der' }) as Buffer).subarray(-32)
  );

  // Zero sensitive material
  seed.fill(0);
  masterKey.fill(0);
  chainCode.fill(0);

  return {
    seed: fullSeed.toString('hex'),
    sourceFingerprint: fingerprint,
    derivationPath: "m/44'/60'/0'/0'/0'",
    warning:
      'HD WALLET FROM SSH KEY — the SSH key is the wallet seed. ' +
      'Protect it accordingly. SSH key rotation = wallet rotation.',
  };
}


// ─── Approach 3: SSH Key as Transaction Signer ───────────────────────────────
//
// The most speculative approach: use the SSH key's raw material to sign
// EVM transactions directly, without deriving a separate wallet key.
//
// This is NOT standard Ethereum signing. Standard Ethereum uses secp256k1
// ECDSA, but Ed25519 is a different curve (Curve25519/Edwards form).
// The signatures are not directly compatible.
//
// However, this is relevant for:
//   1. Layer 2s or chains that accept Ed25519 signatures (Solana, Near, etc.)
//   2. Account abstraction (EIP-4337) where the signature verification is
//      in a smart contract that can verify Ed25519
//   3. Multi-sig schemes where Ed25519 is one factor
//
// For EVM compatibility, we still derive a secp256k1 key (Approach 1 or 2)
// and sign with that. But the signing operation is backed by the SSH key.
//
// The innovation: your SSH key IS your signing key. No separate wallet needed.
// Your ~/.ssh/id_ed25519 file holds your crypto identity.

/**
 * Create a transaction signer backed by an SSH private key.
 *
 * The signer derives a secp256k1 key from the SSH key and uses it to sign
 * EVM transaction hashes. The SSH key material is loaded once and the
 * derived signing key is held in memory.
 *
 * For production use, this should be integrated with a hardware token
 * (YubiKey, TPM) that holds the SSH key, providing hardware-backed signing.
 *
 * @param privateKeyPEM - Ed25519 SSH private key (PEM format)
 * @returns SSHTransactionSigner interface
 */
export function createSSHTransactionSigner(
  privateKeyPEM: string
): Omit<SSHTransactionSigner, 'signHash'> & {
  /** The derived secp256k1 private key for use with viem/ethers */
  derivedPrivateKey: string;
  /** Cleanup: zero the derived key from memory */
  destroy: () => void;
} {
  const result = deriveWalletFromSSHKey(privateKeyPEM, 'tx-signer');

  return {
    address: '(use viem privateKeyToAddress with derivedPrivateKey)',
    fingerprint: result.sourceFingerprint,
    derivedPrivateKey: result.privateKey,
    destroy: () => {
      result.rawPrivateKey.fill(0);
    },
  };
}


// ─── Server Host Key as Service Wallet ───────────────────────────────────────
//
// A particularly interesting application: every pmVPN server already has an
// Ed25519 host key at ~/.pmvpn/hostkey. This key uniquely identifies the server.
//
// By deriving a wallet from the host key, each server gets a deterministic
// Ethereum address. This enables:
//
//   1. Server-to-server payments (pay for API calls between servers)
//   2. On-chain server registry (servers register their addresses on-chain)
//   3. Service deposits (servers stake tokens as service guarantees)
//   4. Automated payroll (server wallets receive and distribute payments)
//   5. Machine identity on-chain (the server's on-chain identity = its SSH identity)
//
// The host key is already:
//   - Generated securely (ssh-keygen)
//   - Stored with restrictive permissions (chmod 600)
//   - Backed up as part of server provisioning
//   - Rotated on compromise (which also rotates the wallet — feature, not bug)

/**
 * Derive a service wallet from a pmVPN server host key.
 *
 * @param hostKeyPath - Path to the Ed25519 host key (default: ~/.pmvpn/hostkey)
 * @returns Service wallet details (without the actual private key exposure)
 */
export function deriveServiceWallet(hostKeyPEM: string): {
  context: string;
  fingerprint: string;
  warning: string;
  /** Call with viem to get the actual address */
  getPrivateKey: () => Buffer;
} {
  const seed = extractEd25519Seed(hostKeyPEM);
  const walletKey = deriveSecp256k1FromSSH(seed, 'pmvpn-service-wallet');

  const pubDer = createPrivateKey({ key: hostKeyPEM, format: 'pem' })
    .export({ type: 'spki', format: 'der' }) as Buffer;
  const fingerprint = computeSSHFingerprint(pubDer.subarray(-32));

  seed.fill(0);

  return {
    context: 'pmvpn-service-wallet',
    fingerprint,
    warning:
      'SERVICE WALLET — derived from server host key. ' +
      'Host key rotation = wallet address change. ' +
      'Only use for ephemeral/operational funds.',
    getPrivateKey: () => {
      // Return a copy; caller must zero it after use
      return Buffer.from(walletKey);
    },
  };
}


// ─── YubiKey / Hardware Token Integration ────────────────────────────────────
//
// When an SSH key lives on a hardware token (YubiKey 5, TPM 2.0, Nitrokey),
// the private key never leaves the hardware. This means:
//
//   - The derived wallet key must be computed ON the hardware (impossible with
//     current firmware — YubiKeys don't support HKDF or custom derivation)
//
//   - OR: the hardware performs Ed25519 signing, and we use the SIGNATURE
//     as key material rather than the private key itself
//
// Approach: Deterministic Signature-Based Derivation
//
//   1. Ask hardware to sign a fixed message: "crypto-ssh:derive:eth-wallet"
//   2. The signature is deterministic (Ed25519 is deterministic, unlike ECDSA)
//   3. Hash the signature: SHA-256(ed25519_signature) → 32 bytes
//   4. Use those 32 bytes as the secp256k1 private key
//
// Properties:
//   - Private key NEVER leaves hardware
//   - Same hardware + same message = same wallet (deterministic)
//   - Different hardware (even same key loaded) may give different wallet
//     (implementation-dependent Ed25519 internals)
//   - Requires touch/PIN to derive (hardware enforces this)

/**
 * Derive wallet key material from a hardware-backed Ed25519 signature.
 *
 * The hardware token signs a deterministic message, and the signature
 * becomes the key material. This works because Ed25519 signatures are
 * deterministic — the same key signing the same message always produces
 * the same signature.
 *
 * @param signWithHardware - Function that signs using the hardware token
 *                           (e.g., via ssh-agent or PKCS#11)
 * @param context - Derivation context
 * @returns 32 bytes of key material for secp256k1
 */
export async function deriveFromHardwareSignature(
  signWithHardware: (message: Buffer) => Promise<Buffer>,
  context: string = 'eth-wallet'
): Promise<Buffer> {
  const derivationMessage = Buffer.from(
    `crypto-ssh:derive:${context}`,
    'utf8'
  );

  // Get deterministic signature from hardware
  const signature = await signWithHardware(derivationMessage);

  // Hash the signature to get uniform 32 bytes
  const keyMaterial = createHash('sha256').update(signature).digest();

  // Zero the signature
  signature.fill(0);

  return keyMaterial;
}


// ─── Multi-Chain Derivation ──────────────────────────────────────────────────
//
// A single SSH key can derive wallets for multiple chains using different
// BIP-44 coin types:
//
//   Ethereum:  m/44'/60'/0'/0'/0'
//   Bitcoin:   m/44'/0'/0'/0'/0'
//   Algorand:  m/44'/283'/0'/0'/0'
//   Solana:    m/44'/501'/0'/0'     (Solana uses Ed25519 natively!)
//   Polygon:   m/44'/60'/0'/0'/0'   (same as Ethereum, different chain)
//
// For Solana, the SSH key could be used DIRECTLY since both use Ed25519.
// No derivation needed — the SSH key IS a Solana keypair.

export const COIN_TYPES = {
  BITCOIN: 0,
  ETHEREUM: 60,
  ALGORAND: 283,
  SOLANA: 501,
  POLYGON: 60,  // Same as Ethereum (EVM-compatible)
  ARBITRUM: 60, // Same as Ethereum
  BASE: 60,     // Same as Ethereum
} as const;

/**
 * Derive a wallet for a specific chain from an SSH seed.
 *
 * @param sshSeed - 32-byte Ed25519 seed
 * @param coinType - BIP-44 coin type (use COIN_TYPES constants)
 * @param account - Account index (default 0)
 * @returns Derived private key and path
 */
export function deriveChainKey(
  sshSeed: Buffer,
  coinType: number,
  account: number = 0
): { privateKey: Buffer; path: string } {
  const { masterKey, chainCode } = deriveBIP32MasterKey(sshSeed);

  // m/44'
  const l1 = deriveHardenedChild(masterKey, chainCode, 44);
  // m/44'/<coin>'
  const l2 = deriveHardenedChild(l1.childKey, l1.childChainCode, coinType);
  // m/44'/<coin>'/account'
  const l3 = deriveHardenedChild(l2.childKey, l2.childChainCode, account);
  // m/44'/<coin>'/account'/0'
  const l4 = deriveHardenedChild(l3.childKey, l3.childChainCode, 0);
  // m/44'/<coin>'/account'/0'/0'
  const l5 = deriveHardenedChild(l4.childKey, l4.childChainCode, 0);

  // Zero intermediates
  masterKey.fill(0); chainCode.fill(0);
  l1.childKey.fill(0); l1.childChainCode.fill(0);
  l2.childKey.fill(0); l2.childChainCode.fill(0);
  l3.childKey.fill(0); l3.childChainCode.fill(0);
  l4.childKey.fill(0); l4.childChainCode.fill(0);

  return {
    privateKey: l5.childKey,
    path: `m/44'/${coinType}'/${account}'/0'/0'`,
  };
}


// ─── Utilities ───────────────────────────────────────────────────────────────

function computeSSHFingerprint(pubKeyBytes: Buffer): string {
  const keyType = Buffer.from('ssh-ed25519');
  const blob = Buffer.concat([
    uint32BE(keyType.length), keyType,
    uint32BE(pubKeyBytes.length), pubKeyBytes,
  ]);
  const hash = createHash('sha256').update(blob).digest('base64');
  return `SHA256:${hash}`;
}

function uint32BE(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n);
  return buf;
}

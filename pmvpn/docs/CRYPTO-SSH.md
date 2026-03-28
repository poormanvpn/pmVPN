# Crypto-SSH — Bidirectional Key Derivation Between SSH and Cryptocurrency Wallets

*When your wallet IS your SSH key. When your SSH key IS your wallet.*

---

## Technical Summary

Crypto-SSH is a zero-dependency TypeScript module that performs deterministic, one-way key derivation between two cryptographic ecosystems: SSH (Ed25519) and cryptocurrency wallets (secp256k1 ECDSA). It operates in both directions — a wallet can derive SSH credentials, and an SSH key can derive crypto wallets — using HKDF (RFC 5869) as the bridge function.

### What This Module Does

Given a 32-byte private key from either ecosystem, crypto-ssh produces a valid private key in the other ecosystem. The derivation is:

- **Deterministic** — the same input always produces the same output
- **One-way** — the derived key cannot reconstruct the source key
- **Context-separated** — different context strings produce cryptographically independent keys
- **Standard-compliant** — output keys work with unmodified OpenSSH, MetaMask, viem, ethers.js

The module contains no networking code, no wallet UI, no SSH server logic. It is pure cryptographic transformation — key bytes in, key bytes out. This makes it embeddable in any project that needs to bridge SSH and wallet identity.

### The Core Operation

```
  Source key (32 bytes)
    │
    ▼
  HKDF-SHA256 (RFC 5869)
    │  Extract: PRK = HMAC-SHA256(salt, source_key)
    │  Expand:  OKM = HMAC-SHA256(PRK, info || counter)
    │
    ▼
  Derived key (32 bytes)
    │
    ▼
  Target ecosystem key operations
    ├── Direction 1: Ed25519 keypair generation → SSH authorized_keys
    └── Direction 2: secp256k1 EC multiply → Keccak256 → Ethereum address
```

No external dependencies. No RPC calls. No network access. The derivation runs in constant time with constant memory on any machine with Node.js crypto.

### Why These Encryption Schemes

The module bridges two specific elliptic curves. The choice of each curve was made by its respective ecosystem, not by us. Understanding why each ecosystem chose its curve explains the design constraints crypto-ssh operates within.

#### Ed25519 (SSH side)

Ed25519 is a twisted Edwards curve over GF(2^255 - 19), designed by Daniel J. Bernstein in 2011. OpenSSH adopted it as the default key type in 2014.

| Property | Value | Why It Matters |
|----------|-------|----------------|
| **Curve** | Twisted Edwards form of Curve25519 | Faster than Weierstrass form; complete addition formula eliminates edge cases |
| **Field size** | 255 bits (prime 2^255 - 19) | Mersenne-like prime enables fast modular arithmetic |
| **Security level** | 128 bits | Equivalent to RSA-3072 or AES-128; sufficient for all foreseeable non-quantum threats |
| **Key size** | 32-byte seed → 64-byte expanded key | Smallest keys of any standard SSH algorithm |
| **Signature size** | 64 bytes | Compact; half the size of RSA-2048 signatures |
| **Deterministic signing** | Yes (RFC 6979-style) | Same message + same key = same signature; no RNG dependency during signing |
| **Side-channel resistance** | Designed for constant-time implementation | No secret-dependent branches or memory access patterns |
| **Patent status** | Patent-free | Bernstein explicitly designed for unrestricted use |

**Why SSH chose Ed25519:** Speed, small keys, no NIST dependency, constant-time design. The SSH ecosystem needed a modern alternative to RSA (slow, large keys) and ECDSA-NIST (NIST curve suspicion post-Snowden, non-deterministic signing).

#### secp256k1 (Wallet side)

secp256k1 is a Koblitz curve defined by the Standards for Efficient Cryptography Group (SECG). Bitcoin adopted it in 2009; Ethereum inherited it in 2015.

| Property | Value | Why It Matters |
|----------|-------|----------------|
| **Curve** | Weierstrass form: y^2 = x^3 + 7 over GF(p) | Standard ECDSA curve; widely audited |
| **Field size** | 256 bits (prime 2^256 - 2^32 - 977) | Efficient implementation due to special prime structure |
| **Security level** | 128 bits | Same as Ed25519; sufficient for current threat models |
| **Key size** | 32-byte private key → 33-byte compressed public key | Compact public keys for on-chain storage |
| **Signature size** | 64-72 bytes (DER-encoded r,s pair) | Variable length due to DER encoding |
| **Deterministic signing** | Via RFC 6979 (not inherent to curve) | Ethereum wallets use deterministic signing to avoid nonce reuse attacks |
| **Recovery parameter** | v (27 or 28) | Unique to Ethereum: ecrecover() recovers address from signature without public key |
| **Koblitz curve** | Yes (a=0, b=7) | Enables endomorphism optimization: ~30% faster verification |
| **Patent status** | Patent-free | Satoshi chose it specifically because it was not a NIST curve |

**Why crypto chose secp256k1:** Bitcoin's Satoshi Nakamoto selected it because it was the most efficient non-NIST curve available in 2008. The `a=0` Koblitz form allows a GLV endomorphism that accelerates point multiplication. Ethereum inherited the choice for ecosystem compatibility with Bitcoin's cryptographic tooling.

#### Why Not Use the Same Curve?

SSH and crypto wallets use different curves because they were designed by different communities with different priorities:

| Priority | SSH (Ed25519) | Crypto (secp256k1) |
|----------|--------------|-------------------|
| Primary goal | Authentication speed | On-chain verification efficiency |
| Signing model | One signature, verified once | One signature, verified by thousands of nodes |
| Key recovery | Not needed (public key is known) | Essential (ecrecover on-chain) |
| Determinism | Built into curve definition | Added via RFC 6979 |
| Ecosystem age | 2011 (curve), 2014 (SSH adoption) | 2000 (curve), 2009 (Bitcoin adoption) |

Crypto-ssh bridges this gap. Rather than forcing one ecosystem to adopt the other's curve (which would break all existing tooling), it derives keys through HKDF — a mathematically sound transformation that preserves security properties while producing keys native to each ecosystem.

#### Why HKDF and Not Direct Mapping

It would be simpler to use the 32 bytes of a secp256k1 key directly as an Ed25519 seed (or vice versa). This is insecure for two reasons:

1. **Domain separation.** If the same 32 bytes are used as both an Ed25519 key and a secp256k1 key, a vulnerability in one curve's implementation could leak information about the other. HKDF's salt and info parameters ensure the derived key is cryptographically independent from the source.

2. **Key validity.** secp256k1 private keys must be in the range [1, n-1] where n is the curve order. While almost all 256-bit numbers are valid, the constraint exists. HKDF's output is indistinguishable from random, which means it satisfies this constraint with overwhelming probability (failure probability ~2^-128). Direct byte copying would work in practice but lacks the formal security proof.

3. **Context binding.** HKDF's info parameter allows deriving multiple independent keys from a single source. `info="ssh-auth:prod"` produces a different key than `info="ssh-auth:dev"`. Direct mapping produces exactly one key per source — no context separation.

#### Why SHA-256 as the Hash Function

HKDF is parameterized by a hash function. We use SHA-256 because:

- **Universal availability**: Node.js crypto, browser WebCrypto, hardware accelerators, every platform
- **Proven security**: No practical attacks against SHA-256 in HMAC mode; the HMAC construction provides security even if the underlying hash has weaknesses
- **Performance**: SHA-256 is the fastest secure hash on x86/ARM with hardware acceleration (Intel SHA Extensions, ARM SHA2 instructions)
- **Compatibility**: Both Ed25519 (internally uses SHA-512, but HKDF is external) and secp256k1 (Bitcoin uses SHA-256 extensively) ecosystems trust SHA-256

SHA-512 would also work (and HKDF-SHA512 is used in BIP-32). We chose SHA-256 for HKDF because the output length (32 bytes) matches both Ed25519 seed size and secp256k1 key size exactly — one HKDF expansion step, no truncation.

### Complete Workflow

#### Workflow A: New User Onboarding with Wallet → SSH

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 1: User has a wallet (MetaMask, Ledger, bankon_vault)          │
  │         Wallet contains secp256k1 keypair                           │
  │         Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266         │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 2: Client runs deriveEd25519FromWallet()                       │
  │                                                                      │
  │   Input:  wallet_privkey (32 bytes from wallet)                     │
  │           context = "ssh-auth" (default)                             │
  │                                                                      │
  │   HKDF Extract:                                                      │
  │     PRK = HMAC-SHA256(                                               │
  │       key  = "pmvpn-crypto-ssh",        ← domain-specific salt      │
  │       data = wallet_privkey             ← input keying material     │
  │     )                                                                │
  │     PRK is now 32 bytes of pseudorandom key material                │
  │                                                                      │
  │   HKDF Expand:                                                       │
  │     T(1) = HMAC-SHA256(                                              │
  │       key  = PRK,                                                    │
  │       data = "ed25519-derivation:ssh-auth" || 0x01                  │
  │     )                                                                │
  │     OKM = first 32 bytes of T(1) = Ed25519 seed                    │
  │                                                                      │
  │   Ed25519 keypair generation:                                        │
  │     private_key = PKCS#8 DER encoding of seed                       │
  │     public_key  = Ed25519 base point multiplication                 │
  │                                                                      │
  │   Output:                                                            │
  │     Private: PEM-encoded Ed25519 key → ~/.ssh/pmvpn_ed25519         │
  │     Public:  ssh-ed25519 AAAA... → authorized_keys on server        │
  │     Fingerprint: SHA256:... → for TOFU verification                 │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 3: Deploy public key to server                                  │
  │                                                                      │
  │   Option A: pmVPN bootstrap (SFTP upload to authorized_keys)        │
  │   Option B: Manual: ssh-copy-id -i ~/.ssh/pmvpn_ed25519.pub         │
  │   Option C: Cloud-init / Terraform / Ansible provisioning           │
  │                                                                      │
  │   The public key line includes the wallet address as comment:        │
  │   ssh-ed25519 AAAA... pmvpn:0xf39F...:ssh-auth                     │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 4: Connect with standard SSH                                    │
  │                                                                      │
  │   ssh -i ~/.ssh/pmvpn_ed25519 user@server                           │
  │                                                                      │
  │   No challenge API. No JSON in password field.                       │
  │   No wallet needed at connection time.                               │
  │   Pure SSH public key authentication (RFC 4252 Section 7).          │
  │                                                                      │
  │   Works with: OpenSSH, PuTTY, Paramiko, ssh2, WinSCP, rsync, git   │
  └──────────────────────────────────────────────────────────────────────┘
```

#### Workflow B: Server Host Key → Service Wallet

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 1: pmVPN server starts                                          │
  │         Host key generated at ~/.pmvpn/hostkey (Ed25519)             │
  │         This happens automatically on first run                      │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 2: Derive service wallet                                        │
  │                                                                      │
  │   Read host key PEM → extract 32-byte Ed25519 seed                  │
  │   HKDF:                                                              │
  │     salt = "crypto-ssh-reverse"                                      │
  │     info = "secp256k1-derivation:pmvpn-service-wallet"              │
  │     OKM  = 32 bytes → secp256k1 private key                        │
  │                                                                      │
  │   secp256k1 point multiplication → uncompressed public key          │
  │   Keccak256(pubkey[1:]) → last 20 bytes → Ethereum address         │
  │                                                                      │
  │   Server now has a deterministic Ethereum address                    │
  │   Same host key → same address (always)                             │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 3: Use service wallet                                           │
  │                                                                      │
  │   Register on-chain: smart contract stores (address, host, pubkey)  │
  │   Receive payments: clients pay server address for VPN service      │
  │   Sign attestations: server signs uptime proofs with wallet key     │
  │   Mesh discovery: other servers find this server via on-chain lookup│
  │                                                                      │
  │   The wallet key is derived on-demand, held in memory, zeroed after │
  │   use. It never touches disk as a wallet file.                      │
  └──────────────────────────────────────────────────────────────────────┘
```

#### Workflow C: SSH Key → Multi-Chain HD Wallet

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 1: User has an SSH key                                          │
  │         ~/.ssh/id_ed25519 (generated by ssh-keygen)                  │
  │         OR on YubiKey / TPM / Nitrokey                               │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 2: Extract seed and derive BIP-32 master key                    │
  │                                                                      │
  │   Parse OpenSSH private key format (openssh-key-v1):                │
  │     AUTH_MAGIC → cipher → kdf → num_keys → pub_blob → priv_blob    │
  │     priv_blob: check1, check2, key_type, pub(32), priv(64)         │
  │     Ed25519 seed = first 32 bytes of priv                           │
  │                                                                      │
  │   BIP-32 master key:                                                 │
  │     I = HMAC-SHA512(Key="Bitcoin seed", Data=ed25519_seed)          │
  │     master_key   = I[0:32]   (IL — left half)                      │
  │     chain_code   = I[32:64]  (IR — right half)                     │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Step 3: Derive chain-specific keys via BIP-44 paths                  │
  │                                                                      │
  │   For each level, hardened child derivation:                         │
  │     data = 0x00 || parent_key(32) || index(4, big-endian)           │
  │     I = HMAC-SHA512(Key=parent_chain_code, Data=data)               │
  │     child_key = (IL + parent_key) mod n                             │
  │     child_chain_code = IR                                            │
  │                                                                      │
  │   Ethereum:  m/44'/60'/0'/0'/0'                                     │
  │     Level 1: derive(master, 44)  → key1, cc1                       │
  │     Level 2: derive(key1, 60)    → key2, cc2                       │
  │     Level 3: derive(key2, 0)     → key3, cc3                       │
  │     Level 4: derive(key3, 0)     → key4, cc4                       │
  │     Level 5: derive(key4, 0)     → eth_privkey                     │
  │                                                                      │
  │   Bitcoin:   m/44'/0'/0'/0'/0'   (same process, coinType=0)        │
  │   Algorand:  m/44'/283'/0'/0'/0' (coinType=283)                    │
  │   Solana:    m/44'/501'/0'/0'    (coinType=501, Ed25519 native)    │
  │                                                                      │
  │   All intermediate keys are zeroed after derivation.                │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Heritage

Crypto-SSH descends from **[csshd](https://github.com/cryptoAGI/csshd)** — the world's first working implementation of wallet-login SSH. Built with Python and paramiko, csshd proved the concept: sign a message with your Ethereum wallet, present the signature as SSH credentials, and the server recovers your address to authenticate you.

csshd demonstrated that wallet-based SSH authentication works. But it had limitations:

| Property | csshd | pmVPN current | crypto-ssh module |
|----------|-------|---------------|-------------------|
| Signature replay | **Vulnerable** (static message) | **Protected** (nonce + 60s TTL) | **Protected** (nonce + session binding) |
| Auth method | Password field hack | Password field hack | **Native SSH public key auth** |
| RPC dependency | Web3 provider required | **None** (viem local) | **None** (pure crypto) |
| Key derivation | None | None | **HKDF (RFC 5869)** |
| Standard SSH client | Not supported | Not supported | **Supported** (derived Ed25519) |
| Reverse direction | Not explored | Not explored | **SSH → Wallet** |

This module is the next evolution: from csshd's proof of concept, through pmVPN's hardened implementation, to true cryptographic unification of SSH and wallet identity.

### The cSSHwallet Lineage

Before csshd, there were ten prototypes:

1. **CRYPTOSSH** — first experiment: "what if a wallet signature replaces a password?"
2. **crypto-ssh** — refined the signing flow
3. **csshd2–csshd9** — iterations on server architecture, auth flow, and security
4. **csshdQR** — QR code for mobile wallet signing

Each prototype refined the core insight: **a wallet already solves the identity problem for SSH**. A private key produces signatures. Signatures prove identity. The verification is pure mathematics. No passwords. No key files. No trust.

csshd was the synthesis — the first version that actually worked end-to-end. This crypto-ssh module is the next step: making the wallet key and the SSH key mathematically the same thing.

---

## Two Directions

```
                    HKDF (RFC 5869)
                    One-way derivation

  ┌──────────────┐                      ┌──────────────┐
  │              │  ──── Direction 1 ──→ │              │
  │   Wallet     │  Wallet → SSH         │   SSH Key    │
  │  secp256k1   │  Your wallet derives  │   Ed25519    │
  │              │  SSH credentials       │              │
  │  MetaMask    │                        │  OpenSSH     │
  │  Ledger      │  ←── Direction 2 ──── │  YubiKey     │
  │  bankon_vault│  SSH → Wallet          │  ~/.ssh/     │
  │              │  Your SSH key derives  │              │
  └──────────────┘  crypto wallets        └──────────────┘

                    Properties:
                    ✓ Deterministic (same input → same output)
                    ✓ One-way (cannot reverse the derivation)
                    ✓ Independent (compromise of derived ≠ compromise of source)
```

---

## Direction 1: Wallet → SSH

*Your wallet key derives SSH credentials for passwordless server access.*

### Why This Matters

Today, pmVPN authenticates by stuffing a wallet signature into the SSH password field. It works, but:

- Standard SSH clients (OpenSSH, PuTTY) can't use it — they don't speak wallet-signature-as-password
- The challenge API is an extra round trip before every connection
- The authentication is protocol-layer (paramiko/ssh2 password callback), not key-layer (SSH public key verification)

With wallet-to-SSH derivation, your wallet **deterministically produces an Ed25519 SSH keypair**. That key goes into `authorized_keys`. Standard `ssh user@host` works. No challenge API. No custom protocol. Pure SSH.

### Approach 1: HKDF Derivation (Recommended)

The most practical approach. Deterministically derives an Ed25519 SSH keypair from a secp256k1 wallet private key using HKDF (RFC 5869).

**Cryptographic flow:**

```
  wallet_privkey (32 bytes, secp256k1)
    │
    ▼
  HKDF-SHA256
    IKM:  wallet_privkey (32 bytes)
    Salt: "pmvpn-crypto-ssh" (constant)
    Info: "ed25519-derivation:<context>" (variable)
    │
    ▼
  32 bytes of key material
    │
    ▼
  Ed25519 seed (the 32-byte seed IS the Ed25519 private key)
    │
    ▼
  Ed25519 keypair
    ├── Private key: PEM (for SSH client)
    └── Public key: authorized_keys line (for server)
```

**Usage:**

```typescript
import { deriveEd25519FromWallet } from '@pmvpn/crypto-ssh';

const keyPair = deriveEd25519FromWallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  'ssh-auth'  // context — different contexts = different keys
);

console.log(keyPair.publicKeySSH);
// ssh-ed25519 AAAA... pmvpn:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266:ssh-auth

console.log(keyPair.fingerprint);
// SHA256:7h+q2F...

// Write to authorized_keys on the server
// Write PEM to ~/.ssh/pmvpn_ed25519 on the client
```

**Properties:**

| Property | Value |
|----------|-------|
| Deterministic | Same wallet → same SSH key (always) |
| One-way | SSH key cannot recover wallet key |
| Context-separated | Different contexts produce independent keys |
| Standard compatible | Works with OpenSSH, PuTTY, any SSH client |
| Key size | Ed25519 = 128-bit security level |

**Per-purpose key derivation:**

A single wallet can derive multiple SSH keys for different purposes:

```typescript
import { deriveMultipleKeys } from '@pmvpn/crypto-ssh';

const keys = deriveMultipleKeys(walletPrivKey, address, [
  'ssh-auth',          // Default login key
  'ssh-auth:prod',     // Production server access
  'ssh-auth:dev',      // Development server access
  'git-signing',       // Git commit signatures
  'backup-access',     // Emergency recovery key
]);
```

Each context produces a cryptographically independent key. Revoking one does not affect the others.

### Approach 2: secp256k1 Native SSH

Uses the wallet's secp256k1 public key directly as an SSH identity. The wallet key IS the SSH key — no derivation needed.

**Custom key type: `ecdsa-sha2-secp256k1`**

```
  Key blob:
    string    "ecdsa-sha2-secp256k1"
    string    "secp256k1"
    string    Q  (33-byte compressed public key point)

  Signature blob:
    string    "ecdsa-sha2-secp256k1"
    string    DER-encoded ECDSA (r, s)
```

**Advantages:**
- Zero derivation — the wallet key is used directly
- EIP-191 signatures are compatible with the SSH signature challenge format
- MetaMask can act as the signing backend

**Limitations:**
- Only works with pmVPN's ssh2-based server (custom key type)
- Standard OpenSSH does not support secp256k1
- Requires wallet availability for every connection (no pre-deployed key)

**Usage:**

```typescript
import { createSecp256k1SSHIdentity } from '@pmvpn/crypto-ssh';

const identity = createSecp256k1SSHIdentity(
  '0x03ab...compressed_pubkey',
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
);

console.log(identity.authorizedKeysLine);
// ecdsa-sha2-secp256k1 AAAA... pmvpn:0xf39F...
```

### Approach 3: SSH Agent Bridge

The wallet acts as an SSH agent. Standard SSH clients talk to the agent, which delegates signing to the wallet.

**Flow:**

```
  ┌─────────────┐       SSH Agent Protocol       ┌─────────────┐
  │  SSH Client  │ ──── (Unix domain socket) ──── │  Wallet Agent│
  │  (OpenSSH)   │                                │  (pmVPN)     │
  │              │  1. REQUEST_IDENTITIES    ───→  │              │
  │              │  ←── IDENTITIES_ANSWER         │  Returns     │
  │              │      (wallet public key)        │  wallet's    │
  │              │                                │  secp256k1   │
  │              │  2. SIGN_REQUEST         ───→  │  public key  │
  │              │      (session challenge)        │              │
  │              │                                │  Forwards to │
  │              │                                │  MetaMask /  │
  │              │                                │  Ledger /    │
  │              │  ←── SIGN_RESPONSE             │  bankon_vault│
  │              │      (wallet signature)         │              │
  └─────────────┘                                └─────────────┘
```

**Why this is the most flexible approach:**

- Standard SSH clients work unmodified
- Private key never touches disk — wallet holds it
- Hardware wallet support (Ledger, Trezor) comes for free
- Multiple wallets = multiple SSH identities
- Works with `ssh`, `scp`, `rsync`, `git` — anything that uses SSH agent

**The agent implements two SSH agent protocol messages:**

| Message | Direction | Purpose |
|---------|-----------|---------|
| `SSH_AGENTC_REQUEST_IDENTITIES` (11) | Client → Agent | "What keys do you have?" |
| `SSH_AGENT_IDENTITIES_ANSWER` (12) | Agent → Client | List of wallet public keys |
| `SSH_AGENTC_SIGN_REQUEST` (13) | Client → Agent | "Sign this challenge" |
| `SSH_AGENT_SIGN_RESPONSE` (14) | Agent → Client | Wallet signature |

---

## Direction 2: SSH → Wallet

*Your SSH key derives crypto wallets for asset custody.*

### The Observation

There are billions of SSH keys in the world. Every developer has one. Every server has one. They are already:

- Generated with cryptographic randomness
- Stored with restrictive file permissions
- Protected by passphrases (optionally)
- Backed up as part of infrastructure provisioning
- Living on hardware tokens (YubiKey, TPM)

An Ed25519 SSH key is 256 bits of entropy — the same as a 24-word BIP-39 mnemonic. The question is not whether an SSH key CAN be a wallet. The question is whether it SHOULD be.

### Approach 1: Direct HKDF Derivation

The simplest path. HKDF transforms the Ed25519 seed into a secp256k1 private key.

**Cryptographic flow:**

```
  ssh_privkey (Ed25519 seed, 32 bytes)
    │
    ▼
  HKDF-SHA256
    IKM:  ed25519_seed (32 bytes)
    Salt: "crypto-ssh-reverse" (constant)
    Info: "secp256k1-derivation:<context>" (variable)
    │
    ▼
  32 bytes → secp256k1 private key
    │
    ▼
  EC point multiplication on secp256k1 curve
    │
    ▼
  Uncompressed public key (65 bytes: 0x04 || x || y)
    │
    ▼
  Keccak256(x || y) → last 20 bytes
    │
    ▼
  Ethereum address (EIP-55 checksummed)
```

**Usage:**

```typescript
import { deriveWalletFromSSHKey } from '@pmvpn/crypto-ssh';

const wallet = deriveWalletFromSSHKey(sshPrivateKeyPEM, 'eth-wallet');
// wallet.privateKey → 0x... (use with viem for address derivation)
// wallet.sourceFingerprint → SHA256:7h+q2F...
// wallet.warning → "DERIVED WALLET — SSH key compromise = wallet compromise"
```

### Approach 2: HD Wallet Seed

Uses the SSH key as seed material for a full BIP-32 hierarchical deterministic wallet tree. One SSH key → unlimited wallets across all chains.

**BIP-32 master key derivation:**

```
  ssh_seed (32 bytes)
    │
    ▼
  HMAC-SHA512(Key="Bitcoin seed", Data=ssh_seed)
    │
    ├── First 32 bytes: master private key (IL)
    └── Last 32 bytes: master chain code (IR)

  Then BIP-44 derivation:
    m/44'/60'/0'/0'/0'  ← Ethereum
    m/44'/0'/0'/0'/0'   ← Bitcoin
    m/44'/283'/0'/0'/0' ← Algorand
    m/44'/501'/0'/0'    ← Solana (Ed25519 native!)
```

**Multi-chain from one SSH key:**

```typescript
import { deriveChainKey, COIN_TYPES, extractEd25519Seed } from '@pmvpn/crypto-ssh';

const seed = extractEd25519Seed(sshPrivateKeyPEM);

const ethKey = deriveChainKey(seed, COIN_TYPES.ETHEREUM);
const btcKey = deriveChainKey(seed, COIN_TYPES.BITCOIN);
const algoKey = deriveChainKey(seed, COIN_TYPES.ALGORAND);
const solKey = deriveChainKey(seed, COIN_TYPES.SOLANA);

// Each produces an independent wallet for that chain
```

**Solana special case:**

Solana uses Ed25519 natively. An Ed25519 SSH key IS a valid Solana keypair without any derivation. `~/.ssh/id_ed25519` is already a Solana wallet. This is not theoretical — it is a mathematical identity.

### Approach 3: SSH Key as Transaction Signer

The SSH key directly signs EVM transactions through a derived secp256k1 key. The SSH key material is loaded once, the signing key is held in memory, and transactions are signed on demand.

```typescript
import { createSSHTransactionSigner } from '@pmvpn/crypto-ssh';

const signer = createSSHTransactionSigner(sshPrivateKeyPEM);
// signer.derivedPrivateKey → use with viem's walletClient
// signer.destroy() → zero key material from memory
```

**Account Abstraction (EIP-4337):**

With account abstraction, a smart contract wallet can accept Ed25519 signatures directly — no secp256k1 derivation needed. The SSH key signs the UserOperation, and the smart contract's `validateUserOp` verifies the Ed25519 signature on-chain.

This requires:
1. A smart contract that verifies Ed25519 (available as precompile on some L2s)
2. A bundler that accepts the non-standard signature format
3. The SSH key to sign the UserOperation hash

The result: your SSH key signs Ethereum transactions. No wallet software. No MetaMask. Just `ssh-keygen` and a smart contract.

### Server Host Key as Service Wallet

Every pmVPN server has an Ed25519 host key at `~/.pmvpn/hostkey`. By deriving a wallet from this key, each server gets a deterministic Ethereum address.

**Applications:**

| Use Case | How It Works |
|----------|-------------|
| **Server-to-server payments** | Servers pay each other for API calls or relay services |
| **On-chain server registry** | Servers register their addresses in a smart contract |
| **Service deposits** | Servers stake tokens as service quality guarantees |
| **Automated payroll** | Server wallets receive and distribute payments |
| **Machine identity** | The server's on-chain identity = its SSH identity |
| **Decentralized VPN mesh** | pmVPN nodes register on-chain, discover each other |

```typescript
import { deriveServiceWallet } from '@pmvpn/crypto-ssh';
import { readFileSync } from 'fs';

const hostKey = readFileSync(
  `${process.env.HOME}/.pmvpn/hostkey`,
  'utf8'
);
const serviceWallet = deriveServiceWallet(hostKey);
// serviceWallet.fingerprint — matches the SSH host key fingerprint
// serviceWallet.getPrivateKey() — use with viem for on-chain operations
```

**Key rotation = wallet rotation:**

When a server's host key is rotated (e.g., after compromise), the derived wallet address changes. This is a feature:
- Compromised key = compromised wallet → move funds BEFORE rotating
- New key = new wallet → fresh start
- On-chain registry can track key rotations as address changes

### YubiKey / Hardware Token Integration

When the SSH key lives on hardware (YubiKey 5, TPM 2.0, Nitrokey), the private key never leaves the device. Standard HKDF derivation is impossible because we can't extract the seed.

**Solution: Signature-Based Derivation**

```
  Hardware token
    │
    ▼
  Ed25519 sign("crypto-ssh:derive:eth-wallet")
    │  (deterministic — same key + same message = same signature)
    ▼
  SHA-256(signature) → 32 bytes
    │
    ▼
  secp256k1 private key
```

The private key never leaves hardware. The hardware must be present (touch/PIN) to derive the wallet. Same hardware always produces the same wallet.

```typescript
import { deriveFromHardwareSignature } from '@pmvpn/crypto-ssh';

const keyMaterial = await deriveFromHardwareSignature(
  async (msg) => {
    // This function calls the hardware token via ssh-agent or PKCS#11
    return await yubikey.sign(msg);
  },
  'eth-wallet'
);
```

---

## Security Analysis

### Threat Model

| Threat | Direction 1 (Wallet→SSH) | Direction 2 (SSH→Wallet) |
|--------|--------------------------|--------------------------|
| **Source key compromised** | Attacker derives all SSH keys | Attacker derives all wallets |
| **Derived key compromised** | SSH access lost, wallet safe | Wallet funds lost, SSH safe |
| **HKDF broken** | Both keys compromised | Both keys compromised |
| **Context collision** | Different contexts = different keys | Different contexts = different keys |
| **Quantum computers** | Ed25519 broken → derive new type | secp256k1 broken → all EVM affected |

### What HKDF Guarantees

HKDF (RFC 5869) provides:

1. **Pseudorandomness**: Output is indistinguishable from random given the input
2. **Independence**: Different (salt, info) pairs produce independent outputs
3. **One-way**: Cannot recover input from output (SHA-256 preimage resistance)
4. **Extraction**: Concentrates entropy from non-uniform input into uniform PRK

HKDF does NOT provide:

1. **Key stretching**: If the input has low entropy (short password), HKDF doesn't help. This is fine for our use case — both Ed25519 seeds and secp256k1 keys are 256-bit uniform random.
2. **Forward secrecy**: Compromising the source key at any time allows re-derivation of all past and future derived keys.

### Recommendations

**For wallet → SSH (Direction 1):**

| Recommendation | Reason |
|---------------|--------|
| Use HKDF derivation (Approach 1) | Standard, compatible, well-analyzed |
| Use per-server contexts | Compromising one server's key doesn't affect others |
| Store derived keys with SSH-standard protections | passphrase, chmod 600, ssh-agent |
| Rotate derived keys when wallet changes | New wallet = new SSH keys |

**For SSH → wallet (Direction 2):**

| Recommendation | Reason |
|---------------|--------|
| **Do not use for high-value custody** | SSH keys have different threat model than wallet keys |
| Use for operational/ephemeral funds only | Service payments, not savings |
| Hardware-back the SSH key (YubiKey) | Elevates security to hardware wallet level |
| Separate human wallets from service wallets | Server host key wallets ≠ personal wallets |
| Track derived addresses on-chain | Know when to move funds before key rotation |

**Do NOT:**

- Use the same SSH key for both production server access AND high-value crypto custody
- Store derived wallet keys on disk (derive on demand, hold in memory, zero after use)
- Assume SSH key backup = wallet backup (it IS, but your backup process may not be secure enough for crypto custody)
- Use hardware-signature derivation across different hardware tokens (results may differ)

### Cryptographic Primitives

| Function | Algorithm | Security Level | Standard |
|----------|-----------|---------------|----------|
| Key derivation | HKDF-SHA256 | 256-bit | RFC 5869 |
| SSH key type | Ed25519 | 128-bit | RFC 8032 |
| Wallet key type | secp256k1 ECDSA | 128-bit | SEC 2 |
| Address hashing | Keccak-256 | 256-bit | Ethereum |
| HD derivation | HMAC-SHA512 | 256-bit | BIP-32 |
| Fingerprints | SHA-256 | 256-bit | OpenSSH |

---

## Why SSH Keys Can Store Crypto Assets

### The Mathematical Argument

An Ed25519 private key is 32 bytes of cryptographic randomness. A secp256k1 private key is 32 bytes of cryptographic randomness. They are different curves, different algorithms, different ecosystems — but the fundamental object is the same: **256 bits of entropy that prove identity through mathematical operations**.

The derivation from one to the other is a deterministic function (HKDF). Given the same input, it always produces the same output. It cannot be reversed. It cannot leak information about the input. It is as secure as SHA-256.

If you trust your SSH key to authenticate you to servers, you are already trusting 256 bits of entropy to prove your identity. Trusting those same 256 bits (through a one-way derivation) to prove your identity on a blockchain is not a new trust assumption — it is the same trust assumption applied to a different domain.

### The Practical Argument

**SSH keys are already well-protected:**
- Generated with `/dev/urandom` or hardware RNG
- Stored in `~/.ssh/` with chmod 600
- Optionally encrypted with a passphrase
- Backed up as part of standard server provisioning
- Living on hardware tokens (YubiKey, TPM, Nitrokey)

**SSH keys are already widely distributed:**
- Every developer has at least one
- Every server has a host key
- GitHub alone has tens of millions of SSH keys registered
- Enterprise environments manage SSH keys through centralized infrastructure

**SSH keys have existing management infrastructure:**
- `ssh-keygen` for generation and conversion
- `ssh-agent` for in-memory key management
- `ssh-add` for agent loading with timeouts
- LDAP/Active Directory integration for enterprise
- Vault/secrets management integration

The question is not "can SSH keys be wallets?" — the math says yes. The question is "should they be?" — and the answer depends on the use case.

### When SSH Keys SHOULD Hold Crypto

1. **Service wallets** — server-to-server micropayments, API billing, operational funds
2. **Machine identity** — on-chain registration of server identity for mesh networking
3. **Ephemeral wallets** — temporary wallets for CI/CD pipelines, test environments
4. **Hardware-backed wallets** — YubiKey SSH key = hardware-backed crypto custody
5. **Emergency recovery** — if your wallet is compromised, your SSH key derivation is an independent backup

### When SSH Keys Should NOT Hold Crypto

1. **Long-term savings** — use a proper hardware wallet (Ledger, Trezor)
2. **Shared infrastructure keys** — if multiple people have access, the wallet is shared
3. **Unencrypted SSH keys** — no passphrase = no protection if disk is copied
4. **Root/admin keys** — these are high-value targets already; don't add crypto custody risk

---

## Integration with pmVPN

### Current State (Password-Field Auth)

```
  Client → GET /challenge → sign → SSH password=JSON({address, sig, nonce}) → Server
```

### With Crypto-SSH (Native Public Key Auth)

```
  One-time setup:
    Wallet → HKDF → Ed25519 keypair
    Public key → server authorized_keys

  Every connection:
    Client → SSH public key auth (standard) → Server
    No challenge API. No JSON in password field. Pure SSH.
```

### Migration Path

1. **Phase 1** (current): Password-field auth with nonce — works everywhere
2. **Phase 2** (crypto-ssh): Add derived Ed25519 keys to authorized_keys alongside existing auth
3. **Phase 3** (hybrid): Server accepts both methods — wallet signature OR derived key
4. **Phase 4** (optional): Deprecate password-field auth for clients that support derived keys

The server already has an `authorized_keys` deployment mechanism (Phase 5 bootstrap). Extending it to deploy wallet-derived Ed25519 keys is straightforward.

### Port +6: Claude AI with Service Wallet

The service wallet derived from the server's host key could enable:
- Claude API billing through the server's own wallet
- On-chain audit log of AI operations
- Token-gated AI access (hold X tokens → use Claude through pmVPN)

---

## File Structure

```
crypto-ssh/
├── src/
│   ├── index.ts              Module exports
│   ├── wallet-to-ssh.ts      Direction 1: Wallet → SSH
│   │   ├── deriveEd25519FromWallet()     HKDF derivation
│   │   ├── deriveMultipleKeys()          Per-purpose keys
│   │   ├── createSecp256k1SSHIdentity()  Native secp256k1
│   │   ├── buildIdentitiesAnswer()       SSH agent protocol
│   │   └── parseSignRequest()            SSH agent protocol
│   │
│   └── ssh-to-wallet.ts      Direction 2: SSH → Wallet
│       ├── extractEd25519Seed()          PEM seed extraction
│       ├── extractOpenSSHEd25519Seed()   OpenSSH format parsing
│       ├── deriveSecp256k1FromSSH()      HKDF derivation
│       ├── deriveWalletFromSSHKey()      Full pipeline
│       ├── deriveBIP32MasterKey()        HD wallet master key
│       ├── deriveHardenedChild()         BIP-32 child derivation
│       ├── deriveEthereumKeyFromSSH()    BIP-44 Ethereum path
│       ├── deriveHDWalletFromSSH()       Full HD wallet
│       ├── createSSHTransactionSigner()  EVM transaction signing
│       ├── deriveServiceWallet()         Server host key wallet
│       ├── deriveFromHardwareSignature() YubiKey/TPM derivation
│       └── deriveChainKey()              Multi-chain derivation
│
├── package.json
└── tsconfig.json
```

---

## The Bigger Picture

### Identity Convergence

SSH keys and cryptocurrency wallets are both implementations of the same primitive: **asymmetric key pair as identity**. They differ in:

| Property | SSH Key | Crypto Wallet |
|----------|---------|--------------|
| Curve | Ed25519 (Curve25519) | secp256k1 |
| Purpose | Server authentication | Transaction authorization |
| Ecosystem | OpenSSH, sshd, git | Ethereum, DeFi, NFTs |
| Management | ssh-keygen, ssh-agent | MetaMask, hardware wallets |
| Verification | Server checks authorized_keys | Smart contract checks signature |
| Identity format | Public key fingerprint | Ethereum address (Keccak256) |

But the core operation is identical: **"I hold a private key. Here is a signature proving it. Verify it against my public key."**

Crypto-SSH unifies these two worlds. A single key — whether it started as an SSH key or a wallet key — can authenticate to both servers and blockchains. Your identity is a 256-bit number. Everything else is derivation.

### The Cypherpunk Vision

The cypherpunk thesis is that cryptographic keys are the fundamental building block of digital identity. Not usernames. Not email addresses. Not government IDs. Keys.

pmVPN implements this for server access: your key is your identity, your signature is your proof, no institution mediates.

Crypto-SSH extends it to its logical conclusion: the same key that proves you own an Ethereum address proves you are authorized to access a server. The same key that lets you sign a transaction lets you open an SSH session. One key. One identity. Two domains.

This is what csshd started. This is what pmVPN hardens. This is what crypto-ssh completes.

---

## Modular Integration Guide

Crypto-SSH is designed as a project-agnostic expansion module. It has zero runtime dependencies — only Node.js built-in `crypto`. It does not import pmVPN code, wallet libraries, SSH servers, or blockchain SDKs. This means it can be embedded in any TypeScript or JavaScript project that needs to bridge SSH and wallet identity.

### Design Principles

1. **Zero dependencies.** The module uses only `node:crypto`. No npm packages. No native bindings. Runs everywhere Node.js runs.

2. **Pure functions.** Every export is a deterministic function: bytes in, bytes out. No side effects, no state, no I/O. This makes the module testable, auditable, and safe to run in any context.

3. **Ecosystem-agnostic outputs.** The module produces raw key material (Buffers, hex strings, PEM). It does not assume which SSH library or wallet library you use. Plug the output into ssh2, paramiko, OpenSSH, viem, ethers.js, web3.py — anything.

4. **Memory hygiene.** All intermediate key material is zeroed after use. Callers receive copies, not references to internal buffers. Destroy functions are provided for long-lived signers.

5. **Context separation.** Every derivation function accepts a `context` string. Different contexts produce different keys. This allows per-server, per-chain, per-purpose derivation from a single source key.

### Installing in Your Project

```bash
# As a local module (monorepo)
cp -r crypto-ssh/ your-project/lib/crypto-ssh/

# Or as an npm package (when published)
npm install @pmvpn/crypto-ssh

# Or as a git submodule
git submodule add https://github.com/poormanvpn/pmVPN.git vendor/pmvpn
# Then import from vendor/pmvpn/pmvpn/crypto-ssh/src/
```

Since the module has no dependencies, copying the `src/` directory is sufficient. No `node_modules` needed.

### Integration Pattern: SSH Server with Wallet Auth

Any project that runs an SSH server (ssh2, paramiko, AsyncSSH) can add wallet-derived key authentication:

```typescript
// your-project/auth.ts
import { deriveEd25519FromWallet } from './lib/crypto-ssh/src/wallet-to-ssh.js';

// During user registration: derive their SSH public key from their wallet
function registerWallet(walletPrivKey: string, address: string) {
  const keyPair = deriveEd25519FromWallet(walletPrivKey, address, 'your-project');
  // Store keyPair.publicKeySSH in your authorized_keys or database
  // The user's wallet deterministically produces this SSH key
  return keyPair.publicKeySSH;
}

// During SSH connection: standard public key auth works automatically
// No custom auth handler needed — OpenSSH verifies against authorized_keys
```

### Integration Pattern: Service Identity on Chain

Any Node.js server with an Ed25519 key (SSH host key, TLS key, custom key) can derive an Ethereum address:

```typescript
// your-project/identity.ts
import { deriveWalletFromSSHKey } from './lib/crypto-ssh/src/ssh-to-wallet.js';
import { readFileSync } from 'fs';

function getServiceIdentity() {
  const hostKey = readFileSync('/etc/ssh/ssh_host_ed25519_key', 'utf8');
  const wallet = deriveWalletFromSSHKey(hostKey, 'service-identity');
  // wallet.privateKey → use with viem to sign on-chain transactions
  // wallet.sourceFingerprint → correlates with SSH host key fingerprint
  return wallet;
}
```

### Integration Pattern: CI/CD Pipeline Wallets

CI/CD runners with SSH deploy keys can derive ephemeral wallets for deployment signing, artifact notarization, or test token management:

```typescript
// .github/actions/deploy.ts
import { deriveChainKey, COIN_TYPES, extractEd25519Seed } from './lib/crypto-ssh/src/ssh-to-wallet.js';
import { readFileSync } from 'fs';

const deployKey = readFileSync(process.env.SSH_DEPLOY_KEY_PATH, 'utf8');
const seed = extractEd25519Seed(deployKey);
const ethKey = deriveChainKey(seed, COIN_TYPES.ETHEREUM);

// ethKey.privateKey → sign deployment attestation on-chain
// Same deploy key → same wallet → verifiable deployment provenance
// Rotate deploy key → wallet changes → old attestations still valid
```

### Integration Pattern: Multi-Tenant SSH Gateway

A gateway server that manages SSH access for multiple wallet holders:

```typescript
// gateway/authorized-keys-command.ts
// Called by OpenSSH's AuthorizedKeysCommand for each connection
import { deriveEd25519FromWallet } from './lib/crypto-ssh/src/wallet-to-ssh.js';

// For each registered wallet address, derive and return the SSH public key
function getAuthorizedKeys(walletAddresses: string[], walletPubKeys: string[]) {
  return walletAddresses.map((addr, i) => {
    // In a real implementation, you'd have the user's public key (not private)
    // and the derived SSH key would be pre-computed during registration.
    // This pattern shows the concept.
    return `ssh-ed25519 ${preComputedKey} pmvpn:${addr}`;
  }).join('\n');
}
```

### Integration Pattern: Python Projects

The cryptographic operations (HKDF, BIP-32) are standard algorithms. A Python implementation uses the same math:

```python
# python equivalent using hashlib + hmac (stdlib only)
import hmac, hashlib

def hkdf_sha256(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    """RFC 5869 HKDF with SHA-256"""
    # Extract
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    # Expand
    okm = b""
    prev = b""
    for i in range(1, (length // 32) + 2):
        prev = hmac.new(prk, prev + info + bytes([i]), hashlib.sha256).digest()
        okm += prev
    return okm[:length]

def wallet_to_ssh_seed(wallet_privkey: bytes, context: str = "ssh-auth") -> bytes:
    """Derive Ed25519 seed from secp256k1 wallet key — same output as TypeScript"""
    return hkdf_sha256(
        ikm=wallet_privkey,
        salt=b"pmvpn-crypto-ssh",
        info=f"ed25519-derivation:{context}".encode(),
        length=32,
    )
```

The Python output is byte-identical to the TypeScript output. Any language with HMAC-SHA256 can implement compatible derivation.

### Integration Pattern: Rust / Native Projects

```rust
// Rust equivalent using ring or hkdf crate
use hkdf::Hkdf;
use sha2::Sha256;

fn wallet_to_ssh_seed(wallet_key: &[u8; 32], context: &str) -> [u8; 32] {
    let salt = b"pmvpn-crypto-ssh";
    let info = format!("ed25519-derivation:{}", context);
    let hk = Hkdf::<Sha256>::new(Some(salt), wallet_key);
    let mut okm = [0u8; 32];
    hk.expand(info.as_bytes(), &mut okm).expect("valid length");
    okm
}
```

### What the Module Does NOT Do

To remain agnostic, crypto-ssh intentionally excludes:

| Excluded | Why | What You Use Instead |
|----------|-----|---------------------|
| SSH server/client | Module is pure crypto, not a transport layer | ssh2, paramiko, OpenSSH, AsyncSSH |
| Wallet signing | Module derives keys, doesn't sign transactions | viem, ethers.js, web3.py |
| Key storage | Module computes keys in memory, doesn't persist | ~/.ssh/, bankon_vault, Vault, KMS |
| Blockchain RPC | Module operates locally, no network calls | viem, Alchemy, Infura, local node |
| UI/wallet connect | Module is library code, no user interface | MetaMask, WalletConnect, custom UI |
| Key encryption | Module outputs raw keys, doesn't encrypt them | ssh-keygen passphrase, AES-256-GCM |

This separation means crypto-ssh fits into existing architectures without displacing any component. It sits between your identity layer (wallet or SSH) and your application layer (server, blockchain, CI/CD), translating keys without assuming anything about the layers above or below.

### Compatibility Matrix

| Platform | Wallet → SSH | SSH → Wallet | Notes |
|----------|-------------|-------------|-------|
| Node.js 18+ | Full | Full | Native `crypto` module |
| Node.js 16 | Full | Full | Ed25519 support added in Node 15 |
| Deno | Full | Full | Uses `node:crypto` compat |
| Bun | Full | Full | Node crypto compatible |
| Browser (WebCrypto) | Partial | Partial | HKDF available; Ed25519 import varies by browser |
| Python (hashlib) | Derivation only | Derivation only | HKDF + BIP-32 math portable; key format encoding differs |
| Rust (ring/hkdf) | Full | Full | Native performance; ideal for Tauri backend |
| Go (x/crypto) | Full | Full | Ed25519 and HKDF in standard library |

### Testing Cross-Language Compatibility

The derivation is deterministic. To verify that your implementation matches, use this test vector:

```
Input (wallet private key):
  0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

HKDF parameters:
  Hash:  SHA-256
  Salt:  "pmvpn-crypto-ssh" (17 bytes, UTF-8)
  Info:  "ed25519-derivation:ssh-auth" (27 bytes, UTF-8)
  Length: 32 bytes

Expected HKDF Extract (PRK):
  (compute: HMAC-SHA256(key=salt, data=IKM))

Expected HKDF Expand output (OKM):
  (32 bytes — this becomes the Ed25519 seed)

Verification: any implementation producing the same 32-byte OKM from the same
inputs is compatible. The Ed25519 keypair generated from that seed will be
identical across all implementations.
```

To run the test: derive the Ed25519 public key from the OKM seed and compare the SSH fingerprint (SHA256 of the key blob). If the fingerprint matches, the implementation is compatible.

---

## References

- [csshd](https://github.com/cryptoAGI/csshd) — The world's first wallet-login SSH server (Python/paramiko)
- [cSSHwallet prototypes](https://github.com/cypherpunk2048) — Ten iterations of wallet-authenticated SSH
- [RFC 5869](https://tools.ietf.org/html/rfc5869) — HMAC-based Extract-and-Expand Key Derivation Function
- [RFC 8032](https://tools.ietf.org/html/rfc8032) — Edwards-Curve Digital Signature Algorithm (Ed25519)
- [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) — Hierarchical Deterministic Wallets
- [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) — Multi-Account Hierarchy
- [EIP-191](https://eips.ethereum.org/EIPS/eip-191) — Signed Data Standard (personal_sign)
- [EIP-4337](https://eips.ethereum.org/EIPS/eip-4337) — Account Abstraction (Ed25519 on-chain verification)
- [SEC 2](https://www.secg.org/sec2-v2.pdf) — secp256k1 Curve Parameters
- [SSH Agent Protocol](https://datatracker.ietf.org/doc/html/draft-miller-ssh-agent) — Agent message format
- [viem](https://viem.sh/) — TypeScript Ethereum library (used for secp256k1 operations)

---

*One key. One identity. Two domains.*

*Professor Codephreak — cypherpunk2048*

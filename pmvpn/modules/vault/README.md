# BANKON Vault

**(c) BANKON — All Rights Reserved · GPL-3.0 · cypherpunk2048 standard**

Pure Node.js credential vault. Zero external dependencies. Wallet is identity. Signature proves ownership. Derived key unlocks vault.

**bankon.pythai.net · github.com/cypherpunk2048**

---

## Principle

Your wallet already solves the identity problem. A signature proves you own the wallet without revealing the private key. BANKON Vault takes that signature and derives an encryption key from it — deterministically, reproducibly, without ever storing the key.

The vault key exists only in memory. When you lock the vault or close the application, the key is zeroized. To open the vault again, sign another challenge. Same wallet, same challenge format, same derived key, same vault.

No passwords. No stored keys. No key files. No master secrets. Just a wallet and a signature.

---

## Modes

### 1. SIGNATURE (default)

```
Wallet Signature → HKDF-SHA512 → Vault Key → AES-256-GCM
```

The wallet signs a challenge message. The signature (65 bytes of secp256k1 entropy) feeds into HKDF-SHA512, which derives a 256-bit vault key. Each credential gets its own per-entry key via HKDF domain separation.

**When to use:** Standard operation. Wallet is available, network doesn't matter (signature is local).

### 2. THRESHOLD (2-of-3)

```
Share 1 (wallet)  ─┐
Share 2 (device)   ├── Any 2 → HKDF → Vault Key
Share 3 (recovery) ─┘
```

The vault key is split into three XOR shares. The wallet share is derived from the signature each time. The device share is stored locally (encrypted). The recovery share is written down by the user.

Any two shares reconstruct the vault key. Lose your wallet? Device + recovery. Lose your device? Wallet + recovery. Lose your recovery phrase? Wallet + device.

**When to use:** When you need key recovery without trusting a third party.

### 3. PASSPHRASE (network=0)

```
Passphrase → PBKDF2-HMAC-SHA512 (600,000 iterations) → Vault Key
```

For offline scenarios where the wallet cannot sign (no MetaMask, no network, air-gapped machine). The passphrase is stretched with PBKDF2 using 600,000 iterations (OWASP 2024 recommendation) and a 256-bit salt bound to the wallet address hash.

**When to use:** Air-gapped machines, offline backup access, emergency recovery.

### 4. COMBINED (maximum security)

```
Signature + Passphrase → HKDF(sig || PBKDF2(pass)) → Vault Key
```

Both factors required. The signature provides cryptographic entropy; the passphrase provides knowledge-based entropy. Combined via HKDF. Even if the signature is intercepted, the vault cannot be opened without the passphrase, and vice versa.

**When to use:** High-value credentials. API keys for production infrastructure. Private keys.

---

## Cryptography

| Component | Algorithm | Security Level |
|-----------|-----------|---------------|
| Key derivation | HKDF-SHA512 (RFC 5869) | 256-bit |
| Encryption | AES-256-GCM | 128-bit post-quantum |
| Passphrase stretching | PBKDF2-HMAC-SHA512 | 600,000 iterations |
| Integrity | GCM authentication tag | 128-bit |
| Salt | cryptographically random | 256-bit |
| IV/Nonce | cryptographically random | 96-bit (GCM standard) |
| Threshold | XOR-based 2-of-3 | Information-theoretic |

**Post-quantum readiness:** HKDF-SHA512 provides 256-bit security. AES-256-GCM provides 128-bit security against Grover's algorithm (which halves symmetric key strength). This exceeds the 2048 compatibility target.

**Zero dependencies:** Uses only Node.js built-in `crypto` module. No `tweetnacl`, no `libsodium`, no `noble-*`, no npm packages. The entire vault is self-contained.

---

## API

```typescript
import { BankonVault } from './credential-vault';

const vault = new BankonVault();

// Mode 1: Signature unlock
vault.unlockWithSignature('0xWalletAddress', '0xSignature...');

// Mode 2: Threshold unlock (any 2 shares)
vault.unlockWithShares('0xAddr', shareA, 'wallet', shareB, 'device');

// Mode 3: Passphrase unlock (offline)
vault.unlockWithPassphrase('0xAddr', 'my secure passphrase');

// Mode 4: Combined unlock (maximum security)
vault.unlockCombined('0xAddr', '0xSignature', 'passphrase');

// Store / retrieve / delete
vault.store('api-key', 'sk_live_xxx', 'hostinger');
const key = vault.retrieve('api-key');
vault.delete('api-key');

// List entries (no secrets exposed)
vault.list();  // → [{ id, context, createdAt, accessCount }]

// Metadata
vault.setMetadata('label', 'Production vault');
vault.getMetadata('label');

// Threshold shares (after unlock)
const shares = vault.createThresholdShares();
// → { wallet: '...', device: 'stored', recovery: 'WRITE THIS DOWN' }

// Export / import (encrypted backup)
const blob = vault.export();
vault.import(blob);

// Lock — zeroize all keys from memory
vault.lock();

// Destroy — overwrite files with random data, then delete
vault.destroy();
```

---

## File Layout

```
~/.bankon/vault/
  ├── .salt              # 256-bit salt (hex, 600 perms)
  ├── manifest.enc       # Encrypted vault manifest (AES-256-GCM)
  └── device.share       # Encrypted device share for threshold mode
```

- `.salt` is created once and never changes (deterministic key derivation)
- `manifest.enc` contains all encrypted entries and metadata
- `device.share` is only created when threshold mode is activated
- All files are `chmod 600` (owner read/write only)
- The wallet address is never stored — only its SHA-256 hash for ownership verification

---

## pmVPN Module Commands

When loaded as a pmVPN module, the vault registers these commands:

| Command | Aliases | Description |
|---------|---------|-------------|
| `vault-status` | `vs` | Show vault status and crypto info |
| `vault-unlock` | `vu` | Unlock with wallet signature |
| `vault-store` | `vstore`, `vput` | Store a credential |
| `vault-get` | `vget` | Retrieve a credential |
| `vault-list` | `vls`, `vlist` | List credential IDs |
| `vault-delete` | `vdel`, `vrm` | Delete a credential |
| `vault-lock` | `vlock` | Lock vault, zeroize keys |
| `vault-export` | `vexport` | Export encrypted backup |
| `vault-threshold` | `v23` | Create 2-of-3 recovery shares |

---

## Security Model

1. **Identity:** wallet address (secp256k1 public key)
2. **Authentication:** EIP-191 signature of a challenge message
3. **Key derivation:** signature → HKDF-SHA512 → vault key (deterministic)
4. **Encryption:** AES-256-GCM with per-entry key separation via HKDF
5. **At rest:** manifest encrypted, files chmod 600, vault dir chmod 700
6. **In memory:** vault key exists only while unlocked; zeroized on lock
7. **Recovery:** 2-of-3 threshold shares (wallet + device + recovery)
8. **Destruction:** random overwrite before deletion

### What is NOT stored

- The wallet private key (never touches the vault)
- The wallet address (only SHA-256 hash for ownership check)
- The vault key (derived from signature, memory only)
- The signature (used once for derivation, then discarded)
- Any plaintext credentials (all entries AES-256-GCM encrypted)

### What IS stored

- A 256-bit random salt (for deterministic HKDF derivation)
- The encrypted manifest (ciphertext + IV + GCM tag)
- Optional: encrypted device share (for threshold recovery)

---

## Integration

BANKON Vault is designed as a portable module. Include it in any project:

```typescript
// pmVPN
import { BankonVault } from './modules/vault/credential-vault';

// Standalone
import { BankonVault } from '@bankon/vault';

// Direct file inclusion (no package manager needed)
// Copy credential-vault.ts into your project
```

The vault has zero npm dependencies. It uses only Node.js `crypto`, `fs`, `path`, and `os` — all built-in modules available in every Node.js installation since v12.

---

## Comparison

| Feature | BANKON Vault | LIT Protocol | HashiCorp Vault | 1Password |
|---------|-------------|-------------|-----------------|-----------|
| Dependencies | 0 (Node.js crypto) | SDK + network | Server + agent | App + cloud |
| Key storage | Memory only | Network MPC | Server-side | Cloud sync |
| Auth method | Wallet signature | Wallet + conditions | Tokens / OIDC | Master password |
| Threshold | 2-of-3 XOR | MPC network | Shamir (enterprise) | N/A |
| Offline mode | Yes (passphrase) | No (requires network) | No (requires server) | Limited |
| Post-quantum | AES-256 + SHA-512 | Depends on network | Configurable | AES-256 |
| Self-hosted | Yes (single file) | Nodes required | Server required | No |
| License | GPL-3.0 | Apache-2.0 | BSL / Enterprise | Proprietary |

---

*Wallet is identity. Signature proves ownership. No passwords. No stored keys. No trust required.*

*(c) BANKON — All Rights Reserved · GPL-3.0 · cypherpunk2048 standard*

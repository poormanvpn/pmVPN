# BANKON Vault — Architecture & Post-Quantum Analysis

**(c) BANKON — All Rights Reserved · GPL-3.0 · cypherpunk2048 standard**

---

## Why Rust Over C++

### Memory Safety Without GC

A credential vault is a **high-value target** — it holds private keys, API tokens, and secrets that control infrastructure. The language that implements it must prevent:

1. **Use-after-free** — accessing key material after zeroization
2. **Buffer overflow** — writing past key buffers into adjacent memory
3. **Double-free** — corrupting the heap where keys are allocated
4. **Data races** — concurrent access to key material during lock/unlock

C++ cannot prevent any of these at compile time. Rust prevents all four through ownership, borrowing, and lifetimes — enforced by the compiler, not the developer's discipline.

**The cost of a memory safety bug in a vault is total key compromise.** Not a crash. Not a DoS. Complete extraction of every secret. Rust eliminates this class of vulnerability at zero runtime cost.

### Zeroization Guarantees

```rust
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Zeroize, ZeroizeOnDrop)]
struct VaultKey {
    bytes: [u8; 32],
}
// When VaultKey drops out of scope, bytes are overwritten with zeros.
// The compiler GUARANTEES this happens — even on panic, even on early return.
// C++ destructors can be bypassed by exceptions, longjmp, or signal handlers.
```

In C++, `memset(key, 0, 32)` can be **optimized away** by the compiler (the key is "dead" after zeroing, so the compiler removes the store). The `SecureZeroMemory` / `explicit_bzero` workarounds are platform-specific. Rust's `zeroize` crate uses `write_volatile` + compiler barriers — portable and guaranteed.

### No Undefined Behavior

C++ has 200+ categories of undefined behavior. A single UB in crypto code means the compiler can do anything — including removing security checks, reordering key operations, or eliminating zeroization. Rust has zero undefined behavior in safe code. Unsafe blocks are explicitly marked and reviewable.

### Auditable Dependency Chain

Rust's `cargo audit` checks every dependency against the RustSec advisory database. The RustCrypto ecosystem (k256, aes-gcm, argon2, sha3) is:
- Formally specified against NIST/RFC standards
- Audited by Trail of Bits, NCC Group, and Cure53
- Constant-time by construction (using the `subtle` crate)
- No C dependencies (pure Rust, no OpenSSL, no libsodium)

C++ crypto libraries (OpenSSL, Botan, libsodium) are high-quality but carry decades of accumulated complexity and C-era footguns.

---

## Dual Implementation Strategy

BANKON Vault has two implementations:

| Layer | Language | Purpose | Dependencies |
|-------|----------|---------|-------------|
| **Node.js vault** | TypeScript | Server-side, pmVPN modules, CLI | 0 (Node.js `crypto`) |
| **Tauri vault** | Rust | Desktop client, key signing, hardware | RustCrypto crates |

### Why both?

The **Node.js vault** runs on the server and in any Node.js project. Zero dependencies means it works everywhere — Docker containers, VPS, edge functions, CI pipelines. It uses OpenSSL via Node.js `crypto` (battle-tested, hardware-accelerated).

The **Rust vault** runs in the Tauri desktop client where it has direct access to:
- Memory protection (mlock, guard pages)
- Hardware security modules (YubiKey via PKCS#11)
- Process isolation (Tauri's IPC sandbox)
- Secure random from OS entropy pool (getrandom)

The two implementations share the same HKDF-SHA512 + AES-256-GCM protocol. A vault created by one can be read by the other — the file format is portable.

---

## Post-Quantum Resistance Analysis

### Threat Model

Grover's algorithm (quantum search) halves the effective key length of symmetric ciphers:
- AES-128 → 64-bit security (broken)
- AES-256 → 128-bit security (safe)

Shor's algorithm breaks all RSA, DSA, ECDSA, and ECDH:
- secp256k1 signatures → broken (wallet authentication)
- Ed25519 signatures → broken (SSH host keys)
- RSA-4096 → broken (if used)
- ECDH key exchange → broken (SSH tunnel setup)

### What BANKON Vault Survives

| Component | Quantum Impact | BANKON Status |
|-----------|---------------|---------------|
| AES-256-GCM (vault encryption) | 128-bit effective | SAFE through 2048+ |
| HKDF-SHA512 (key derivation) | 256-bit preimage | SAFE through 2048+ |
| PBKDF2-SHA512 (passphrase) | 256-bit effective | SAFE through 2048+ |
| HMAC-SHA512 (integrity) | 256-bit effective | SAFE through 2048+ |
| XOR threshold (2-of-3) | Information-theoretic | SAFE (unconditional) |

### What Does NOT Survive (External Dependencies)

| Component | Quantum Impact | Mitigation |
|-----------|---------------|------------|
| secp256k1 wallet signatures | Shor's breaks ECDSA | Migrate to CRYSTALS-Dilithium |
| Ed25519 SSH host keys | Shor's breaks EdDSA | Migrate to SPHINCS+ |
| ECDH key exchange | Shor's breaks DH | Migrate to CRYSTALS-Kyber |

### Migration Path

The vault itself is quantum-safe. The wallet signatures that **unlock** the vault are not. When quantum computers threaten ECDSA (estimated 2035-2045 by NIST), the unlock mechanism transitions:

**Current (pre-quantum):**
```
secp256k1 signature → HKDF-SHA512 → vault key
```

**Post-quantum (when available):**
```
CRYSTALS-Dilithium signature → HKDF-SHA512 → vault key
```

The vault format doesn't change. Only the signature scheme feeding into HKDF changes. HKDF accepts any input key material — the derivation is algorithm-agnostic.

### NIST Post-Quantum Standards (Finalized 2024)

| Algorithm | Type | NIST Standard | Rust Crate |
|-----------|------|--------------|------------|
| ML-KEM (Kyber) | Key encapsulation | FIPS 203 | `ml-kem` |
| ML-DSA (Dilithium) | Digital signature | FIPS 204 | `ml-dsa` |
| SLH-DSA (SPHINCS+) | Hash-based signature | FIPS 205 | `slh-dsa` |

These are available in the `pqcrypto` Rust crate family. When MetaMask or equivalent wallets adopt post-quantum signatures, BANKON Vault's unlock path transitions seamlessly — the HKDF derivation is the bridge.

### Why Not Add PQ Signatures Now?

1. **No wallet supports them.** MetaMask uses secp256k1. Hardware wallets use secp256k1/Ed25519. Until wallets sign with Dilithium, there's nothing to derive from.
2. **The standards are fresh.** FIPS 203-205 were finalized in 2024. Implementation maturity takes 3-5 years. Deploying immature PQ code in a vault is higher risk than waiting.
3. **The symmetric layer is already safe.** AES-256-GCM + HKDF-SHA512 survives quantum. The only vulnerable component (wallet signatures) is external to the vault.

### 4096-bit Keys

The vault supports arbitrary HKDF output lengths. Currently we derive 256-bit (32-byte) AES keys. If future analysis recommends larger symmetric keys:

```typescript
// Current
deriveKey(ikm, salt, info, 32);  // 256-bit

// Future (if needed — Grover's advances beyond expected)
deriveKey(ikm, salt, info, 64);  // 512-bit → use AES-256 with double-key whitening
```

HKDF-SHA512 can produce up to 255 × 64 = 16,320 bytes of key material from a single extraction. There is no practical limit.

---

## Rust Crate Selection

### Chosen: RustCrypto Ecosystem

| Crate | Version | Algorithm | Why |
|-------|---------|-----------|-----|
| `aes-gcm` | 0.10 | AES-256-GCM | Pure Rust, constant-time, no C dependencies |
| `argon2` | 0.5 | Argon2id | RFC 9106, memory-hard, side-channel resistant |
| `k256` | 0.13 | secp256k1 | EVM signing, constant-time field arithmetic |
| `sha2` | 0.10 | SHA-512 | HKDF hash, HMAC |
| `sha3` | 0.10 | Keccak256 | Ethereum address derivation |
| `hkdf` | 0.12 | HKDF | RFC 5869, generic over hash |
| `zeroize` | 1.7 | Memory cleanup | Derive macro, guaranteed zeroization |
| `rand` | 0.8 | CSPRNG | OS entropy via getrandom |

### Rejected

| Crate | Why Not |
|-------|---------|
| `ring` | C/ASM core, not pure Rust, harder to audit |
| `openssl` | C dependency, massive attack surface |
| `sodiumoxide` | Wraps libsodium (C), unmaintained |
| `rust-crypto` | Unmaintained since 2016 |
| `orion` | Good but smaller community, less audit coverage |

### Why Pure Rust Matters

Every C dependency is a potential for:
- Buffer overflows in C code called via FFI
- Undefined behavior in C that Rust cannot detect
- Platform-specific build failures (cross-compilation)
- Supply chain attacks on C build systems (autotools, cmake)

RustCrypto crates compile on every target Rust supports — including WebAssembly, which enables running the vault in-browser without native code.

---

## File Format

```
~/.bankon/vault/
├── .salt           32 bytes hex, chmod 600
├── manifest.enc    JSON { ciphertext, iv, tag }, chmod 600
└── device.share    JSON { ciphertext, iv, tag }, chmod 600 (optional)
```

The manifest contains all entries. Each entry has its own IV and GCM tag. The manifest itself is encrypted with a key derived from the vault key via HKDF with info string `bankon-manifest-key-v1`. This provides domain separation — the manifest key is different from any entry key.

The format is portable between Node.js and Rust implementations. Both produce identical HKDF outputs from the same inputs (verified by RFC 5869 test vectors).

---

*Wallet is identity. Signature proves ownership. Rust proves safety. Math proves security.*

*(c) BANKON — All Rights Reserved · GPL-3.0 · cypherpunk2048 standard*

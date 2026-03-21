# pmVPN Development Plan

*Roadmap and implementation status*

Updated: 2026-03-20 | Status: Alpha

---

## Mission

Provide the simplest, most secure way to remotely access Linux machines using only a cryptocurrency wallet for identity. Eight ports. One wallet. No passwords. No key files.

---

## Phase Status

### Phase 1: Server Core ✅

- [x] Node.js/TypeScript project structure
- [x] Port allocation system (8 ports, configurable base)
- [x] Ed25519 host key generation via ssh-keygen
- [x] pino structured logging
- [x] viem `verifyMessage()` signature verification
- [x] Nonce challenge store (60s TTL, single-use, 1000 cap)
- [x] Wallet-to-user mapping (env var + JSON file)
- [x] ssh2 server with hardened algorithms (Ed25519, curve25519, chacha20-poly1305)
- [x] node-pty PTY shell spawner
- [x] SSH connection handler with wallet auth dispatch
- [x] HTTP challenge endpoint (Node built-in, no Express)
- [x] All 8 ports listening and verified

### Phase 2: VPN Tunnel ✅

- [x] PM binary protocol (8-byte framed, 65535 channels)
- [x] Frame parser with resync capability
- [x] Channel multiplexer with flow control (32KB threshold)
- [x] TCP proxy handler (connect, data, EOF, backpressure)
- [x] UDP relay handler (30s inactivity timeout)
- [x] DNS forwarder handler (10s timeout)
- [x] Tunnel server (runs inside SSH session)
- [x] Tunnel client (local TCP listener, explicit connect API)
- [x] iptables NAT firewall module
- [x] Integrated into SSH handler as 'tunnel' port role

### Phase 3: Parsec Client Module ✅

- [x] TypeScript module types (PmvpnHost, PmvpnSession, etc.)
- [x] State store following Parsec pattern
- [x] Challenge-response auth via bankon_vault
- [x] Connection orchestrator (challenge → sign → SSH → terminal)
- [x] xterm.js terminal manager with Tauri event piping
- [x] pmVPN view (host sidebar + terminal + status bar)
- [x] SCSS dark theme matching Parsec aesthetic
- [x] Rust SSH session manager (PmvpnState)
- [x] EVM signing in Rust (k256 secp256k1 + keccak256)
- [x] 5 Tauri IPC commands registered
- [x] View registered in main.ts
- [x] Lock integration (disconnect all on Parsec lock)
- [x] TypeScript compiles clean, Rust compiles clean, Vite builds clean

### Phase 4: Bootstrap & Persistence 🔄

- [x] Bootstrap documentation (user/admin/zero-SSH methods)
- [ ] Automated server upload via SFTP channel
- [ ] Automated install script execution via SSH exec
- [ ] Ed25519 key exchange for persistent `authorized_keys`
- [ ] Self-protection in `authorized_keys` (pmvpn: markers)
- [ ] Host key TOFU (trust on first use) verification
- [ ] Connection profile export/import

### Phase 5: SFTP & File Manager

- [ ] ssh2 SFTP subsystem on port +1
- [ ] Rust russh-sftp operations
- [ ] Tauri SFTP commands (ls, get, put, mkdir, rm)
- [ ] File manager panel in pmVPN view
- [ ] Drag-and-drop upload/download
- [ ] Progress indicators

### Phase 6: Claude Proxy

- [ ] Claude CLI proxy on port +6
- [ ] Dedicated Claude terminal tab per host
- [ ] Multi-host Claude session management
- [ ] Claude output streaming via tunnel

### Phase 7: Multi-Host Management

- [ ] Connect to N machines simultaneously
- [ ] Tab-based terminal switching
- [ ] 8-port status indicators per host
- [ ] Batch command execution across hosts
- [ ] Host group management

### Phase 8: Hardening & Mobile

- [ ] Security audit (input validation, path traversal, replay)
- [ ] TLS on HTTP ports (self-signed or Let's Encrypt)
- [ ] Chroot/jail for user sessions
- [ ] Rate limiting on challenge endpoint
- [ ] Per-wallet connection limits
- [ ] WalletConnect v2 for mobile wallet signing
- [ ] Tauri mobile targets (Android/iOS)
- [ ] Responsive mobile layout
- [ ] Docker production image

---

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview and quick start |
| [PROTOCOL.md](PROTOCOL.md) | PM tunnel protocol specification |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Server deployment guide |
| [BOOTSTRAP.md](BOOTSTRAP.md) | Self-installation and key exchange |
| [CLIENT.md](CLIENT.md) | Parsec client module documentation |
| [DEVELOPMENT.md](DEVELOPMENT.md) | This file — roadmap and status |

---

## Dependencies Inventory

### Server (4 production deps)

| Package | License | Native? | Purpose |
|---------|---------|---------|---------|
| ssh2 | MIT | Optional C++ | SSH2 protocol |
| node-pty | MIT | Yes (N-API) | PTY spawning |
| viem | MIT | No | Signature verification |
| pino | MIT | No | Logging |

### Client — Rust (3 new deps)

| Crate | License | Purpose |
|-------|---------|---------|
| k256 | Apache-2.0/MIT | secp256k1 ECDSA signing |
| sha3 | Apache-2.0/MIT | Keccak256 hashing |
| hex | Apache-2.0/MIT | Hex encoding |

### Client — TypeScript (2 new deps)

| Package | License | Purpose |
|---------|---------|---------|
| @xterm/xterm | MIT | Terminal emulator |
| @xterm/addon-fit | MIT | Terminal auto-sizing |

---

## Reference Corpus

- [sshuttle](https://github.com/sshuttle/sshuttle) — TCP/UDP/DNS tunneling over SSH
- [cSSHwallet prototypes](../../../cSSHwallet/) — 10 wallet-auth SSH experiments
- [bankon-greeter](../../../bankonme/overlay/bankon-greeter/) — viem verification pattern
- [bankon_vault](../../../parsec/parsec-wallet/src-tauri/src/bankon_vault/) — Argon2id + AES-256-GCM
- [Parsec Wallet](../../../parsec/parsec-wallet/) — Vanilla TS + Tauri 2 architecture
- [OpenSSH](https://www.openssh.com/) — SSH hardening philosophy
- [cypherpunk2048](https://github.com/cypherpunk2048) — Cryptographic Civilization Protocol

---

*Professor Codephreak — cypherpunk2048*

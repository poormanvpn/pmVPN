# pmVPN Development Plan

*Roadmap and implementation status*

Updated: 2026-03-28 | Status: Alpha | 9.8 of 10 phases complete | 46 commits

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

### Phase 4: Standalone Client + WebSocket Bridge ✅

- [x] Standalone client UI (Vite, vanilla TypeScript, no frameworks)
- [x] MetaMask login with mandatory signature (proof of personhood)
- [x] wallet_revokePermissions on logout (MetaMask standard practice)
- [x] Lock state detection via _metamask.isUnlocked()
- [x] Connection list with +/− management, localStorage persistence
- [x] WebSocket bridge on port +4 (replaces tunnel stub)
- [x] WS auth: wallet signature verified server-side via viem
- [x] Live terminal: xterm.js → WebSocket → node-pty PTY shell
- [x] SFTP file browser: ls, get, put, mkdir, rm, stat over WebSocket
- [x] Path sandboxing (no traversal outside user home)
- [x] Tabbed interface: Terminal | Files
- [x] File download (browser save), upload (file picker), new folder, delete
- [x] Breadcrumb directory navigation
- [x] Diagnostics panel: real server/challenge/signature/payload tests
- [x] Tokyo Night theme with gnugui semantic tokens
- [x] Green-on-black terminal with CRT scanline overlay
- [x] Transparent favicon and logo from poormanvpn.png
- [x] Auto-reconnect to known servers (saved connections)

### Phase 5: Bootstrap & Persistence ✅

- [x] Bootstrap documentation (user/admin/zero-SSH methods)
- [x] Automated server bootstrap via SFTP (uploads wallets.json, install.sh, start.sh)
- [x] Install script: checks Node.js, installs nvm/pnpm if needed, clones pmVPN, installs deps
- [x] Start script: launches server on configurable unprivileged port
- [x] Ed25519 key deploy script for persistent `authorized_keys`
- [x] Self-protection in `authorized_keys` (pmvpn:wallet:timestamp markers)
- [x] Host key TOFU verification (localStorage, first-seen/last-seen tracking)
- [x] Host key mismatch detection (possible MITM warning)
- [x] Connection profile export (JSON: connections + host keys)
- [x] Connection profile import (merge without duplicates)
- [x] Tools panel in sidebar: Bootstrap, Deploy Key, Export, Import

### Phase 6: P2P File Sharing ✅

- [x] Share manager: create shares, add files, set expiry/download limits
- [x] Access control: restrict shares to specific wallet addresses
- [x] Share invite: wallet-signed connection details for receiver
- [x] Receiver browses and downloads shared files via browser
- [x] Both sides authenticated by signature (proof of personhood)
- [x] Share tab in client UI (Terminal | Files | Share)
- [x] Create share, add files, copy invite, view files, delete share
- [x] Receive share: paste invite JSON, browse and download
- [x] Server-side share storage with auto-expiry and download limits
- [x] WebSocket share protocol (create/add-file/list/files/download/invite/remove)

### Phase 7: blocktalk (Wallet-to-Wallet Messaging) ✅

- [x] Separate dApp module at `/blocktalk/`
- [x] Message format: from, to, timestamp, content, type, nonce, signature
- [x] Canonical message signing (blocktalk message string)
- [x] Signature verification via viem.verifyMessage()
- [x] Message store (localStorage, 500 message limit)
- [x] Contact list with add/remove
- [x] Conversation view with sent/received bubbles
- [x] MetaMask login with mandatory signature (proof of personhood)
- [x] Share invite message type for pmVPN integration
- [x] Transport agnostic: clipboard, paste, any channel
- [x] Message replay protection (unique nonce per message)
- [x] Expiry detection (24-hour default)

### Phase 8: Multi-Host Management ✅

- [x] Connect to N machines simultaneously (each gets own WebSocket session)
- [x] Per-host terminal, file browser, and share panel (independent DOM containers)
- [x] Click connection in sidebar to switch between hosts
- [x] Tab switching (Terminal/Files/Share) shows the active host's session
- [x] Disconnect one host without affecting others (session cleanup, DOM removal)
- [x] Status bar shows active host + total session count
- [x] Logout destroys ALL sessions simultaneously
- [ ] Batch command execution across hosts (future)
- [ ] Host group management (future)

### Phase 9: Tauri Desktop + Android ✅

- [x] Tauri 2 wraps existing client as native desktop app
- [x] Desktop build: 13MB binary, 4.3MB .deb, 4.3MB .rpm
- [x] Tauri config: 1200x800 window, CSP for ws/wss/http/https
- [x] pmVPN logo icons at all required sizes (transparent PNG)
- [x] Android scripts: android:init, android:dev, android:build
- [x] ANDROID.md: 6-step fresh-machine build environment setup
- [x] ANDROID.md: browser fallback for phones too old for APK
- [x] ANDROID.md: GitHub Releases APK download instructions
- [x] ANDROID.md: step-by-step install for first-time Android users
- [x] Per-connection kill button (⏻) for individual session teardown
- [x] App exit button (✕) — kills all, disconnects wallet, clean shutdown
- [x] beforeunload handler — clean disconnect on browser close

### Phase 9.5: Claude Remote Control ✅

- [x] `remote-control.sh` launcher script (server, interactive, attach modes)
- [x] Worktree isolation for concurrent sessions (default spawn mode)
- [x] Configurable capacity, session name, spawn mode via env vars
- [x] Comprehensive documentation: REMOTE-CONTROL.md
- [x] systemd companion service unit for production
- [x] Integration guide with pmVPN server (dual tmux, systemd)
- [x] Mobile workflow documentation (Claude iOS/Android app)
- [x] Security model documentation (what flows through API, what stays local)

### Phase 9.6: Crypto-SSH Module ✅

- [x] Wallet → SSH: HKDF derivation (secp256k1 → Ed25519 keypair)
- [x] Wallet → SSH: secp256k1 native SSH key type (ecdsa-sha2-secp256k1)
- [x] Wallet → SSH: SSH agent bridge (wallet as agent backend)
- [x] SSH → Wallet: HKDF derivation (Ed25519 → secp256k1 wallet)
- [x] SSH → Wallet: HD wallet seed (BIP-32/BIP-44 multi-chain derivation)
- [x] SSH → Wallet: SSH key as EVM transaction signer
- [x] SSH → Wallet: Server host key as service wallet
- [x] SSH → Wallet: YubiKey/hardware token signature-based derivation
- [x] SSH → Wallet: Multi-chain derivation (Ethereum, Bitcoin, Algorand, Solana)
- [x] OpenSSH private key parser (openssh-key-v1 format)
- [x] Full BIP-32 hardened child key derivation
- [x] Comprehensive CRYPTO-SSH.md documentation
- [x] Heritage documentation: csshd, cSSHwallet lineage

### Phase 9.7: blocktalk v2 Design ✅

- [x] Room architecture: private room, boardroom, dojo (multi-chat)
- [x] Three transport modes: self-hosted node, XMTP network, direct (v1 compat)
- [x] Self-hosted node: lightweight WebSocket event server on port +8
- [x] XMTP integration: MLS encryption, agent SDK, remote attachments, content types
- [x] Permission controls: owner/admin/member/viewer/agent roles
- [x] Throttle settings: rate limiting, bandwidth caps, burst control, agent guards
- [x] Sandboxed shared folders with per-room quotas and path traversal prevention
- [x] AI agent participation: XMTP Agent SDK, local agents, Claude via Remote Control
- [x] Dojo multi-chat: human-AI and AI-AI with loop guards and cooldowns
- [x] Encryption: X25519 + ChaCha20-Poly1305 (self-hosted), MLS RFC 9420 (XMTP)
- [x] Message type extensions: room-invite, reaction, reply, agent-action, agent-result
- [x] XMTP content type mapping for cross-app interoperability
- [x] Comprehensive BLOCKTALK.md documentation
- [x] Cypherpunk2048 compliance analysis

### Phase 9.8: Citadel — On-Chain Permanent Rooms ✅

- [x] Citadel room type: blockchain-registered, token-gated, permanent
- [x] On-chain registry design: Algorand (ARC-4 box storage) + EVM (Solidity mapping)
- [x] ChainRegistry abstraction layer (AlgorandRegistry, EVMRegistry)
- [x] Token-gating model: 5 gate types (allowlist, NFT collection, NFT specific, SFT, fungible)
- [x] Cross-chain gates: room on one chain, gate asset on another
- [x] Fee/payment model: creation fee in native asset, configurable recipient
- [x] Room discovery: on-chain event queries + gossip announcements
- [x] Room resurrection protocol: chain → metadata → rebuild → update transportHint
- [x] Message preservation strategies: XMTP, IPFS backup, dual-write, SFTP mirror
- [x] Distributed social networking: token-as-membership, federation via chain, identity portability
- [x] Smart contract interfaces: Algorand PuyaTs + Solidity
- [x] Security analysis: 10 threat vectors with mitigations
- [x] Cypherpunk2048 compliance verification
- [x] Platform economics: fee-splitting (20% protocol / 80% operator), FeeSplit events
- [x] blocktalk project wallet: published multisig, auditable, transparent
- [x] Resurrection fee model: standard free, priority tip opt-in
- [x] Operator revenue model: 80% of creation fees, premium service fees
- [x] Self-sovereignty escape hatch: fork contract, set 0% protocol fee
- [x] Updated smart contract interfaces with fee-splitting (Algorand + EVM)
- [x] Comprehensive CITADEL.md documentation

### Phase 10: Hardening (Future)

- [ ] Security audit (input validation, path traversal, replay)
- [ ] TLS on HTTP/WS ports (self-signed or Let's Encrypt)
- [ ] Rate limiting on challenge endpoint
- [ ] Per-wallet connection limits
- [ ] WalletConnect v2 for mobile wallet signing
- [ ] Podman container image

---

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview and quick start |
| [USAGE.md](USAGE.md) | Step-by-step connection guide |
| [PROTOCOL.md](PROTOCOL.md) | PM tunnel protocol specification |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Server deployment guide |
| [BOOTSTRAP.md](BOOTSTRAP.md) | Self-installation and key exchange |
| [CLIENT.md](CLIENT.md) | Parsec client module documentation |
| [ANDROID.md](ANDROID.md) | Android build, install, and connection guide |
| [metamaskbestpractice.md](metamaskbestpractice.md) | MetaMask auth standard practice |
| [REMOTE-CONTROL.md](REMOTE-CONTROL.md) | Claude Remote Control — handheld AI server administration |
| [CRYPTO-SSH.md](CRYPTO-SSH.md) | Bidirectional key derivation between SSH and crypto wallets |
| [BLOCKTALK.md](BLOCKTALK.md) | blocktalk v2 — wallet-gated rooms, XMTP integration, dojo multi-chat |
| [CITADEL.md](CITADEL.md) | Citadel — blockchain-permanent, token-gated rooms, distributed social networking |
| [DEVELOPMENT.md](DEVELOPMENT.md) | This file — roadmap and status |

---

## Dependencies Inventory

### Server (5 production deps)

| Package | License | Native? | Purpose |
|---------|---------|---------|---------|
| ssh2 | MIT | Optional C++ | SSH2 protocol |
| node-pty | MIT | Yes (N-API) | PTY spawning |
| viem | MIT | No | Signature verification |
| ws | MIT | No | WebSocket bridge (browser connectivity) |
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

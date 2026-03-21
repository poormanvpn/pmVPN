<h1 align="center">poormanvpn</h1>
<p align="center"><em>Wallet-authenticated remote access for the sovereign internet</em></p>

<p align="center">
  <img src="poormansvpn.jpg" alt="Poor Man's VPN" width="320" />
</p>

---

> *The poor man doesn't need a VPN provider. He needs SSH, a wallet, and a machine that listens.*

---

## The Project

poormanvpn is infrastructure for people who run their own machines. It provides encrypted remote access — terminal, file transfer, VPN tunneling — authenticated by cryptocurrency wallet signature instead of passwords or SSH keys.

No accounts to create. No services to subscribe to. No third party between you and your machine. Your wallet is your identity. Your signature is your proof.

The project encompasses:

| Component | Description | License |
|-----------|-------------|---------|
| **[pmVPN](pmvpn/)** | Wallet-authenticated SSH server + Parsec client module | MIT server · GPL client |
| **[sshuttle fork](https://github.com/poormanvpn/sshuttle)** | Reference: the original "poor man's VPN" by Avery Pennarun | LGPL |
| **[REP/BONA FIDE](rep_bonafide_module/)** | On-chain reputation and governance module | — |

---

## Why

Traditional remote access requires managing SSH keys, remembering passwords, configuring authorized_keys files, rotating credentials. VPN services require subscriptions, trust in providers, and client software that phones home.

A cryptocurrency wallet already contains everything needed for secure authentication:
- A **private key** you control
- A **public address** that identifies you
- A **signature** that proves possession without revealing the key

pmVPN uses this. Connect your wallet. Sign a challenge. You're in.

---

## Architecture

```
  You (anywhere)                              Your Machine (anywhere)
  ┌──────────────────┐                        ┌──────────────────────┐
  │  PARSEC Wallet    │    Wallet Signature    │  pmVPN Server        │
  │  + pmVPN module   │ ═══════════════════► │                      │
  │                   │                        │  8 ports:            │
  │  ● Terminal       │    SSH (encrypted)     │  ├─ Shell            │
  │  ● File Manager   │ ◄══════════════════► │  ├─ SFTP             │
  │  ● VPN Tunnel     │                        │  ├─ Exec             │
  │                   │    PM Protocol         │  ├─ VPN Tunnel       │
  │  Desktop / Mobile │ ◄══════════════════► │  ├─ File Sync        │
  │  (Tauri)          │    TCP/UDP/DNS mux     │  ├─ Claude AI        │
  └──────────────────┘                        │  └─ Admin            │
                                               │                      │
                                               │  Ed25519 · chacha20  │
                                               │  No RSA · No NIST    │
                                               └──────────────────────┘
```

---

## Components

### pmVPN Server

Node.js/TypeScript SSH server. Four dependencies. Hardened cryptography. Runs on any Linux machine or VPS.

- **Wallet authentication** via [viem](https://viem.sh/) signature verification
- **8 dedicated ports** per host (shell, SFTP, exec, API, tunnel, sync, Claude, admin)
- **VPN tunneling** via the PM binary protocol (TCP/UDP/DNS multiplexing over SSH)
- **PTY shells** via [node-pty](https://github.com/microsoft/node-pty) — real terminal emulation
- **SSH hardening** — Ed25519 only, curve25519-sha256, chacha20-poly1305

### pmVPN Client (PARSEC Module)

Vanilla TypeScript + Rust (Tauri 2). Integrates into [PARSEC Wallet](https://github.com/cypherpunk2048/parsec-wallet).

- **Terminal** via [xterm.js](https://xtermjs.org/) — full terminal emulation in the wallet
- **Wallet signing** in Rust memory via [bankon_vault](https://github.com/cypherpunk2048/parsec-wallet) (Argon2id + AES-256-GCM)
- **Multi-host** — connect to multiple machines simultaneously
- **Mobile-ready** — Tauri targets Android and iOS

### REP/BONA FIDE

Optional reputation and governance layer. Dignitas scoring, BONA token, Senate governance, dispute resolution. Future integration for trust networks between pmVPN nodes.

---

## Quick Start

```bash
# Server
cd pmvpn/server
pnpm install
WALLET_USER_MAP="0xYourAddr:username" pnpm run dev

# Verify
curl http://localhost:2203/status
```

See [pmVPN documentation](pmvpn/docs/) for deployment, bootstrapping, and protocol details.

---

## Documentation

| Document | Path |
|----------|------|
| **pmVPN README** | [pmvpn/README.md](pmvpn/README.md) |
| **PM Protocol Spec** | [pmvpn/docs/PROTOCOL.md](pmvpn/docs/PROTOCOL.md) |
| **Deployment Guide** | [pmvpn/docs/DEPLOYMENT.md](pmvpn/docs/DEPLOYMENT.md) |
| **Bootstrap Guide** | [pmvpn/docs/BOOTSTRAP.md](pmvpn/docs/BOOTSTRAP.md) |
| **Client Module** | [pmvpn/docs/CLIENT.md](pmvpn/docs/CLIENT.md) |
| **Development Plan** | [pmvpn/docs/DEVELOPMENT.md](pmvpn/docs/DEVELOPMENT.md) |

---

## Heritage

The poor man's VPN is not a new idea. It is an old one, refined.

**[OpenSSH](https://www.openssh.com/)** built the tunnel. Every encrypted connection in pmVPN flows through algorithms the OpenBSD team chose, audited, and defended. Ed25519 because Daniel J. Bernstein's curves are trustworthy. chacha20-poly1305 because constant-time matters. *The foundation.*

**[sshuttle](https://github.com/sshuttle/sshuttle)** by Avery Pennarun named the concept. A transparent proxy over SSH. No root on the server. No kernel modules. Just Python, iptables, and a clever binary protocol. The PM Protocol in pmVPN is a direct descendant — reimplemented in TypeScript, same spirit. *The inspiration.*

**[Paramiko](https://www.paramiko.org/)** powered the ten cSSHwallet prototypes that preceded pmVPN. Jeff Forcier's Python SSH library made it possible to experiment with wallet signatures as SSH credentials. Those experiments proved the idea works. *The laboratory.*

**[Brian White](https://github.com/mscdex)** wrote ssh2 — the pure JavaScript SSH2 implementation that pmVPN's server is built on. Thousands of lines of protocol handling so we didn't have to write them. *The engine.*

**[viem](https://viem.sh/)** by the wevm team made Ethereum signature verification a one-line operation. Pure local secp256k1 recovery. No RPC calls. *The verifier.*

**[Tauri](https://tauri.app/)** proved that native apps don't need Electron. Rust backend, system webview, 10MB instead of 300MB. The architecture for shipping pmVPN to phones. *The vehicle.*

**[PARSEC Wallet](https://github.com/cypherpunk2048/parsec-wallet)** and **[bankonOS](https://github.com/cypherpunk2048)** are the ecosystem pmVPN was built for. Sovereign Algorand wallet. Self-sovereign banking OS. Crypto-ssh authentication. bankon_vault encrypted key storage. The pattern that wallet signatures can replace passwords was proven here first. *The home.*

**[RustCrypto](https://github.com/RustCrypto)** — k256 for secp256k1, sha3 for keccak256. Private key operations in Rust memory. Never in JavaScript. *The shield.*

---

## License

- **Server**: MIT — deploy anywhere, no restrictions
- **Client**: GPL-3.0 — user freedom protected
- **Shared types**: MIT

---

<p align="center">
  <strong>Code is law. Keys are identity. Verification replaces trust.</strong>
</p>
<p align="center">
  <a href="https://github.com/cypherpunk2048">cypherpunk2048</a> · Professor Codephreak
</p>
<p align="center">
  <a href="https://github.com/poormanvpn">github.com/poormanvpn</a>
</p>

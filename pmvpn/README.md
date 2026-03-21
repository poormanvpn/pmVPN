<h1 align="center">pmVPN</h1>
<p align="center"><em>Poor Man's VPN — Wallet-Authenticated Remote Access</em></p>

<div align="center">
  <picture>
    <img src="../poormansvpn.jpg" alt="pmVPN" width="480" style="
      border-radius: 20px;
      box-shadow:
        0 25px 80px rgba(0,0,0,0.7),
        0 0 120px rgba(88,166,255,0.18),
        inset 0 1px 0 rgba(255,255,255,0.08);
      transform: perspective(1200px) rotateY(-2deg) rotateX(1deg) translateZ(20px);
      border: 1px solid rgba(88,166,255,0.25);
    " />
  </picture>
</div>

<br />

<div align="center">
  <a href="https://agenticplace.pythai.net">
    <picture>
      <img src="../agenticplace.jpg" alt="AgenticPlace" width="360" style="
        border-radius: 16px;
        box-shadow:
          0 20px 60px rgba(0,0,0,0.6),
          0 0 100px rgba(188,140,255,0.15),
          inset 0 1px 0 rgba(255,255,255,0.06);
        transform: perspective(1200px) rotateY(2deg) rotateX(-0.5deg) translateZ(10px);
        border: 1px solid rgba(188,140,255,0.25);
      " />
    </picture>
  </a>
</div>

---

> *Your wallet is your key. Your signature is your password. Eight ports. Zero trust required.*

---

## What Is pmVPN

pmVPN is wallet-authenticated SSH infrastructure. It replaces traditional SSH keys and passwords with Ethereum wallet signatures — your cryptographic identity becomes your access credential. One wallet. Eight dedicated ports. Terminal, file transfer, VPN tunneling, and Claude AI — all from a handheld interface.

The server runs on any Linux machine or VPS. The client is a module of [PARSEC Wallet](https://github.com/cypherpunk2048/parsec-wallet), built with vanilla TypeScript and Tauri. No React. No frameworks. Minimal attack surface on a hostile internet.

```
                          Wallet Signature
  ┌────────────┐         ═══════════════         ┌────────────────┐
  │   PARSEC   │────────── 8 SSH Ports ────────│  pmVPN Server  │
  │   Wallet   │                                 │  (Linux/VPS)   │
  │            │   ┌─ Shell (Claude, bash)       │                │
  │  ┌ pmVPN ┐ │   ├─ SFTP (file transfer)      │  Ed25519 only  │
  │  │ module │ │   ├─ Exec (scripting)          │  curve25519    │
  │  │        │ │   ├─ Challenge API             │  chacha20      │
  │  │ xterm  │ │   ├─ VPN Tunnel (TCP/UDP/DNS)  │  poly1305      │
  │  └────────┘ │   ├─ File Sync                 │                │
  │            │   ├─ Claude AI Proxy            │  node-pty      │
  └────────────┘   └─ Admin                      │  viem          │
                                                  └────────────────┘
```

---

## Design

**Minimalist.** Four production dependencies on the server. No Express. No WebSocket library. HTTP uses Node's built-in `http.createServer`. Every dependency is an attack surface — we minimize ruthlessly.

**Sovereign.** Self-hosted. Your hardware. Your rules. No cloud accounts, no custodial services, no phone-home telemetry. The server runs wherever you put it.

**Hardened.** Ed25519 host keys only. curve25519-sha256 key exchange. chacha20-poly1305 encryption. No RSA. No NIST curves. No agent forwarding. No X11. Three auth attempts. Thirty-second timeout. Thank [OpenBSD](https://www.openssh.com/).

**Modular.** pmVPN is a module of PARSEC, and can itself be extended. The server is MIT-licensed for universal deployment. The tunnel protocol is documented and open.

---

## Eight Ports

| Port | Service | Purpose |
|------|---------|---------|
| +0 | **SSH Shell** | Interactive terminal — run Claude, bash, anything |
| +1 | **SFTP** | File transfer and remote browsing |
| +2 | **SSH Exec** | Non-interactive command execution for scripting |
| +3 | **Challenge API** | Nonce endpoint for wallet authentication |
| +4 | **VPN Tunnel** | Multiplexed TCP/UDP/DNS over SSH ([PM Protocol](docs/PROTOCOL.md)) |
| +5 | **File Sync** | Bidirectional file synchronization |
| +6 | **Claude AI** | Dedicated channel for AI assistant proxy |
| +7 | **Admin** | Server health and session management |

Base port configurable (default: `2200`). All SSH ports use wallet authentication. All traffic encrypted end-to-end.

---

## Authentication

No passwords. No key files. Your wallet signs a challenge.

```
  Client                                      Server
  ──────                                      ──────

  GET /challenge?address=0x...  ──────────►  Generate nonce (32 random bytes)
                                              Store with 60-second expiry

  ◄──────────  { nonce, message, expires }    message = "PMVPN:<nonce>:<ts>"

  Wallet signs message ────────────────────►  viem.verifyMessage()
  (bankon_vault / MetaMask / WalletConnect)   Pure local secp256k1 recovery
                                              No blockchain RPC needed
  SSH connect                                 Check nonce (single-use, delete)
  password = { address, signature, nonce }    Check wallet map
                                              Spawn PTY shell
  ◄──────────  AUTH_SUCCESS
```

The signature is verified locally using [viem](https://viem.sh/) — pure secp256k1 elliptic curve recovery. No Alchemy. No Infura. No RPC calls. No network dependency for authentication.

---

## Quick Start

### Server

```bash
git clone https://github.com/poormanvpn/pmVPN.git
cd pmVPN/server

pnpm install

# Configure: map your wallet to a system user
export WALLET_USER_MAP="0xYourWalletAddress:yourusername"

# Start (development)
pnpm run dev

# Start (production)
pnpm run build && pnpm start
```

Ed25519 host key generated automatically at `~/.pmvpn/hostkey` on first run.

### Client

The pmVPN client lives inside PARSEC Wallet. From the dashboard, navigate to the pmVPN view, add your server, and connect with your wallet.

```bash
cd parsec-wallet
pnpm install
pnpm run tauri:dev
```

---

## VPN Tunnel

pmVPN includes an in-house VPN tunneling protocol that multiplexes TCP, UDP, and DNS streams over a single SSH channel. The **PM Protocol** uses 8-byte binary frames with 16-bit channel IDs — supporting up to 65,535 concurrent streams.

Inspired by the elegant simplicity of [sshuttle](https://github.com/sshuttle/sshuttle). Reimplemented in TypeScript. No Python dependency. No root required on the server.

See [PM Protocol Specification](docs/PROTOCOL.md) for the wire format.

---

## Security

| | |
|---|---|
| **Host key** | Ed25519 — smallest, fastest, no NIST dependency |
| **Key exchange** | curve25519-sha256 |
| **Cipher** | chacha20-poly1305@openssh.com (AEAD, constant-time) |
| **Signing** | secp256k1 ECDSA with keccak256 (EIP-191) |
| **Vault** | Argon2id KDF + AES-256-GCM ([bankon_vault](https://github.com/cypherpunk2048/parsec-wallet)) |
| **Nonces** | In-memory only, 60s TTL, single-use, hard cap at 1000 |
| **On lock** | All sessions disconnected, signing keys zeroized in Rust memory |

Private keys never leave the wallet. Signing happens in Rust (bankon_vault). The key is retrieved, used to sign one message, and zeroized. On mobile, signing is delegated to MetaMask via WalletConnect — the key never touches pmVPN.

---

## Self-Installation

pmVPN can bootstrap its own server onto any machine you can reach. Regular SSH or SFTP access is sufficient — no admin required.

| Access Level | What pmVPN Does |
|---|---|
| **User shell** | Installs in `~/`, runs on unprivileged ports (8200+), single-user |
| **Sudo** | Installs to `/opt/`, standard ports (2200+), systemd service, multi-user |
| **Container** | pmVPN IS an SSH server (ssh2). No OpenSSH needed. Just Node.js |

pmVPN never modifies system SSH configuration. Never opens firewall ports. Never touches other users' files. Every action is logged, auditable, and reversible.

See [Bootstrap Guide](docs/BOOTSTRAP.md).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Protocol Specification](docs/PROTOCOL.md) | PM tunnel wire format, commands, flow control |
| [Deployment Guide](docs/DEPLOYMENT.md) | Production setup: systemd, Docker, firewall, monitoring |
| [Bootstrap Guide](docs/BOOTSTRAP.md) | Self-installation, key exchange, authorized_keys handling |
| [Client Module](docs/CLIENT.md) | PARSEC integration, UI, Tauri commands |
| [Development Plan](docs/DEVELOPMENT.md) | Roadmap, phase status, dependency inventory |

---

## Dependencies

### Server — MIT License

| Package | Purpose |
|---------|---------|
| [ssh2](https://github.com/mscdex/ssh2) | Pure JavaScript SSH2 implementation — Brian White |
| [node-pty](https://github.com/microsoft/node-pty) | Real PTY spawning — Microsoft |
| [viem](https://viem.sh/) | Signature verification — wevm |
| [pino](https://github.com/pinojs/pino) | Structured logging — Matteo Collina |

Four dependencies. No Express. No ws. No dotenv. Configuration from environment variables.

### Client — GPL-3.0 (PARSEC Module)

| Component | Purpose |
|-----------|---------|
| [xterm.js](https://xtermjs.org/) | Terminal emulator — xtermjs |
| [k256](https://github.com/RustCrypto/elliptic-curves) | secp256k1 ECDSA — RustCrypto |
| [sha3](https://github.com/RustCrypto/hashes) | Keccak256 — RustCrypto |

---

## License

| Component | License |
|-----------|---------|
| Server (`server/`) | [MIT](LICENSE-SERVER-MIT) |
| Client (PARSEC module) | GPL-3.0 |
| Shared types (`shared/`) | MIT |

---

## Heritage & Tribute

pmVPN stands on the shoulders of projects and people who built the infrastructure of digital freedom.

**[OpenSSH](https://www.openssh.com/)** — The OpenBSD team gave the world secure remote access. Every SSH hardening decision in pmVPN follows their lead: Ed25519, curve25519, chacha20-poly1305. The algorithms we trust because they earned that trust. *Thank you, Theo de Raadt and the OpenBSD community.*

**[sshuttle](https://github.com/sshuttle/sshuttle)** — Avery Pennarun's "poor man's VPN" proved that you don't need root, kernel modules, or complicated setup to tunnel traffic securely. The elegant simplicity of multiplexing TCP over SSH inspired pmVPN's [PM Protocol](docs/PROTOCOL.md). We [forked sshuttle](https://github.com/poormanvpn/sshuttle) as tribute and reference.

**[viem](https://viem.sh/)** — The wevm team built the TypeScript Ethereum library that makes wallet signature verification a single function call. Pure local cryptography. No RPC. No network dependency.

**[Tauri](https://tauri.app/)** — The Tauri contributors proved that desktop and mobile apps don't need Electron's 300MB footprint. Rust backend, system webview, minimal surface. The architecture pmVPN's client is built on.

**[PARSEC Wallet](https://github.com/cypherpunk2048/parsec-wallet)** — The sovereign Algorand wallet that houses pmVPN as a module. Vanilla TypeScript, bankon_vault encryption, zero-framework philosophy.

**[bankonOS](https://github.com/cypherpunk2048)** — The self-sovereign cryptocurrency banking operating system. The crypto-ssh authentication pattern that became pmVPN's wallet-based auth originated in bankon-greeter's EIP-191 verification flow.

**[cSSHwallet](https://github.com/cypherpunk2048)** — Ten prototypes exploring wallet-authenticated SSH. CRYPTOSSH, crypto-ssh, csshd2 through csshd9, csshdQR — each iteration refined the idea that a wallet signature could replace an SSH key. pmVPN is the synthesis.

**[RustCrypto](https://github.com/RustCrypto)** — The k256 and sha3 crates that handle EVM signing in Rust memory. No JavaScript ever touches the private key during signing.

---

## Contributors

<p align="center"><em>The idea that a wallet key is the login key</em></p>

<table align="center">
  <tr>
    <td align="center" width="300" style="padding: 24px;">
      <a href="https://github.com/Professor-Codephreak">
        <img src="https://github.com/Professor-Codephreak.png" width="130" style="
          border-radius: 50%;
          box-shadow:
            0 12px 40px rgba(0,0,0,0.6),
            0 0 80px rgba(88,166,255,0.25),
            0 0 2px rgba(88,166,255,0.5);
          border: 3px solid rgba(88,166,255,0.35);
          transform: perspective(600px) translateZ(15px);
        " />
      </a>
      <br /><br />
      <strong><a href="https://github.com/Professor-Codephreak">Professor Codephreak</a></strong>
      <br />
      <sub>cSSHwallet prototypes · bankon-greeter auth pattern<br />cypherpunk2048 protocol · PARSEC Wallet · bankonOS<br /><em>Wallet-as-login-key architect</em></sub>
    </td>
    <td align="center" width="300" style="padding: 24px;">
      <a href="https://github.com/Web3dGuy">
        <img src="https://github.com/Web3dGuy.png" width="130" style="
          border-radius: 50%;
          box-shadow:
            0 12px 40px rgba(0,0,0,0.6),
            0 0 80px rgba(63,185,80,0.25),
            0 0 2px rgba(63,185,80,0.5);
          border: 3px solid rgba(63,185,80,0.35);
          transform: perspective(600px) translateZ(15px);
        " />
      </a>
      <br /><br />
      <strong><a href="https://github.com/Web3dGuy">Web3dGuy</a></strong>
      <br />
      <sub>Wallet-authenticated SSH concept · Web3 development<br />3D immersive experience · Spatial interface<br /><em>Wallet-as-login-key architect</em></sub>
    </td>
  </tr>
</table>

---

<p align="center">
  <em>Code is law. Keys are identity. Verification replaces trust.</em>
</p>
<p align="center">
  <a href="https://github.com/cypherpunk2048">cypherpunk2048</a> · Professor Codephreak
</p>

# pmVPN Quick Start

*First-time guide — from zero to connected in 3 minutes*

---

## What Is pmVPN

pmVPN is a remote access tool that uses your cryptocurrency wallet as your login credential. Instead of SSH keys or passwords, you sign a cryptographic challenge with MetaMask. The server verifies the signature and opens an encrypted terminal session. No accounts to create. No passwords to remember. Your wallet is your key.

---

## 3 Steps to Connect

### Step 1: Install MetaMask

**Desktop:** Install the [MetaMask browser extension](https://metamask.io/) for Chrome, Firefox, or Brave.

**Android/iOS:** Install the MetaMask app from [Google Play](https://play.google.com/store/apps/details?id=io.metamask) or [App Store](https://apps.apple.com/us/app/metamask-blockchain-wallet/id1438144202). pmVPN will open the app automatically via deep link.

### Step 2: Start the Server

**Option A — Use the live Hostinger VPS** (already deployed):

The server is running at `168.231.126.58` with 12 ports active (core 2200-2207, fleet 2600-2603). Skip to Step 3.

**Option B — Deploy your own:**

```bash
git clone https://github.com/poormanvpn/pmVPN.git
cd pmVPN/pmvpn/server
pnpm install
pnpm run dev
```

The server starts 8 core ports (default 2200-2207). Any wallet that signs in gets access.

See [GUIDE-HOSTINGER-VPS.md](GUIDE-HOSTINGER-VPS.md) for full VPS deployment.

### Step 3: Open the Client

```bash
cd pmvpn/client
pnpm install   # first time only
pnpm run dev   # starts at http://localhost:1420
```

1. Open `http://localhost:1420/`
2. Click **[+] Add Connection** in the sidebar
3. Enter: Name `Hostinger VPS`, Host `168.231.126.58`, Port `2200`
4. Click **Connect MetaMask** → sign the login challenge
5. Click the connection → terminal opens

Your wallet is your identity. Logout leaves no trace except your public receive address.

---

## What You See

### Before Connecting

```
┌─ pmVPN ──────────────────────────── [✕] ┐
│  WALLET                                  │
│  [🦊 Connect MetaMask]                   │
│                                          │
│  CONNECTIONS                         [+] │
│  ■ Local Server (localhost:2200)     [−] │
│                                          │
│  Connect MetaMask → Select → Auth        │
├──────────────────────────────────────────┤
│  PMVPN — WALLET-AUTHENTICATED ...    ▼   │
│  DIAGNOSTICS: [Run Diagnostics]          │
│  TOOLS: [Bootstrap] [Deploy Key]         │
│         [Export] [Import]                │
├──────────────────────────────────────────┤
│  LOG                                 ▲   │
├──────────────────────────────────────────┤
│  ● Disconnected                          │
└──────────────────────────────────────────┘
```

**Sidebar** (left on desktop, top on mobile): wallet connection + server list.

**Footer** (bottom): pmVPN tools panel (diagnostics, bootstrap, key management) and log. Both expand/collapse independently.

### After Connecting

```
┌─ pmVPN ─────────── [0xf3..92] LOGOUT [✕] ┐
├─ Sidebar ──┬─ Terminal  Files  Share ─────┤
│  ● Local   │  user@remote:~$              │
│    Server  │  $ ls -la                    │
│            │  drwxr-xr-x 2 user           │
│  [+] Add   │  $ _                         │
├────────────┴──────────────────────────────┤
│  PMVPN — ...  ▲  │  LOG  ▲               │
├───────────────────────────────────────────┤
│  ● Connected │ localhost:2200             │
└───────────────────────────────────────────┘
```

**Three tabs** in the main area:
- **Terminal** — full interactive shell via xterm.js
- **Files** — SFTP file browser (browse, upload, download, delete)
- **Share** — P2P file sharing with wallet-signed invites

---

## Features

### Terminal

Full interactive terminal session over WebSocket. Real PTY emulation — run bash, vim, htop, claude, anything. Supports window resize, copy/paste, 256 colors.

### File Browser

Browse the remote filesystem. Click a folder to navigate. Click a file to download. Upload via the ↑ button or drag files from your desktop directly into the browser. Cross-server file transfer: drag a file from one server's browser and drop it on another.

### P2P File Sharing

Create a share → add files → generate an invite link. Send the invite to someone (clipboard, chat, email). They paste the invite → browse → download. Both sides authenticated by wallet signature.

### Multi-Host

Connect to multiple servers simultaneously. Click a connection in the sidebar to switch between them. Each server has its own terminal, file browser, and share panel.

### Bootstrap

Install pmVPN on a remote server through an existing connection. Click "Bootstrap Remote Server" in the tools panel. pmVPN uploads itself via SFTP and starts a new instance.

### Diagnostics

Test connectivity to all configured servers. Click "Run Diagnostics" — tests server reachability, challenge API, signature verification, and payload format.

---

## All Modules

pmVPN is a modular platform. Each module can be used independently or composed together.

| Module | What It Does | Status |
|--------|-------------|:------:|
| **pmVPN** | Wallet-authenticated SSH terminal, SFTP, VPN tunnel | Live |
| **blocktalk** | Wallet-to-wallet messaging, rooms (private/boardroom/dojo), XMTP integration | Designed |
| **Citadel** | Blockchain-permanent rooms, token-gated access, distributed social networking | Designed |
| **crypto-ssh** | Bidirectional key derivation between SSH keys and crypto wallets (HKDF, BIP-32) | Library |
| **Remote Control** | Claude AI server administration from phone via claude.ai/code | Service |
| **Hostinger MCP** | VPS management via Hostinger API — provision, monitor, fleet | Live |
| **Fleet Coordination** | Multi-server management on ports 2600-2603 | Live |
| **dApp Diagnostics** | Privilege-gated fleet/provider status in the client UI | Live |
| **BANKON Vault** | Wallet-signature-gated credential storage (GPLv3, pure Node.js crypto) | Live |

## Documentation

| Guide | What It Covers |
|-------|---------------|
| [QUICKSTART.md](QUICKSTART.md) | This guide — zero to connected in 3 minutes |
| [GUIDE-HOSTINGER-VPS.md](GUIDE-HOSTINGER-VPS.md) | Deploy pmVPN on a Hostinger VPS |
| [HOSTINGER-MCP-SETUP.md](HOSTINGER-MCP-SETUP.md) | Configure Hostinger API MCP for VPS management |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment, systemd, Docker |
| [PROTOCOL.md](PROTOCOL.md) | PM Protocol wire format specification |
| [GUIDE-PHONE-TO-LAPTOP.md](GUIDE-PHONE-TO-LAPTOP.md) | Connect your phone to your laptop |
| [GUIDE-LAPTOP-TO-DESKTOP.md](GUIDE-LAPTOP-TO-DESKTOP.md) | Connect laptop to desktop over LAN |

### Module Composition

All modules share one identity: your wallet signature. A wallet that authenticates to pmVPN is the same wallet that opens a blocktalk room, the same wallet that derives SSH keys via crypto-ssh.

```
  Your Wallet (MetaMask)
       │
       ├── pmVPN: sign challenge → SSH terminal access
       ├── BANKON Vault: sign → derive key → encrypted credentials
       ├── blocktalk: sign messages → room participation
       ├── Citadel: hold token → on-chain room access
       └── crypto-ssh: derive keys → SSH public key auth
```

---

## Mobile Usage

pmVPN works in your phone's browser. Open `http://<server-ip>:1420/` on your phone.

**With MetaMask app installed:** The button says "Open MetaMask App". Tap it → MetaMask opens → approve → sign → redirected back to pmVPN authenticated.

**Without MetaMask:** Install from [Google Play](https://play.google.com/store/apps/details?id=io.metamask) or [App Store](https://apps.apple.com/us/app/metamask-blockchain-wallet/id1438144202).

The mobile UI is optimized:
- Sidebar collapses to a single row when connected (tap to expand)
- Terminal fills the screen (full bleed, no wasted edges)
- Footer panels (pmVPN tools, Log) collapse independently
- All buttons and text sized for touch

---

## Security Model

- **Private key never leaves MetaMask.** pmVPN only sees your address and signature.
- **Every login requires a fresh signature.** No auto-reconnect. No cached credentials.
- **Nonces prevent replay.** Each challenge expires in 60 seconds and can only be used once.
- **SSH is end-to-end encrypted.** Ed25519 host keys, ChaCha20-Poly1305 transport.
- **Logout revokes everything.** All sessions killed, all payloads cleared, MetaMask permissions revoked.

---

## Next Steps

| Want to... | Read... |
|-----------|---------|
| Connect phone to laptop (LAN) | [GUIDE-PHONE-TO-LAPTOP.md](GUIDE-PHONE-TO-LAPTOP.md) |
| Deploy on a Hostinger VPS | [GUIDE-HOSTINGER-VPS.md](GUIDE-HOSTINGER-VPS.md) |
| Connect laptop to desktop (no root) | [GUIDE-LAPTOP-TO-DESKTOP.md](GUIDE-LAPTOP-TO-DESKTOP.md) |
| Deploy to production | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Understand the tunnel protocol | [PROTOCOL.md](PROTOCOL.md) |
| Bootstrap remote servers | [BOOTSTRAP.md](BOOTSTRAP.md) |
| Build the Android APK | [ANDROID.md](ANDROID.md) |
| Derive SSH keys from your wallet | [CRYPTO-SSH.md](CRYPTO-SSH.md) |
| Set up wallet-to-wallet messaging | [BLOCKTALK.md](BLOCKTALK.md) |
| Create permanent on-chain rooms | [CITADEL.md](CITADEL.md) |
| Use Claude for server admin | [REMOTE-CONTROL.md](REMOTE-CONTROL.md) |
| Review the full codebase audit | [AUDIT.md](AUDIT.md) |

---

*Your wallet is your key. Your signature is your password. Connect and go.*

*Professor Codephreak — cypherpunk2048*

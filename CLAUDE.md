# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

pmVPN is a wallet-authenticated SSH/VPN infrastructure that replaces traditional remote access credentials with Ethereum wallet signatures. Your wallet is your SSH key. Your signature is your password. Eight ports. Zero trust required.

The system consists of:
- **Server**: Node.js/TypeScript SSH server with 8 dedicated ports
- **Client**: Vite/Tauri desktop app + web client with MetaMask integration
- **Shared modules**: Common protocol definitions and utilities
- **blocktalk**: Wallet-gated communication rooms
- **Crypto-SSH**: Bidirectional key derivation between SSH keys and crypto wallets

## Package Manager

**Always use pnpm** (not npm) for package management in this project. All package.json files are configured for pnpm, and the user prefers pnpm for consistency with "pmVPN" naming.

## Development Commands

### Server (pmvpn/server/)
```bash
cd pmvpn/server
pnpm install                          # Install dependencies
pnpm run dev                          # Development with watch mode (tsx)
pnpm run build                        # Build TypeScript to dist/
pnpm run start                        # Run built server
pnpm run remote                       # Start Claude remote control
pnpm run remote:interactive          # Interactive Claude remote control
```

### Client (pmvpn/client/)
```bash
cd pmvpn/client
pnpm install                          # Install dependencies
pnpm run dev                          # Vite development server
pnpm run build                        # Build for production
pnpm run preview                      # Preview production build
pnpm run tauri:dev                    # Tauri desktop app (development)
pnpm run tauri:build                  # Build Tauri desktop app
pnpm run android:dev                  # Android development
pnpm run android:build               # Build Android APK
```

### Shared Modules (pmvpn/shared/)
```bash
cd pmvpn/shared
pnpm install
pnpm run build                        # Build shared utilities
```

### blocktalk (blocktalk/)
```bash
cd blocktalk
pnpm install
pnpm run dev                          # Development server
```

## Server Architecture (8 Core + 4 Fleet Ports)

### Core Ports (default 2200-2207, configurable via `PMVPN_BASE_PORT`)

| Port | Service | Module | Description |
|------|---------|--------|-------------|
| +0   | Shell   | `ssh/` | Interactive terminal via node-pty |
| +1   | SFTP    | `ssh/` | File transfer |
| +2   | Exec    | `ssh/` | Non-interactive command execution |
| +3   | Auth    | `api/` | Challenge nonce endpoint (HTTP) |
| +4   | Tunnel  | `ws/` | WebSocket bridge (browser terminal + file browser) |
| +5   | Sync    | `ssh/` | File synchronization |
| +6   | Provider GW | `modules/core/` | Cloud provider coordination (HTTP) |
| +7   | Admin   | `api/` | Server health and metrics |

### Fleet Ports (default 2600-2603, configurable via `PMVPN_FLEET_BASE_PORT`)

Optional — activated when `~/.pmvpn/fleet.json` exists.

| Port | Service | Module | Description |
|------|---------|--------|-------------|
| +0   | Control | `modules/fleet/` | HTTP REST fleet CRUD, deployments |
| +1   | Events  | `modules/fleet/` | WebSocket real-time monitoring |
| +2   | Mesh    | `modules/fleet/` | Inter-node heartbeat, state sync |
| +3   | Metrics | `modules/fleet/` | Prometheus metrics + health |

### Module System

Dynamic module loading via `pmvpn/modules/registry.ts`:
- **Hostinger** (`modules/hostinger/`): VPS management via hostinger-api-mcp (5 commands)
- **Fleet** (`modules/fleet/`): Multi-server coordination (7 commands)
- **Core** (`modules/core/`): Cloud provider abstraction, Provider Gateway

### Live Deployment

VPS at `168.231.126.58` — 12 ports active, Hostinger MCP loaded, fleet coordinator mode. systemd service `pmvpn` with auto-restart. See [GUIDE-HOSTINGER-VPS.md](pmvpn/docs/GUIDE-HOSTINGER-VPS.md).

### Key Server Modules

- **`auth/`**: Wallet signature verification via viem, nonce management
- **`ssh/`**: SSH server implementation using ssh2 library
- **`tunnel/`**: PM Protocol binary multiplexing (TCP/UDP/DNS)
- **`ws/`**: WebSocket bridge for client communication
- **`api/`**: HTTP endpoints for authentication and administration
- **`config/`**: Server configuration and wallet-to-user mapping
- **`utils/`**: Shared utilities and helpers

## Authentication Flow

```
Wallet ────── sign challenge ──────► SSH connect ────── verify signature ──────► Shell
  │                                      │                                        │
  │  "PMVPN:<nonce>:<timestamp>"         │  password = { address,                 │  PTY
  │  signed with secp256k1               │    signature, nonce }                  │  spawned
  │  key never leaves vault              │  single-use nonce                      │  as user
```

1. Client fetches challenge nonce from `/auth/challenge` (port +3)
2. User signs challenge with MetaMask/wallet
3. Client connects to SSH with signature as password
4. Server verifies signature using `viem.verifyMessage()`
5. On success, spawns PTY as mapped Linux user

## Client Architecture

### Web Client (pmvpn/client/src/)
- **Vite + TypeScript**: No frameworks, vanilla TypeScript
- **xterm.js**: Terminal emulation
- **Wallet connect**: EIP-6963 multi-wallet discovery (desktop) + MetaMask SDK (mobile deep link)
- **viem**: Wallet client creation, message signing, on-chain reads (no ethers)
- **WebSocket**: Real-time communication with server
- **privilege.ts**: Asset-gated access — wallet signature = identity, token holding = privilege tier
- **dapp-diagnostics.ts**: Privilege-gated fleet/provider response viewer in the UI

### Wallet Connection (auth.ts)
Desktop: EIP-6963 announced providers → `window.ethereum.providers[]` fallback → raw `window.ethereum`.
Mobile: MetaMask SDK deep link to native app.
Key fix: never use `window.ethereum` directly when `providers[]` exists — it's a proxy that triggers MetaMask's broken `selectExtension`. Extract the actual provider from the array.

### Desktop Client (pmvpn/client/src-tauri/)
- **Tauri 2**: Rust backend with TypeScript frontend
- **bankon_vault**: Secure key storage with Argon2id + AES-256-GCM
- **Session management**: Auto-disconnect on lock, key zeroization

## Connection Scenarios

The system supports multiple connection patterns:

1. **Phone to Laptop**: Android MetaMask app → laptop pmVPN server over Wi-Fi
2. **Laptop to Desktop**: Client on laptop → desktop server over LAN
3. **Desktop to VPS**: Client on desktop → VPS server over internet
4. **Phone to VPS**: Mobile browser → VPS server for remote access

See `pmvpn/docs/GUIDE-*.md` files for step-by-step setup instructions.

## Configuration

### Server Configuration
- **WALLET_USER_MAP**: Environment variable mapping wallet addresses to Linux users
  - Format: `"0xWalletAddress:username,0xOther:otheruser"`
- **Base port**: Configurable, defaults to 2200
- **Host keys**: Ed25519 keys auto-generated in `~/.ssh/` or current directory

### Client Configuration
- **Connections**: Stored in localStorage, exportable/importable JSON
- **Host keys**: TOFU (Trust On First Use) verification with mismatch warnings
- **MetaMask**: Lock detection, mandatory signature verification

## Security Model

- **Algorithms**: Ed25519, curve25519-sha256, chacha20-poly1305, keccak256
- **Rejected**: RSA, NIST curves, agent forwarding, X11, password fallback
- **Dependencies**: Minimal attack surface - ssh2, node-pty, viem, pino
- **Nonces**: In-memory, 60s TTL, single-use, 1000 hard cap
- **Keys**: Never transmitted, signatures verified locally

## PM Protocol (VPN Tunnel)

Binary multiplexing protocol inspired by sshuttle:
- **8-byte frames**: 2-byte channel ID + 2-byte command + 4-byte length
- **65,535 channels**: Concurrent TCP/UDP/DNS streams
- **Flow control**: 32KB threshold with backpressure
- **Commands**: CONNECT, DATA, EOF, UDP, DNS with dedicated handlers

See `pmvpn/docs/PROTOCOL.md` for complete wire format specification.

## Documentation Structure

- **`pmvpn/docs/QUICKSTART.md`**: 3-minute setup guide
- **`pmvpn/docs/USAGE.md`**: Complete user guide
- **`pmvpn/docs/DEPLOYMENT.md`**: Production deployment (systemd, Docker)
- **`pmvpn/docs/GUIDE-HOSTINGER-VPS.md`**: Deploy to Hostinger VPS (live at 168.231.126.58)
- **`pmvpn/docs/HOSTINGER-MCP-SETUP.md`**: Hostinger API MCP configuration
- **`pmvpn/docs/PROTOCOL.md`**: PM Protocol wire format specification
- **`pmvpn/docs/GUIDE-PHONE-TO-LAPTOP.md`**: Phone → laptop connection tutorial
- **`pmvpn/docs/GUIDE-LAPTOP-TO-DESKTOP.md`**: Laptop → desktop over LAN
- **`pmvpn/docs/BOOTSTRAP.md`**: Self-installation methods
- **`pmvpn/docs/DEVELOPMENT.md`**: Roadmap and status
- **`TOKEN_GATED_ACCESS_DESIGN.md`**: Token-gated access control architecture
- **`SIGNATURE_SECURITY_ANALYSIS.md`**: Security limitations and hardening
- **`HANDHELD_VPS_COORDINATION.md`**: Mobile-first fleet coordination design
- **`MODULAR_CLAUDE_EXPANSION.md`**: Extensible module system for remote control

## Bootstrap and Remote Control

### Self-Installation
pmVPN can install itself on any reachable machine:
```bash
# From pmvpn/server/
pnpm run remote                       # Start Claude remote control
# Or manually bootstrap via SFTP upload + install script
```

### Claude Remote Control (Mobile Infrastructure Command Center)
Transform your phone into a multi-server fleet coordinator:
- **Natural language control**: "Deploy user-service to staging" instead of complex commands
- **Multi-VPS coordination**: Manage entire server fleets from handheld devices
- **Modular expansion system**: Extensible modules for deployment, monitoring, custom workflows
- **Real-time fleet monitoring**: Live health status and predictive maintenance
- **Mobile-first interface**: Touch-optimized UI with voice commands and gestures

#### Enhanced Remote Control
```bash
# Multi-server fleet coordination
pnpm run remote --fleet              # Enhanced multi-server coordinator
pnpm run remote --modules            # List available modules
pnpm run remote --discover           # Auto-discover pmVPN servers on network
```

#### Module System
The remote control system is built on extensible modules:
- **Core modules**: Connection management, authentication, execution planning
- **Fleet modules**: Server discovery, grouping, scaling, health monitoring
- **Deployment modules**: Rolling deployments, blue-green, canary releases
- **Custom modules**: User-defined workflows and integrations
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

## Server Architecture (8-Port System)

The server opens 8 consecutive ports (default 2200-2207) with dedicated functions:

| Port | Service | Module | Description |
|------|---------|--------|-------------|
| +0   | Shell   | `ssh/` | Interactive terminal via node-pty |
| +1   | SFTP    | `ssh/` | File transfer |
| +2   | Exec    | `ssh/` | Non-interactive command execution |
| +3   | Auth    | `api/` | Challenge nonce endpoint (HTTP) |
| +4   | Tunnel  | `tunnel/` | VPN multiplexing via PM Protocol |
| +5   | Sync    | `share/` | Bidirectional file synchronization |
| +6   | Claude  | `ws/` | AI assistant proxy |
| +7   | Admin   | `api/` | Server health and metrics |

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
- **MetaMask SDK**: Wallet integration with mobile deep linking
- **WebSocket**: Real-time communication with server

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
- **`pmvpn/docs/DEPLOYMENT.md`**: Production deployment
- **`pmvpn/docs/PROTOCOL.md`**: PM Protocol specification
- **`pmvpn/docs/DEVELOPMENT.md`**: Roadmap and status (9.8/10 phases complete)
- **`pmvpn/docs/GUIDE-*.md`**: Connection scenario tutorials
- **`pmvpn/docs/BOOTSTRAP.md`**: Self-installation methods
- **`TOKEN_GATED_ACCESS_DESIGN.md`**: Token-gated access control architecture and UI wrapper design
- **`SIGNATURE_SECURITY_ANALYSIS.md`**: Security limitations analysis and hardening recommendations
- **`HANDHELD_VPS_COORDINATION.md`**: Mobile-first fleet coordination system design and architecture
- **`MODULAR_CLAUDE_EXPANSION.md`**: Extensible module system for Claude remote control expansion

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
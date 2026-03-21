# pmVPN Client — Parsec Wallet Module

*Handheld remote machine management*

Updated: 2026-03-20

---

## Overview

The pmVPN client is a module inside the Parsec Wallet. It provides a terminal-based interface for connecting to and managing remote Linux machines, with wallet-based authentication.

No separate app. No browser extension. Open Parsec → pmVPN → connect.

---

## User Interface

### Layout

```
┌─────────────────────────────────────────────────────┐
│ pmVPN                                    [← Back]   │
├──────────────┬──────────────────────────────────────┤
│ Host List    │                                      │
│              │           Terminal                    │
│ ■ dev-box    │                                      │
│   connected  │  user@remote:~$                      │
│              │  claude --model opus                  │
│ □ staging    │  Hello! I'm Claude...                │
│   offline    │                                      │
│              │                                      │
│ □ prod-eu    │                                      │
│   offline    │                                      │
│              │                                      │
├──────────────┤                                      │
│ Add Host     │                                      │
│ Name: [    ] │                                      │
│ Host: [    ] │                                      │
│ Port: [2200] │                                      │
│ Addr: [0x.] │                                      │
│ [Add Host]   │                                      │
├──────────────┴──────────────────────────────────────┤
│ Connected │ Sessions: 1                             │
└─────────────────────────────────────────────────────┘
```

### Connections

- Click a host to connect (wallet signs challenge automatically)
- Active host shows terminal with xterm.js
- Multiple hosts can be connected simultaneously
- Switch between hosts by clicking in the sidebar
- Disconnect via the host action button

### Host Management

- **Add Host**: Name, IP/hostname, base port (default 2200), wallet address
- **Remove Host**: Deletes saved connection profile
- **Profiles persisted** in localStorage across sessions

---

## Connection Flow

1. **Select host** in sidebar
2. **Challenge fetch** — Client requests nonce from server's HTTP API (port +3)
3. **Wallet sign** — bankon_vault retrieves EVM private key, signs the challenge message (EIP-191 personal_sign with keccak256), returns signature. Key is zeroized immediately
4. **SSH connect** — Rust backend establishes SSH connection, sends `{ address, signature, nonce }` as password
5. **Terminal ready** — Server authenticates, spawns PTY, xterm.js displays output

### On Lock

When Parsec locks (auto-lock timer or manual):
- All pmVPN sessions are disconnected
- Terminal instances are destroyed
- Session keys are zeroized in Rust memory
- Connection state resets to `disconnected`

---

## Client-Side Bootstrap

The pmVPN client can bootstrap a server onto a remote machine through an existing SSH or SFTP connection. This turns a basic shell login into a full pmVPN-managed host.

### How It Works

From an established SSH session (wallet-authenticated or traditional):

1. Client uploads the pmVPN server package via SFTP (port +1)
2. Client executes installation commands via SSH exec (port +2)
3. Server starts on the remote machine
4. Client switches to the new pmVPN connection
5. Optionally deploys an Ed25519 SSH key for fallback access

### Escalation Levels

| Level | Access | What pmVPN Can Do |
|-------|--------|-------------------|
| **User** | Regular SSH/SFTP login | Install in `~/`, run on unprivileged ports (8200+), single-user |
| **Sudo** | User with sudo | Install to `/opt/`, standard ports (2200+), multi-user, systemd service |
| **Root** | Direct root | Full system integration, all features |

Each level is a clean escalation — pmVPN works within whatever permissions are granted. No privilege escalation tricks. No exploits. Legitimate use of the access you already have.

### Containerized Environments

For Docker containers, Kubernetes pods, or LXC where OpenSSH isn't installed:

1. pmVPN's server IS an SSH server (ssh2 library). It doesn't need OpenSSH
2. If Node.js is available in the container, pmVPN server can run directly
3. If not, use a static Node.js binary or include pmVPN in the container image

```dockerfile
# Add to existing Dockerfile
COPY pmvpn-server/ /opt/pmvpn/
RUN cd /opt/pmvpn && npx pnpm install
EXPOSE 8200-8207
CMD ["node", "/opt/pmvpn/dist/index.js"]
```

This gives you SSH + SFTP + terminal access to any container — without modifying the container's base image or installing OpenSSH.

---

## File Structure

```
parsec-wallet/
├── src/lib/pmvpn/
│   ├── types.ts         Host, session, connection state types
│   ├── store.ts         State management (hosts persisted, sessions in-memory)
│   ├── auth.ts          Challenge-response authentication
│   ├── connector.ts     Connection orchestrator
│   └── terminal.ts      xterm.js terminal with Tauri event piping
├── src/views/pmvpn.ts   Main view (sidebar + terminal + status bar)
├── src/styles/pmvpn.scss  Dark theme styles
└── src-tauri/src/pmvpn/
    ├── mod.rs           Session state management
    ├── client.rs        SSH session with async channels
    └── commands.rs      Tauri IPC commands
```

---

## Tauri Commands

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `pmvpn_connect` | host, port, authPayload | sessionId | Establish SSH connection |
| `pmvpn_disconnect` | sessionId | () | Close SSH session |
| `pmvpn_send_data` | sessionId, data | () | Send keystrokes to remote |
| `pmvpn_resize` | sessionId, cols, rows | () | Resize remote PTY |
| `pmvpn_sign_challenge` | address, message | signature (0x...) | Sign with vault key |

---

## Tauri Events

| Event | Payload | Description |
|-------|---------|-------------|
| `pmvpn-terminal-data` | `{ sessionId, data }` | Server output → terminal |
| `pmvpn-error` | `{ sessionId, error }` | Connection error |

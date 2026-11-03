# pmVPN Server Deployment Guide

*Production deployment for home servers and VPS*

Updated: 2026-03-20

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **pnpm** 9+
- **Linux** (Ubuntu 22.04+ / Debian 12+ recommended)
- **ssh-keygen** (from OpenSSH, for Ed25519 host key generation)
- A system user account for each wallet-authorized user

---

## Quick Deploy

```bash
# Clone
git clone https://github.com/poormanvpn/pmvpn.git
cd pmvpn/server

# Install
pnpm install

# Configure wallet mapping
export WALLET_USER_MAP="0xYourWalletAddress:yourusername"

# Start
pnpm run dev
```

The server generates an Ed25519 host key at `~/.pmvpn/hostkey` on first run.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PMVPN_BASE_PORT` | `2200` | Base port (8 ports allocated: base through base+7) |
| `PMVPN_HOST` | `0.0.0.0` | Bind address |
| `WALLET_USER_MAP` | (none) | Wallet mappings: `0xaddr:user,0xaddr:user` |
| `LOG_LEVEL` | `info` | Logging: debug, info, warn, error |
| `PMVPN_SHELL` | `/bin/bash` | Shell binary for PTY sessions |
| `PMVPN_HOME_BASE` | `/home` | Base directory for user home dirs |
| `PMVPN_ENV_FILE` | (none) | Env file to load. Unset: `./.env`, then `~/.pmvpn/.env`. Real environment variables win. |
| `PMVPN_PUBLIC_HOST` | (none) | Name written into generated `ssh_config` files |
| `PMVPN_AUTO_REGISTER` | `true` | `false`: only wallets in the map or `wallets.json` may log in |
| `PMVPN_MAX_CONNECTIONS_PER_PORT` | `256` | Sockets one SSH port accepts, before authentication |
| `PMVPN_MAX_CONNECTIONS_PER_WALLET` | `32` | Authenticated connections per wallet, across SSH and WebSocket |
| `PMVPN_MAX_SESSIONS_PER_CONNECTION` | `16` | Channels on one SSH connection |
| `PMVPN_LOGIN_GRACE_SECONDS` | `30` | Seconds to authenticate, from TCP accept |
| `PMVPN_MAX_AUTH_FAILURES` | `6` | Failed attempts per SSH connection before it is closed |
| `PMVPN_CHALLENGES_PER_MINUTE` | `30` | Login challenges per client address per minute |
| `PMVPN_SHARES_DIR` | `~/.pmvpn/shares` | P2P share storage, created mode 0700 |
| `PMVPN_HOSTINGER_MCP_VERSION` | `3.1.0` | Exact `hostinger-api-mcp` version run by npx |
| `PMVPN_KEEPALIVE_SECONDS` | `30` | Seconds between keepalive probes; `0` turns them off |
| `PMVPN_KEEPALIVE_COUNT_MAX` | `3` | Unanswered probes before a connection is dropped |
| `PMVPN_SESSION_PATH` | `/usr/local/bin:/usr/bin:/bin` | Session `PATH`; a leading `~/` means the user's home |
| `PMVPN_ACCEPT_ENV` | `LANG,LC_*,COLORTERM` | Variables a client may set with `SendEnv`/`SetEnv`; `PATH`, `LD_*` and similar are always refused |
| `PMVPN_KEYRING_SIZE` | `8` | Keys a wallet may enrol, up to 64 |

`server/.env.example` explains each one. See [GUIDE-TERMINAL-TOOLS.md](GUIDE-TERMINAL-TOOLS.md) for clients.

### Wallet Map File

For production, use `~/.pmvpn/wallets.json` instead of (or in addition to) the env var:

```json
{
  "0x1234567890abcdef1234567890abcdef12345678": {
    "user": "alice",
    "role": "admin"
  },
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd": {
    "user": "bob",
    "role": "user"
  }
}
```

The JSON file takes precedence over env var entries for the same address.

---

## Production with systemd

Create `/etc/systemd/system/pmvpn.service`:

```ini
[Unit]
Description=pmVPN Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/pmvpn/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

# Environment
Environment=PMVPN_BASE_PORT=2200
Environment=PMVPN_HOST=0.0.0.0
Environment=LOG_LEVEL=info
Environment=NODE_ENV=production

# Security hardening
NoNewPrivileges=false
ProtectSystem=strict
ReadWritePaths=/home /root/.pmvpn /var/log

[Install]
WantedBy=multi-user.target
```

```bash
# Build for production
cd /opt/pmvpn/server
pnpm run build

# Enable and start
sudo systemctl enable pmvpn
sudo systemctl start pmvpn
sudo systemctl status pmvpn

# View logs
sudo journalctl -u pmvpn -f
```

**Note:** The server runs as root so it can drop privileges into the jailed
user when a wallet connects. On first boot it self-injects
`/usr/local/bin/pmvpn-create-user.sh` (the jail warden) and
`/usr/local/bin/pmvpn-warden` (the admin CLI) from `server/scripts/`. Every
authenticated PTY, exec, and SFTP session then runs under the user's real
uid/gid — not as root. For single-operator dev setups, run the server
unprivileged as the target user; isolation falls back to path-sandboxed
operations only.

To provision a wallet manually (without it logging in first):

```bash
sudo pmvpn-warden add        # interactive: wallet, role, confirm
sudo pmvpn-warden list       # show all managed users
sudo pmvpn-warden rotate 0xabc... # rotate the user's ed25519 key
```

---

## Docker Deployment

`Dockerfile`:

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    openssh-client \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

EXPOSE 2200-2207

CMD ["node", "dist/index.js"]
```

```bash
docker build -t pmvpn-server .
docker run -d \
  --name pmvpn \
  -p 2200-2207:2200-2207 \
  -e WALLET_USER_MAP="0xYourAddr:username" \
  -v pmvpn-data:/root/.pmvpn \
  pmvpn-server
```

---

## Firewall Rules

Open ports 2200–2207 (or your configured base port range):

```bash
# UFW
sudo ufw allow 2200:2207/tcp

# iptables
sudo iptables -A INPUT -p tcp --dport 2200:2207 -j ACCEPT
```

For VPS providers (AWS, DigitalOcean, Hetzner), also open these ports in the cloud firewall/security group.

---

## Creating System Users

Each wallet maps to a system user. Create users with restricted shells:

```bash
# Standard user
sudo useradd -m -s /bin/bash alice

# Restricted user (no login shell, SFTP only)
sudo useradd -m -s /usr/sbin/nologin bob
```

---

## Monitoring

### Health Check

```bash
curl http://localhost:2203/status
```

Returns:
```json
{
  "version": "0.3.0",
  "uptime": 3600,
  "wallets": 2
}
```

### Structured Logs

pmVPN uses pino for JSON-structured logging. Pipe to `pino-pretty` for development:

```bash
pnpm run dev | npx pino-pretty
```

---

## Security Checklist

- [ ] Host key generated and permissions are 600: `ls -la ~/.pmvpn/hostkey`
- [ ] Wallet map contains only authorized addresses
- [ ] Ports 2200–2207 are firewalled to trusted IPs (if not public)
- [ ] Server runs with minimal privileges (or root only if multi-user PTY needed)
- [ ] Log level set to `info` or `warn` in production (not `debug`)
- [ ] Regular rotation of wallet-user mappings when team changes
- [ ] Ed25519 host key fingerprint distributed to clients out-of-band

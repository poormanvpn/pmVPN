# Guide: Connect to a Hostinger VPS

*Deploy pmVPN on a Hostinger VPS and access it from anywhere with your wallet*

---

## What You'll Build

A pmVPN server running on a Hostinger VPS that you can reach from any device — your laptop, your phone, a borrowed computer — using nothing but your MetaMask wallet to authenticate. Fleet coordination ports enable multi-server management from a single handheld device.

```
  ┌──────────────┐                          ┌──────────────────────┐
  │  Any Device   │       Internet           │  Hostinger VPS        │
  │               │ ◄──────────────────────► │                       │
  │  Browser +    │   wallet-signed tunnel   │  pmVPN server         │
  │  MetaMask     │                          │  Core:  2200-2207     │
  │               │                          │  Fleet: 2600-2603     │
  └──────────────┘                          │  Ubuntu 24.04 LTS     │
                                             └──────────────────────┘
```

---

## Live Deployment

**Server**: `168.231.126.58` (KVM 2, Ubuntu 24.04 LTS, 8GB RAM, 2 vCPU, 96GB disk)

| Port Range | Service | Status |
|------------|---------|--------|
| 2200-2207 | Core (SSH, SFTP, Auth, WS, Provider Gateway, Admin) | Active |
| 2600-2603 | Fleet (Control Plane, Events, Mesh, Metrics) | Active |

### Quick Connect

```bash
# Desktop: run client locally
cd pmvpn/client && pnpm run dev
# Open http://localhost:1420, add connection: 168.231.126.58:2200
# Connect MetaMask → sign → terminal opens

# API check
curl http://168.231.126.58:2203/status
curl http://168.231.126.58:2206/status
curl http://168.231.126.58:2600/status
curl http://168.231.126.58:2603/health
```

---

## Prerequisites

| Item | Details |
|------|---------|
| Hostinger VPS | KVM 2 or higher recommended (8 GB RAM, 2 vCPU) |
| OS | Ubuntu 24.04 LTS |
| Access | Root SSH access |
| Local | MetaMask installed on your browser or phone |
| API Key | Hostinger API token (from https://developers.hostinger.com/) |

---

## Automated Deployment

The fastest path — one SSH session deploys everything:

```bash
ssh root@YOUR_VPS_IP

# Install build tools + Node.js (if not already present)
apt-get update && apt-get install -y python3 make g++
npm install -g pnpm

# Create directory structure
mkdir -p /opt/pmvpn ~/.pmvpn

# Upload pmVPN server (from local machine)
# tar czf /tmp/pmvpn-server.tar.gz --exclude=node_modules --exclude=dist \
#   pmvpn/server/ pmvpn/modules/ pmvpn/shared/ pmvpn-server-entry.ts start-pmvpn-server.sh
# scp /tmp/pmvpn-server.tar.gz root@YOUR_VPS_IP:/opt/pmvpn/

# On VPS: extract and install
cd /opt/pmvpn && tar xzf pmvpn-server.tar.gz
cd pmvpn/server && pnpm install
cd /opt/pmvpn && npm init -y && npm install ws @types/ws

# Configure environment
cat > /opt/pmvpn/.env << 'EOF'
HOSTINGER_API_KEY=your_api_key_here
PMVPN_BASE_PORT=2200
PMVPN_HOST=0.0.0.0
PMVPN_FLEET_BASE_PORT=2600
LOG_LEVEL=info
NODE_ENV=production
EOF
chmod 600 /opt/pmvpn/.env

# Empty wallets — first wallet to sign in gets access
echo '{}' > ~/.pmvpn/wallets.json

# Fleet config (coordinator mode)
cat > ~/.pmvpn/fleet.json << 'EOF'
{
  "role": "coordinator",
  "members": [],
  "settings": {
    "healthCheckIntervalMs": 30000,
    "deploymentStrategy": "rolling",
    "meshEnabled": true,
    "metricsEnabled": true,
    "metricsRetentionHours": 168
  },
  "groups": {}
}
EOF

# Open firewall
ufw allow 22/tcp
ufw allow 2200:2207/tcp comment "pmVPN core"
ufw allow 2600:2603/tcp comment "pmVPN fleet"
ufw --force enable

# Install systemd service
cat > /etc/systemd/system/pmvpn.service << 'EOF'
[Unit]
Description=pmVPN Server — wallet-authenticated remote access
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pmvpn
ExecStart=/opt/pmvpn/pmvpn/server/node_modules/.bin/tsx pmvpn-server-entry.ts
EnvironmentFile=/opt/pmvpn/.env
Environment=NODE_PATH=/opt/pmvpn/node_modules:/opt/pmvpn/pmvpn/server/node_modules
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pmvpn
systemctl start pmvpn
```

---

## Port Architecture

### Core Ports (2200-2207)

| Port | Service | Protocol | Purpose |
|------|---------|----------|---------|
| +0 | SSH Shell | SSH | Interactive terminal via PTY |
| +1 | SFTP | SSH | File transfer |
| +2 | SSH Exec | SSH | Non-interactive command execution |
| +3 | Challenge API | HTTP | Wallet authentication nonces |
| +4 | WS Bridge | WebSocket | Browser terminal + file browser |
| +5 | File Sync | SSH | Bidirectional file sync |
| +6 | Provider Gateway | HTTP | Cloud provider coordination |
| +7 | Admin API | HTTP | Server health and metrics |

### Fleet Ports (2600-2603)

| Port | Service | Protocol | Purpose |
|------|---------|----------|---------|
| +0 | Fleet Control | HTTP REST | Fleet CRUD, deployments, commands |
| +1 | Fleet Events | WebSocket | Real-time health, deploy progress |
| +2 | Fleet Mesh | HTTP+WS | Inter-node heartbeat, state sync |
| +3 | Fleet Metrics | HTTP | Prometheus metrics, health data |

---

## Authentication Flow

```
Phone/Browser                    VPS (168.231.126.58)
    │                                    │
    │  GET /challenge?address=0x...      │
    │ ──────────────────────────────────► │ :2203
    │  { nonce, message, expires }       │
    │ ◄────────────────────────────────── │
    │                                    │
    │  MetaMask signs message            │
    │  (private key never leaves device) │
    │                                    │
    │  WebSocket { auth: signature }     │
    │ ──────────────────────────────────► │ :2204
    │  { ok: true, user: "root" }        │
    │ ◄────────────────────────────────── │
    │                                    │
    │  Terminal I/O over WebSocket       │
    │ ◄────────────────────────────────► │
```

No passwords. No SSH keys to manage. Your wallet IS your key.

---

## Hostinger MCP Integration

The Provider Gateway on port 2206 integrates with the Hostinger API via MCP:

```bash
# Check provider status
curl http://168.231.126.58:2206/status
# → modules: 1, cloudProviders: 1, Hostinger VPS

# List available commands
curl http://168.231.126.58:2206/commands
# → hostinger-list-vps, hostinger-create-vps, etc.
```

### API Reference

Hostinger API documentation: https://developers.hostinger.com/

MCP tools available through the Provider Gateway:
- `list_vps_instances` — list all VPS
- `get_vps_details` — VPS info, CPU/memory
- `create_vps` — provision new VPS
- `restart_vps` — restart VPS
- `get_ssh_access` — SSH credentials
- `get_account_info` — verify API connection

---

## Wallet-Based Identity

The login wallet address is the participant's identity. On logout, no trace remains except the public key — which is the storefront for receiving.

- **Login**: wallet signs challenge → identity verified
- **Session**: authenticated terminal, file browser, fleet access
- **Logout**: session destroyed, wallet permissions revoked
- **Public key**: visible as receive address only — showing it is showing a storefront

No user accounts. No password database. No credential storage.

---

## Managing the Server

```bash
# View logs
journalctl -u pmvpn -f

# Restart
systemctl restart pmvpn

# Stop
systemctl stop pmvpn

# Check status
systemctl status pmvpn
```

---

## VPS Plans

| Plan | RAM | vCPU | Disk | Notes |
|------|-----|------|------|-------|
| KVM 1 | 4 GB | 1 | 50 GB | Sufficient for pmVPN |
| KVM 2 | 8 GB | 2 | 100 GB | Comfortable for pmVPN + services |
| KVM 4 | 16 GB | 4 | 200 GB | Room for fleet + Claude remote |

pmVPN server uses ~50-80 MB RAM. The rest is yours.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't reach VPS on port 2200 | Check `ufw status` and Hostinger cloud firewall in hPanel |
| `ws` module not found | Run `npm install ws` in `/opt/pmvpn/` |
| Service won't start | Check `journalctl -u pmvpn -n 50` |
| Wallet not authorized | First wallet to sign in gets auto-registered |
| Slow connection | Choose Hostinger datacenter closest to you |
| Fleet ports unreachable | Ensure `~/.pmvpn/fleet.json` exists and `ufw allow 2600:2603/tcp` |

---

*Your wallet is your key. Your VPS is your sovereign territory. Connect from anywhere.*

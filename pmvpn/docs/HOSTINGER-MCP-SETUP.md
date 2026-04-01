# Hostinger MCP Setup

*Configure the Hostinger API MCP server for VPS management through pmVPN*

---

## Overview

The Hostinger MCP (Model Context Protocol) integration connects pmVPN to the Hostinger API, enabling VPS management from the command line, Claude Code, or the pmVPN mobile interface. The MCP server runs as a stdio process — no persistent daemon, no open ports. It spawns on demand, executes a tool call, and exits.

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  pmVPN       │     │  hostinger-api   │     │  Hostinger API   │
│  Provider    │────►│  -mcp (stdio)    │────►│  developers.     │
│  Gateway     │     │  npx on-demand   │     │  hostinger.com   │
│  :2206       │     │                  │     │                  │
└─────────────┘     └──────────────────┘     └──────────────────┘
```

---

## 1. Get Your API Token

1. Go to https://developers.hostinger.com/
2. Sign in with your Hostinger account
3. Generate an API token with VPS management permissions
4. Copy the token — you'll need it for the next step

**API Reference**: https://developers.hostinger.com/ — documents all available endpoints for VPS listing, creation, management, SSH access, and account info.

---

## 2. Store the API Token

### Local development (`.env` file)

```bash
# In the project root (/home/hacker/Desktop/PMVPN/)
echo "HOSTINGER_API_KEY=your_token_here" > .env
chmod 600 .env
```

The `.env` file is in `.gitignore` — it will never be committed.

### VPS deployment (`/opt/pmvpn/.env`)

```bash
# On the VPS
cat > /opt/pmvpn/.env << 'EOF'
HOSTINGER_API_KEY=your_token_here
PMVPN_BASE_PORT=2200
PMVPN_HOST=0.0.0.0
PMVPN_FLEET_BASE_PORT=2600
LOG_LEVEL=info
NODE_ENV=production
EOF
chmod 600 /opt/pmvpn/.env
```

The systemd service loads this via `EnvironmentFile=/opt/pmvpn/.env`.

---

## 3. Configure Claude Code MCP

### Option A: Project-level MCP config

Create `.claude/mcp.json` in the project root:

```json
{
  "inputs": [
    {
      "id": "api_token",
      "type": "promptString",
      "description": "Enter your Hostinger API token"
    }
  ],
  "servers": {
    "hostinger-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "hostinger-api-mcp@latest"
      ],
      "env": {
        "API_TOKEN": "${input:api_token}"
      }
    }
  }
}
```

Then add to `.claude/settings.local.json`:

```json
{
  "enabledMcpjsonServers": [
    "hostinger-mcp",
    "vibekit-mcp",
    "kappa"
  ]
}
```

### Option B: Environment variable (no prompt)

If you prefer to load the token from `.env` without prompting:

```json
{
  "servers": {
    "hostinger-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "hostinger-api-mcp@latest"
      ],
      "env": {
        "API_TOKEN": "${env:HOSTINGER_API_KEY}"
      }
    }
  }
}
```

---

## 4. How pmVPN Uses the MCP

The Hostinger provider (`pmvpn/modules/hostinger/provider.ts`) spawns the MCP process on demand:

```typescript
// Spawns: npx hostinger-api-mcp@latest
// Env: API_TOKEN from HOSTINGER_API_KEY
// Protocol: JSON-RPC 2.0 over stdin/stdout
// Timeout: 30 seconds per call

const request = {
  jsonrpc: '2.0',
  id: Date.now(),
  method: 'tools/call',
  params: {
    name: 'list_vps_instances',  // MCP tool name
    arguments: {}                 // tool parameters
  }
};
```

No persistent process. Each call spawns `npx hostinger-api-mcp@latest`, sends one JSON-RPC request over stdin, reads the response from stdout, and the process exits.

### Available MCP Tools

| Tool | Description | Used By |
|------|-------------|---------|
| `list_vps_instances` | List all VPS in account | `hostinger-list-vps` / `hvps` |
| `get_vps_details` | CPU, memory, disk, status | `hostinger-get-details` / `hdetails` |
| `create_vps` | Provision new VPS | `hostinger-create-vps` / `hcreate` |
| `restart_vps` | Restart a VPS | `hostinger-restart-vps` / `hrestart` |
| `get_ssh_access` | Get SSH credentials | `hostinger-get-ssh-access` / `hssh` |
| `delete_vps` | Terminate a VPS | (admin only) |
| `get_account_info` | Verify API connection | Used internally on startup |

### Provider Gateway API (port 2206)

The MCP tools are exposed through the Provider Gateway HTTP API:

```bash
# List providers
curl http://localhost:2206/providers
# → { "providers": [{ "name": "hostinger", "displayName": "Hostinger VPS" }] }

# List available commands
curl http://localhost:2206/commands
# → 5 hostinger commands + 7 fleet commands

# Server status
curl http://localhost:2206/status
# → { "modules": 2, "cloudProviders": 1, ... }
```

---

## 5. Architecture

### Module Loading

```
pmvpn-server-entry.ts
  │
  ├── ModuleRegistry (pmvpn/modules/registry.ts)
  │     │
  │     ├── HostingerModule (pmvpn/modules/hostinger/index.ts)
  │     │     │
  │     │     ├── HostingerProvider (pmvpn/modules/hostinger/provider.ts)
  │     │     │     └── callMcpTool() → spawns npx hostinger-api-mcp@latest
  │     │     │
  │     │     └── 5 commands registered (hvps, hcreate, hdetails, hssh, hrestart)
  │     │
  │     └── FleetModule (pmvpn/modules/fleet/index.ts)
  │           └── 7 commands registered (fleet-status, fleet-discover, etc.)
  │
  ├── Provider Gateway :2206 → routes to HostingerProvider
  └── Fleet Control    :2600 → fleet coordination
```

### File Layout

```
pmvpn/
  modules/
    hostinger/
      index.ts          # HostingerModule — registers commands with module registry
      provider.ts       # HostingerProvider — MCP bridge, server discovery, provisioning
    core/
      cloud-provider.ts # CloudProvider abstract class (Hostinger implements this)
      provider-gateway.ts # HTTP API on port 2206
    fleet/
      control-plane.ts  # Fleet API on port 2600
      events.ts         # WebSocket events on port 2601
      mesh.ts           # Inter-node mesh on port 2602
      metrics.ts        # Prometheus metrics on port 2603
      index.ts          # FleetModule — registers fleet commands
    registry.ts         # ModuleRegistry — dynamic module loading
```

### Environment Variable Flow

```
.env (local) or /opt/pmvpn/.env (VPS)
  │
  HOSTINGER_API_KEY
  │
  ├── process.env.HOSTINGER_API_KEY
  │     │
  │     └── HostingerProvider.initialize()
  │           │
  │           this.apiKey = config.apiKey || process.env.HOSTINGER_API_KEY
  │           │
  │           └── callMcpTool() → spawn env: { API_TOKEN: this.apiKey }
  │                 │
  │                 └── npx hostinger-api-mcp@latest reads API_TOKEN
  │                       │
  │                       └── HTTPS → api.hostinger.com
```

---

## 6. Verify the Integration

### Check the provider loaded

```bash
curl -s http://localhost:2206/status | jq .
```

Expected output:
```json
{
  "modules": 2,
  "cloudProviders": 1,
  "moduleList": [
    { "name": "hostinger-cloud-provider", "version": "1.0.0", "commands": 5, "hasProvider": true },
    { "name": "fleet-coordination", "version": "1.0.0", "commands": 7, "hasProvider": false }
  ],
  "providerList": [
    { "name": "hostinger", "displayName": "Hostinger VPS" }
  ]
}
```

### Check from the live VPS

```bash
curl -s http://168.231.126.58:2206/status | jq .providerList
curl -s http://168.231.126.58:2206/commands | jq '.commands[] | .name'
```

### Check server logs for MCP initialization

```bash
# Local
cat server.log | grep -i hostinger

# VPS
journalctl -u pmvpn | grep -i hostinger
```

Expected log lines:
```
Cloud provider registered: Hostinger VPS
Hostinger provider initialized successfully
Hostinger module loaded successfully
Module loaded: hostinger-cloud-provider
```

---

## 7. Hostinger API Endpoints

Full documentation: https://developers.hostinger.com/

Key endpoints used by the MCP:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/vps/v1/virtual-machines` | GET | List all VPS instances |
| `/api/vps/v1/virtual-machines/{id}` | GET | Get VPS details |
| `/api/vps/v1/virtual-machines` | POST | Create new VPS |
| `/api/vps/v1/virtual-machines/{id}/restart` | POST | Restart VPS |
| `/api/vps/v1/virtual-machines/{id}` | DELETE | Delete VPS |
| `/api/vps/v1/virtual-machines/{id}/ssh-access` | GET | SSH credentials |
| `/api/billing/v1/account` | GET | Account info |

Store access to this documentation in your browser bookmarks or reference it from the client's local storage for quick lookup.

---

## 8. Security

- **API token** is stored in `.env` files with `chmod 600` permissions
- `.env` is in `.gitignore` — never committed to git
- The MCP process runs ephemerally — no persistent daemon holding the token
- The token is passed via environment variable, not command-line argument (invisible in `ps`)
- On the VPS, the systemd service loads the token from `EnvironmentFile` (root-only readable)
- The Provider Gateway (port 2206) requires wallet signature authentication for mutating operations

---

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Hostinger API key is required" | Set `HOSTINGER_API_KEY` in `.env` or export it |
| MCP timeout (30s) | Check network connectivity to api.hostinger.com |
| "MCP process failed" | Run `npx hostinger-api-mcp@latest` manually to see errors |
| Provider not in status | Check server logs for initialization errors |
| "Module loaded but provider initialization failed" | API key is set but invalid — regenerate at developers.hostinger.com |
| Commands return empty | API token may lack VPS permissions — check token scopes |

### Manual MCP test

```bash
# Test the MCP process directly
export API_TOKEN="your_token_here"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_account_info","arguments":{}}}' | npx hostinger-api-mcp@latest
```

---

## 10. Adding More Providers

The modular architecture supports adding new cloud providers following the same pattern:

```typescript
// pmvpn/modules/yourprovider/provider.ts
export class YourProvider extends CloudProvider {
  name = 'yourprovider';
  displayName = 'Your Provider';

  async initialize(config: any) { /* ... */ }
  async discoverServers(walletAddress: string) { /* ... */ }
  async executeCommand(command: string, params: any) { /* ... */ }
}
```

Register in the entry point alongside Hostinger. The Provider Gateway automatically exposes the new provider's commands.

---

*MCP connects your wallet-authenticated infrastructure to cloud provider APIs. No passwords. No dashboards. Just sign and manage.*

# pmVPN Remote Control — Claude Code from Your Pocket

*Handheld AI-powered server administration through wallet-authenticated infrastructure*

---

## Why This Exists

You are sitting on a bus. Your production server throws an alert. You pull out your phone, open the Claude app, and tell it: "check the nginx logs on dev-box and restart the service if it crashed." Claude reads the logs, diagnoses the issue, restarts the service, and confirms it's healthy. You never opened a terminal. You never typed a command. You never even unlocked your laptop.

This is what pmVPN Remote Control does.

It connects Claude Code — Anthropic's AI coding assistant — to your pmVPN infrastructure, and makes the entire thing accessible from a phone, a tablet, a browser on a borrowed computer, or any device that can reach claude.ai. Claude runs locally on your machine. Your files, your MCP servers, your project configuration, your wallet authentication — all of it stays where it is. The phone is just a window.

---

## The Poor Man's VPN

### What pmVPN Is

pmVPN is a wallet-authenticated remote access system. It replaces SSH keys, passwords, and VPN subscriptions with a single concept: **your cryptocurrency wallet is your identity**.

You sign a cryptographic challenge with your wallet. The server verifies the signature using pure local math — no blockchain, no RPC, no third-party service. If the signature matches a registered wallet address, eight encrypted ports open between you and your machine:

| Port | Service | What You Get |
|------|---------|-------------|
| +0 | SSH Shell | Interactive terminal. Run anything — bash, vim, htop, claude |
| +1 | SFTP | File transfer. Browse, upload, download your server's filesystem |
| +2 | SSH Exec | Non-interactive commands. Scripting, cron, automation |
| +3 | Challenge API | Nonce endpoint for wallet authentication |
| +4 | WS Bridge | Browser terminal + file browser over WebSocket |
| +5 | File Sync | Bidirectional file synchronization |
| +6 | Claude AI | Dedicated channel for AI assistant traffic |
| +7 | Admin | Server health, sessions, metrics |

Every connection is encrypted end-to-end via SSH or WebSocket. Every authentication is a wallet signature that expires in 60 seconds and can never be replayed.

### Why "Poor Man's"

The name is a tribute to [sshuttle](https://github.com/sshuttle/sshuttle), Avery Pennarun's "poor man's VPN" that proved you don't need root, kernel modules, or a VPN subscription to tunnel traffic securely over SSH.

pmVPN extends the philosophy: you don't need a VPN provider, a password manager, SSH key files, a certificate authority, or a cloud service. You need a wallet and a server. The server is five npm packages and an Ed25519 host key. The client is a module inside your wallet. Everything else is eliminated.

**Poor man** is not a limitation. It is a design constraint. Minimal dependencies. Minimal attack surface. Minimal trust. Maximum sovereignty.

### The Problem pmVPN Solves

Traditional remote access has three fundamental weaknesses:

1. **Passwords are shared secrets.** They exist in your memory, in a password manager, on a Post-it note, in a breached database. They are symmetric — anyone who has the password IS you to the server.

2. **SSH keys are files.** They sit on disk, get copied between machines, get forgotten on decommissioned laptops, get left in backups. They require manual distribution — scp the key, edit authorized_keys, hope you got the permissions right.

3. **VPN subscriptions are third parties.** Your traffic routes through someone else's infrastructure. You pay them. You trust them. They see your traffic metadata. When they go down, you lose access.

pmVPN eliminates all three:

- **Wallet signatures are asymmetric proofs.** The private key never leaves your device. The signature proves you control the key without revealing it. Mathematical certainty, not institutional trust.
- **No key files to manage.** Your wallet IS the key. It works on every device where your wallet exists. No scp. No authorized_keys. No file permissions.
- **Self-hosted.** Your server, your hardware, your rules. No subscription, no third party, no metadata leakage. The only thing between you and your machine is the SSH channel you encrypted yourself.

---

## Why a Handheld App Matters

### The Phone Is the Computer

For an increasing number of people worldwide, a smartphone is their only computer. For many more, it is their primary computer — the device that is always powered on, always connected, always in their pocket.

Server administration has not adapted to this reality. Terminal emulators on phones are cramped, hostile interfaces designed for desktop keyboards. SSH clients on mobile require manual key management. VPN apps require subscriptions and trust in third-party providers.

pmVPN with Remote Control changes the interaction model entirely:

**You don't type commands. You describe intent.**

Instead of memorizing rsync flags, you say: "sync the logs directory to /backup/logs-2026-03-28." Instead of writing a sed one-liner, you say: "replace all instances of the old API endpoint with the new one across the config files." Instead of navigating man pages on a 6-inch screen, you say: "show me the disk usage for the top 10 largest directories."

Claude translates intent into action. Your phone becomes a natural language interface to your entire infrastructure.

### Mobile Use Cases

**Emergency response.** Server alert at 2 AM. Open Claude on your phone. "Check what's consuming all the memory on prod-1 and kill it if it's the known memory leak in the image processor." Claude runs `ps aux`, identifies the process, cross-references it with your project context, kills it, and verifies the system recovered. You never left bed.

**Travel administration.** You're at a conference. A colleague needs access to the staging server. Open Claude from your phone. "Add wallet 0xABC...DEF to the staging server as user 'guest' with read-only access." Claude edits wallets.json, restarts the pmVPN service, and confirms the new user can authenticate.

**Monitoring from anywhere.** Walking the dog. Quick check: "How's the build going on dev-box?" Claude reads the build output, summarizes the status, and reports any errors. If something failed, you tell it how to fix it — still walking the dog.

**Multi-machine operations.** You manage five servers. "Run `apt update && apt upgrade -y` on all my Debian machines and report any that need a reboot." Claude can work through your pmVPN multi-host connections, executing and reporting.

**Learning and exploration.** You're new to a codebase. On the train, you ask: "Walk me through how the authentication flow works in this project." Claude reads the source files, traces the flow, and explains it — with references to the exact files and line numbers.

### Why Not Just Use a Terminal App?

You can. pmVPN's WebSocket bridge (port +4) already gives you a full xterm.js terminal from any browser on your phone. The Tauri client builds to an Android APK. You have terminal access.

But Remote Control adds something a terminal cannot provide: **an AI that understands your project.**

Claude Code has read your codebase. It knows your file structure, your configuration, your dependencies, your recent git history. When you say "fix the failing test," it doesn't need you to specify which test, which file, or what the error message says. It finds the failure, reads the test, reads the code under test, identifies the bug, fixes it, and runs the test again.

A terminal gives you a command line. Remote Control gives you a colleague who has already read every file in your project and never sleeps.

---

## The Importance of pmVPN

### Digital Sovereignty

pmVPN is infrastructure for self-sovereignty. In an era where cloud providers can deplatform you, VPN services can log your traffic, and password databases can be breached, pmVPN offers a different model:

- **You own the server.** It runs on your hardware — a VPS, a Raspberry Pi, a rack in your closet, a container in your homelab.
- **You own the identity.** Your wallet is a cryptographic keypair you generated yourself. No email registration. No phone number verification. No identity provider.
- **You own the connection.** SSH is a proven protocol with 30 years of security research behind it. The encryption is end-to-end. The algorithms are industry-hardened (Ed25519, curve25519, chacha20-poly1305).
- **You own the data.** Nothing leaves your machine. No telemetry. No analytics. No cloud relay. The server logs are on your disk, not someone else's.

### Minimal Trust Surface

Every dependency is a trust decision. Every cloud service is a counterparty. pmVPN minimizes both:

**Server: 5 npm packages.** ssh2 (SSH protocol), node-pty (PTY spawning), viem (signature verification), ws (WebSocket), pino (logging). No Express. No database. No ORM. No cloud SDK. Every line of dependency code is auditable.

**Authentication: zero network calls.** Wallet signature verification is pure local math. `viem.verifyMessage()` recovers the signer address from the signature using secp256k1 elliptic curve recovery. No RPC to a blockchain node. No API call to an identity provider. No DNS lookup. The server can verify your identity in an air-gapped network.

**Protocol: documented and open.** The PM tunnel protocol is a simple binary format with an 8-byte header. The specification fits in one markdown file. No proprietary handshakes. No obfuscated negotiation. Every byte on the wire is accounted for.

### The Wallet-as-Identity Paradigm

pmVPN implements a specific thesis: **a cryptocurrency wallet already solves the identity problem for remote access.**

A wallet holds a private key. That key produces signatures. Those signatures prove identity without revealing the key. The verification is pure mathematics — the same secp256k1 curve used to secure billions of dollars in cryptocurrency secures your SSH session.

This is not a theoretical exercise. This is a practical observation:

- Millions of people already have wallets (MetaMask, hardware wallets, mobile wallets).
- Those wallets already implement EIP-191 personal_sign.
- The signature verification code is one function call: `viem.verifyMessage()`.
- The security properties (asymmetric, non-repudiable, replay-resistant with nonces) are exactly what SSH authentication needs.

pmVPN simply connects these existing pieces. Your wallet signs a challenge. The server verifies the signature. The SSH channel opens. No new cryptographic infrastructure required.

### Infrastructure for the Next Decade

The convergence of three trends makes pmVPN increasingly relevant:

1. **AI-assisted administration.** Claude Code and similar tools are transforming how developers interact with servers. Natural language replaces command memorization. Intent replaces syntax. The server becomes conversational.

2. **Mobile-first computing.** The smartphone is the universal computing device. Server administration tools that require a desktop are excluding the majority of the world's computing capacity.

3. **Self-hosting renaissance.** Rising cloud costs, platform deplatforming, and privacy concerns are driving a return to self-hosted infrastructure. People want their own machines. They need tools to access them.

pmVPN sits at the intersection of all three. It gives you AI-powered, mobile-accessible, self-hosted remote access with wallet-based identity. No subscription. No third party. No permission required.

---

## Claude Remote Control — How It Works

### Architecture

```
  ┌─────────────────────────────┐
  │    Your Phone / Tablet /     │
  │    Browser on Any Device     │
  │                              │
  │  claude.ai/code  or  Claude  │
  │  mobile app (iOS / Android)  │
  └──────────────┬───────────────┘
                 │
          HTTPS (TLS, port 443)
          Outbound only — no
          inbound ports opened
                 │
  ┌──────────────┴───────────────┐
  │      Anthropic API            │
  │   (message relay only —       │
  │    no code execution,         │
  │    no file access)            │
  └──────────────┬───────────────┘
                 │
          HTTPS polling
          (outbound from your machine)
                 │
  ┌──────────────┴───────────────┐
  │    Your Machine               │
  │                               │
  │  ┌─────────────────────────┐  │
  │  │    Claude Code process   │  │
  │  │    (runs locally)        │  │
  │  │                          │  │
  │  │  ┌───────────────────┐  │  │
  │  │  │   pmVPN project    │  │  │
  │  │  │   directory        │  │  │
  │  │  │                    │  │  │
  │  │  │  server/           │  │  │
  │  │  │  client/           │  │  │
  │  │  │  shared/           │  │  │
  │  │  │  docs/             │  │  │
  │  │  │  .claude/          │  │  │
  │  │  │  MCP servers       │  │  │
  │  │  └───────────────────┘  │  │
  │  └─────────────────────────┘  │
  │                               │
  │  ┌─────────────────────────┐  │
  │  │   pmVPN Server           │  │
  │  │   8 ports listening      │  │
  │  │   wallet auth active     │  │
  │  └─────────────────────────┘  │
  └───────────────────────────────┘
```

### Key Properties

- **Claude runs locally.** The AI process executes on your machine. It reads your files, runs your tools, uses your MCP servers. Nothing moves to the cloud except the conversation messages.
- **No inbound ports.** Claude Code makes outbound HTTPS requests to the Anthropic API and polls for work. Your firewall does not need any new rules.
- **Multi-device sync.** The conversation stays synchronized across your terminal, browser, and phone. Send a message from any surface.
- **Auto-reconnect.** If your laptop sleeps or your network drops, the session reconnects automatically when your machine comes back online.
- **Worktree isolation.** Each concurrent session can get its own git worktree, preventing file conflicts when multiple people connect.

### What Remote Control Can Do

Inside a Remote Control session, Claude has full access to:

| Capability | How It Works |
|-----------|-------------|
| **Read and edit files** | Direct filesystem access to your pmVPN project and server |
| **Run shell commands** | Execute builds, tests, deployments, diagnostics |
| **Use MCP servers** | Algorand tools (vibekit-mcp), blockchain analysis (Blockscout), any configured MCP |
| **Git operations** | Commit, branch, diff, log, merge — full git workflow |
| **Package management** | pnpm install, build, test across the monorepo |
| **Server administration** | Start/stop pmVPN server, check logs, modify configuration |
| **Network diagnostics** | curl endpoints, check port status, debug connections |
| **Code analysis** | Search codebase, trace call chains, explain architecture |

### What It Cannot Do

- **Access other machines directly.** Claude operates within your local environment. To reach remote pmVPN servers, it uses the tools available on your machine (SSH, curl, etc.).
- **Survive process termination.** If the Claude Code process stops, the session ends. Use `remote-control.sh` to start a new one.
- **Work without internet.** The relay through Anthropic's API requires network access. Extended outages (>10 minutes) terminate the session.
- **Use API keys.** Remote Control requires claude.ai OAuth authentication, not API keys.

---

## Setup

### Prerequisites

| Requirement | Details |
|-------------|---------|
| Claude Code | v2.1.51 or later (`claude --version`) |
| Subscription | Pro, Max, Team, or Enterprise on claude.ai |
| Authentication | `claude auth login` completed with claude.ai account |
| Workspace trust | Run `claude` in the pmVPN directory at least once |

### Installation

Claude Code Remote Control requires no additional installation beyond Claude Code itself. The `remote-control.sh` script in this repository provides a convenient launcher.

```bash
# Install Claude Code (if not already installed)
npm install -g @anthropic-ai/claude-code

# Authenticate
claude auth login

# Trust the workspace (first run)
cd /path/to/pmvpn
claude
# Accept the workspace trust dialog, then exit
```

### Team and Enterprise

On Team and Enterprise plans, an administrator must enable Remote Control in the [Claude Code admin settings](https://claude.ai/admin-settings/claude-code) before any team member can use it.

---

## Usage

### Quick Start

```bash
# From the pmvpn directory
./remote-control.sh
```

This starts a Remote Control server with:
- Session name: **pmVPN**
- Spawn mode: **worktree** (each session gets isolated git worktree)
- Capacity: **8** concurrent sessions
- Verbose logging enabled

A session URL and QR code appear in the terminal. Open the URL in a browser or scan the QR code with the Claude mobile app.

### Three Modes

#### Server Mode (Default)

```bash
./remote-control.sh
```

Dedicated server process. Waits for remote connections. Supports multiple concurrent sessions. Best for persistent availability — leave it running in a tmux or screen session.

#### Interactive Mode

```bash
./remote-control.sh --interactive
```

Full interactive Claude Code session in your terminal that is also accessible remotely. You can type locally AND send messages from your phone simultaneously. Best for active development where you want both local and remote access.

#### Attach Mode

```bash
./remote-control.sh --attach
```

Shows instructions for attaching Remote Control to an already-running Claude Code session using the `/remote-control` slash command.

### Connecting from Your Phone

1. **Install the Claude app** — [iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) or [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude)
2. **Start Remote Control** — `./remote-control.sh` on your machine
3. **Scan the QR code** — press spacebar to show/hide it
4. **Or open claude.ai/code** — find the "pmVPN" session in the list (green dot = online)
5. **Start talking** — "check the server status" or "read the last 50 lines of the pino log"

### Connecting from a Browser

Open [claude.ai/code](https://claude.ai/code) in any browser. The pmVPN session appears in the sidebar with a computer icon and green status dot. Click to connect.

### Enable for All Sessions

To automatically enable Remote Control for every Claude Code session (not just when explicitly started):

1. Run `claude` in the pmVPN directory
2. Type `/config`
3. Set **Enable Remote Control for all sessions** to `true`

---

## Integration with pmVPN Server

### Running Both Together

pmVPN Remote Control and the pmVPN server are complementary:

```bash
# Terminal 1: Start pmVPN server (8 ports)
cd pmvpn/server
pnpm run dev

# Terminal 2: Start Remote Control (Claude AI access)
cd pmvpn
./remote-control.sh
```

Or in a single tmux session:

```bash
tmux new-session -d -s pmvpn 'cd pmvpn/server && pnpm run dev'
tmux split-window -h 'cd pmvpn && ./remote-control.sh'
tmux attach -t pmvpn
```

### systemd Integration

For production, add a companion service unit:

```ini
# /etc/systemd/system/pmvpn-remote-control.service
[Unit]
Description=pmVPN Remote Control — Claude Code
After=network-online.target pmvpn.service
Wants=pmvpn.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/opt/pmvpn/pmvpn
ExecStart=/opt/pmvpn/pmvpn/remote-control.sh
Restart=on-failure
RestartSec=30
Environment=SESSION_NAME=pmVPN-prod
Environment=SPAWN_MODE=worktree
Environment=CAPACITY=4

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable pmvpn-remote-control
sudo systemctl start pmvpn-remote-control
```

### Port +6: Claude AI Channel

pmVPN reserves port +6 (default 2206) as a dedicated SSH channel for AI assistant traffic. This port is architecturally separate from the general shell (port +0) to:

- **Isolate AI traffic** from interactive shell sessions
- **Enable dedicated rate limiting** for AI workloads
- **Provide audit separation** — AI commands logged separately from human commands
- **Allow future direct Claude API integration** through the SSH tunnel

Remote Control uses a different mechanism (outbound HTTPS to Anthropic API) but serves the same goal: AI-powered access to your pmVPN infrastructure.

---

## Security Considerations

### What Flows Through Anthropic's API

| Data | Flows Through API? | Notes |
|------|--------------------|-------|
| Conversation messages | Yes | Your prompts and Claude's responses |
| File contents | Only when Claude reads them | Sent as context for AI processing |
| Command output | Only when Claude runs them | Returned as tool results |
| Wallet private keys | **Never** | Keys stay in your wallet / bankon_vault |
| SSH host keys | **Never** | Stored locally at ~/.pmvpn/hostkey |
| Wallet-to-user map | **Never** | Local config file |

### Transport Security

- All traffic between your machine and Anthropic API travels over TLS (HTTPS, port 443)
- Multiple short-lived credentials, each scoped to a single purpose
- No inbound ports opened on your machine
- Same transport security as any Claude Code session

### Recommendations

1. **Use worktree spawn mode** — prevents concurrent sessions from conflicting on files
2. **Set reasonable capacity** — default 8 is plenty; reduce for sensitive environments
3. **Run in tmux/screen** — if the terminal closes, the session ends
4. **Review sensitive operations** — Claude will ask for confirmation before destructive actions
5. **Keep Claude Code updated** — security fixes ship in CLI updates

---

## Comparison: Remote Access Methods

pmVPN offers multiple ways to access your infrastructure remotely. Choose based on your situation:

| Method | Device | AI? | Setup | Best For |
|--------|--------|-----|-------|----------|
| **pmVPN Terminal** (port +0) | Desktop SSH client | No | SSH connect | Power users, scripting |
| **pmVPN Browser** (port +4) | Any browser | No | Open URL | Quick access, no install |
| **pmVPN Android APK** | Android phone | No | Install APK | Native mobile terminal |
| **Remote Control** | Phone / tablet / browser | **Yes** | `./remote-control.sh` | **AI-assisted administration** |
| **Claude AI Channel** (port +6) | SSH to port +6 | Yes | SSH + run claude | Direct Claude on server |

Remote Control is the recommended method for mobile access because it combines the convenience of a phone interface with the intelligence of an AI that understands your project.

---

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| `claude: command not found` | Install: `npm install -g @anthropic-ai/claude-code` |
| `Remote Control requires a claude.ai subscription` | Run `claude auth login`, choose claude.ai |
| `Remote Control requires a full-scope login token` | Don't use `CLAUDE_CODE_OAUTH_TOKEN`; run `claude auth login` |
| Session not appearing on phone | Ensure phone and machine use same claude.ai account |
| Session disconnects after ~10 min | Network outage — check connectivity, restart with `./remote-control.sh` |
| `ANTHROPIC_API_KEY` conflicts | Unset it: `unset ANTHROPIC_API_KEY` before starting |
| QR code not showing | Press spacebar in server mode terminal |

### Diagnostics

```bash
# Check version (must be >= 2.1.51)
claude --version

# Check auth status
claude auth status

# Run with verbose logging
./remote-control.sh

# Check pmVPN server health
curl http://localhost:2207/status
```

---

## The Vision: Infrastructure from Your Pocket

Imagine this workflow:

1. **Morning.** You start `./remote-control.sh` on your development machine. It sits in a tmux session, ready.

2. **Commute.** On the bus, you open Claude on your phone. "What's the status of the feature branch? Run the tests and tell me if anything broke overnight."

3. **Lunch.** A teammate pings you about a bug. You open Claude on your phone. "Find where we handle the WebSocket auth timeout and add a retry with exponential backoff. Run the tests after."

4. **Meeting.** You need a deployment artifact. Under the table, you type: "Build the server, create a Docker image tagged v0.1.1, and push it to the registry." Claude handles the multi-step build while you nod along to the presentation.

5. **Evening.** On the couch, you review the day's work. "Show me the git log for today. Summarize what changed." Claude reads the commits and gives you a concise changelog.

You never opened a laptop outside of work. You never memorized a docker command. You never wrote a deployment script. You described what you wanted, and an AI that knows your entire codebase made it happen — from your pocket.

This is what pmVPN Remote Control enables. Not a terminal on a phone. A **collaborator** on a phone.

---

## Related Documentation

| Document | What It Covers |
|----------|----------------|
| **[README.md](../README.md)** | Project overview, architecture, authentication, 8 ports |
| **[USAGE.md](USAGE.md)** | Step-by-step server + client setup |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Production: systemd, Docker, firewall |
| **[ANDROID.md](ANDROID.md)** | Android build, APK install, browser fallback |
| **[CLIENT.md](CLIENT.md)** | Standalone client + PARSEC module |
| **[PROTOCOL.md](PROTOCOL.md)** | PM tunnel wire format specification |
| **[BOOTSTRAP.md](BOOTSTRAP.md)** | Self-installation and key exchange |
| **[DEVELOPMENT.md](DEVELOPMENT.md)** | Roadmap and phase status |

---

*Your wallet is your key. Your signature is your password. Your phone is your terminal. Claude is your collaborator.*

*Professor Codephreak — cypherpunk2048*

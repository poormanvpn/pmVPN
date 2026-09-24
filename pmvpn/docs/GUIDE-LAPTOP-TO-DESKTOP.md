# Guide: Connect Your Laptop to Your Desktop

*Remote desktop access with pmVPN — no root required on either machine*

---

## What You'll Build

Your laptop connects to your desktop over the local network (or the internet). The pmVPN server runs on your desktop as your regular user — no root, no sudo, no system service installation. You deploy the server remotely from your laptop and connect with your wallet.

```
  ┌──────────────┐        LAN / Internet       ┌──────────────┐
  │  Laptop       │ ◄────────────────────────► │  Desktop       │
  │  (client)     │   wallet-signed SSH tunnel  │  (server)      │
  │               │                             │                │
  │  Browser +    │                             │  pmVPN server  │
  │  MetaMask     │                             │  port 8200+    │
  │               │                             │  runs as $USER │
  └──────────────┘                             └──────────────┘
```

**Key feature of this guide:** Everything runs as your normal user. No `sudo`. No root. No system-level changes on either machine. This satisfies environments where you don't have admin privileges — shared workstations, locked-down corporate desktops, university machines, or any box where you just have a user account.

---

## Prerequisites

| Item | Details |
|------|---------|
| Desktop | Linux, macOS, or WSL2 on Windows. A user account you can log into. |
| Laptop | Any OS with a browser and MetaMask |
| Network | Both on the same LAN, or desktop reachable over the internet |
| Desktop access | One-time: SSH, VNC, physical keyboard, or any way to run commands |
| Node.js | 20+ on the desktop (can install without root — see below) |

---

## Part 1: Deploy the Server to Your Desktop (from Your Laptop)

This section shows how to remotely set up pmVPN on your desktop without root. You need one-time shell access to the desktop — either sitting in front of it, or via existing SSH.

### Option A: You have existing SSH access to the desktop

From your laptop:

```bash
# SSH into the desktop
ssh youruser@desktop-ip
```

Then continue with Step 1 below.

### Option B: You're sitting at the desktop

Open a terminal on the desktop and continue with Step 1.

### Option C: Remote deploy via pmVPN bootstrap from the laptop

If pmVPN is already running on your laptop and you have basic SSH access to the desktop, use the bootstrap tool in the pmVPN client:

1. Open `http://localhost:1420/` on your laptop
2. Connect to the desktop via the existing SSH connection
3. Click **Bootstrap Remote Server** in the pmVPN tools panel
4. pmVPN uploads itself via SFTP and starts on the desktop

See [BOOTSTRAP.md](BOOTSTRAP.md) for full details on this method.

---

## Step 1: Install Node.js Without Root

If Node.js isn't installed on the desktop and you don't have root:

```bash
# Install nvm (Node Version Manager) — no root needed
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc

# Install Node.js 20
nvm install 20

# Enable pnpm
corepack enable pnpm

# Verify
node --version   # v20.x.x
pnpm --version   # 9.x.x
```

Everything installs under `~/.nvm/` — no system directories touched.

---

## Step 2: Install pmVPN on the Desktop

```bash
cd ~
git clone https://github.com/poormanvpn/pmVPN.git
cd pmVPN/pmvpn/server
pnpm install
pnpm run build
```

All files live under `~/pmVPN/`. Nothing written outside your home directory.

---

## Step 3: Configure (No Root)

### Set your wallet mapping

```bash
mkdir -p ~/.pmvpn
cat > ~/.pmvpn/wallets.json << 'EOF'
{
  "0xYourMetaMaskAddress": {
    "user": "YOURUSERNAME",
    "role": "admin"
  }
}
EOF
```

Replace `0xYourMetaMaskAddress` with your wallet address and `YOURUSERNAME` with your Linux username on the desktop (`whoami` to check).

### Choose unprivileged ports

Without root, you can't bind ports below 1024. pmVPN defaults to 2200, which is fine — but if another service uses that range, pick any open range above 1024:

```bash
# Check if 8200 is free
ss -tlnp | grep 8200
# No output = port is free
```

---

## Step 4: Start the Server (No Root)

### Foreground (testing)

```bash
cd ~/pmVPN/pmvpn/server
PMVPN_BASE_PORT=8200 node dist/index.js
```

### Background (persistent, no systemd)

```bash
# Using nohup
cd ~/pmVPN/pmvpn/server
nohup env PMVPN_BASE_PORT=8200 node dist/index.js > ~/.pmvpn/server.log 2>&1 &
echo $! > ~/.pmvpn/server.pid
```

### Auto-start on login (no root, no systemd)

**Option 1: crontab**

```bash
(crontab -l 2>/dev/null; echo "@reboot cd ~/pmVPN/pmvpn/server && PMVPN_BASE_PORT=8200 node dist/index.js >> ~/.pmvpn/server.log 2>&1") | crontab -
```

**Option 2: systemd user service (no root)**

This uses `systemd --user`, which runs under your user account — no sudo required:

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/pmvpn.service << 'EOF'
[Unit]
Description=pmVPN Server (user)
After=default.target

[Service]
Type=simple
WorkingDirectory=%h/pmVPN/pmvpn/server
ExecStart=%h/.nvm/versions/node/v20.18.0/bin/node dist/index.js
Environment=PMVPN_BASE_PORT=8200
Environment=PMVPN_HOST=0.0.0.0
Environment=LOG_LEVEL=info
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# Enable and start (no sudo)
systemctl --user daemon-reload
systemctl --user enable pmvpn
systemctl --user start pmvpn
systemctl --user status pmvpn

# Make it survive logout (important!)
loginctl enable-linger $USER
```

**Note on `enable-linger`:** This one command may require admin assistance if your system restricts it. If you can't enable linger, the service stops when you log out of the desktop. Use the `crontab` method instead, which starts the server on next boot.

Check the actual node path with `which node` and update the `ExecStart` path accordingly.

### View logs

```bash
# If using systemd --user:
journalctl --user -u pmvpn -f

# If using nohup:
tail -f ~/.pmvpn/server.log
```

---

## Step 5: Connect from Your Laptop

### Find the desktop's IP

On the desktop:

```bash
hostname -I | awk '{print $1}'
# e.g., 192.168.1.10
```

### Connect via browser

1. On your laptop, open `http://192.168.1.10:1420/`
2. Click **Connect MetaMask**
3. Sign the challenge
4. You're in — full terminal, file browser, and P2P sharing

### Or add as a saved connection

In the pmVPN sidebar, click **[+]** and add:

| Field | Value |
|-------|-------|
| Name | Desktop |
| Host | 192.168.1.10 |
| Base Port | 8200 |

---

## Complete Example: Remote Deploy from Laptop to Desktop

This walkthrough covers the entire flow — deploying pmVPN to a desktop you can SSH into, without root on either machine.

### On your laptop

```bash
# 1. Verify you can reach the desktop
ssh youruser@192.168.1.10 "echo connected"

# 2. Upload pmVPN to the desktop
scp -r ~/pmVPN/pmvpn/server youruser@192.168.1.10:~/pmvpn-server/

# 3. SSH in and set up
ssh youruser@192.168.1.10
```

### Now on the desktop (via SSH from laptop)

```bash
# 4. Install node if needed (no root)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20
corepack enable pnpm

# 5. Install dependencies
cd ~/pmvpn-server
pnpm install
pnpm run build

# 6. Configure wallet
mkdir -p ~/.pmvpn
cat > ~/.pmvpn/wallets.json << 'EOF'
{
  "0xYourWalletAddress": { "user": "youruser", "role": "admin" }
}
EOF

# 7. Start server (background, survives SSH disconnect)
nohup env PMVPN_BASE_PORT=8200 node dist/index.js > ~/.pmvpn/server.log 2>&1 &

# 8. Verify it's running
curl -s http://localhost:8203/status
# Should return: {"version":"0.1.1","uptime":...,"wallets":1}

# 9. Set up auto-start (no root)
(crontab -l 2>/dev/null; echo "@reboot cd ~/pmvpn-server && PMVPN_BASE_PORT=8200 node dist/index.js >> ~/.pmvpn/server.log 2>&1") | crontab -

# 10. Disconnect — server keeps running
exit
```

### Back on your laptop

```bash
# 11. Open pmVPN client and connect
# Browser: http://192.168.1.10:1420/
# Or use the pmVPN client sidebar: add Desktop, host 192.168.1.10, port 8200
```

Sign with MetaMask. You now have wallet-authenticated terminal access to your desktop, deployed entirely from your laptop, with zero root privileges used.

---

## Why No Root Works

pmVPN's architecture is designed for unprivileged operation:

| Component | Why No Root Needed |
|-----------|-------------------|
| **Node.js** | Installed via `nvm` in `~/.nvm/` |
| **pnpm** | Runs from Node.js corepack — userland |
| **SSH server** | pmVPN's built-in SSH (ssh2 library) — not OpenSSH, no privileged ports required |
| **Host key** | Generated in `~/.pmvpn/hostkey` — your home directory |
| **Wallet config** | Stored in `~/.pmvpn/wallets.json` — your home directory |
| **Ports** | Any port >1024 works without root. Default unprivileged: 8200-8207 |
| **PTY** | `node-pty` spawns shells as the current user — no setuid needed in single-user mode |
| **Auto-start** | `crontab` or `systemd --user` — no system services modified |

The only operation that might require root is `loginctl enable-linger` for systemd user services to survive logout. If unavailable, `crontab @reboot` achieves the same result.

---

## Multi-User on the Desktop (Requires Root)

If multiple people need access to the desktop, each mapped to their own system user, the pmVPN server needs to spawn shells as different users. This requires root (or CAP_SETUID capability).

For the single-user case in this guide — where you deploy the server as yourself and connect as yourself — root is never needed. The server spawns your shell as you.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `EACCES` on port 2200 | Use an unprivileged port: `PMVPN_BASE_PORT=8200` |
| `nvm: command not found` | Run `source ~/.bashrc` or `source ~/.nvm/nvm.sh` |
| Server stops when SSH disconnects | Use `nohup ... &` or set up crontab/systemd user service |
| Can't reach desktop from laptop | Check `ip addr` on desktop, ensure both are on same network |
| `loginctl enable-linger` denied | Use `crontab @reboot` instead — works without admin |
| Laptop firewall blocks connection | This guide connects FROM laptop TO desktop. Only the desktop needs ports open. |
| `node-pty` build fails | Install build tools: `apt install build-essential` (needs root) or ask admin |

---

## Going Further

| Want to... | Read... |
|-----------|---------|
| Connect your phone to your laptop | [GUIDE-PHONE-TO-LAPTOP.md](GUIDE-PHONE-TO-LAPTOP.md) |
| Deploy on a Hostinger VPS | [GUIDE-HOSTINGER-VPS.md](GUIDE-HOSTINGER-VPS.md) |
| Bootstrap without any pre-existing SSH | [BOOTSTRAP.md](BOOTSTRAP.md) |
| Set up Claude AI remote control | [REMOTE-CONTROL.md](REMOTE-CONTROL.md) |
| Full deployment reference (systemd, Docker) | [DEPLOYMENT.md](DEPLOYMENT.md) |

---

*Your wallet is your key. Your user account is your castle. No root required.*

*Professor Codephreak — cypherpunk2048*

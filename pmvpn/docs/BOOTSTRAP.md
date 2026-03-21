# pmVPN Bootstrap — Server Self-Installation

*How pmVPN installs itself on a remote machine through an existing connection*

Updated: 2026-03-20

---

## Overview

When you have basic access to a remote machine (SSH, SFTP, or even just a shell), pmVPN can bootstrap its own server for future wallet-authenticated connections. This works at three privilege levels:

1. **User-level** — No admin needed. Runs in `~/` on an unprivileged port
2. **Admin-level** — Full installation with systemd, standard ports, multi-user
3. **Zero-SSH** — Machine has no SSH server. pmVPN brings its own over any channel

All methods use OpenSSH conventions where possible. The bootstrap is legitimate, auditable, and reversible.

---

## Method 1: User-Level Bootstrap (No Admin Required)

You have a regular user shell (via existing SSH, or any terminal access). No sudo needed.

### What Happens

1. Upload the pmVPN server binary (single `node` process + bundled deps) via SFTP or `scp`
2. Generate Ed25519 host key in `~/.pmvpn/`
3. Configure wallet mapping in `~/.pmvpn/wallets.json`
4. Start server on unprivileged ports (e.g., 8200–8207)
5. Set up OpenSSH `authorized_keys` for persistent access

### Steps

```bash
# From existing SSH connection to remote:

# 1. Create pmVPN directory
mkdir -p ~/.pmvpn ~/pmvpn-server

# 2. Upload server (via SFTP or scp from client)
# Client side: scp -r pmvpn/server/* user@remote:~/pmvpn-server/

# 3. Install (Node.js must be available — if not, use nvm)
cd ~/pmvpn-server
# If node isn't installed:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20
# Then:
npx pnpm install

# 4. Configure
cat > ~/.pmvpn/wallets.json << 'EOF'
{
  "0xYourWalletAddress": { "user": "$USER", "role": "admin" }
}
EOF

# 5. Start on unprivileged port (>1024)
PMVPN_BASE_PORT=8200 node dist/index.js &

# 6. Persist with crontab (no systemd needed)
(crontab -l 2>/dev/null; echo "@reboot cd ~/pmvpn-server && PMVPN_BASE_PORT=8200 node dist/index.js") | crontab -
```

### Port Selection

Unprivileged users can bind ports 1024–65535. Choose a range of 8 consecutive ports:

| Range | Use Case |
|-------|----------|
| 8200–8207 | Default unprivileged |
| 2200–2207 | Standard (requires root) |
| Custom | Set via `PMVPN_BASE_PORT` |

---

## Method 2: Admin-Level Bootstrap

You have sudo/root access. Full installation with system integration.

```bash
# 1. Install to /opt
sudo mkdir -p /opt/pmvpn
sudo cp -r pmvpn-server/* /opt/pmvpn/
cd /opt/pmvpn && sudo npx pnpm install

# 2. Create system service (see DEPLOYMENT.md for full systemd unit)
sudo cp pmvpn.service /etc/systemd/system/
sudo systemctl enable pmvpn
sudo systemctl start pmvpn

# 3. Open firewall
sudo ufw allow 2200:2207/tcp
```

---

## Method 3: Zero-SSH Bootstrap

The remote machine has **no SSH server installed**. You have some other form of access (web shell, VNC, physical console, container exec, cloud serial console).

### Approach

pmVPN's server IS an SSH server (built on ssh2). It doesn't need OpenSSH installed. If you can execute commands on the remote machine by any means, you can start pmVPN:

```bash
# From any shell on the remote machine (web terminal, console, etc.):

# 1. Get Node.js (if not present)
# Option A: Package manager
apt install -y nodejs npm  # Debian/Ubuntu
# Option B: Binary download (no admin)
curl -fsSL https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.xz | tar -xJ
export PATH="$PWD/node-v20.18.0-linux-x64/bin:$PATH"

# 2. Get pmVPN server
# Option A: git clone
git clone https://github.com/poormanvpn/pmvpn.git && cd pmvpn/server
# Option B: Download tarball
curl -L https://github.com/poormanvpn/pmvpn/releases/latest/download/server.tar.gz | tar -xz

# 3. Install and start
npx pnpm install
WALLET_USER_MAP="0xYourAddr:$USER" PMVPN_BASE_PORT=8200 node dist/index.js
```

Now you have an SSH server running — connect from the pmVPN client using your wallet.

---

## SSH Key Exchange for Persistent Access

After the initial wallet-authenticated connection, pmVPN can set up OpenSSH `authorized_keys` for persistent recognition. This provides a backup access method using standard SSH.

### Automated Key Exchange

When connecting for the first time, the client can optionally:

1. Generate an Ed25519 key pair specific to this host
2. Upload the public key to `~/.ssh/authorized_keys` on the server
3. Store the private key in bankon_vault (encrypted with Argon2id + AES-256-GCM)
4. Future connections can use either wallet auth OR the SSH key

```bash
# The client does this automatically on first connect (if enabled):

# Generate host-specific key
ssh-keygen -t ed25519 -f ~/.pmvpn/keys/<host-id> -N "" -q

# Upload public key via the authenticated SFTP channel
# (happens over the already wallet-authenticated SSH session)
cat ~/.pmvpn/keys/<host-id>.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### authorized_keys Self-Protection

pmVPN adds a marker comment to its entries in `authorized_keys`:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG... pmvpn:<wallet-address>:<timestamp>
```

**Rules:**

1. pmVPN will **never remove** other entries from `authorized_keys`
2. pmVPN entries are identified by the `pmvpn:` prefix in the comment
3. Only the wallet that created an entry can remove it
4. The client tracks which keys it has deployed to which servers

### Revoking Your Own Key

If you choose to remove your pmVPN SSH key from a server's `authorized_keys`:

```bash
# Remove pmVPN entries for a specific wallet
sed -i '/pmvpn:0xYourAddress/d' ~/.ssh/authorized_keys
```

**Consequences of removing your key:**

- Standard SSH key access to this server is revoked for this wallet
- **Wallet authentication still works** — the pmVPN server authenticates via signature, not SSH keys
- If the pmVPN server process is stopped, you lose all remote access unless:
  - You have another SSH key in `authorized_keys`
  - You have physical/console access
  - Another authorized wallet can re-bootstrap access
- **Recommendation**: Always keep at least one backup access method before revoking keys

### Key Hierarchy

```
Access Methods (most to least dependent on pmVPN):

1. Wallet signature auth  → Requires pmVPN server running
2. pmVPN SSH key          → Requires OpenSSH OR pmVPN server
3. Standard SSH key       → Requires OpenSSH only
4. Password auth          → Requires OpenSSH + password set
5. Physical console       → Always works
```

**Best practice**: After bootstrapping pmVPN, ensure at least access level 3 (standard SSH key) is configured as a fallback before relying solely on wallet auth.

---

## Bootstrap Security

### What pmVPN Does

- [x] Creates `~/.pmvpn/` directory for config and host keys
- [x] Generates Ed25519 host key (never reuses keys between servers)
- [x] Writes `wallets.json` with your wallet address
- [x] Starts SSH server on configured ports
- [x] Optionally adds Ed25519 public key to `~/.ssh/authorized_keys`
- [x] All operations logged to stdout (auditable)

### What pmVPN Never Does

- Does NOT modify system SSH configuration (`/etc/ssh/sshd_config`)
- Does NOT install system packages without explicit user action
- Does NOT open firewall ports (user must do this)
- Does NOT modify other users' files
- Does NOT remove existing `authorized_keys` entries
- Does NOT phone home or contact external services
- Does NOT store wallet private keys on the server

### Reversibility

To completely remove pmVPN from a server:

```bash
# Stop the service
pkill -f "pmvpn" || systemctl stop pmvpn

# Remove crontab entry
crontab -l | grep -v pmvpn | crontab -

# Remove files
rm -rf ~/.pmvpn ~/pmvpn-server

# Remove authorized_keys entries (optional)
sed -i '/pmvpn:/d' ~/.ssh/authorized_keys

# Remove systemd service (if admin-installed)
sudo systemctl disable pmvpn
sudo rm /etc/systemd/system/pmvpn.service
sudo rm -rf /opt/pmvpn
```

---

## Connection After Bootstrap

Once the server is running on the remote machine:

1. Open Parsec Wallet → pmVPN view
2. Add host: `name`, `host IP`, `base port`, `wallet address`
3. Click the host to connect
4. Wallet signs the challenge → SSH session established → terminal ready

Every subsequent connection uses wallet authentication. No passwords. No key files to manage. Your cryptographic identity is your access.

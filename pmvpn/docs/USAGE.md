# pmVPN Usage Guide

*Connect to a remote machine with your wallet*

Updated: 2026-03-20

---

## Prerequisites

**You need:**
- An Ethereum wallet (MetaMask, any EVM wallet, or a raw private key)
- Node.js 20+ and pnpm on the server machine
- The wallet's private key available for signing (or PARSEC Wallet with bankon_vault)

**You do not need:**
- An SSH key pair
- A password
- An Alchemy/Infura API key
- Root access (for user-level setup)

---

## Part 1: Server Setup

This runs on the Linux machine you want to access remotely.

### 1.1 Install

```bash
# Clone the repo
git clone https://github.com/poormanvpn/pmVPN.git
cd pmVPN/pmvpn/server

# Install dependencies
pnpm install
```

### 1.2 Get your wallet address

Open MetaMask (or any EVM wallet) and copy your address. It looks like:

```
0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18
```

### 1.3 Map your wallet to a system user

The server needs to know which wallet address maps to which Linux user. The simplest way:

```bash
export WALLET_USER_MAP="0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18:yourusername"
```

Replace `yourusername` with your actual Linux username on this machine.

**Multiple wallets:**

```bash
export WALLET_USER_MAP="0xAliceAddr:alice,0xBobAddr:bob"
```

**Persistent configuration** — create `~/.pmvpn/wallets.json`:

```bash
mkdir -p ~/.pmvpn
cat > ~/.pmvpn/wallets.json << 'EOF'
{
  "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18": {
    "user": "yourusername",
    "role": "admin"
  }
}
EOF
```

### 1.4 Start the server

```bash
# Development mode (auto-reload on changes)
pnpm run dev

# Or production mode
pnpm run build
pnpm start
```

You should see:

```
PMVPN server starting
loaded Ed25519 host key
wallet mappings loaded (count: 1)
──────────────────────────────────────────────────
PMVPN server ready — 8 ports active
  SSH Shell:      0.0.0.0:2200
  SFTP:           0.0.0.0:2201
  SSH Exec:       0.0.0.0:2202
  Challenge API:  0.0.0.0:2203
  VPN Tunnel:     0.0.0.0:2204
  File Sync:      0.0.0.0:2205
  Claude AI:      0.0.0.0:2206
  Admin:          0.0.0.0:2207
──────────────────────────────────────────────────
```

### 1.5 Verify the server is running

From the server itself or any machine that can reach it:

```bash
curl http://localhost:2203/status
```

Expected response:

```json
{ "version": "0.1.0", "uptime": 42, "wallets": 1 }
```

### 1.6 Firewall

If connecting from another machine, open the ports:

```bash
# UFW
sudo ufw allow 2200:2207/tcp

# Or iptables
sudo iptables -A INPUT -p tcp --dport 2200:2207 -j ACCEPT
```

For cloud providers (AWS, DigitalOcean, Hetzner), also open 2200–2207 in the security group / cloud firewall.

---

## Part 2: Client Setup

This runs on the machine you connect FROM.

### Option A: PARSEC Wallet (GUI — recommended)

If you have PARSEC Wallet installed:

```bash
cd parsec-wallet
pnpm install
pnpm run tauri:dev
```

1. Open PARSEC → navigate to **pmVPN** view
2. Fill in **Add Host**:
   - **Name**: whatever you want (e.g. `my-server`)
   - **Host**: server IP or hostname (e.g. `192.168.1.50` or `myserver.example.com`)
   - **Port**: `2200` (or your custom base port)
   - **Wallet**: your `0x...` address
3. Click **Add Host**
4. Click the host to connect
5. PARSEC signs the challenge with bankon_vault → terminal opens

### Option B: Command-line test (no PARSEC needed)

For testing without PARSEC, you can authenticate manually using Node.js and a standard SSH client.

#### Step 1: Get a challenge nonce

```bash
# Replace SERVER with your server's IP or hostname
SERVER=192.168.1.50

curl -s "http://${SERVER}:2203/challenge?address=0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"
```

Response:

```json
{
  "nonce": "a1b2c3d4e5f6...",
  "message": "PMVPN:a1b2c3d4e5f6...:1679900000",
  "expires": 1679900060
}
```

Save the `nonce` and `message` values. You have 60 seconds.

#### Step 2: Sign the message with your wallet

Create a signing script. Save as `sign.mjs`:

```javascript
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';

// Your private key (NEVER share this — test only)
const PRIVATE_KEY = '0xYourPrivateKeyHere';

// The message from the challenge response
const MESSAGE = process.argv[2];

if (!MESSAGE) {
  console.error('Usage: node sign.mjs "PMVPN:<nonce>:<timestamp>"');
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const signature = await account.signMessage({ message: MESSAGE });

// Build the auth payload
const payload = JSON.stringify({
  address: account.address,
  signature: signature,
  nonce: MESSAGE.split(':')[1],
});

console.log(payload);
```

Install viem and run it:

```bash
# In a temporary directory
mkdir /tmp/pmvpn-test && cd /tmp/pmvpn-test
pnpm init && pnpm add viem

# Sign the challenge message (paste the message from step 1)
node sign.mjs "PMVPN:a1b2c3d4e5f6...:1679900000"
```

This outputs the auth payload JSON:

```json
{"address":"0x742d...","signature":"0xabc123...","nonce":"a1b2c3d4e5f6..."}
```

#### Step 3: Connect via SSH

Use the auth payload as the SSH password:

```bash
# Copy the entire JSON output from step 2
# Use it as the password when prompted

ssh -p 2200 \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=no \
  yourusername@${SERVER}
```

When SSH asks for a password, paste the entire JSON payload from step 2.

**You're in.** You should see a bash shell on the remote machine.

#### One-liner with sshpass (automation)

```bash
# Install sshpass if needed: sudo apt install sshpass

PAYLOAD=$(node sign.mjs "PMVPN:a1b2c3d4e5f6...:1679900000")

sshpass -p "${PAYLOAD}" ssh -p 2200 \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o StrictHostKeyChecking=no \
  yourusername@${SERVER}
```

### Option C: All-in-one test script

Save as `connect.mjs`:

```javascript
import { privateKeyToAccount } from 'viem/accounts';

const SERVER = process.argv[2] || 'localhost';
const PORT = process.argv[3] || '2200';
const PRIVATE_KEY = process.env.PMVPN_KEY;

if (!PRIVATE_KEY) {
  console.error('Set PMVPN_KEY environment variable to your private key');
  console.error('Usage: PMVPN_KEY=0x... node connect.mjs <server> [port]');
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const challengePort = parseInt(PORT) + 3;

// Step 1: Fetch challenge
console.log(`Requesting challenge from ${SERVER}:${challengePort}...`);
const res = await fetch(
  `http://${SERVER}:${challengePort}/challenge?address=${account.address}`
);
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  console.error('Challenge failed:', body.error || res.status);
  process.exit(1);
}

const { nonce, message } = await res.json();
console.log(`Got nonce: ${nonce.slice(0, 16)}...`);

// Step 2: Sign
const signature = await account.signMessage({ message });
console.log(`Signed: ${signature.slice(0, 20)}...`);

// Step 3: Build payload
const payload = JSON.stringify({ address: account.address, signature, nonce });

// Step 4: Connect via SSH
console.log(`\nConnect with:\n`);
console.log(`sshpass -p '${payload}' ssh -p ${PORT} \\`);
console.log(`  -o PreferredAuthentications=password \\`);
console.log(`  -o PubkeyAuthentication=no \\`);
console.log(`  -o StrictHostKeyChecking=no \\`);
console.log(`  ${account.address.slice(0, 10)}@${SERVER}`);
console.log(`\nOr paste this as the SSH password:\n`);
console.log(payload);
```

Usage:

```bash
# Set your private key (test key only — never use a funded wallet key in env vars)
export PMVPN_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Connect
node connect.mjs 192.168.1.50
```

---

## Part 3: Testing Locally

Run both server and client on the same machine for development.

### 3.1 Generate a test wallet

```bash
node -e "
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const key = generatePrivateKey();
const account = privateKeyToAccount(key);
console.log('Private key:', key);
console.log('Address:', account.address);
"
```

Or use a well-known test key (Hardhat account #0):

```
Private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
Address:     0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### 3.2 Start the server with the test wallet

```bash
cd pmVPN/pmvpn/server

WALLET_USER_MAP="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266:$(whoami)" pnpm run dev
```

### 3.3 Test the challenge API

```bash
# Health check
curl -s http://localhost:2203/status | python3 -m json.tool

# Get a challenge
curl -s "http://localhost:2203/challenge?address=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" | python3 -m json.tool
```

### 3.4 Full connection test

In a second terminal:

```bash
cd /tmp/pmvpn-test  # where you installed viem earlier

export PMVPN_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

node connect.mjs localhost
```

Follow the output to connect via SSH. You should get a shell on your own machine, authenticated by wallet signature.

### 3.5 Verify it actually works

Once connected:

```bash
# You should see your username
whoami

# You should be in your home directory
pwd

# The server log should show:
# "authenticated" with your wallet address
# "shell spawned" with your username
```

---

## Part 4: Remote Machine Setup

Connecting to a real remote server (VPS, home lab, cloud instance).

### 4.1 Server machine

SSH into your remote machine the normal way first:

```bash
ssh user@your-server.example.com
```

Then install and configure pmVPN:

```bash
# Install Node.js if not present
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm

# Clone and install
git clone https://github.com/poormanvpn/pmVPN.git
cd pmVPN/pmvpn/server
pnpm install

# Configure your wallet
mkdir -p ~/.pmvpn
cat > ~/.pmvpn/wallets.json << 'EOF'
{
  "0xYourWalletAddress": {
    "user": "youruser",
    "role": "admin"
  }
}
EOF

# Build and start
pnpm run build

# Run in background (or use systemd — see DEPLOYMENT.md)
nohup node dist/index.js > /tmp/pmvpn.log 2>&1 &

# Open firewall
sudo ufw allow 2200:2207/tcp
```

### 4.2 Client machine

From your local machine:

```bash
# Test the connection
curl -s "http://your-server.example.com:2203/status"

# Use the connect script
export PMVPN_KEY="0xYourPrivateKey"
node connect.mjs your-server.example.com
```

### 4.3 Keep it running

For persistent operation, set up systemd:

```bash
sudo tee /etc/systemd/system/pmvpn.service << 'EOF'
[Unit]
Description=pmVPN Server
After=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/youruser/pmVPN/pmvpn/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable pmvpn
sudo systemctl start pmvpn
```

Check logs:

```bash
sudo journalctl -u pmvpn -f
```

---

## Part 5: Unprivileged Setup (No Root)

If you don't have root on the remote machine, use ports above 1024:

```bash
# On the remote machine (as regular user)
cd ~/pmVPN/pmvpn/server

PMVPN_BASE_PORT=8200 \
WALLET_USER_MAP="0xYourAddr:$(whoami)" \
pnpm run dev
```

Ports 8200–8207 will be used instead. Connect from the client:

```bash
node connect.mjs your-server.example.com 8200
```

---

## Part 6: Troubleshooting

### Server won't start

```bash
# Check if ports are in use
ss -tlnp | grep 2200

# Kill existing pmVPN processes
pkill -f "pmvpn.*index"

# Check logs
LOG_LEVEL=debug pnpm run dev
```

### Challenge request fails

```bash
# "wallet not registered"
# → Your address is not in WALLET_USER_MAP or wallets.json
# → Check: the address must be lowercase in the map

# "server busy, try again"
# → Too many pending challenges (>1000)
# → Wait a moment and retry

# Connection refused on port 2203
# → Server not running, or firewall blocking
```

### SSH authentication fails

```bash
# "invalid or expired nonce"
# → Nonce expired (>60 seconds). Get a fresh challenge and sign again

# "invalid signature"
# → Wrong private key, or message was modified between sign and send

# "unknown wallet address"
# → Address not in wallet map. Check WALLET_USER_MAP

# "malformed auth payload"
# → Password field isn't valid JSON. Make sure you paste the full payload
```

### SSH connection hangs

```bash
# Force password-only auth (disable key negotiation)
ssh -p 2200 \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o GSSAPIAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  user@server
```

### Verify signature locally

Test that your signing works without connecting:

```bash
node -e "
import('viem/accounts').then(async ({ privateKeyToAccount }) => {
  const account = privateKeyToAccount('$PMVPN_KEY');
  const sig = await account.signMessage({ message: 'test' });
  console.log('Address:', account.address);
  console.log('Signature:', sig.slice(0, 40) + '...');
  console.log('Signing works.');
});
"
```

---

## Security Notes

- **Never put a funded wallet's private key in an environment variable or script.** Use a dedicated test wallet for CLI testing. For real use, use PARSEC Wallet with bankon_vault — the key stays in encrypted Rust memory.

- **The auth payload JSON is sensitive for 60 seconds.** Anyone who captures it during that window can use it once. After that, the nonce is consumed and the payload is worthless.

- **First connection trust.** The first time you connect to a new server, verify the Ed25519 host key fingerprint out-of-band if possible. After that, the client remembers it (TOFU — Trust On First Use).

- **The test private key** (`0xac0974...`) is Hardhat's well-known account #0. Never use it for anything with real value. It is public.

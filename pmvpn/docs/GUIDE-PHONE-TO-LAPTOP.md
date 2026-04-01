# Guide: Connect Your Android Phone to Your Laptop

*Access your laptop terminal from your phone using pmVPN and MetaMask*

---

## What You'll Build

Your Android phone connects to your laptop over your local network (Wi-Fi). You sign in with MetaMask on your phone, and get a full terminal session to your laptop — no passwords, no SSH keys, no cloud relay. Just your wallet signature.

```
  ┌──────────────┐         Wi-Fi / LAN         ┌──────────────┐
  │  Android      │ ◄─────────────────────────► │  Laptop       │
  │  Phone        │   wallet-signed SSH tunnel   │  (server)     │
  │               │                              │               │
  │  MetaMask app │                              │  pmVPN server │
  │  + Browser    │                              │  ports 2200-  │
  │               │                              │  2207         │
  └──────────────┘                              └──────────────┘
```

---

## Prerequisites

| Item | Details |
|------|---------|
| Laptop | Linux (Ubuntu/Debian), Node.js 20+, pnpm 9+ |
| Phone | Android with [MetaMask](https://play.google.com/store/apps/details?id=io.metamask) installed |
| Network | Both devices on the same Wi-Fi network |
| Time | ~3 minutes |

---

## Step 1: Find Your Laptop's IP Address

On your laptop, find its local IP:

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# Look for something like: inet 192.168.1.42/24
```

Or the quick way:

```bash
hostname -I | awk '{print $1}'
```

Write down this IP. You'll type it into your phone's browser. Example: `192.168.1.42`

---

## Step 2: Start the pmVPN Server on Your Laptop

```bash
cd pmVPN/pmvpn/server
pnpm install          # first time only
export WALLET_USER_MAP="0xYourMetaMaskAddress:yourusername"
pnpm run dev
```

Replace `0xYourMetaMaskAddress` with your actual MetaMask wallet address (find it in the MetaMask app under your account name). Replace `yourusername` with your Linux username on the laptop.

You should see:

```
[INFO] pmVPN server starting
[INFO] SSH Shell     listening on 0.0.0.0:2200
[INFO] SFTP          listening on 0.0.0.0:2201
[INFO] SSH Exec      listening on 0.0.0.0:2202
[INFO] Challenge API listening on 0.0.0.0:2203
[INFO] WS Bridge     listening on 0.0.0.0:2204
...
```

The server is now listening on all interfaces (`0.0.0.0`), which means your phone can reach it over the local network.

---

## Step 3: Connect from Your Phone

1. **Open your phone's browser** (Chrome, Firefox, or the MetaMask built-in browser)

2. **Navigate to** `http://192.168.1.42:1420/` (use your laptop's actual IP)

3. **Tap "Open MetaMask App"** — the button detects you're on mobile and uses a deep link to launch the MetaMask app directly

4. **In MetaMask:** Review the login challenge. It shows the server's nonce and a 60-second expiry. Tap **Sign**.

5. **You're redirected back to the browser** — authenticated. The terminal opens.

### What You See on Your Phone

```
┌─ pmVPN ─────────── [0xf3..92] LOGOUT ─┐
│  ● Local Server                        │
├────────────────────────────────────────┤
│  Terminal   Files   Share              │
│                                        │
│  user@laptop:~$                        │
│  $ _                                   │
│                                        │
│                                        │
│                                        │
├────────────────────────────────────────┤
│  ● Connected │ 192.168.1.42:2200      │
└────────────────────────────────────────┘
```

The mobile UI is optimized for touch — full-bleed terminal, collapsible sidebar, large tap targets.

---

## Step 4: Use It

You now have a full interactive terminal on your laptop, running from your phone.

**Run commands:**
```bash
ls -la
htop
git status
```

**Browse files:** Tap the **Files** tab to browse your laptop's filesystem. Tap a folder to navigate, tap a file to download.

**Upload files:** In the Files tab, tap the upload button or drag files from your phone's file picker.

---

## Optional: Add Claude Remote Control

For AI-powered administration from your phone:

```bash
# On your laptop (separate terminal)
cd pmVPN/pmvpn
./remote-control.sh
```

A QR code appears. Scan it with the Claude app on your phone. Now you can describe what you want in natural language — "show me disk usage", "restart nginx", "find the largest log files" — and Claude executes it on your laptop.

See [REMOTE-CONTROL.md](REMOTE-CONTROL.md) for full details.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Phone can't reach `http://<ip>:1420/` | Verify both devices are on the same Wi-Fi. Run `ping <laptop-ip>` from a terminal app on your phone. |
| MetaMask doesn't open | Ensure MetaMask is installed. Try opening `metamask://` in your phone's browser to test the deep link. |
| "Wallet not authorized" | Double-check your wallet address in `WALLET_USER_MAP`. Addresses are case-insensitive but must be the full `0x...` format. |
| Connection drops on phone sleep | The WebSocket disconnects when the phone sleeps. Wake the phone and reconnect — the server is still running. |
| Firewall blocking | On the laptop, open the port range: `sudo ufw allow 2200:2207/tcp` and `sudo ufw allow 1420/tcp` |

---

## Security Notes

- **Your wallet private key never leaves your phone.** The server only sees the signature and recovers your public address from it.
- **The connection is over your local network.** No traffic leaves your Wi-Fi unless you port-forward (don't do this unless you understand the implications).
- **The nonce expires in 60 seconds.** Even if someone intercepts the challenge, they can't replay it.
- **Logout kills everything.** Sessions, WebSocket connections, and cached auth are all destroyed on logout.

---

## Going Further

| Want to... | Read... |
|-----------|---------|
| Connect over the internet (not just LAN) | [GUIDE-HOSTINGER-VPS.md](GUIDE-HOSTINGER-VPS.md) |
| Connect your laptop to a desktop | [GUIDE-LAPTOP-TO-DESKTOP.md](GUIDE-LAPTOP-TO-DESKTOP.md) |
| Build the native Android APK | [ANDROID.md](ANDROID.md) |
| Understand the full protocol | [PROTOCOL.md](PROTOCOL.md) |

---

*Your wallet is your key. Your phone is your terminal. Connect and go.*

*Professor Codephreak — cypherpunk2048*

# pmVPN Android Build & Install

*Run pmVPN on your phone — connect to your laptop from anywhere*

---

## Quickest Way: Browser (No Install)

You don't need an APK. Your phone's browser works right now:

1. On your laptop, start both services:

```bash
# Terminal 1: server
cd pmVPN/pmvpn/server
WALLET_USER_MAP="0xYourAddr:yourusername" pnpm run dev

# Terminal 2: client
cd pmVPN/pmvpn/client
pnpm run dev
```

2. Find your laptop's WiFi IP:

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# e.g. 192.168.1.50
```

3. On your phone, open Chrome and go to:

```
http://192.168.1.50:1420/
```

4. Full pmVPN UI works — Connect MetaMask, terminal, files, share. No install needed. Works on any Android version.

---

## Download APK from GitHub Releases

When an APK build is available, it will be at:

**https://github.com/poormanvpn/pmVPN/releases**

1. Open that URL on your phone in Chrome
2. Find the latest release
3. Tap **app-universal-debug.apk** to download
4. Open the downloaded file
5. If prompted about "unknown sources" — tap Settings → Allow → go back → Install
6. Open pmVPN from your app drawer

If no release is listed yet, the APK hasn't been built. Use the browser method above.

---

## What Is an APK

An APK is an Android app file. It's like a .deb for your phone. You build it on your laptop, transfer it to your phone, and install it. No Google Play Store needed. Your phone runs the app directly.

pmVPN's APK is ~8MB. It contains the pmVPN web UI wrapped in a native Android shell via Tauri. When you open it, you see the same interface as the browser version — MetaMask connect, terminal, file browser, share.

## Your Phone (11 Years Old)

An 11-year-old phone is likely running Android 4-5 (2013-2014 era). Tauri 2 requires **Android 7.0 (API 24)** minimum because it uses the system WebView.

**Check your Android version:**
- Settings → About Phone → Android Version

| Android Version | Year | Tauri Support |
|----------------|------|---------------|
| 4.x (KitKat) | 2013 | No — too old for Tauri |
| 5.x (Lollipop) | 2014 | No |
| 6.x (Marshmallow) | 2015 | No |
| 7.0+ (Nougat) | 2016 | Yes |
| 8.0+ (Oreo) | 2017 | Yes |

**If your phone is too old for the APK**, you can still use pmVPN in the phone's web browser:

1. Start the pmVPN server on your laptop
2. Open Chrome on your phone
3. Go to `http://YOUR_LAPTOP_IP:1420/`
4. Same interface, no app install needed

This works on any Android version with Chrome.

## Build Environment Setup (Fresh Machine)

Everything you need to build the Android APK from scratch. This takes about 15 minutes and ~5GB of disk space.

### Step 1: System dependencies

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  unzip \
  git \
  pkg-config \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  openjdk-17-jdk

# Verify Java
java --version
# Should show: openjdk 17.x.x
```

### Step 2: Node.js + pnpm

```bash
# Install Node.js 20 via nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20

# Install pnpm
npm install -g pnpm

# Verify
node --version   # v20.x.x
pnpm --version   # 10.x.x
```

### Step 3: Rust + Android targets

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Add Android cross-compilation targets
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  x86_64-linux-android \
  i686-linux-android

# Verify
rustc --version   # 1.77+
cargo --version
```

### Step 4: Android SDK + NDK (command-line only — no Android Studio needed)

```bash
# Create SDK directory
mkdir -p ~/Android/Sdk
cd ~/Android/Sdk

# Download command-line tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip

# Fix the directory structure (Google's zip has a quirk)
mkdir -p cmdline-tools
mv cmdline-tools cmdline-tools/latest 2>/dev/null || mv latest cmdline-tools/latest 2>/dev/null

# Set environment variables — add these to ~/.bashrc
echo 'export ANDROID_HOME=~/Android/Sdk' >> ~/.bashrc
echo 'export NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools' >> ~/.bashrc
source ~/.bashrc

# Accept all licenses (press 'y' for each)
sdkmanager --licenses

# Install required SDK components
sdkmanager \
  "platforms;android-34" \
  "build-tools;34.0.0" \
  "ndk;27.0.12077973" \
  "platform-tools"

# Verify
sdkmanager --list | head -5
adb --version
```

### Step 5: Clone and install pmVPN

```bash
git clone https://github.com/poormanvpn/pmVPN.git
cd pmVPN/pmvpn/client
pnpm install
```

### Step 6: Verify everything works

```bash
# Check all tools
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "Rust: $(rustc --version)"
echo "Cargo: $(cargo --version)"
echo "Java: $(java --version 2>&1 | head -1)"
echo "Android SDK: $ANDROID_HOME"
echo "NDK: $(ls $ANDROID_HOME/ndk 2>/dev/null)"
echo "adb: $(adb --version 2>/dev/null | head -1)"
rustup target list --installed | grep android
```

You should see Node 20+, Rust 1.77+, Java 17+, Android SDK path, NDK version, and 4 Android Rust targets.

## Build the APK

### Step 1: Initialize Android project

```bash
cd pmVPN/pmvpn/client

# This creates src-tauri/gen/android/ with the Gradle project
pnpm run android:init
```

### Step 2: Build debug APK (for testing)

```bash
pnpm run android:build -- --debug
```

This takes 3-5 minutes on the first run (downloads Gradle, compiles Rust for ARM).

### Step 3: Find the APK

```bash
ls -lh src-tauri/gen/android/app/build/outputs/apk/universal/debug/
# → app-universal-debug.apk (~8MB)
```

### Step 4: Upload to GitHub Releases (so you can download on your phone)

```bash
# Create a release with the APK + desktop builds
gh release create v0.1.0 \
  "src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk#pmVPN Android APK" \
  "src-tauri/target/release/bundle/deb/pmVPN_0.1.0_amd64.deb#pmVPN Linux .deb" \
  --repo poormanvpn/pmVPN \
  --title "pmVPN v0.1.0" \
  --notes "Wallet-authenticated remote access. Eight ports. One wallet.

- **Android APK**: download and install on your phone
- **Linux .deb**: install with dpkg -i

Connect MetaMask → sign → live terminal + file browser + P2P sharing."
```

After this, the APK is downloadable at:

**https://github.com/poormanvpn/pmVPN/releases**

Open that URL on your phone in Chrome, tap the APK, install it.

### Build release APK (for distribution)

```bash
pnpm run android:build
```

Output at: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`

## Install on Your Android Phone

You have three options. Pick whichever is easiest for you.

---

### Option A: USB Cable (Recommended for first time)

**Step 1: Enable Developer Mode on your phone**

This is a one-time setup. Android hides developer options by default.

1. Open **Settings** on your phone
2. Scroll to **About Phone** (sometimes under System → About Phone)
3. Find **Build Number**
4. Tap **Build Number** exactly **7 times** — fast
5. You'll see a toast message: "You are now a developer!"

**Step 2: Enable USB Debugging**

1. Go back to **Settings**
2. You'll now see **Developer Options** (usually under System)
3. Open **Developer Options**
4. Find **USB Debugging** and turn it **ON**
5. A warning will appear — tap **OK**

**Step 3: Connect phone to laptop with USB cable**

1. Plug in the USB cable
2. On your phone, a popup asks "Allow USB debugging?" → tap **Allow** (check "Always allow" if you want)
3. On your laptop, verify the connection:

```bash
adb devices
# Should show something like:
# List of devices attached
# ABC123DEF456    device
```

If `adb` is not found: `sudo apt install adb`

**Step 4: Install the APK**

```bash
cd pmVPN/pmvpn/client
adb install src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

You should see: `Success`

**Step 5: Find and open the app**

1. Go to your phone's home screen or app drawer
2. Look for **pmVPN** — it will have the pmVPN hooded figure icon
3. Tap it to open

---

### Option B: Transfer via WiFi (No USB cable needed)

Your phone and laptop must be on the same WiFi network.

**Step 1: Find your laptop's IP address**

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# Look for something like: inet 192.168.1.50/24
```

**Step 2: Serve the APK from your laptop**

```bash
cd pmVPN/pmvpn/client/src-tauri/gen/android/app/build/outputs/apk/universal/debug/
python3 -m http.server 9090
```

This starts a tiny web server. Leave it running.

**Step 3: Download on your phone**

1. Open **Chrome** on your phone
2. Type in the address bar: `http://192.168.1.50:9090/` (use YOUR laptop IP)
3. You'll see a file listing — tap **app-universal-debug.apk**
4. Chrome will download it

**Step 4: Install the APK**

1. When the download finishes, tap **Open** (or go to Downloads)
2. Android will say "Install blocked" or "Unknown sources" — this is normal for apps not from Google Play
3. Tap **Settings** when prompted
4. Enable **Allow from this source** (or "Install unknown apps" for Chrome)
5. Go back and tap **Install**
6. Tap **Open** when done

---

### Option C: Email or Cloud Drive

1. Email the APK to yourself, or upload it to Google Drive/Dropbox
2. Open it on your phone from the email or cloud app
3. Follow the "Install unknown apps" steps from Option B above

---

### If "Install Unknown Apps" Is Confusing

Every Android phone handles this slightly differently. Here's the general idea:

- **Android 7 (Nougat):** Settings → Security → Unknown Sources → ON
- **Android 8+ (Oreo):** Settings → Apps → Special Access → Install Unknown Apps → choose Chrome → Allow
- **Older Android:** Settings → Security → check "Unknown Sources"

This setting just means "allow apps from outside Google Play." It's perfectly safe for apps you built yourself.

---

### After Installing — What You See

1. Open the pmVPN app
2. You see the same dark UI as the browser version
3. **Connect MetaMask** — if you have MetaMask Mobile installed, it will open. If not, you can use the browser version instead (see below)
4. Add your laptop as a connection: enter your laptop's WiFi IP and port 2200
5. Connect → sign → terminal opens on your phone

### If You Don't Have MetaMask Mobile

You can use pmVPN in your phone's browser instead of the app:

1. Make sure the pmVPN client is running on your laptop: `pnpm run dev`
2. Open Chrome on your phone
3. Go to `http://YOUR_LAPTOP_IP:1420/`
4. Install MetaMask as a Chrome extension (if your Chrome supports it), or use the browser version

### For Very Old Phones (Android 4-6)

The APK won't work, but the browser version will:

1. Start both server and client on your laptop
2. On your phone, open any browser
3. Go to `http://YOUR_LAPTOP_IP:1420/`
4. The full pmVPN UI works in the browser — terminal, files, share

## Connect from Android to Laptop

### 1. Start the pmVPN server on your laptop

```bash
cd pmVPN/pmvpn/server

# Use your laptop's WiFi IP (not localhost)
PMVPN_HOST=0.0.0.0 \
WALLET_USER_MAP="0xYourWalletAddress:yourusername" \
pnpm run dev
```

Find your laptop's IP:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# → e.g. 192.168.1.50
```

### 2. Open pmVPN on your phone

1. Open the pmVPN app
2. Connect MetaMask Mobile (or MetaMask in the phone browser)
3. Add a connection:
   - **Name**: My Laptop
   - **Host**: `192.168.1.50` (your laptop's WiFi IP)
   - **Port**: `2200`
4. Click the connection → MetaMask signs → terminal opens

### 3. You're in

You now have a terminal to your laptop from your phone. Type `claude` to start Claude. Browse files in the Files tab. Share files in the Share tab.

## Firewall

Make sure your laptop's firewall allows connections on ports 2200-2207:

```bash
sudo ufw allow 2200:2207/tcp
```

## Troubleshooting

### "Connection refused" from phone

- Check laptop IP: `ip addr show`
- Check server is running: `curl http://LAPTOP_IP:2203/status`
- Check firewall: `sudo ufw status`
- Make sure phone and laptop are on the same WiFi network

### "MetaMask not found"

- The Tauri webview doesn't have browser extensions
- Use MetaMask Mobile app — it has a built-in browser
- Or use WalletConnect (future feature)

### APK won't install

- Enable "Install from unknown sources" in phone settings
- Settings → Apps → Special access → Install unknown apps → allow Chrome/Files

## Build Artifacts

| File | Location | Size |
|------|----------|------|
| Linux binary | `src-tauri/target/release/pmvpn` | ~13MB |
| Linux .deb | `src-tauri/target/release/bundle/deb/pmVPN_0.1.0_amd64.deb` | ~4.3MB |
| Linux .rpm | `src-tauri/target/release/bundle/rpm/pmVPN-0.1.0-1.x86_64.rpm` | ~4.3MB |
| Android APK | `src-tauri/gen/android/.../app-universal-debug.apk` | ~8MB |

## Desktop: How to Run

### Install the .deb (Debian/Ubuntu)

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/pmVPN_0.1.0_amd64.deb
# Run from applications menu or:
pmvpn
```

### Run the binary directly

```bash
./src-tauri/target/release/pmvpn
```

### Development mode

```bash
pnpm run tauri:dev
```

---

*The .deb and binary are built. The Android APK requires Android SDK setup. Both connect to the same pmVPN server.*

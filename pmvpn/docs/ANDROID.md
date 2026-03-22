# pmVPN Android Build & Install

*Run pmVPN on your phone — connect to your laptop from anywhere*

---

## Prerequisites

On your build machine (this laptop):

```bash
# Java 17+ (Android requires 17, not 11)
sudo apt install openjdk-17-jdk

# Android SDK
# Option A: Android Studio (installs SDK automatically)
# Option B: Command-line tools only
mkdir -p ~/Android/Sdk
cd ~/Android/Sdk
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip
mv cmdline-tools latest
mkdir cmdline-tools
mv latest cmdline-tools/

# Set environment
export ANDROID_HOME=~/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

# Accept licenses and install required components
sdkmanager --licenses
sdkmanager "platforms;android-34" "build-tools;34.0.0" "ndk;27.0.12077973"

# Rust Android targets
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
```

## Initialize Android

```bash
cd pmVPN/pmvpn/client

# Initialize Android project (creates src-tauri/gen/android/)
pnpm run android:init
```

## Build APK

### Debug (for testing)

```bash
pnpm run android:build -- --debug
```

The APK will be at:
```
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

### Release (for distribution)

```bash
pnpm run android:build
```

The APK will be at:
```
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

## Install on Your Android Phone

### Option A: USB Cable

1. Enable **Developer Options** on your phone:
   - Settings → About Phone → tap **Build Number** 7 times
2. Enable **USB Debugging**:
   - Settings → Developer Options → USB Debugging → ON
3. Connect phone via USB
4. Install:

```bash
adb install src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

### Option B: Transfer the APK

1. Copy the APK to your phone (email, cloud, USB, or serve it over HTTP):

```bash
# Serve the APK from this laptop
cd src-tauri/gen/android/app/build/outputs/apk/universal/debug/
python3 -m http.server 9090
# → http://YOUR_LAPTOP_IP:9090/app-universal-debug.apk
```

2. On your phone, open the URL in Chrome
3. Download the APK
4. Open it → Install (may need to allow "Install from unknown sources")

### Option C: ADB over WiFi

```bash
# On laptop (phone and laptop on same WiFi)
adb tcpip 5555
adb connect PHONE_IP:5555
adb install app-universal-debug.apk
```

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

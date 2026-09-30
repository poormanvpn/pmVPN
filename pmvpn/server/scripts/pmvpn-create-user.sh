#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# pmvpn-create-user.sh — pmVPN jail warden
# Provisions an isolated Linux user bound to a single wallet address.
#
# Usage: pmvpn-create-user.sh <username> <role> <wallet_address>
#   role            admin | user
#   wallet_address  0x-prefixed Ethereum address (lowercase preferred)
#
# Idempotent: re-running on an existing user refreshes quota and .ssh binding
# without touching home contents.

set -eu

VERSION="1"

USERNAME="${1:-}"
ROLE="${2:-user}"
WALLET="${3:-}"

if [ -z "$USERNAME" ] || [ -z "$WALLET" ]; then
  echo "usage: $0 <username> <role:admin|user> <wallet_address>" >&2
  exit 2
fi

case "$ROLE" in
  admin|user) ;;
  *) echo "role must be 'admin' or 'user' (got: $ROLE)" >&2; exit 2 ;;
esac

if ! echo "$WALLET" | grep -Eq '^0x[a-fA-F0-9]{40}$'; then
  echo "wallet must be 0x + 40 hex chars (got: $WALLET)" >&2
  exit 2
fi

WALLET="$(echo "$WALLET" | tr 'A-F' 'a-f')"

if [ "$(id -u)" -ne 0 ]; then
  echo "warden must run as root (got uid=$(id -u))" >&2
  exit 1
fi

# Quota tiers -----------------------------------------------------------------
if [ "$ROLE" = "admin" ]; then
  QUOTA_BLOCKS_SOFT=$((900 * 1024))    # 900 MB soft
  QUOTA_BLOCKS_HARD=$((1024 * 1024))   # 1 GB hard
  QUOTA_FILES_SOFT=40000
  QUOTA_FILES_HARD=50000
  QUOTA_LABEL="1GB / 50K files"
else
  QUOTA_BLOCKS_SOFT=$((9 * 1024))      # 9 MB soft
  QUOTA_BLOCKS_HARD=$((10 * 1024))     # 10 MB hard
  QUOTA_FILES_SOFT=800
  QUOTA_FILES_HARD=1000
  QUOTA_LABEL="10MB / 1K files"
fi

# Create user -----------------------------------------------------------------
if id "$USERNAME" >/dev/null 2>&1; then
  echo "user $USERNAME already exists — refreshing"
else
  useradd \
    --create-home \
    --shell /bin/bash \
    --home-dir "/home/$USERNAME" \
    --comment "pmvpn:$WALLET" \
    "$USERNAME"
  # Lock password — wallet signature is the only auth path
  passwd -l "$USERNAME" >/dev/null 2>&1 || true
  echo "created user $USERNAME ($QUOTA_LABEL)"
fi

HOME_DIR="/home/$USERNAME"
SSH_DIR="$HOME_DIR/.ssh"

# Tight home — others cannot see in
chmod 700 "$HOME_DIR"
chown "$USERNAME:$USERNAME" "$HOME_DIR"

# .ssh directory + wallet binding --------------------------------------------
install -d -m 700 -o "$USERNAME" -g "$USERNAME" "$SSH_DIR"

BINDING="$SSH_DIR/pmvpn_wallet"
cat > "$BINDING" <<EOF
# pmVPN wallet binding — DO NOT EDIT
# This account is owned by the wallet listed below. pmVPN rejects
# logins where the authenticated wallet does not match this address.
owner=$WALLET
role=$ROLE
created=$(date -u +%Y-%m-%dT%H:%M:%SZ)
version=$VERSION
EOF
chmod 400 "$BINDING"
chown "$USERNAME:$USERNAME" "$BINDING"

# Derive (or generate) an ed25519 key tagged for this wallet ------------------
SHORT="$(echo "$WALLET" | cut -c3-10)"
KEY_FILE="$SSH_DIR/pmvpn_${SHORT}"
AUTH_KEYS="$SSH_DIR/authorized_keys"
KEY_TAG="pmvpn:${WALLET}:v${VERSION}"

if [ ! -f "$KEY_FILE" ]; then
  ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "$KEY_TAG" -q
  chown "$USERNAME:$USERNAME" "$KEY_FILE" "$KEY_FILE.pub"
  chmod 600 "$KEY_FILE"
  chmod 644 "$KEY_FILE.pub"
fi

touch "$AUTH_KEYS"
chown "$USERNAME:$USERNAME" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

# Replace any existing pmvpn: entry for this wallet (idempotent)
TMP_KEYS="$(mktemp)"
grep -v -F "$KEY_TAG" "$AUTH_KEYS" 2>/dev/null > "$TMP_KEYS" || true
cat "$KEY_FILE.pub" >> "$TMP_KEYS"
install -m 600 -o "$USERNAME" -g "$USERNAME" "$TMP_KEYS" "$AUTH_KEYS"
rm -f "$TMP_KEYS"

# Restricted login env --------------------------------------------------------
PROFILE="$HOME_DIR/.profile"
cat > "$PROFILE" <<'EOF'
# pmVPN restricted profile — managed by jail warden
# Sets a minimal PATH and blocks shell escapes via env tampering.
umask 077
export PATH=/usr/bin:/bin
export PMVPN_JAIL=1
unset LD_PRELOAD LD_LIBRARY_PATH
EOF
chown "$USERNAME:$USERNAME" "$PROFILE"
chmod 644 "$PROFILE"

# Pre-create vault dir so first vault op doesn't escape sandbox ---------------
VAULT_DIR="$HOME_DIR/.bankon/vault"
install -d -m 700 -o "$USERNAME" -g "$USERNAME" "$HOME_DIR/.bankon"
install -d -m 700 -o "$USERNAME" -g "$USERNAME" "$VAULT_DIR"

# Disk quota (best-effort — only if quota tools + fs support it) --------------
if command -v setquota >/dev/null 2>&1; then
  # Discover the filesystem that holds /home
  FS_DEV="$(df --output=source /home 2>/dev/null | tail -1)"
  if [ -n "$FS_DEV" ] && grep -q '\<usrquota\>' /proc/mounts 2>/dev/null; then
    setquota -u "$USERNAME" \
      "$QUOTA_BLOCKS_SOFT" "$QUOTA_BLOCKS_HARD" \
      "$QUOTA_FILES_SOFT" "$QUOTA_FILES_HARD" \
      "$FS_DEV" 2>/dev/null \
      && echo "  quota: $QUOTA_LABEL" \
      || echo "  quota: setquota failed (fs may not support quotas)"
  else
    echo "  quota: skipped (filesystem not mounted with usrquota)"
  fi
else
  echo "  quota: skipped (quota tools not installed)"
fi

# Deny cron access (best-effort) ---------------------------------------------
if [ -d /etc/cron.allow ] 2>/dev/null || [ -f /etc/cron.deny ] || command -v crontab >/dev/null 2>&1; then
  touch /etc/cron.deny 2>/dev/null || true
  if ! grep -qx "$USERNAME" /etc/cron.deny 2>/dev/null; then
    echo "$USERNAME" >> /etc/cron.deny 2>/dev/null || true
  fi
fi

# Block ptrace from this user (best-effort, kernel.yama) ----------------------
# Persistent jail-wide ptrace block lives in /etc/sysctl.d/99-pmvpn-jail.conf;
# create it once if the warden is allowed to.
SYSCTL_FILE="/etc/sysctl.d/99-pmvpn-jail.conf"
if [ -d /etc/sysctl.d ] && [ ! -f "$SYSCTL_FILE" ]; then
  cat > "$SYSCTL_FILE" <<'EOF'
# pmVPN jail — prevent participants from ptrace-ing each other or the warden
kernel.yama.ptrace_scope = 2
EOF
  sysctl -p "$SYSCTL_FILE" >/dev/null 2>&1 || true
fi

# Final ownership sweep so quota counts cleanly -------------------------------
chown -R "$USERNAME:$USERNAME" "$HOME_DIR" 2>/dev/null || true

echo "pmvpn warden: $USERNAME ($ROLE) bound to $WALLET — $QUOTA_LABEL"
exit 0

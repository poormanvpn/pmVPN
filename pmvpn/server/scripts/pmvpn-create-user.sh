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

VERSION="2"

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

# Tight home — others cannot see in
chmod 700 "$HOME_DIR"
chown "$USERNAME:$USERNAME" "$HOME_DIR"

# Files inside the home are written by the user, not by root -------------------
# The user controls this directory, so a root write could be redirected by a link
# they planted. Running as them gives the write their privileges and nothing more.
as_user() { runuser -u "$USERNAME" -- "$@"; }

KEY_TAG="pmvpn:${WALLET}:v${VERSION}"
SHORT="$(echo "$WALLET" | cut -c3-10)"
CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

as_user env HOME="$HOME_DIR" WALLET="$WALLET" ROLE="$ROLE" VERSION="$VERSION" KEY_TAG="$KEY_TAG" SHORT="$SHORT" CREATED="$CREATED" \
  sh -eu -c '
umask 077
cd "$HOME"
mkdir -p .ssh && chmod 700 .ssh

# Wallet binding: pmVPN rejects logins whose wallet does not match owner=.
rm -f .ssh/pmvpn_wallet
cat > .ssh/pmvpn_wallet <<EOF
# pmVPN wallet binding — DO NOT EDIT
# This account is owned by the wallet listed below. pmVPN rejects
# logins where the authenticated wallet does not match this address.
owner=$WALLET
role=$ROLE
created=$CREATED
version=$VERSION
EOF
chmod 400 .ssh/pmvpn_wallet

# An ed25519 key tagged for this wallet, mirrored into authorized_keys.
KEY_FILE=".ssh/pmvpn_${SHORT}"
[ -f "$KEY_FILE" ] || ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "$KEY_TAG" -q
touch .ssh/authorized_keys
{ grep -v -F "$KEY_TAG" .ssh/authorized_keys || true; cat "$KEY_FILE.pub"; } > .ssh/authorized_keys.pmvpn-new
chmod 600 .ssh/authorized_keys.pmvpn-new
mv -f .ssh/authorized_keys.pmvpn-new .ssh/authorized_keys

# Restricted login environment.
rm -f .profile
cat > .profile <<"EOF"
# pmVPN restricted profile — managed by jail warden
# Sets a minimal PATH and blocks shell escapes via env tampering.
umask 077
export PATH=/usr/bin:/bin
export PMVPN_JAIL=1
unset LD_PRELOAD LD_LIBRARY_PATH
EOF
chmod 644 .profile

# Vault directory, so the first vault operation stays inside the home.
mkdir -p .bankon/vault && chmod 700 .bankon .bankon/vault
'

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

echo "pmvpn warden: $USERNAME ($ROLE) bound to $WALLET — $QUOTA_LABEL"
exit 0

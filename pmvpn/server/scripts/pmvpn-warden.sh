#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# pmvpn-warden.sh — interactive admin CLI for pmVPN user provisioning
#
# Subcommands:
#   add               prompt for wallet + role, provision a jailed user
#   list              list all pmVPN-managed users (by /home/.../.ssh/pmvpn_wallet)
#   show <user|wallet>  inspect binding for a specific user or wallet
#   remove <user|wallet>  deprovision (locks user, removes pmvpn: keys, optional purge)
#   rotate <user|wallet>  rotate the user's ed25519 key, refresh authorized_keys
#   keyring-install <user|wallet> <lines-file>
#                     replace the wallet's pmvpn:<wallet>:k* ring lines in authorized_keys
#                     with the lines in <lines-file> (one authorized_keys line each)
#   keyring-remove <user|wallet>
#                     strip the wallet's ring lines (the server does this on DELETE /keyring)
#
# Designed for ops staff. Calls the non-interactive pmvpn-create-user.sh
# for the heavy lifting.

set -eu

VERSION="2"

WARDEN_DIR="$(cd "$(dirname "$0")" && pwd)"
CREATE_USER="${WARDEN_DIR}/pmvpn-create-user.sh"
if [ ! -x "$CREATE_USER" ] && [ -x /usr/local/bin/pmvpn-create-user.sh ]; then
  CREATE_USER=/usr/local/bin/pmvpn-create-user.sh
fi
WALLETS_JSON="${PMVPN_WALLETS_JSON:-/root/.pmvpn/wallets.json}"

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "pmvpn-warden must run as root" >&2
    exit 1
  fi
}

prompt() {
  local label="$1" default="${2:-}" reply
  if [ -n "$default" ]; then
    read -r -p "$label [$default]: " reply
    echo "${reply:-$default}"
  else
    read -r -p "$label: " reply
    echo "$reply"
  fi
}

confirm() {
  local label="$1" reply
  read -r -p "$label [y/N] " reply
  case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

wallet_for_user() {
  local user="$1" home binding
  home="$(getent passwd "$user" | cut -d: -f6)"
  binding="$home/.ssh/pmvpn_wallet"
  [ -f "$binding" ] || return 1
  grep '^owner=' "$binding" | head -1 | cut -d= -f2
}

user_for_wallet() {
  local wallet="$1"
  wallet="$(echo "$wallet" | tr 'A-F' 'a-f')"
  for home in /home/*; do
    local b="$home/.ssh/pmvpn_wallet"
    [ -f "$b" ] || continue
    local owner
    owner="$(grep '^owner=' "$b" | head -1 | cut -d= -f2)"
    if [ "$owner" = "$wallet" ]; then
      basename "$home"
      return 0
    fi
  done
  return 1
}

resolve_target() {
  # Accept either a username or 0x wallet; print "user wallet" to stdout.
  local arg="$1" user wallet
  if echo "$arg" | grep -Eq '^0x[a-fA-F0-9]{40}$'; then
    wallet="$(echo "$arg" | tr 'A-F' 'a-f')"
    user="$(user_for_wallet "$wallet")" || { echo "no user bound to wallet $wallet" >&2; return 1; }
  else
    user="$arg"
    id "$user" >/dev/null 2>&1 || { echo "no such user: $user" >&2; return 1; }
    wallet="$(wallet_for_user "$user")" || { echo "user $user has no pmvpn binding" >&2; return 1; }
  fi
  echo "$user $wallet"
}

cmd_add() {
  require_root
  echo "── pmVPN provision new wallet ──"
  local wallet role suggested user

  wallet="$(prompt 'Wallet address (0x...)')"
  if ! echo "$wallet" | grep -Eq '^0x[a-fA-F0-9]{40}$'; then
    echo "invalid wallet address" >&2; exit 2
  fi
  wallet="$(echo "$wallet" | tr 'A-F' 'a-f')"

  if existing="$(user_for_wallet "$wallet" 2>/dev/null)"; then
    echo "wallet already provisioned as user '$existing'"
    if ! confirm "Re-provision (refresh binding + quota + keys)?"; then exit 0; fi
    user="$existing"
  else
    suggested="w$(echo "$wallet" | cut -c3-10)"
    user="$(prompt 'Linux username' "$suggested")"
  fi

  role="$(prompt 'Role (admin|user)' 'user')"
  case "$role" in admin|user) ;; *) echo "role must be admin or user" >&2; exit 2 ;; esac

  echo
  echo "About to provision:"
  echo "  user:   $user"
  echo "  role:   $role"
  echo "  wallet: $wallet"
  echo "  quota:  $([ "$role" = admin ] && echo '1GB / 50K files' || echo '10MB / 1K files')"
  confirm "Proceed?" || { echo "cancelled"; exit 0; }

  "$CREATE_USER" "$user" "$role" "$wallet"

  # Mirror into wallets.json so the server picks it up at next reload
  if [ -d "$(dirname "$WALLETS_JSON")" ] || mkdir -p "$(dirname "$WALLETS_JSON")" 2>/dev/null; then
    if [ ! -f "$WALLETS_JSON" ]; then echo '{}' > "$WALLETS_JSON"; fi
    if command -v python3 >/dev/null 2>&1; then
      python3 - "$WALLETS_JSON" "$wallet" "$user" "$role" <<'PY'
import json, sys
path, wallet, user, role = sys.argv[1:5]
try:
    with open(path) as f: data = json.load(f)
except Exception:
    data = {}
data[wallet] = {"user": user, "role": role}
with open(path, 'w') as f: json.dump(data, f, indent=2)
PY
      echo "wallets.json updated ($WALLETS_JSON)"
    else
      echo "note: python3 not found — edit $WALLETS_JSON by hand"
    fi
  fi
  echo "done."
}

cmd_list() {
  printf '%-16s %-44s %-8s %s\n' USER WALLET ROLE CREATED
  for home in /home/*; do
    local b="$home/.ssh/pmvpn_wallet"
    [ -f "$b" ] || continue
    local user owner role created
    user="$(basename "$home")"
    owner="$(grep '^owner='  "$b" | head -1 | cut -d= -f2)"
    role="$( grep '^role='   "$b" | head -1 | cut -d= -f2)"
    created="$(grep '^created=' "$b" | head -1 | cut -d= -f2)"
    printf '%-16s %-44s %-8s %s\n' "$user" "$owner" "$role" "$created"
  done
}

cmd_show() {
  local arg="${1:-}"; [ -n "$arg" ] || { echo "usage: pmvpn-warden show <user|wallet>" >&2; exit 2; }
  local pair user wallet home
  pair="$(resolve_target "$arg")" || exit 1
  user="${pair% *}"; wallet="${pair#* }"
  home="$(getent passwd "$user" | cut -d: -f6)"
  echo "user:   $user"
  echo "wallet: $wallet"
  echo "home:   $home"
  echo "binding:"
  sed 's/^/  /' "$home/.ssh/pmvpn_wallet"
  echo "authorized_keys (pmvpn entries):"
  grep -F "pmvpn:" "$home/.ssh/authorized_keys" 2>/dev/null | sed 's/^/  /' || echo "  (none)"
  local ring="/root/.pmvpn/keyrings/${wallet}.json"
  if [ -f "$ring" ]; then
    echo "keyring: $ring"
    grep -E '"(index|slug|fingerprint)"' "$ring" | sed 's/^ */  /'
  else
    echo "keyring: (none enrolled)"
  fi
}

# Rewrite only the wallet's ring lines (tag pmvpn:<wallet>:k*), keep everything else.
_keyring_rewrite() {
  local user="$1" wallet="$2" lines_file="${3:-}" home ak tmp
  home="$(getent passwd "$user" | cut -d: -f6)"
  ak="$home/.ssh/authorized_keys"
  mkdir -p "$home/.ssh"; chmod 700 "$home/.ssh"; chown "$user:$user" "$home/.ssh"
  touch "$ak"
  tmp="$(mktemp)"
  grep -v -F "pmvpn:${wallet}:k" "$ak" > "$tmp" || true
  if [ -n "$lines_file" ]; then
    grep -E 'ssh-ed25519 ' "$lines_file" >> "$tmp"
  fi
  install -m 600 -o "$user" -g "$user" "$tmp" "$ak"
  rm -f "$tmp"
}

cmd_keyring_install() {
  require_root
  local arg="${1:-}" file="${2:-}"
  [ -n "$arg" ] && [ -f "$file" ] || { echo "usage: pmvpn-warden keyring-install <user|wallet> <lines-file>" >&2; exit 2; }
  local pair user wallet
  pair="$(resolve_target "$arg")" || exit 1
  user="${pair% *}"; wallet="${pair#* }"
  _keyring_rewrite "$user" "$wallet" "$file"
  echo "keyring installed for $user ($(grep -c 'ssh-ed25519 ' "$file") keys)."
}

cmd_keyring_remove() {
  require_root
  local arg="${1:-}"; [ -n "$arg" ] || { echo "usage: pmvpn-warden keyring-remove <user|wallet>" >&2; exit 2; }
  local pair user wallet
  pair="$(resolve_target "$arg")" || exit 1
  user="${pair% *}"; wallet="${pair#* }"
  _keyring_rewrite "$user" "$wallet" ""
  rm -f "/root/.pmvpn/keyrings/${wallet}.json"
  echo "keyring removed for $user."
}

cmd_remove() {
  require_root
  local arg="${1:-}"; [ -n "$arg" ] || { echo "usage: pmvpn-warden remove <user|wallet>" >&2; exit 2; }
  local pair user wallet home
  pair="$(resolve_target "$arg")" || exit 1
  user="${pair% *}"; wallet="${pair#* }"
  home="$(getent passwd "$user" | cut -d: -f6)"

  echo "About to deprovision:"
  echo "  user:   $user"
  echo "  wallet: $wallet"
  echo "  home:   $home"
  confirm "Lock account and strip pmvpn keys?" || { echo "cancelled"; exit 0; }

  passwd -l "$user" >/dev/null 2>&1 || true
  usermod -L "$user" 2>/dev/null || true
  if [ -f "$home/.ssh/authorized_keys" ]; then
    grep -v -F "pmvpn:${wallet}" "$home/.ssh/authorized_keys" > "$home/.ssh/authorized_keys.tmp" || true
    mv "$home/.ssh/authorized_keys.tmp" "$home/.ssh/authorized_keys"
    chown "$user:$user" "$home/.ssh/authorized_keys"
    chmod 600 "$home/.ssh/authorized_keys"
  fi
  rm -f "$home/.ssh/pmvpn_wallet" "$home/.ssh/pmvpn_$(echo "$wallet" | cut -c3-10)" \
        "$home/.ssh/pmvpn_$(echo "$wallet" | cut -c3-10).pub"

  if confirm "Also delete the home directory and Linux user?"; then
    userdel -r "$user" 2>/dev/null || userdel "$user"
    echo "user $user removed."
  else
    echo "user $user locked; home preserved."
  fi
}

cmd_rotate() {
  require_root
  local arg="${1:-}"; [ -n "$arg" ] || { echo "usage: pmvpn-warden rotate <user|wallet>" >&2; exit 2; }
  local pair user wallet home
  pair="$(resolve_target "$arg")" || exit 1
  user="${pair% *}"; wallet="${pair#* }"
  home="$(getent passwd "$user" | cut -d: -f6)"
  local short; short="$(echo "$wallet" | cut -c3-10)"
  rm -f "$home/.ssh/pmvpn_${short}" "$home/.ssh/pmvpn_${short}.pub"
  local role; role="$(grep '^role=' "$home/.ssh/pmvpn_wallet" | head -1 | cut -d= -f2)"
  "$CREATE_USER" "$user" "${role:-user}" "$wallet"
  echo "key rotated for $user."
}

usage() {
  cat <<EOF
pmvpn-warden — pmVPN admin CLI

  pmvpn-warden add                       interactively provision a wallet
  pmvpn-warden list                      list managed users
  pmvpn-warden show   <user|wallet>      show binding details
  pmvpn-warden remove <user|wallet>      lock account, strip pmvpn keys
  pmvpn-warden rotate <user|wallet>      rotate the user's ed25519 key
  pmvpn-warden keyring-install <user|wallet> <lines-file>
                                         replace the wallet's port-scoped ring lines
  pmvpn-warden keyring-remove  <user|wallet>
                                         strip the wallet's ring lines

Wallets are matched case-insensitively. All write subcommands require root.
EOF
}

case "${1:-}" in
  add)    shift; cmd_add    "$@" ;;
  list)   shift; cmd_list   "$@" ;;
  show)   shift; cmd_show   "$@" ;;
  remove) shift; cmd_remove "$@" ;;
  rotate) shift; cmd_rotate "$@" ;;
  keyring-install) shift; cmd_keyring_install "$@" ;;
  keyring-remove)  shift; cmd_keyring_remove  "$@" ;;
  ''|-h|--help|help) usage ;;
  *) echo "unknown subcommand: $1" >&2; usage; exit 2 ;;
esac

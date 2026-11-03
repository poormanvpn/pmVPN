#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Prove stock terminal tools work against a pmVPN server after `pmvpn-keyring login`.
#   verify-terminal-tools.sh ALIAS
# Extra ssh options go in PMVPN_SSH_OPTS. Set PMVPN_SSH_OPTS='-F /path/config' to test
# a config other than ~/.ssh/config. Each run writes under its own pmvpn-verify-<run>*
# names in the remote home, deletes nothing there, and prints what it left.
set -u
A="${1:?usage: verify-terminal-tools.sh ALIAS}"
# shellcheck disable=SC2206
O=(${PMVPN_SSH_OPTS:-})
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fails=0
V="pmvpn-verify-$(date +%s)-$$"
ok()   { echo "ok    $1"; }
bad()  { echo "FAIL  $1"; fails=$((fails+1)); }
SSH()  { timeout 30 ssh "${O[@]}" "$@"; }

SSH "$A-exec" 'exit 7'; [ $? = 7 ] && ok 'exec returns the exit code' || bad 'exec returns the exit code'
[ "$(printf hello | SSH "$A-exec" cat)" = hello ] && ok 'stdin EOF reaches the command' || bad 'stdin EOF reaches the command'
[ "$(SSH "$A-exec" 'echo out; echo err >&2' 2>/dev/null)" = out ] && ok 'stdout and stderr stay separate' || bad 'stdout and stderr stay separate'

head -c 5000000 /dev/urandom > "$T/blob"
sum=$(sha256sum < "$T/blob")
[ "$(SSH "$A-exec" cat < "$T/blob" | sha256sum)" = "$sum" ] && ok '5 MB round trip through stdin and stdout' || bad '5 MB round trip through stdin and stdout'

pids=(); for i in $(seq 1 10); do ( [ "$(timeout 30 ssh -o ControlMaster=no -o ControlPath=none "${O[@]}" "$A-exec" "echo $i")" = "$i" ] ) & pids+=($!); done
r=0; for p in "${pids[@]}"; do wait "$p" || r=1; done
[ $r = 0 ] && ok '10 parallel separate connections' || bad '10 parallel separate connections'

r=0; for i in $(seq 1 40); do [ "$(SSH "$A-exec" "echo $i")" = "$i" ] || r=1; done
[ $r = 0 ] && ok '40 commands in a row over a shared master' || bad '40 commands in a row over a shared master'
pids=(); for i in $(seq 1 10); do ( [ "$(SSH "$A-exec" "sleep 1; echo $i")" = "$i" ] ) & pids+=($!); done
r=0; for p in "${pids[@]}"; do wait "$p" || r=1; done
[ $r = 0 ] && ok '10 parallel channels over a shared master' || bad '10 parallel channels over a shared master'

s=$(date +%s); SSH "$A-sync" true 2>&1 | cat; e=$(( $(date +%s) - s ))
[ $e -lt 10 ] && ok 'a piped ssh does not wait for the background master' || bad "a piped ssh waited ${e}s for the background master"

[[ "$(SSH -tt "$A-shell" tty </dev/null | tr -d '\r')" == /dev/* ]] && ok 'ssh -t gives a command a terminal' || bad 'ssh -t gives a command a terminal'
SSH -tt "$A-shell" 'exit 9' </dev/null >/dev/null 2>&1; [ $? = 9 ] && ok 'ssh -t returns the exit code' || bad 'ssh -t returns the exit code'
SSH -T "$A-exec" </dev/null >/dev/null 2>&1; [ $? != 124 ] && ok 'a refused shell request fails without hanging' || bad 'a refused shell request hangs'

printf 'sftp-data' > "$T/up"
printf 'put %s %s-up\nget %s-up %s\nbye\n' "$T/up" "$V" "$V" "$T/down" | timeout 30 sftp "${O[@]}" -b - "$A-sftp" >/dev/null 2>&1
cmp -s "$T/up" "$T/down" && ok 'sftp put and get' || bad 'sftp put and get'
timeout 30 scp "${O[@]}" -s -q "$T/up" "$A-sftp:$V-scp" && ok 'scp -s on the sftp port' || bad 'scp -s on the sftp port'
timeout 30 scp "${O[@]}" -O -q "$T/up" "$A-sync:$V-scp-legacy" && ok 'legacy scp on the sync port' || bad 'legacy scp on the sync port'
timeout 30 sftp "${O[@]}" -b /dev/null "$A-sync" >/dev/null 2>&1; [ $? != 124 ] && ok 'sftp on a non-sftp port fails without hanging' || bad 'sftp on a non-sftp port hangs'

mkdir -p "$T/site/sub"; echo a > "$T/site/a"; echo b > "$T/site/sub/b"
if command -v rsync >/dev/null; then
  timeout 30 rsync -a -e "ssh ${O[*]}" "$T/site/" "$A-sync:$V-rsync/" \
    && [ "$(SSH "$A-exec" "cat $V-rsync/sub/b")" = b ] && ok 'rsync' || bad 'rsync'
fi
if command -v git >/dev/null; then
  SSH "$A-sync" "git init -q --bare $V.git" \
    && git -C "$T/site" init -q && git -C "$T/site" add . \
    && git -C "$T/site" -c user.name=t -c user.email=t@t commit -qm init \
    && GIT_SSH_COMMAND="ssh ${O[*]}" timeout 30 git -C "$T/site" push -q "$A-sync:$V.git" HEAD:refs/heads/main \
    && GIT_SSH_COMMAND="ssh ${O[*]}" timeout 30 git clone -q -b main "$A-sync:$V.git" "$T/clone" \
    && [ "$(cat "$T/clone/sub/b")" = b ] && ok 'git push and clone' || bad 'git push and clone'
fi

G() { ssh "${O[@]}" -G "$A-$1" </dev/null 2>/dev/null | awk -v k="$2" '$1==k{print $2; exit}'; }
# Options come first because ssh keeps the first value it sees. The pinned known_hosts
# means a refusal can only come from the server's key check, not from the host key.
out=$(timeout 15 ssh -o ControlMaster=no -o ControlPath=none -o BatchMode=yes -o IdentitiesOnly=yes \
  -o UserKnownHostsFile="$(G exec userknownhostsfile)" "${O[@]}" -i "$(G exec identityfile)" \
  -p "$(G shell port)" "$(G exec user)@$(G exec hostname)" true 2>&1 </dev/null)
[[ "$out" == *"Permission denied"* ]] && ok 'the exec key is refused on the shell port' || bad "the exec key on the shell port: $out"

echo "---"; echo "left on the server: ~/$V*"; [ $fails = 0 ] && echo "all checks passed" || echo "$fails check(s) failed"
exit $fails

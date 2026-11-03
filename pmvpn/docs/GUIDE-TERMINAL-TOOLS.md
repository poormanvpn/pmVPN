# Claude and other terminal tools

Log in once from your wallet. After that `ssh`, `sftp`, `scp`, `rsync`, `git`, paramiko
and Claude Code all reach the server with no wallet and no pmVPN client in the loop.

## Log in

```bash
cd pmvpn/crypto-ssh && pnpm install

# Get the fingerprint out of band, for example on the server's own console:
#   curl -s localhost:2203/status

# Hardware wallet or Foundry keystore: the key never enters pmVPN
pnpm keyring login --host vps1.example.net --alias vps1 --host-fp SHA256:… \
  --address 0xYourWallet \
  --sign-cmd 'cast wallet sign --ledger "$PMVPN_SIGN_MESSAGE"'

# Browser wallet: the command prints each message and you paste the signature
pnpm keyring login --host vps1.example.net --alias vps1 --host-fp SHA256:… --address 0xYourWallet

# Unattended agent or CI, with a wallet that exists only for this job
PMVPN_WALLET_KEY=0x… pnpm keyring login --host vps1.example.net --alias vps1 --host-fp SHA256:… --json
# or: --key-file ~/.pmvpn/agent.key   (mode 0600)
```

Login signs two messages. The first is the host-bound derivation message that produces
the keys. The second is a single-use challenge that proves you own the wallet. Each
signature is checked locally against your address before it is used. Only public keys
reach the server.

`--host-fp` pins the server you expect. Without it, login stops and shows the fingerprint
the server reported. `--tofu` accepts that fingerprint without checking it.

**Plain HTTP.** The challenge API has no TLS yet. Since 0.3.0 the enrolment signature
covers the pinned host, the nonce and a hash of your exact public keys, so a signature
seen on the network can only ever enrol your own keys. Traffic is still readable, though:
over the internet, prefer an HTTPS proxy in front of port +3 with `--api https://…`, or a
private network.

**Agent wallets.** A raw key on disk can do everything that wallet can do, including
spending. Give an agent its own empty wallet, never your treasury key.

## Which alias for which job

Login writes four aliases, one for each port that speaks SSH.

| Alias | Port | Use it for |
|---|---|---|
| `vps1-shell` | +0 | Terminals: `ssh vps1-shell`, `ssh -t vps1-shell htop`. Also runs commands. |
| `vps1-sftp` | +1 | `sftp vps1-sftp`, `scp -s file vps1-sftp:`. File transfer only. |
| `vps1-exec` | +2 | Scripted commands: `ssh vps1-exec 'uptime'`. No terminal. |
| `vps1-sync` | +5 | `rsync -a ./site/ vps1-sync:www/`, `git clone vps1-sync:repo.git`, `scp -O`. |

`scp` on the SFTP port needs SFTP mode, which is the default from OpenSSH 9 onward. Older
clients need `-s`, or use the sync alias.

## Multiple connections

Every alias multiplexes through `ControlMaster`, so repeated commands share one connection
and start almost instantly. Parallel work is fine. If a connection reaches
`PMVPN_MAX_SESSIONS_PER_CONNECTION`, OpenSSH opens another one, up to
`PMVPN_MAX_CONNECTIONS_PER_WALLET` for the wallet.

A shared connection stays open for 5 idle minutes and outlives a server-side revoke until
then. `pnpm keyring logout` closes shared connections on this machine before it revokes
and removes the keys:

```bash
pnpm keyring logout --host vps1.example.net --alias vps1 --address 0xYourWallet --sign-cmd '…'
```

## Claude Code

**Claude here, working on the server.** Tell Claude Code to use the aliases, or put them
in the project's `CLAUDE.md`. Its Bash tool then runs `ssh vps1-exec '…'` and
`rsync … vps1-sync:…` like any other command, with no wallet prompt.

**Claude on the server, driven from here.** It needs a terminal, so use the shell port:

```bash
ssh -t vps1-shell claude
```

For this, Claude must be on the session `PATH`, and the user needs room to write:

- Participant accounts have a 10 MB quota, too small for a per-user install. Install Claude
  system-wide on the server, or map the wallet to an admin (1 GB) in `wallets.json`.
- For a per-user install, set `PMVPN_SESSION_PATH=~/.local/bin:/usr/local/bin:/usr/bin:/bin`.
- To pass an API key without storing it on the server, add `ANTHROPIC_API_KEY` to
  `PMVPN_ACCEPT_ENV` on the server, then send it with
  `ssh -o SendEnv=ANTHROPIC_API_KEY -t vps1-shell claude`.

**A tool on the server, as a local MCP server.** The exec port carries stdin, stdout and
EOF cleanly, which is what a stdio MCP server needs:

```bash
claude mcp add remote-tool -- ssh vps1-exec /usr/local/bin/some-mcp-server
```

## Check a server

```bash
crypto-ssh/scripts/verify-terminal-tools.sh vps1
```

This runs real `ssh`, `sftp`, `scp`, `rsync` and `git` against the server, including
parallel connections, multiplexing, large transfers and the rule that a key only opens its
own port. It leaves its `pmvpn-verify-*` test files in the remote home and prints the name.

## Server settings

Every setting is explained in `server/.env.example`. For a server reached from outside:

```bash
PMVPN_HOST=0.0.0.0
PMVPN_PUBLIC_HOST=vps1.example.net
PMVPN_AUTO_REGISTER=false            # unless any wallet should get an account
WALLET_USER_MAP=0xYourWallet:alice
```

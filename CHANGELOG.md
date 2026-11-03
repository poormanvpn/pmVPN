# Changelog

All notable changes to pmVPN. Versions follow semver; the protocol version in
`/status` tracks the release.

## [0.3.0] — 2026-11-02

Security hardening from a full audit. The audit record is in `pmvpn/docs/AUDIT.md`.

### Breaking
- **Keyring enrolment and revocation sign a bound message** (`PMVPN-ENROL:v1:` /
  `PMVPN-REVOKE:v1:`, `crypto-ssh/src/enrol.ts`): host fingerprint, nonce and, for
  enrolment, a digest of the exact keys. Clients older than 0.3.0 can no longer enrol or
  revoke; login and existing rings are unaffected (the derivation is unchanged).
- `/provider` on the gateway port requires the admin role.
- `/diagnostics` ignores `X-Wallet` unless it comes with `X-Wallet-Nonce` and
  `X-Wallet-Signature` over a fresh challenge.
- Sessions on a non-root server run only for wallets mapped to the server's own account.
- Default share directory moves from `/tmp/pmvpn-shares` to `~/.pmvpn/shares`.

### Added
- Settings: `PMVPN_LOGIN_GRACE_SECONDS`, `PMVPN_MAX_AUTH_FAILURES`,
  `PMVPN_CHALLENGES_PER_MINUTE`, `PMVPN_HOSTINGER_MCP_VERSION`.
- Revoking a keyring ends the wallet's live SSH and WebSocket sessions.
- `pmvpn-keyring message --nonce N --keyring FILE` prints the enrolment text;
  `logout` accepts `--host-fp`.

### Fixed
- Malformed SSH passwords, WebSocket messages and HTTP requests could stop the server.
- The warden, the `authorized_keys` mirror and SFTP no longer act as root inside user homes;
  SFTP has no in-process root fallback; worker group drop failures are fatal.
- Shares: validated ids and names, creator-only writes, limits, private files.
- SFTP uploads honour write offsets and stop at the 50 MB limit as data arrives.
- Challenge store could be exhausted by one client; unauthenticated SSH sockets had no deadline.
- Hostinger: credentials stripped from API data; `npx` pinned, minimal environment.
- Client: HTML escaping of server, file, profile and chain data; CSP without inline scripts;
  xterm CSS bundled; signing restricted to pmVPN message shapes; Keys tab pins the host key;
  bootstrap validates the remote user; tool buttons used an undefined `term`; client
  type-checks cleanly.
- `wallets.json` is private and written atomically, and only after provisioning succeeds.
- `start-pmvpn-server.sh` sets `NODE_PATH`, so the production entry point finds `ws`.

## [0.2.0] — 2026-11-02

External connections, multiple connections, and login from wallet credentials.
Guide: `pmvpn/docs/GUIDE-TERMINAL-TOOLS.md`.

### Added
- **`pmvpn-keyring login` / `logout`** (`crypto-ssh/src/login.ts`): one command from wallet
  credentials to working `ssh`, `sftp`, `rsync` and `git`, for terminals and agents with no
  browser wallet. Signers: `--sign-cmd` (hardware wallet, Foundry keystore), pasted
  signatures, `--key-file`, `PMVPN_WALLET_KEY`. The host is pinned with `--host-fp`.
- `crypto-ssh/src/personal-sign.ts`: EIP-191 signing and recovery, matching the keyring vector.
- Settings: `PMVPN_ENV_FILE`, `PMVPN_PUBLIC_HOST`, `PMVPN_AUTO_REGISTER`,
  `PMVPN_MAX_CONNECTIONS_PER_PORT`, `PMVPN_MAX_CONNECTIONS_PER_WALLET`,
  `PMVPN_MAX_SESSIONS_PER_CONNECTION`, `PMVPN_KEEPALIVE_SECONDS`, `PMVPN_KEEPALIVE_COUNT_MAX`,
  `PMVPN_SESSION_PATH`, `PMVPN_ACCEPT_ENV`.
- `ssh -t host cmd` runs under a PTY on the shell port, so interactive programs such as
  `claude` work. Client `TERM` and allowlisted `SendEnv`/`SetEnv` variables are honoured.
- `/status` reports `publicHost`, `autoRegister`, `sshPorts` and `limits`.
- `crypto-ssh/scripts/verify-terminal-tools.sh`.

### Changed
- Generated `ssh_config`: aliases only for ports that speak SSH (+0, +1, +2, +5), with
  `ControlMaster` multiplexing and `ServerAlive` keepalives. All eight keys are still derived.
- `GET /challenge` requires a well-formed address and no longer registers the wallet.
  Registration happens after the signature verifies.
- The keyring derivation is unchanged (`KEYRING_VERSION` 1): existing rings stay valid.

### Fixed
- `.env` files were documented but never loaded.
- `pmvpn-keyring` crashed at startup: the v0.1.2 licence header sat above its shebang, as it
  also did in `remote-control-enhanced.ts`.
- Exec never passed stdin EOF, so `cmd | ssh host cat` hung, and it ignored backpressure.
  A command that failed to start could crash the server, and a signal-killed one reported success.
- Terminal resize never reached the PTY, shell exit codes were lost, and UTF-8 split across
  packets was corrupted.
- A request on the wrong port got no reply and hung the client; it now ends with a message.
- `scp` in SFTP mode reported failure after a successful copy (no exit status on the channel).

### Security
- Unsigned `GET /challenge` requests could grow `wallets.json` without limit.
- Bundles are refused when `host` or `user` could run shell code or add `ssh_config`
  directives. These values can come from a server's reply and went into a script the user runs.

## [0.1.2] — 2026-09-29

### Changed
- **pmVPN is licensed GPL-3.0-only, all of it**: the server, client, shared types, crypto-ssh, the vault module
  and blocktalk. pmVPN makes, holds and checks keys, and copyleft keeps every modification of that code open, so
  no black-box change to key handling can ship. The full text is in `LICENSE`; every source file carries
  `SPDX-License-Identifier: GPL-3.0-only`; the package manifests say `GPL-3.0-only`. `LICENSE-SERVER-MIT` is
  retired.
- Releases up to v0.1.1 keep the licences they were published under (MIT server, shared and crypto-ssh; GPL-3.0
  client).
- Version and protocol version 0.1.1 → 0.1.2. There are no functional changes.

## [0.1.1] — 2026-09-23

### Added
- **Keyring** — one wallet signature derives eight port-scoped Ed25519 keys
  (`pmvpn/crypto-ssh/src/keyring.ts`, isomorphic Node + browser). Key *i* is accepted
  only on port base+*i*. `PMVPN_KEYRING_SIZE` raises the ring above 8.
- **Publickey authentication** on every SSH port alongside the wallet-JSON password
  method. Stock OpenSSH, `sftp`, `scp`, rsync, git and paramiko now log in.
- `POST` / `GET` / `DELETE /keyring` on the challenge and admin ports; `/status` reports
  `hostFingerprint`, `basePort`, `keyringSize`.
- Keyring mirror into the jailed user's `~/.ssh/authorized_keys` with per-index
  options (`restrict`, `internal-sftp`, `port-forwarding`), never touching other lines.
- Self-extracting bundle (`pmvpn-keyring-<alias>.sh`): keys, `ssh_config` aliases,
  pinned `known_hosts`. Client **Keys** tab: derive · enrol · download · revoke.
- `pmvpn-keyring` CLI (`message` / `derive` / `enrol`) and
  `scripts/verify-paramiko.py`.
- `pmvpn-warden keyring-install` / `keyring-remove`; `show` lists the ring.
- crypto-ssh test suite (`pnpm test`, `node --test` via tsx) with a fixed
  cross-implementation vector cross-checked against `ssh-keygen`.
- `docs/KEYRING.md`; `.env.example` now lists every variable the server reads.

### Changed
- `crypto-ssh` emits unencrypted openssh-key-v1 private keys (`privateKeyOpenSSH`)
  next to PKCS#8; key comments lowercase the wallet address. It now depends on
  `@noble/curves` and `@noble/hashes` (the primitives viem already ships).
- Protocol/package version 0.1.0 → 0.1.1 everywhere; `start-pmvpn-server.sh`
  uses `pnpm exec tsx`.
- `pmvpn-warden.sh` carries `VERSION="2"` so the boot-time self-install stops
  rewriting it on every start.

### Fixed
- `crypto-ssh` called `require('crypto')` inside an ES module and threw at runtime;
  a dead `generateKeyPairSync` call generated and discarded a random keypair per derivation.
- SFTP subsystem: an empty directory replied with an empty NAME packet instead of
  EOF, and the channel was never closed after the client's EOF — stock `sftp ls`
  hung in both cases.

## [0.1.0] — 2026-05-22

Initial public tree: eight-port wallet-authenticated SSH server, Tauri/browser
client, PM Protocol tunnel, jail warden and privilege drop.

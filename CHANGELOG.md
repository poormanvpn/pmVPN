# Changelog

All notable changes to pmVPN. Versions follow semver; the protocol version in
`/status` tracks the release.

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

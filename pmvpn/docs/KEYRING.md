# Keyring — one wallet signature, eight port-scoped SSH keys

*pmVPN 0.1.1*

pmVPN's promise is "your wallet is your SSH key". Until 0.1.1 that was only true
inside pmVPN's own client: the server accepted one authentication method, a JSON
blob in the SSH password field, so stock `ssh`, `sftp`, `rsync`, `git` and
paramiko could not log in at all. The keyring closes that gap without giving up
the wallet as the root of identity.

```
  wallet ── personal_sign("PMVPN-KEYRING:v1:<host fingerprint>") ──► signature
                                                                        │
                                                        SHA-256 ────────┘
                                                                        │ master seed (never stored)
             HKDF-SHA256(salt="pmvpn-keyring", info="ed25519:<fp>:<i>:<slug>")
                                                                        │
     k0-shell  k1-sftp  k2-exec  k3-challenge  k4-tunnel  k5-sync  k6-claude  k7-admin
       :2200     :2201    :2202      :2203        :2204      :2205    :2206      :2207
```

## Why eight keys instead of one

| One key | Eight keys |
|---|---|
| A leaked key opens every service | A leaked SFTP key opens SFTP; it is refused on the shell, exec and tunnel ports |
| Revoking means re-keying every client | Revoke one index; the other seven keep working |
| `authorized_keys` options are all-or-nothing | Each index carries its own options when a stock sshd reads the file |
| Fleet or future services must share the key | Indices 8+ are free; `PMVPN_KEYRING_SIZE=12` lets a wallet enrol more |

The server enforces the scope itself: on every SSH port `key.index === port offset`
or the key is refused (`pmvpn/server/src/ssh/handler.ts`). The mirror lines in the
bound user's `~/.ssh/authorized_keys` carry per-index options so an OpenSSH sshd on
the same box keeps the scoping too:

| Index | Port | Slug | authorized_keys options |
|---|---|---|---|
| 0 | +0 | shell | *(none)* |
| 1 | +1 | sftp | `restrict,command="internal-sftp"` |
| 2 | +2 | exec | `restrict` |
| 3 | +3 | challenge | `restrict` |
| 4 | +4 | tunnel | `restrict,port-forwarding` |
| 5 | +5 | sync | `restrict` |
| 6 | +6 | claude | `restrict` |
| 7 | +7 | admin | `restrict` |
| 8+ | — | `k<i>` | `restrict` |

## Derivation

Defined once in `pmvpn/crypto-ssh/src/keyring.ts` and mirrored byte for byte by
the PARSEC Rust implementation. Any two implementations that agree on the vector
in `pmvpn/crypto-ssh/test/keyring.test.ts` produce the same ring.

| Step | Value |
|---|---|
| Message | `PMVPN-KEYRING:v1:` + the server's host-key fingerprint (`SHA256:…`, padding stripped) |
| Signature | EIP-191 `personal_sign` of the message, 65 bytes. MetaMask, Ledger, viem and bankon_vault all sign deterministically (RFC 6979), so the ring is reproducible. |
| Master seed | `SHA-256(signature)`, 32 bytes, held in memory only |
| Key *i* | `HKDF-SHA256(ikm = seed, salt = "pmvpn-keyring", info = "ed25519:<fp>:<i>:<slug>", L = 32)` → Ed25519 seed |
| Public line | `ssh-ed25519 <base64 blob> pmvpn:<wallet lowercase>:k<i>:<slug>` |
| Private file | unencrypted openssh-key-v1, check integers derived from the public key so output is deterministic |
| Fingerprint | `SHA256:<base64, no padding>` — identical to `ssh-keygen -lf` |

Binding the message to the host fingerprint means every server gets its own ring
and the wallet prompt names the machine the keys are for. A phishing page cannot
obtain the ring for host A by asking for a signature "for" host B.

**Threat model.** The wallet's private key never enters the derivation; only a
signature does. Compromising a ring key does not reveal the seed (HKDF is one-way)
and never touches the wallet. Compromising the *seed* reveals the whole ring for
that host, so the client zeroes it as soon as the keys exist and never writes it.
Anyone who can make the wallet sign the exact derivation message can rebuild the
ring; the message is therefore explicit, versioned and host-bound, and wallets show
it in full before signing.

## Enrolment

```
POST http://<host>:<base+3>/keyring
{ "address": "0x…", "signature": "0x…", "nonce": "…",     ← the usual challenge, signed
  "hostFingerprint": "SHA256:…",                          ← must equal the server's
  "keys": [ { "index": 0, "publicKey": "ssh-ed25519 AAAA…" }, … ] }
```

The server runs the same three steps as SSH login (consume nonce → `viem.verifyMessage`
→ `provisionWallet`), refuses a fingerprint that is not its own, stores the public
keys in `~/.pmvpn/keyrings/<wallet>.json`, rewrites only the `pmvpn:<wallet>:k*`
lines of the user's `authorized_keys`, and answers with everything a client needs:

```
{ "enrolled": 8, "user": "w1234abcd", "hostFingerprint": "SHA256:…", "hostKey": "ssh-ed25519 AAAA…",
  "basePort": 2200, "keyringSize": 8, "keys": [ { index, slug, publicKey, fingerprint } … ],
  "sshConfig": "Host <host>-shell\n  HostName …", "knownHosts": "[host]:2200 ssh-ed25519 …" }
```

`GET /keyring?address=0x…` lists indices and fingerprints (public data).
`DELETE /keyring` with a signed nonce revokes the ring and strips the mirror lines.
`GET /status` now includes `hostFingerprint`, `basePort` and `keyringSize`.

## The bundle — a working environment in one file

The client (Keys tab, or `pmvpn-keyring derive …`) writes `pmvpn-keyring-<alias>.sh`:
a POSIX `sh` script whose private keys sit in quoted heredocs. Running it installs

```
~/.pmvpn/keys/<alias>/k0-shell … k7-admin   (0600)   + .pub files
~/.pmvpn/keys/<alias>/ssh_config             one Host alias per port, absolute paths
~/.pmvpn/keys/<alias>/known_hosts            the server host key pinned for every port
~/.ssh/config                                gains `Include ~/.pmvpn/keys/<alias>/ssh_config` once
~/.ssh/known_hosts                           gains the missing lines only
```

After that, with nothing pmVPN-specific in the loop:

```bash
ssh  vps1-shell            # interactive terminal, k0
sftp vps1-sftp             # file transfer, k1
ssh  vps1-exec 'uptime'    # scripted commands, k2
rsync -e 'ssh -F ~/.ssh/config' ./site/ vps1-sftp:www/
```

and from Python:

```python
import paramiko
key = paramiko.Ed25519Key.from_private_key_file('~/.pmvpn/keys/vps1/k2-exec')
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('vps1.example.net', port=2202, username='w1234abcd', pkey=key)
```

`pmvpn/crypto-ssh/scripts/verify-paramiko.py` does exactly this and also proves the
scoping (`--expect-fail` on the wrong port). The username may be the bound Linux
user, the wallet address, or `pmvpn`; the key already says which wallet it is.

## CLI

```bash
cd pmvpn/crypto-ssh && pnpm install
pnpm keyring message --host-fp SHA256:…                       # text to sign in your wallet
pnpm keyring derive  --signature 0x… --host-fp SHA256:… --address 0x… \
     --host vps1.example.net --base-port 2200 --user w1234abcd \
     --host-key 'ssh-ed25519 AAAA…' --alias vps1 --out ./ring     # keys + ssh_config + bundle
pnpm keyring enrol   --server http://vps1.example.net:2203 --address 0x… \
     --signature 0x… --nonce … --keyring ./ring/keyring.json      # after signing the challenge
```

## Revoke and rotate

- **Server side**: Keys tab → Revoke, or `DELETE /keyring`, or `pmvpn-warden keyring-remove <user|wallet>`.
- **Client side**: delete `~/.pmvpn/keys/<alias>` and the `Include` line.
- **Rotate**: revoke, then derive again. The ring is deterministic for a given
  wallet and host key, so rotation means rotating the *server host key*
  (`~/.pmvpn/hostkey`) or the wallet. That is deliberate: a ring is a function of
  the two identities it connects.

## Compatibility

| Consumer | Works with | Notes |
|---|---|---|
| OpenSSH `ssh`/`sftp`/`scp` | 7.x+ | openssh-key-v1 private keys, `IdentitiesOnly yes` |
| paramiko | 2.x+ | `Ed25519Key.from_private_key_file` |
| ssh2 (Node) | 1.x | pmVPN's own server library |
| rsync, git, ansible | any | via `ssh -F ~/.ssh/config <alias>` |
| Legacy `pmvpn:<wallet>:v1` warden key | unchanged | still written by `pmvpn-create-user.sh`; never removed by the ring |

Older pmVPN clients keep using the JSON-password method; both methods land in the
same `provisionWallet()` and run as the same jailed user.

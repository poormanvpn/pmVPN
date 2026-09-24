// crypto-ssh: the pmVPN keyring — one wallet signature, N port-scoped Ed25519 keys
// MIT License
//
// The browser and Tauri clients never hold the wallet's private key, so the ring is
// derived from a *signature*, not from key bytes:
//
//   msg   = "PMVPN-KEYRING:v1:<server host-key SHA256 fingerprint>"
//   sig   = personal_sign(msg)                 (RFC 6979 makes secp256k1 signing deterministic)
//   seed  = SHA-256(sig)                       (32-byte master seed, never stored)
//   key_i = HKDF-SHA256(ikm=seed, salt="pmvpn-keyring", info="ed25519:<fp>:<i>:<slug>")
//
// Binding the message to the host fingerprint gives every server its own ring and
// makes the wallet prompt say which machine the keys are for. Index i is the port
// offset: key 0 opens the shell port and nothing else, key 1 the SFTP port, and so on.
// Sizes above 8 are allowed so fleet or future services can claim indices 8+.
//
// This file is isomorphic (Node and browser). It uses @noble/curves and
// @noble/hashes — the same audited primitives viem already ships — and no Buffer.

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';

// ─── Constants (mirrored in shared/src/constants.ts and server/src/shared.ts) ──

export const KEYRING_VERSION = 1;
export const KEYRING_MESSAGE_PREFIX = 'PMVPN-KEYRING:v1:';
export const KEYRING_SALT = 'pmvpn-keyring';
export const DEFAULT_KEYRING_SIZE = 8;

/** Short names for the eight core ports; indices beyond 8 become `k<i>`. */
export const PORT_SLUGS: readonly string[] = [
  'shell', 'sftp', 'exec', 'challenge', 'tunnel', 'sync', 'claude', 'admin',
];

export function portSlug(index: number): string {
  return PORT_SLUGS[index] ?? `k${index}`;
}

/**
 * authorized_keys options per index. They only matter when a stock OpenSSH sshd on
 * the same box reads the file; the pmVPN server enforces scoping by port instead.
 * Key 0 is the shell key and gets no restriction.
 */
export function authorizedKeysOptions(index: number): string {
  switch (index) {
    case 0: return '';
    case 1: return 'restrict,command="internal-sftp"';
    case 2: return 'restrict';
    case 4: return 'restrict,port-forwarding';
    default: return 'restrict';
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KeyringKey {
  /** Port offset this key is valid for. */
  index: number;
  /** Human slug: shell, sftp, exec, … or k<i>. */
  slug: string;
  /** 32-byte Ed25519 seed. Wipe it when done. */
  seed: Uint8Array;
  /** 32-byte Ed25519 public key. */
  publicKey: Uint8Array;
  /** `ssh-ed25519 <base64 blob> <comment>` */
  publicKeyLine: string;
  /** Unencrypted openssh-key-v1 PEM — what OpenSSH and paramiko load. */
  privateKeyOpenSSH: string;
  /** `SHA256:<base64 without padding>` as ssh-keygen -l prints it. */
  fingerprint: string;
  /** `pmvpn:<wallet>:k<i>:<slug>` */
  comment: string;
}

export interface KeyringOptions {
  /** Number of keys, default 8. */
  size?: number;
}

export interface KeyringPublicEntry {
  index: number;
  slug: string;
  publicKey: string;     // the full authorized_keys-style line without options
  fingerprint: string;
}

// ─── Derivation ──────────────────────────────────────────────────────────────

/** The exact text the wallet signs. */
export function derivationMessage(hostFingerprint: string): string {
  if (!/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(hostFingerprint)) {
    throw new Error('hostFingerprint must be an OpenSSH SHA256:<base64> fingerprint');
  }
  return `${KEYRING_MESSAGE_PREFIX}${hostFingerprint.replace(/=$/, '')}`;
}

/** SHA-256 of the 65-byte EIP-191 signature → 32-byte master seed. */
export function seedFromSignature(signatureHex: string): Uint8Array {
  const sig = hexToBytes(signatureHex);
  if (sig.length !== 65 && sig.length !== 64) {
    throw new Error(`signature must be 64 or 65 bytes (got ${sig.length})`);
  }
  const seed = sha256(sig);
  sig.fill(0);
  return seed;
}

/** HKDF info string for one index. */
export function keyInfo(hostFingerprint: string, index: number): string {
  return `ed25519:${hostFingerprint.replace(/=$/, '')}:${index}:${portSlug(index)}`;
}

/**
 * Derive the ring. `address` is only used for the key comments; it is lowercased.
 */
export function deriveKeyring(
  masterSeed: Uint8Array,
  hostFingerprint: string,
  address: string,
  opts: KeyringOptions = {},
): KeyringKey[] {
  if (masterSeed.length !== 32) throw new Error('master seed must be 32 bytes');
  const size = opts.size ?? DEFAULT_KEYRING_SIZE;
  if (!Number.isInteger(size) || size < 1 || size > 64) {
    throw new Error('keyring size must be an integer in 1..64');
  }
  const wallet = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new Error('address must be 0x + 40 hex chars');

  const salt = utf8(KEYRING_SALT);
  const keys: KeyringKey[] = [];
  for (let i = 0; i < size; i++) {
    const seed = hkdf(sha256, masterSeed, salt, utf8(keyInfo(hostFingerprint, i)), 32);
    const publicKey = ed25519.getPublicKey(seed);
    const slug = portSlug(i);
    const comment = `pmvpn:${wallet}:k${i}:${slug}`;
    keys.push({
      index: i,
      slug,
      seed,
      publicKey,
      publicKeyLine: publicKeyLine(publicKey, comment),
      privateKeyOpenSSH: encodeOpenSSHPrivateKey(seed, publicKey, comment),
      fingerprint: fingerprintSSH(publicKey),
      comment,
    });
  }
  return keys;
}

/** Zero every seed in a ring once the bundle has been written. */
export function wipeKeyring(keys: KeyringKey[]): void {
  for (const k of keys) k.seed.fill(0);
}

/** The server-facing view: public material only. */
export function toPublicEntries(keys: KeyringKey[]): KeyringPublicEntry[] {
  return keys.map((k) => ({
    index: k.index,
    slug: k.slug,
    publicKey: k.publicKeyLine,
    fingerprint: k.fingerprint,
  }));
}

// ─── SSH wire encodings ──────────────────────────────────────────────────────

const KEY_TYPE = 'ssh-ed25519';

/** The `ssh-ed25519` public key blob: string(type) ‖ string(pub). */
export function sshPublicKeyBlob(publicKey: Uint8Array): Uint8Array {
  return concat(sshString(utf8(KEY_TYPE)), sshString(publicKey));
}

export function publicKeyLine(publicKey: Uint8Array, comment: string): string {
  return `${KEY_TYPE} ${toBase64(sshPublicKeyBlob(publicKey))} ${comment}`;
}

/** `SHA256:<base64, no padding>` — matches `ssh-keygen -lf`. */
export function fingerprintSSH(publicKey: Uint8Array): string {
  return `SHA256:${toBase64(sha256(sshPublicKeyBlob(publicKey))).replace(/=+$/, '')}`;
}

/** Parse an `ssh-ed25519 AAAA… comment` line back to its 32-byte public key. */
export function parsePublicKeyLine(line: string): { publicKey: Uint8Array; comment: string } {
  const parts = line.trim().split(/\s+/);
  const typeIdx = parts.indexOf(KEY_TYPE);
  if (typeIdx === -1 || !parts[typeIdx + 1]) throw new Error('not an ssh-ed25519 public key line');
  const blob = fromBase64(parts[typeIdx + 1]);
  let off = 0;
  const readString = () => {
    const len = readU32(blob, off); off += 4;
    const s = blob.subarray(off, off + len); off += len;
    return s;
  };
  const type = bytesToUtf8(readString());
  if (type !== KEY_TYPE) throw new Error(`expected ${KEY_TYPE} blob, got ${type}`);
  const publicKey = readString();
  if (publicKey.length !== 32) throw new Error('ed25519 public key must be 32 bytes');
  return { publicKey: new Uint8Array(publicKey), comment: parts.slice(typeIdx + 2).join(' ') };
}

/**
 * Unencrypted openssh-key-v1 private key (PROTOCOL.key in the OpenSSH sources).
 * The two check integers are derived from the public key instead of drawn at
 * random so a given seed always produces byte-identical output — the ring is
 * deterministic end to end, which is what makes cross-implementation tests possible.
 */
export function encodeOpenSSHPrivateKey(seed: Uint8Array, publicKey: Uint8Array, comment: string): string {
  const check = sha256(publicKey).subarray(0, 4);
  const priv = concat(
    check, check,
    sshString(utf8(KEY_TYPE)),
    sshString(publicKey),
    sshString(concat(seed, publicKey)),
    sshString(utf8(comment)),
  );
  const padLen = (8 - (priv.length % 8)) % 8;
  const pad = new Uint8Array(padLen);
  for (let i = 0; i < padLen; i++) pad[i] = i + 1;

  const body = concat(
    utf8('openssh-key-v1\0'),
    sshString(utf8('none')),
    sshString(utf8('none')),
    sshString(new Uint8Array(0)),
    u32(1),
    sshString(sshPublicKeyBlob(publicKey)),
    sshString(concat(priv, pad)),
  );
  const b64 = toBase64(body).replace(/(.{70})/g, '$1\n').replace(/\n$/, '');
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

// ─── Delivery: ssh_config, known_hosts, and the self-extracting bundle ───────

export interface BundleTarget {
  /** Hostname or IP the client will dial. */
  host: string;
  /** Base port of the eight-port block (2200 by default). */
  basePort: number;
  /** Linux user the wallet is bound to on the server. */
  user: string;
  /** `ssh-ed25519 AAAA…` line of the server host key (no hostname prefix). */
  hostKeyPublicLine: string;
  /** Short alias used for Host entries and the key directory, e.g. `vps1`. */
  alias?: string;
}

function aliasOf(t: BundleTarget): string {
  const a = (t.alias || t.host).toLowerCase().replace(/[^a-z0-9.-]/g, '-');
  return a || 'pmvpn';
}

export function keyFileName(k: Pick<KeyringKey, 'index' | 'slug'>): string {
  return `k${k.index}-${k.slug}`;
}

/**
 * ssh_config with one Host alias per port. `keyDir` is where the bundle puts the
 * keys; the self-extracting script passes the literal `$DIR` so the installed
 * config carries absolute paths and the per-host known_hosts, and works with
 * `ssh -F` from anywhere.
 */
export function renderSshConfig(
  t: BundleTarget,
  keys: Pick<KeyringKey, 'index' | 'slug'>[],
  opts: { keyDir?: string } = {},
): string {
  const alias = aliasOf(t);
  const dir = opts.keyDir ?? `~/.pmvpn/keys/${alias}`;
  const out: string[] = [
    `# pmVPN keyring for ${t.host} — one Host per port, one key per Host.`,
    `# Generated by pmVPN; re-run the bundle to refresh. Delete ${dir} to revoke locally.`,
    '',
  ];
  for (const k of keys) {
    out.push(
      `Host ${alias}-${k.slug}`,
      `  HostName ${t.host}`,
      `  Port ${t.basePort + k.index}`,
      `  User ${t.user}`,
      `  IdentityFile ${dir}/${keyFileName(k)}`,
      `  IdentitiesOnly yes`,
      `  UserKnownHostsFile ${dir}/known_hosts`,
      `  PreferredAuthentications publickey`,
      `  ForwardAgent no`,
      '',
    );
  }
  return out.join('\n');
}

export function renderKnownHosts(t: BundleTarget, keys: Pick<KeyringKey, 'index'>[]): string {
  const [type, b64] = t.hostKeyPublicLine.trim().split(/\s+/);
  if (type !== KEY_TYPE || !b64) throw new Error('hostKeyPublicLine must be an ssh-ed25519 line');
  return keys.map((k) => `[${t.host}]:${t.basePort + k.index} ${type} ${b64}`).join('\n') + '\n';
}

/**
 * A POSIX sh script that installs the ring. Private keys ride inside quoted
 * heredocs, so nothing is interpolated. It never overwrites files it did not
 * write, appends the Include once, and appends only missing known_hosts lines.
 */
export function renderBundleScript(t: BundleTarget, keys: KeyringKey[]): string {
  const alias = aliasOf(t);
  const lines: string[] = [
    '#!/bin/sh',
    `# pmVPN keyring bundle — ${t.host} (${keys.length} keys) — generated ${new Date().toISOString()}`,
    '# Installs port-scoped Ed25519 keys, an ssh_config Include and known_hosts lines.',
    '# Review it, then: sh pmvpn-keyring-' + alias + '.sh',
    'set -eu',
    `ALIAS="${alias}"`,
    'DIR="$HOME/.pmvpn/keys/$ALIAS"',
    'umask 077',
    'mkdir -p "$DIR" "$HOME/.ssh"',
    'chmod 700 "$HOME/.pmvpn" "$HOME/.ssh" 2>/dev/null || true',
    '',
  ];
  for (const k of keys) {
    const f = keyFileName(k);
    lines.push(
      `cat > "$DIR/${f}" <<'PMVPN_KEY'`,
      k.privateKeyOpenSSH.replace(/\n$/, ''),
      'PMVPN_KEY',
      `chmod 600 "$DIR/${f}"`,
      `printf '%s\\n' '${k.publicKeyLine}' > "$DIR/${f}.pub"`,
      '',
    );
  }
  lines.push(
    // Unquoted heredoc on purpose: $DIR expands to the absolute key directory.
    // The config contains no other `$`, backticks or backslashes.
    `cat > "$DIR/ssh_config" <<PMVPN_CFG`,
    renderSshConfig(t, keys, { keyDir: '$DIR' }).replace(/\n$/, ''),
    'PMVPN_CFG',
    '',
    `cat > "$DIR/known_hosts" <<'PMVPN_KH'`,
    renderKnownHosts(t, keys).replace(/\n$/, ''),
    'PMVPN_KH',
    '',
    'INCLUDE="Include $DIR/ssh_config"',
    'touch "$HOME/.ssh/config"',
    'if ! grep -qF "$INCLUDE" "$HOME/.ssh/config"; then',
    '  # Include must precede the first Host block to apply everywhere.',
    '  { printf \'%s\\n\' "$INCLUDE"; cat "$HOME/.ssh/config"; } > "$HOME/.ssh/config.pmvpn.tmp"',
    '  mv "$HOME/.ssh/config.pmvpn.tmp" "$HOME/.ssh/config"',
    'fi',
    '# Also pin the host key globally so plain `ssh -p PORT host` sees it.',
    'touch "$HOME/.ssh/known_hosts"',
    'while IFS= read -r line; do',
    '  [ -n "$line" ] || continue',
    '  grep -qF "$line" "$HOME/.ssh/known_hosts" || printf \'%s\\n\' "$line" >> "$HOME/.ssh/known_hosts"',
    'done < "$DIR/known_hosts"',
    '',
    `echo "pmVPN keyring installed in $DIR"`,
    `echo "  ssh  ${alias}-shell        # interactive terminal"`,
    `echo "  sftp ${alias}-sftp         # file transfer"`,
    `echo "  ssh  ${alias}-exec id      # non-interactive command"`,
    '',
  );
  return lines.join('\n');
}

// ─── Byte helpers (no Buffer) ────────────────────────────────────────────────

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function bytesToUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) throw new Error('invalid hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export function toBase64(b: Uint8Array): string {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff; b[1] = (n >>> 16) & 0xff; b[2] = (n >>> 8) & 0xff; b[3] = n & 0xff;
  return b;
}

function readU32(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

function sshString(b: Uint8Array): Uint8Array {
  return concat(u32(b.length), b);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

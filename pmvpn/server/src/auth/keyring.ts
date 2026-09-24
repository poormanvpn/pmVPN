// Keyring store — enrolled public keys, one ring per wallet, one key per port
// MIT License
//
// ~/.pmvpn/keyrings/<wallet>.json holds PUBLIC material only. The private halves
// exist solely on the client that derived them. On boot every ring is indexed by
// key blob so publickey auth is a single Map lookup.
//
// The same keys are mirrored into the bound user's ~/.ssh/authorized_keys with the
// tag `pmvpn:<wallet>:k<i>:<slug>` so a stock OpenSSH sshd on the box honours them
// too; per-index options keep the scoping there (k1 → internal-sftp, k4 → forwarding
// only, everything but k0 → restrict). Lines that are not ours are never touched.

import { createHash } from 'node:crypto';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, chownSync, chmodSync, renameSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { KEYRING_SIZE } from '../config/ports.js';
import { portSlug, KEYRING_VERSION } from '../shared.js';
import type { KeyringEntry } from '../shared.js';
import { logger } from '../utils/logger.js';
import { lookupUser, canDropPrivileges } from '../utils/userinfo.js';

const KEYRINGS_DIR = join(homedir(), '.pmvpn', 'keyrings');
const BASE_HOME = process.env.PMVPN_HOME_BASE || '/home';

export interface StoredKeyring {
  version: number;
  address: string;
  hostFingerprint: string;
  enrolledAt: number;
  keys: KeyringEntry[];
}

export interface IndexedKey {
  address: string;
  index: number;
  slug: string;
  fingerprint: string;
}

// blob (base64) → owner + index
const byBlob = new Map<string, IndexedKey>();
const rings = new Map<string, StoredKeyring>();

// ─── Public key parsing (Buffer flavour of crypto-ssh/keyring.ts) ────────────

export function parseEd25519Line(line: string): { blob: Buffer; b64: string; comment: string } {
  const parts = line.trim().split(/\s+/);
  const i = parts.indexOf('ssh-ed25519');
  if (i === -1 || !parts[i + 1]) throw new Error('not an ssh-ed25519 line');
  const blob = Buffer.from(parts[i + 1], 'base64');
  // string("ssh-ed25519") ‖ string(32 bytes)
  if (blob.length !== 4 + 11 + 4 + 32) throw new Error('malformed ed25519 key blob');
  if (blob.readUInt32BE(0) !== 11 || blob.subarray(4, 15).toString() !== 'ssh-ed25519') throw new Error('malformed ed25519 key blob');
  if (blob.readUInt32BE(15) !== 32) throw new Error('malformed ed25519 key blob');
  return { blob, b64: blob.toString('base64'), comment: parts.slice(i + 2).join(' ') };
}

export function fingerprintOf(blob: Buffer): string {
  return 'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
}

export function authorizedKeysOptions(index: number): string {
  switch (index) {
    case 0: return '';
    case 1: return 'restrict,command="internal-sftp"';
    case 2: return 'restrict';
    case 4: return 'restrict,port-forwarding';
    default: return 'restrict';
  }
}

function tagFor(address: string, index: number): string {
  return `pmvpn:${address}:k${index}:${portSlug(index)}`;
}

// ─── Store ───────────────────────────────────────────────────────────────────

function ringPath(address: string): string {
  return join(KEYRINGS_DIR, `${address}.json`);
}

function indexRing(ring: StoredKeyring): void {
  rings.set(ring.address, ring);
  for (const k of ring.keys) {
    try {
      const { b64 } = parseEd25519Line(k.publicKey);
      byBlob.set(b64, { address: ring.address, index: k.index, slug: k.slug, fingerprint: k.fingerprint });
    } catch (err: any) {
      logger.warn({ address: ring.address, index: k.index, err: err.message }, 'skipping malformed keyring entry');
    }
  }
}

function unindexRing(address: string): void {
  const ring = rings.get(address);
  if (!ring) return;
  for (const k of ring.keys) {
    try { byBlob.delete(parseEd25519Line(k.publicKey).b64); } catch {}
  }
  rings.delete(address);
}

/** Load every ring from disk. Call once at boot. */
export function loadKeyrings(): number {
  if (!existsSync(KEYRINGS_DIR)) return 0;
  let n = 0;
  for (const f of readdirSync(KEYRINGS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const ring = JSON.parse(readFileSync(join(KEYRINGS_DIR, f), 'utf-8')) as StoredKeyring;
      if (!ring?.address || !Array.isArray(ring.keys)) continue;
      indexRing(ring);
      n++;
    } catch (err: any) {
      logger.warn({ file: f, err: err.message }, 'failed to load keyring');
    }
  }
  logger.info({ rings: n, keys: byBlob.size }, 'keyrings loaded');
  return n;
}

export function getKeyring(address: string): StoredKeyring | null {
  return rings.get(address.toLowerCase()) ?? null;
}

/** O(1) lookup used by publickey auth. */
export function findByBlob(blob: Buffer): IndexedKey | null {
  return byBlob.get(blob.toString('base64')) ?? null;
}

/**
 * Validate and persist a ring. Throws with a client-safe message on bad input.
 * A key blob may belong to exactly one wallet; re-enrolling replaces the wallet's ring.
 */
export function saveKeyring(
  address: string,
  hostFingerprint: string,
  keys: Array<{ index: number; publicKey: string }>,
): StoredKeyring {
  const addr = address.toLowerCase();
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('keys must be a non-empty array');
  if (keys.length > KEYRING_SIZE) throw new Error(`keyring size ${keys.length} exceeds server limit ${KEYRING_SIZE}`);

  const seen = new Set<number>();
  const entries: KeyringEntry[] = [];
  for (const k of keys) {
    if (!Number.isInteger(k.index) || k.index < 0 || k.index >= KEYRING_SIZE) throw new Error(`bad key index ${k.index}`);
    if (seen.has(k.index)) throw new Error(`duplicate key index ${k.index}`);
    seen.add(k.index);
    if (typeof k.publicKey !== 'string' || k.publicKey.length > 512) throw new Error(`bad public key at index ${k.index}`);
    const { blob, b64 } = parseEd25519Line(k.publicKey);
    const owner = byBlob.get(b64);
    if (owner && owner.address !== addr) throw new Error(`key ${k.index} is already enrolled by another wallet`);
    entries.push({
      index: k.index,
      slug: portSlug(k.index),
      publicKey: `ssh-ed25519 ${b64} ${tagFor(addr, k.index)}`,
      fingerprint: fingerprintOf(blob),
    });
  }
  entries.sort((a, b) => a.index - b.index);

  const ring: StoredKeyring = {
    version: KEYRING_VERSION,
    address: addr,
    hostFingerprint,
    enrolledAt: Date.now(),
    keys: entries,
  };

  mkdirSync(KEYRINGS_DIR, { recursive: true, mode: 0o700 });
  unindexRing(addr);
  writeFileSync(ringPath(addr), JSON.stringify(ring, null, 2) + '\n', { mode: 0o600 });
  indexRing(ring);
  logger.info({ address: addr, keys: entries.length }, 'keyring enrolled');
  return ring;
}

export function deleteKeyring(address: string): boolean {
  const addr = address.toLowerCase();
  const had = rings.has(addr);
  unindexRing(addr);
  try { unlinkSync(ringPath(addr)); } catch {}
  if (had) logger.info({ address: addr }, 'keyring revoked');
  return had;
}

// ─── authorized_keys mirror ──────────────────────────────────────────────────

function authorizedKeysPathFor(username: string): { path: string; uid?: number; gid?: number } | null {
  // Same rule as provision.ts: the jail lives under PMVPN_HOME_BASE. In production
  // that is the passwd home; in a non-root dev run it keeps us out of the real ~/.ssh.
  const info = lookupUser(username);
  const home = join(BASE_HOME, username);
  if (!existsSync(home)) return null;
  return { path: join(home, '.ssh', 'authorized_keys'), uid: info?.uid, gid: info?.gid };
}

/**
 * Rewrite the wallet's `pmvpn:<wallet>:k*` lines in the user's authorized_keys.
 * Pass an empty ring to strip them. Other lines are preserved byte for byte.
 * Returns the number of lines written, or -1 when the home is not reachable.
 */
export function syncAuthorizedKeys(username: string, address: string, ring: StoredKeyring | null): number {
  const addr = address.toLowerCase();
  const target = authorizedKeysPathFor(username);
  if (!target) {
    logger.warn({ username }, 'authorized_keys sync skipped — home directory missing');
    return -1;
  }
  const sshDir = join(target.path, '..');
  const marker = `pmvpn:${addr}:k`;
  let existing: string[] = [];
  try { existing = readFileSync(target.path, 'utf-8').split('\n'); } catch {}
  const kept = existing.filter((l) => l.trim() !== '' && !l.includes(marker));
  const mine = ring ? ring.keys.map((k) => {
    const opts = authorizedKeysOptions(k.index);
    return opts ? `${opts} ${k.publicKey}` : k.publicKey;
  }) : [];
  const body = [...kept, ...mine].join('\n') + '\n';

  try {
    mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    const tmp = target.path + '.pmvpn.tmp';
    writeFileSync(tmp, body, { mode: 0o600 });
    if (canDropPrivileges() && target.uid !== undefined && target.gid !== undefined) {
      try { chownSync(tmp, target.uid, target.gid); chownSync(sshDir, target.uid, target.gid); } catch {}
    }
    chmodSync(tmp, 0o600);
    renameSync(tmp, target.path);
  } catch (err: any) {
    logger.warn({ username, err: err.message }, 'authorized_keys sync failed');
    return -1;
  }
  logger.info({ username, address: addr, lines: mine.length }, 'authorized_keys synced');
  return mine.length;
}

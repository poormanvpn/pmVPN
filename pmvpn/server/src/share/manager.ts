// pmVPN Share Manager — P2P file sharing
// MIT License
//
// The sender stages files in a share directory and generates
// a signed invite. The receiver connects with their wallet
// and downloads the shared files. Both sides authenticated
// by signature — proof of personhood.
//
// Share lifecycle:
//   1. Sender creates a share (directory + metadata)
//   2. Sender generates invite (signed JSON with share ID + connection details)
//   3. Receiver presents invite to server
//   4. Server verifies invite signature
//   5. Receiver browses and downloads shared files
//   6. Share can be time-limited or one-time

import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { logger } from '../utils/logger.js';

const SHARES_DIR = process.env.PMVPN_SHARES_DIR || '/tmp/pmvpn-shares';

export interface ShareMeta {
  id: string;
  creator: string;         // wallet address of sender
  name: string;
  created: string;
  expires: string | null;   // ISO timestamp or null for no expiry
  maxDownloads: number;     // 0 = unlimited
  downloads: number;
  allowedWallets: string[]; // empty = anyone with invite can access
  files: string[];
}

export interface ShareInvite {
  shareId: string;
  host: string;
  port: number;
  creator: string;
  name: string;
  expires: string | null;
  signature: string;        // creator's wallet signature over the invite
}

// In-memory share registry
const shares = new Map<string, ShareMeta>();

// Initialize shares directory
if (!existsSync(SHARES_DIR)) {
  mkdirSync(SHARES_DIR, { recursive: true });
}

// Load existing shares on startup
try {
  for (const dir of readdirSync(SHARES_DIR)) {
    const metaPath = join(SHARES_DIR, dir, '.share.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as ShareMeta;
      shares.set(meta.id, meta);
    }
  }
  if (shares.size > 0) {
    logger.info({ count: shares.size }, 'loaded existing shares');
  }
} catch {}

/**
 * Create a new share. Returns the share metadata.
 */
export function createShare(
  creator: string,
  name: string,
  opts?: {
    expires?: string | null;
    maxDownloads?: number;
    allowedWallets?: string[];
  },
): ShareMeta {
  const id = randomBytes(16).toString('hex');
  const shareDir = join(SHARES_DIR, id);
  mkdirSync(shareDir, { recursive: true });

  const meta: ShareMeta = {
    id,
    creator: creator.toLowerCase(),
    name: name || `Share ${id.slice(0, 8)}`,
    created: new Date().toISOString(),
    expires: opts?.expires || null,
    maxDownloads: opts?.maxDownloads || 0,
    downloads: 0,
    allowedWallets: (opts?.allowedWallets || []).map(w => w.toLowerCase()),
    files: [],
  };

  writeFileSync(join(shareDir, '.share.json'), JSON.stringify(meta, null, 2));
  shares.set(id, meta);

  logger.info({ shareId: id, creator, name: meta.name }, 'share created');
  return meta;
}

/**
 * Add a file to a share.
 */
export function addFileToShare(shareId: string, filename: string, data: Buffer): boolean {
  const meta = shares.get(shareId);
  if (!meta) return false;

  const shareDir = join(SHARES_DIR, shareId);
  const safeName = basename(filename); // prevent traversal
  writeFileSync(join(shareDir, safeName), data);

  if (!meta.files.includes(safeName)) {
    meta.files.push(safeName);
    writeFileSync(join(shareDir, '.share.json'), JSON.stringify(meta, null, 2));
  }

  logger.info({ shareId, file: safeName, size: data.length }, 'file added to share');
  return true;
}

/**
 * Get share metadata. Returns null if not found or expired.
 */
export function getShare(shareId: string): ShareMeta | null {
  const meta = shares.get(shareId);
  if (!meta) return null;

  // Check expiry
  if (meta.expires && new Date(meta.expires) < new Date()) {
    logger.info({ shareId }, 'share expired — removing');
    removeShare(shareId);
    return null;
  }

  // Check download limit
  if (meta.maxDownloads > 0 && meta.downloads >= meta.maxDownloads) {
    logger.info({ shareId }, 'share download limit reached');
    return null;
  }

  return meta;
}

/**
 * Check if a wallet is allowed to access a share.
 */
export function canAccess(shareId: string, walletAddress: string): boolean {
  const meta = getShare(shareId);
  if (!meta) return false;

  // If no allowed wallets specified, anyone with invite can access
  if (meta.allowedWallets.length === 0) return true;

  return meta.allowedWallets.includes(walletAddress.toLowerCase());
}

/**
 * List files in a share.
 */
export function listShareFiles(shareId: string): { name: string; size: number }[] {
  const meta = getShare(shareId);
  if (!meta) return [];

  const shareDir = join(SHARES_DIR, shareId);
  const files: { name: string; size: number }[] = [];

  for (const name of meta.files) {
    const filePath = join(shareDir, name);
    if (existsSync(filePath)) {
      const st = statSync(filePath);
      files.push({ name, size: st.size });
    }
  }

  return files;
}

/**
 * Get a file from a share. Returns buffer or null.
 */
export function getShareFile(shareId: string, filename: string): Buffer | null {
  const meta = getShare(shareId);
  if (!meta) return null;

  const safeName = basename(filename);
  if (!meta.files.includes(safeName)) return null;

  const filePath = join(SHARES_DIR, shareId, safeName);
  if (!existsSync(filePath)) return null;

  // Increment download count
  meta.downloads++;
  writeFileSync(join(SHARES_DIR, shareId, '.share.json'), JSON.stringify(meta, null, 2));

  return readFileSync(filePath);
}

/**
 * Remove a share and all its files.
 */
export function removeShare(shareId: string): boolean {
  const shareDir = join(SHARES_DIR, shareId);
  if (existsSync(shareDir)) {
    rmSync(shareDir, { recursive: true });
  }
  shares.delete(shareId);
  logger.info({ shareId }, 'share removed');
  return true;
}

/**
 * List all shares by a creator.
 */
export function listShares(creator?: string): ShareMeta[] {
  const all = Array.from(shares.values());
  if (!creator) return all;
  return all.filter(s => s.creator === creator.toLowerCase());
}

/**
 * Build an invite message for signing.
 * The sender signs this with their wallet to prove they created the share.
 */
export function buildInviteMessage(shareId: string, host: string, port: number): string {
  return `pmVPN Share Invite\n\nShare: ${shareId}\nHost: ${host}\nPort: ${port}\nTimestamp: ${Date.now()}`;
}

// SPDX-License-Identifier: GPL-3.0-only
// Ed25519 host key generation and loading
// MIT License
//
// Thank OpenBSD: Ed25519 only. No RSA, no ECDSA NIST curves.

import { readFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { logger } from './logger.js';

const PMVPN_DIR = join(homedir(), '.pmvpn');
const HOSTKEY_PATH = join(PMVPN_DIR, 'hostkey');

/**
 * Load or generate the server's Ed25519 host key.
 * ssh2 requires OpenSSH format — use ssh-keygen to generate.
 */
export function loadOrGenerateHostKey(): Buffer {
  if (existsSync(HOSTKEY_PATH)) {
    logger.info({ path: HOSTKEY_PATH }, 'loaded Ed25519 host key');
    return readFileSync(HOSTKEY_PATH);
  }

  logger.info('generating new Ed25519 host key');
  mkdirSync(PMVPN_DIR, { recursive: true });

  // Generate Ed25519 key in OpenSSH format (ssh2 requires this)
  try {
    execSync(`ssh-keygen -t ed25519 -f "${HOSTKEY_PATH}" -N "" -q`);
    chmodSync(HOSTKEY_PATH, 0o600);
  } catch (err) {
    logger.fatal({ err }, 'failed to generate host key — is ssh-keygen installed?');
    throw new Error('host key generation failed: ssh-keygen not available or permission denied');
  }

  logger.info({ path: HOSTKEY_PATH }, 'Ed25519 host key generated and saved');
  return readFileSync(HOSTKEY_PATH);
}

const HOSTKEY_PUB_PATH = HOSTKEY_PATH + '.pub';
let cachedPublicLine: string | null = null;

/** `ssh-ed25519 AAAA…` — the host key's public half without the comment. */
export function hostKeyPublicLine(): string {
  if (cachedPublicLine) return cachedPublicLine;
  if (!existsSync(HOSTKEY_PUB_PATH)) {
    throw new Error(`host public key missing: ${HOSTKEY_PUB_PATH}`);
  }
  const [type, b64] = readFileSync(HOSTKEY_PUB_PATH, 'utf-8').trim().split(/\s+/);
  if (type !== 'ssh-ed25519' || !b64) throw new Error('host key is not ssh-ed25519');
  cachedPublicLine = `${type} ${b64}`;
  return cachedPublicLine;
}

/** `SHA256:<base64, no padding>` — what clients bind the keyring to. */
export function hostKeyFingerprint(): string {
  const b64 = hostKeyPublicLine().split(' ')[1];
  return 'SHA256:' + createHash('sha256').update(Buffer.from(b64, 'base64')).digest('base64').replace(/=+$/, '');
}

// Ed25519 host key generation and loading
// MIT License
//
// Thank OpenBSD: Ed25519 only. No RSA, no ECDSA NIST curves.

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
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
  execSync(`ssh-keygen -t ed25519 -f "${HOSTKEY_PATH}" -N "" -q`);
  chmodSync(HOSTKEY_PATH, 0o600);

  logger.info({ path: HOSTKEY_PATH }, 'Ed25519 host key generated and saved');
  return readFileSync(HOSTKEY_PATH);
}

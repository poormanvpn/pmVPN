// SPDX-License-Identifier: GPL-3.0-only
// Wallet → user provisioning + binding enforcement
// MIT License
//
// Shared by ssh/handler.ts and ws/bridge.ts. Runs after signature
// verification succeeds, before any session is opened.
//
// Responsibilities:
//   1. Look up wallet in WalletMap; auto-register as `w<8hex>` if unknown.
//   2. Persist mapping to ~/.pmvpn/wallets.json.
//   3. Invoke the jail warden (pmvpn-create-user.sh) so the Linux user exists
//      with quota + ~/.ssh/pmvpn_wallet binding + tagged authorized_keys.
//   4. If the user already existed, verify that ~/.ssh/pmvpn_wallet's
//      `owner=` matches the authenticated wallet. Reject on mismatch.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { WalletMap } from '../config/wallets.js';
import type { WalletEntry } from '../shared.js';
import { logger } from '../utils/logger.js';
import { forgetUser, lookupUser } from '../utils/userinfo.js';

const BASE_HOME = process.env.PMVPN_HOME_BASE || '/home';
const WARDEN = '/usr/local/bin/pmvpn-create-user.sh';

export interface ProvisionResult {
  ok: boolean;
  entry?: WalletEntry;
  homeDir?: string;
  newUser?: boolean;
  error?: string;
}

function readBoundWallet(home: string): string | null {
  const path = join(home, '.ssh', 'pmvpn_wallet');
  if (!existsSync(path)) return null;
  try {
    const body = readFileSync(path, 'utf-8');
    const m = body.match(/^owner=(0x[0-9a-fA-F]{40})/m);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function persistWalletMap(address: string, entry: WalletEntry): void {
  try {
    const dir = join(homedir(), '.pmvpn');
    mkdirSync(dir, { recursive: true });
    const walletsPath = join(dir, 'wallets.json');
    const existing: Record<string, WalletEntry> = {};
    try { Object.assign(existing, JSON.parse(readFileSync(walletsPath, 'utf-8'))); } catch {}
    existing[address] = entry;
    writeFileSync(walletsPath, JSON.stringify(existing, null, 2));
  } catch (err: any) {
    logger.warn({ err: err.message }, 'failed to persist wallets.json');
  }
}

function runWarden(username: string, role: 'admin' | 'user', wallet: string): boolean {
  if (existsSync(WARDEN)) {
    try {
      execFileSync(WARDEN, [username, role, wallet], { stdio: 'pipe' });
      forgetUser(username);
      return true;
    } catch (err: any) {
      logger.warn({ err: err.message, username }, 'warden script failed');
      return false;
    }
  }
  // Fallback when warden missing — bare useradd, no binding file.
  // The wallet binding can be added later by re-running the warden.
  try {
    execFileSync('useradd', ['-m', '-s', '/bin/bash', username], { stdio: 'pipe' });
    forgetUser(username);
    logger.warn({ username }, 'warden missing — created user with bare useradd (no .ssh binding)');
    return true;
  } catch (err: any) {
    // Already exists? not fatal.
    if (lookupUser(username)) return true;
    logger.error({ err: err.message, username }, 'fallback useradd failed');
    return false;
  }
}

/**
 * Authorize an already-signature-verified wallet to use a session.
 * Returns the resolved Linux user + home, or an error if the binding is wrong.
 */
export function provisionWallet(walletAddress: string, walletMap: WalletMap): ProvisionResult {
  const address = walletAddress.toLowerCase();
  let entry = walletMap.get(address);
  let newUser = false;

  if (!entry) {
    const username = `w${address.slice(2, 10)}`;
    entry = { user: username, role: 'user' };
    walletMap.set(address, entry);
    persistWalletMap(address, entry);
    newUser = true;
    logger.info({ address, user: username }, 'auto-registered wallet');
  }

  const role: 'admin' | 'user' = entry.role === 'admin' ? 'admin' : 'user';
  const homeDir = join(BASE_HOME, entry.user);

  // Provision the OS user if missing
  if (!lookupUser(entry.user)) {
    if (!runWarden(entry.user, role, address)) {
      return { ok: false, error: 'failed to provision Linux user' };
    }
    newUser = true;
  }

  // Enforce wallet binding — once a user has a binding file, only the bound
  // wallet may authenticate as them. Survives wallets.json corruption.
  const bound = readBoundWallet(homeDir);
  if (bound && bound !== address) {
    logger.warn({ address, user: entry.user, bound }, 'wallet binding mismatch — rejecting auth');
    return { ok: false, error: 'wallet does not own this account' };
  }

  // If user existed without a binding (legacy / fallback creation), write one now.
  if (!bound && existsSync(WARDEN)) {
    runWarden(entry.user, role, address);
  }

  if (!existsSync(homeDir)) {
    try { mkdirSync(homeDir, { recursive: true, mode: 0o700 }); } catch {}
  }

  return { ok: true, entry, homeDir, newUser };
}

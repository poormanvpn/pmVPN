// Wallet-to-user mapping
// MIT License

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { WalletEntry } from '../shared.js';

export type WalletMap = Map<string, WalletEntry>;

/**
 * Load wallet mappings from:
 * 1. WALLET_USER_MAP env var: "0xabc:alice,0xdef:bob"
 * 2. ~/.pmvpn/wallets.json: { "0xabc": { "user": "alice", "role": "admin" } }
 *
 * Env var entries default to role "user". JSON file takes precedence.
 */
export function loadWalletMap(): WalletMap {
  const map: WalletMap = new Map();

  // 1. Parse env var (same format as cSSHwallet prototypes)
  const envMap = process.env.WALLET_USER_MAP || '';
  for (const pair of envMap.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const address = trimmed.slice(0, colonIdx).toLowerCase().trim();
    const user = trimmed.slice(colonIdx + 1).trim();
    if (address && user) {
      map.set(address, { user, role: 'user' });
    }
  }

  // 2. Load JSON file (overrides env entries)
  const jsonPath = join(homedir(), '.pmvpn', 'wallets.json');
  if (existsSync(jsonPath)) {
    try {
      const raw = readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, WalletEntry>;
      for (const [address, entry] of Object.entries(data)) {
        map.set(address.toLowerCase(), entry);
      }
    } catch {
      // Silently skip malformed file — logged by caller
    }
  }

  return map;
}

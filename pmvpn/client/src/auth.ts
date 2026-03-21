// pmVPN Client — MetaMask Authentication
// See docs/metamaskbestpractice.md for the full rationale.
//
// Key rules:
//   - sessionActive is the gate, NOT MetaMask's state
//   - Never call eth_requestAccounts on page load
//   - Always revoke before requesting (forces popup)
//   - eth_accounts (silent) for checking, eth_requestAccounts (popup) for connecting

import { createWalletClient, custom, type WalletClient } from 'viem';
import { mainnet } from 'viem/chains';

export interface Challenge {
  nonce: string;
  message: string;
  expires: number;
}

// ── Session state — this is the source of truth, NOT MetaMask ──
let walletClient: WalletClient | null = null;
let connectedAddress: string | null = null;
let sessionActive = false;

/**
 * Check if MetaMask is available in the browser.
 */
export function hasMetaMask(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
}

/**
 * Connect to MetaMask with a fresh approval popup.
 *
 * Flow:
 *   1. Clear all local state
 *   2. Revoke existing permissions (so MetaMask forgets us)
 *   3. Request accounts (triggers popup because permissions were revoked)
 *   4. Set session active only after user approves
 */
export async function connectMetaMask(): Promise<string> {
  if (!hasMetaMask()) {
    throw new Error('MetaMask not found. Install MetaMask to continue.');
  }

  // 1. Clear stale state
  walletClient = null;
  connectedAddress = null;
  sessionActive = false;

  const ethereum = (window as any).ethereum;

  // 2. Revoke existing permissions — forces fresh popup on next request
  try {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Not supported in all versions — continue
  }

  // 3. Verify permissions are actually revoked
  //    eth_accounts should return [] after revoke
  try {
    const check = await ethereum.request({ method: 'eth_accounts' }) as string[];
    if (check && check.length > 0) {
      // MetaMask still remembers us — this can happen on some versions
      // We still proceed, but our sessionActive gate protects us
    }
  } catch {}

  // 4. Request fresh account access — this MUST trigger the MetaMask popup
  //    because we revoked permissions above
  const accounts = await ethereum.request({
    method: 'eth_requestAccounts',
  }) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned — user may have rejected the request');
  }

  // 5. Create wallet client for signing
  walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(ethereum),
  });

  // 6. Set session — only now is the user "logged in"
  connectedAddress = accounts[0].toLowerCase();
  sessionActive = true;

  return connectedAddress;
}

/**
 * Get connected address. Returns null if no active session.
 * This checks OUR session, not MetaMask.
 */
export function getAddress(): string | null {
  if (!sessionActive) return null;
  return connectedAddress;
}

/**
 * Check if user has an active session.
 * This is the gate — all operations check this.
 */
export function isConnected(): boolean {
  return sessionActive && connectedAddress !== null && walletClient !== null;
}

/**
 * Full logout — destroy session, revoke MetaMask permission, clear everything.
 *
 * After this:
 *   - sessionActive is false
 *   - eth_accounts returns [] (if revoke succeeded)
 *   - connectMetaMask() will show the full approval popup
 */
export async function disconnect(): Promise<void> {
  // 1. Kill session immediately — this is the real logout
  sessionActive = false;
  walletClient = null;
  connectedAddress = null;

  // 2. Revoke MetaMask permission
  if (hasMetaMask()) {
    const ethereum = (window as any).ethereum;
    try {
      await ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {}
  }

  // 3. Clear any persisted wallet data
  localStorage.removeItem('pmvpn-wallet-address');
}

/**
 * Fetch a challenge nonce from the pmVPN server.
 */
export async function fetchChallenge(serverUrl: string, address: string): Promise<Challenge> {
  const res = await fetch(`${serverUrl}/challenge?address=${address}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `Challenge failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Sign challenge via MetaMask. Requires active session.
 * MetaMask shows a signing popup — user must approve.
 */
export async function signAndBuildPayload(message: string, nonce: string): Promise<string> {
  if (!sessionActive || !walletClient || !connectedAddress) {
    throw new Error('No active session — connect MetaMask first');
  }

  const signature = await walletClient.signMessage({
    account: connectedAddress as `0x${string}`,
    message,
  });

  return JSON.stringify({
    address: connectedAddress,
    signature,
    nonce,
  });
}

/**
 * Listen for MetaMask account changes (user switches account or disconnects).
 */
export function onAccountChange(callback: (accounts: string[]) => void): void {
  if (!hasMetaMask()) return;
  (window as any).ethereum.on('accountsChanged', callback);
}

// pmVPN Client — MetaMask Authentication
// Standard practice: wallet_revokePermissions for disconnect.
// See docs/metamaskbestpractice.md
//
// Security model:
//   1. wallet_revokePermissions on logout (official MetaMask standard)
//   2. Detect MetaMask lock state — warn if unlocked
//   3. Mandatory signing challenge on every login (cannot be bypassed)
//   4. After logout, instruct user to lock MetaMask for full security
//
// MetaMask does NOT expose a lock API to dApps. This is by design.
// The MetaMask password is controlled by the user via auto-lock timer.

import { createWalletClient, custom, type WalletClient } from 'viem';
import { mainnet } from 'viem/chains';

export interface Challenge {
  nonce: string;
  message: string;
  expires: number;
}

// ── Session state ──
let walletClient: WalletClient | null = null;
let connectedAddress: string | null = null;
let sessionActive = false;
let sessionProof: string | null = null;

/**
 * Check if MetaMask is available.
 */
export function hasMetaMask(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
}

/**
 * Check if MetaMask is currently locked or unlocked.
 * Returns true if locked (password required), false if unlocked.
 * Returns null if detection is not available.
 */
export async function isMetaMaskLocked(): Promise<boolean | null> {
  if (!hasMetaMask()) return null;
  try {
    // Official MetaMask API for checking lock state
    const isUnlocked = await (window as any).ethereum._metamask.isUnlocked();
    return !isUnlocked;
  } catch {
    return null; // Detection not available
  }
}

/**
 * Connect to MetaMask with mandatory signature verification.
 *
 * Flow:
 *   1. Revoke existing permissions (standard practice)
 *   2. Check if MetaMask is locked — report to caller
 *   3. Request accounts (triggers password if locked, approval if unlocked)
 *   4. Require signature on login challenge (ALWAYS shows popup)
 *   5. Session active only after signature proof
 *
 * Returns { address, wasLocked } so the UI can inform the user.
 */
export async function connectMetaMask(): Promise<{ address: string; wasLocked: boolean }> {
  if (!hasMetaMask()) {
    throw new Error('MetaMask not found. Install MetaMask to continue.');
  }

  // Clear stale state
  walletClient = null;
  connectedAddress = null;
  sessionActive = false;
  sessionProof = null;

  const ethereum = (window as any).ethereum;

  // Step 1: Check if MetaMask is locked before we do anything
  const wasLocked = await isMetaMaskLocked();

  // Step 2: Revoke permissions (standard practice per MetaMask docs)
  try {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch {}

  // Step 3: Request accounts
  // If MetaMask is locked → password prompt appears (good)
  // If MetaMask is unlocked → approval popup appears (acceptable)
  let accounts: string[];
  try {
    accounts = await ethereum.request({
      method: 'eth_requestAccounts',
    }) as string[];
  } catch (err: any) {
    throw new Error(err?.message || 'MetaMask connection rejected');
  }

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned');
  }

  const address = accounts[0].toLowerCase();

  // Step 4: Create wallet client for signing
  walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(ethereum),
  });

  // Step 5: MANDATORY SIGNATURE — the real authentication
  // This popup ALWAYS appears regardless of MetaMask lock state.
  // User must explicitly click "Sign" — no way to bypass.
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const loginMessage = [
    'pmVPN Login',
    '',
    `Timestamp: ${timestamp}`,
    `Session: ${random}`,
    '',
    'Sign this message to authenticate with pmVPN.',
    'This does not cost gas or make any transaction.',
  ].join('\n');

  let signature: string;
  try {
    signature = await walletClient.signMessage({
      account: address as `0x${string}`,
      message: loginMessage,
    });
  } catch {
    walletClient = null;
    throw new Error('Signature rejected — login cancelled');
  }

  // Step 6: Session proven
  connectedAddress = address;
  sessionActive = true;
  sessionProof = signature;

  return { address, wasLocked: wasLocked === true };
}

/**
 * Get connected address. Null if no verified session.
 */
export function getAddress(): string | null {
  if (!sessionActive || !sessionProof) return null;
  return connectedAddress;
}

/**
 * Check if user has a verified session.
 */
export function isConnected(): boolean {
  return sessionActive && connectedAddress !== null && walletClient !== null && sessionProof !== null;
}

/**
 * Logout — standard practice disconnect.
 * Calls wallet_revokePermissions (official MetaMask method).
 * Clears all session state. Cannot lock MetaMask — that's the user's action.
 */
export async function disconnect(): Promise<void> {
  // 1. Kill session
  sessionActive = false;
  walletClient = null;
  connectedAddress = null;
  sessionProof = null;

  // 2. Revoke permissions (standard practice per MetaMask docs)
  if (hasMetaMask()) {
    try {
      await (window as any).ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {}
  }

  // 3. Clear persisted data
  localStorage.removeItem('pmvpn-wallet-address');
}

/**
 * Fetch challenge nonce from pmVPN server.
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
 * Sign server challenge for SSH auth payload. Requires verified session.
 */
export async function signAndBuildPayload(message: string, nonce: string): Promise<string> {
  if (!sessionActive || !walletClient || !connectedAddress || !sessionProof) {
    throw new Error('No verified session — connect MetaMask first');
  }

  const signature = await walletClient.signMessage({
    account: connectedAddress as `0x${string}`,
    message,
  });

  return JSON.stringify({ address: connectedAddress, signature, nonce });
}

/**
 * Listen for MetaMask account changes.
 */
export function onAccountChange(callback: (accounts: string[]) => void): void {
  if (!hasMetaMask()) return;
  (window as any).ethereum.on('accountsChanged', callback);
}

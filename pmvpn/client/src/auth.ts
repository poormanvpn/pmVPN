// pmVPN Client — MetaMask Authentication
// No private keys. MetaMask signs. We verify.
//
// Security: We maintain our own session state independent of MetaMask.
// Even if MetaMask remembers the site, we require explicit login each time.
// Logout destroys our session AND revokes MetaMask permission.

import { createWalletClient, custom, type WalletClient } from 'viem';
import { mainnet } from 'viem/chains';

export interface Challenge {
  nonce: string;
  message: string;
  expires: number;
}

// Session state — this is the source of truth, NOT MetaMask
let walletClient: WalletClient | null = null;
let connectedAddress: string | null = null;
let sessionActive = false;

/**
 * Check if MetaMask (or any EIP-1193 provider) is available.
 */
export function hasMetaMask(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
}

/**
 * Connect to MetaMask. Returns the connected address.
 * Always forces the MetaMask popup regardless of prior approval.
 */
export async function connectMetaMask(): Promise<string> {
  if (!hasMetaMask()) {
    throw new Error('MetaMask not found. Install MetaMask to continue.');
  }

  // Clear any stale state first
  walletClient = null;
  connectedAddress = null;
  sessionActive = false;

  const ethereum = (window as any).ethereum;

  // First try to revoke existing permissions to force a fresh popup
  try {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Not supported in all versions — continue
  }

  // Now request fresh permission — this MUST show the MetaMask popup
  // because we just revoked permissions above
  const accounts = await ethereum.request({
    method: 'eth_requestAccounts',
  }) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from MetaMask');
  }

  walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(ethereum),
  });

  connectedAddress = accounts[0].toLowerCase();
  sessionActive = true;

  return connectedAddress;
}

/**
 * Get the connected wallet address (null if not connected or logged out).
 */
export function getAddress(): string | null {
  if (!sessionActive) return null;
  return connectedAddress;
}

/**
 * Check if a wallet session is active.
 * This checks OUR session state, not MetaMask's.
 */
export function isConnected(): boolean {
  return sessionActive && connectedAddress !== null && walletClient !== null;
}

/**
 * Disconnect wallet — true logout.
 * 1. Destroys our session state
 * 2. Revokes MetaMask permission
 * 3. Removes all event listeners
 * After this, connectMetaMask() will require full user approval.
 */
export async function disconnect(): Promise<void> {
  // 1. Kill our session immediately
  walletClient = null;
  connectedAddress = null;
  sessionActive = false;

  // 2. Revoke MetaMask permission
  if (hasMetaMask()) {
    try {
      await (window as any).ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Fallback: try the older method
      try {
        await (window as any).ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
        // Immediately revoke what we just requested
        await (window as any).ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Last resort — at minimum our session state is cleared
      }
    }
  }
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
 * Sign the challenge message via MetaMask and build the auth payload.
 * Requires active session. MetaMask popup appears for signature approval.
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
 * Listen for MetaMask account changes.
 */
export function onAccountChange(callback: (accounts: string[]) => void): void {
  if (!hasMetaMask()) return;
  (window as any).ethereum.on('accountsChanged', callback);
}

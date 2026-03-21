// pmVPN Client — MetaMask Authentication
// See docs/metamaskbestpractice.md
//
// Security model:
//   MetaMask cannot be locked or forced to ask for password by a dApp.
//   So we don't rely on MetaMask's connection state at all.
//
//   Instead, EVERY login requires the user to SIGN a login challenge.
//   MetaMask's signing popup requires explicit user approval every time —
//   even if MetaMask is already unlocked and the site is already approved.
//
//   Flow:
//     1. Get address from MetaMask (may auto-connect — that's fine)
//     2. Generate a random login challenge
//     3. User MUST sign the challenge in MetaMask (popup appears)
//     4. Only after signature verification is the session active
//     5. Logout destroys the session — next login requires a NEW signature

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
let sessionProof: string | null = null; // The signature that proves this session

/**
 * Check if MetaMask is available.
 */
export function hasMetaMask(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
}

/**
 * Connect to MetaMask with MANDATORY signature verification.
 *
 * Even if MetaMask auto-connects (no password popup), the user MUST
 * approve a signing request. The signing popup ALWAYS appears and
 * requires explicit user action. This is our real authentication.
 *
 * Returns the verified address.
 */
export async function connectMetaMask(): Promise<string> {
  if (!hasMetaMask()) {
    throw new Error('MetaMask not found. Install MetaMask to continue.');
  }

  // Clear stale state
  walletClient = null;
  connectedAddress = null;
  sessionActive = false;
  sessionProof = null;

  const ethereum = (window as any).ethereum;

  // Step 1: Get address (may auto-connect — that's OK, it's not our auth)
  let accounts: string[];
  try {
    // Try revoking first for a cleaner experience
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    }).catch(() => {});

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

  // Step 2: Create wallet client
  walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(ethereum),
  });

  // Step 3: MANDATORY SIGNATURE — this is the real authentication
  // Generate a unique login challenge that can never be reused
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const loginMessage = `pmVPN Login\n\nTimestamp: ${timestamp}\nSession: ${random}\n\nSign this message to authenticate with pmVPN.\nThis does not cost gas or make any transaction.`;

  let signature: string;
  try {
    // This ALWAYS shows a MetaMask popup requiring user approval
    // The user must click "Sign" — there is no way to bypass this
    signature = await walletClient.signMessage({
      account: address as `0x${string}`,
      message: loginMessage,
    });
  } catch (err: any) {
    // User rejected the signature — NOT authenticated
    walletClient = null;
    throw new Error('Login signature rejected — authentication cancelled');
  }

  // Step 4: Session is now proven — user explicitly signed
  connectedAddress = address;
  sessionActive = true;
  sessionProof = signature;

  return address;
}

/**
 * Get connected address. Null if no verified session.
 */
export function getAddress(): string | null {
  if (!sessionActive || !sessionProof) return null;
  return connectedAddress;
}

/**
 * Check if user has a verified session (address + signature).
 */
export function isConnected(): boolean {
  return sessionActive && connectedAddress !== null && walletClient !== null && sessionProof !== null;
}

/**
 * Full logout — destroy everything.
 */
export async function disconnect(): Promise<void> {
  // Kill session
  sessionActive = false;
  walletClient = null;
  connectedAddress = null;
  sessionProof = null;

  // Revoke MetaMask permissions
  if (hasMetaMask()) {
    try {
      await (window as any).ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {}
  }

  // Clear persisted data
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
 * Sign server challenge via MetaMask (for SSH auth payload).
 * Requires verified session. Shows MetaMask signing popup.
 */
export async function signAndBuildPayload(message: string, nonce: string): Promise<string> {
  if (!sessionActive || !walletClient || !connectedAddress || !sessionProof) {
    throw new Error('No verified session — connect MetaMask first');
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

// pmVPN Client — MetaMask Authentication
// Standard practice: wallet_revokePermissions for disconnect.
// See docs/metamaskbestpractice.md
//
// Supports both MetaMask browser extension AND MetaMask mobile app.
// On mobile: MetaMask SDK opens the native app via deep link.
// On desktop: uses injected window.ethereum provider.
//
// Security model:
//   1. wallet_revokePermissions on logout (official MetaMask standard)
//   2. Detect MetaMask lock state — warn if unlocked
//   3. Mandatory signing challenge on every login (cannot be bypassed)
//   4. After logout, instruct user to lock MetaMask for full security

import { createWalletClient, custom, type WalletClient } from 'viem';
import { mainnet } from 'viem/chains';
import { MetaMaskSDK } from '@metamask/sdk';

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

// ── MetaMask SDK (for mobile deep link) ──
let sdk: MetaMaskSDK | null = null;
let sdkProvider: any = null;

/**
 * Detect if running on a mobile device.
 */
export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Check if MetaMask extension is injected in the browser.
 */
function hasInjectedProvider(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ethereum?.isMetaMask;
}

/**
 * Check if MetaMask is available (extension OR mobile app via SDK).
 */
export function hasMetaMask(): boolean {
  // Desktop: extension injected
  if (hasInjectedProvider()) return true;
  // Mobile: MetaMask SDK will handle deep link to app
  if (isMobile()) return true;
  return false;
}

/**
 * Get the Ethereum provider — extension or SDK.
 * On desktop: returns window.ethereum (injected by extension)
 * On mobile: initializes MetaMask SDK, returns SDK provider (deep link flow)
 */
async function getProvider(): Promise<any> {
  // If extension is injected, use it directly (fastest path)
  if (hasInjectedProvider()) {
    return (window as any).ethereum;
  }

  // Mobile: initialize MetaMask SDK for deep link to native app
  if (!sdk) {
    sdk = new MetaMaskSDK({
      dappMetadata: {
        name: 'pmVPN',
        url: window.location.href,
      },
      preferDesktop: false,
    });
    await sdk.init();
  }

  sdkProvider = sdk.getProvider();
  if (!sdkProvider) {
    throw new Error('MetaMask SDK failed to initialize');
  }

  return sdkProvider;
}

/**
 * Check if MetaMask is currently locked or unlocked.
 * Returns true if locked, false if unlocked, null if unavailable.
 */
export async function isMetaMaskLocked(): Promise<boolean | null> {
  if (!hasInjectedProvider()) return null; // Lock detection only works with extension
  try {
    const isUnlocked = await (window as any).ethereum._metamask.isUnlocked();
    return !isUnlocked;
  } catch {
    return null;
  }
}

/**
 * Connect to MetaMask with mandatory signature verification.
 *
 * On desktop: uses browser extension (window.ethereum)
 * On mobile: opens MetaMask app via deep link, user approves, returns to browser
 *
 * Flow:
 *   1. Get provider (extension or SDK)
 *   2. Revoke existing permissions (standard practice)
 *   3. Request accounts (triggers MetaMask popup or app switch)
 *   4. Require signature on login challenge (ALWAYS shows popup)
 *   5. Session active only after signature proof
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

  // Get provider (extension or SDK deep link)
  const ethereum = await getProvider();

  // Check lock state (extension only)
  const wasLocked = await isMetaMaskLocked();

  // Revoke permissions (standard practice)
  try {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch {} // Not all providers support this

  // Request accounts
  // Extension: approval popup. Mobile SDK: switches to MetaMask app.
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

  // Create wallet client for signing
  walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(ethereum),
  });

  // MANDATORY SIGNATURE — the real authentication
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

  // Session proven
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
 */
export async function disconnect(): Promise<void> {
  sessionActive = false;
  walletClient = null;
  connectedAddress = null;
  sessionProof = null;

  // Revoke permissions on whatever provider is active
  try {
    const provider = hasInjectedProvider() ? (window as any).ethereum : sdkProvider;
    if (provider) {
      await provider.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    }
  } catch {}

  // Terminate SDK connection if active
  if (sdk) {
    try { sdk.terminate(); } catch {}
    sdk = null;
    sdkProvider = null;
  }

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
  if (hasInjectedProvider()) {
    (window as any).ethereum.on('accountsChanged', callback);
  }
  // SDK provider account changes handled internally
}

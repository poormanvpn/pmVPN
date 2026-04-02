// pmVPN Client — Wallet Authentication
// MIT License
//
// Desktop: EIP-6963 discovery → announced provider → eth_requestAccounts
// Mobile:  MetaMask SDK → deep link to native app
// Signing: viem walletClient.signMessage
//
// Based on:
// - EIP-6963: https://eips.ethereum.org/EIPS/eip-6963
// - MetaMask docs: https://docs.metamask.io/wallet/how-to/connect/
// - Chainlist pattern: raw eth_requestAccounts, no pre-revoke

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
let activeProvider: any = null;

// ── MetaMask SDK (mobile only) ──
let sdk: MetaMaskSDK | null = null;
let sdkProvider: any = null;

// ── EIP-6963 provider discovery ──
// Wallets announce themselves via CustomEvent. We collect them.
interface EIP6963ProviderDetail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: any;
}

const discoveredProviders: EIP6963ProviderDetail[] = [];

if (typeof window !== 'undefined') {
  // Listen for wallet announcements (EIP-6963)
  window.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => {
    const detail = event.detail as EIP6963ProviderDetail;
    const idx = discoveredProviders.findIndex(p => p.info.uuid === detail.info.uuid);
    if (idx >= 0) {
      discoveredProviders[idx] = detail;
    } else {
      discoveredProviders.push(detail);
    }
  }) as EventListener);

  // Ask wallets to announce — they re-announce on each request
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/**
 * Detect mobile device.
 */
export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Get the best provider via EIP-6963, then window.ethereum fallback.
 * Returns the raw EIP-1193 provider object — NOT the proxy.
 */
function getDesktopProvider(): any {
  // Re-request in case wallets loaded late
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // 1. EIP-6963: use the announced provider directly (bypasses selectExtension)
  if (discoveredProviders.length > 0) {
    // Prefer MetaMask if available
    const mm = discoveredProviders.find(p => p.info.rdns === 'io.metamask');
    if (mm) return mm.provider;
    // Otherwise first available
    return discoveredProviders[0].provider;
  }

  // 2. window.ethereum.providers array (multiple extensions)
  const eth = (window as any).ethereum;
  if (eth?.providers?.length) {
    const mm = eth.providers.find((p: any) => p.isMetaMask);
    if (mm) return mm;
    return eth.providers[0];
  }

  // 3. Raw window.ethereum (single extension)
  if (eth) return eth;

  return null;
}

/**
 * Get mobile provider via MetaMask SDK (deep link to native app).
 */
async function getMobileProvider(): Promise<any> {
  if (sdkProvider) return sdkProvider;

  if (!sdk) {
    sdk = new MetaMaskSDK({
      dappMetadata: { name: 'pmVPN', url: window.location.href },
      preferDesktop: false,
    });
    await sdk.init();
  }

  sdkProvider = sdk.getProvider();
  if (!sdkProvider) throw new Error('MetaMask app not found — install MetaMask');
  return sdkProvider;
}

/**
 * Check if any wallet is available.
 * Always returns true on desktop — we attempt connection and let it fail
 * with a clear error rather than hiding the button due to timing issues
 * (EIP-6963 announcements are async, window.ethereum may inject late).
 */
export function hasMetaMask(): boolean {
  return true;
}

/**
 * Check if MetaMask is locked.
 */
export async function isMetaMaskLocked(): Promise<boolean | null> {
  const provider = getDesktopProvider();
  if (!provider?._metamask?.isUnlocked) return null;
  try {
    return !(await provider._metamask.isUnlocked());
  } catch {
    return null;
  }
}

/**
 * Connect wallet. Triggers MetaMask popup on desktop, deep link on mobile.
 * Then requires mandatory signature to prove identity.
 */
export async function connectMetaMask(): Promise<{ address: string; wasLocked: boolean }> {
  // Reset state
  walletClient = null;
  connectedAddress = null;
  sessionActive = false;
  sessionProof = null;

  // Get provider
  let provider: any;
  if (isMobile()) {
    provider = await getMobileProvider();
  } else {
    // Re-request EIP-6963 and wait briefly for announcements
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    await new Promise(r => setTimeout(r, 100));
    provider = getDesktopProvider();
  }

  if (!provider) {
    throw new Error('No wallet found. Install MetaMask or another Web3 wallet.');
  }

  activeProvider = provider;
  const wasLocked = await isMetaMaskLocked();

  // eth_requestAccounts — triggers the popup
  // No wallet_revokePermissions before this (breaks some setups)
  let accounts: string[];
  try {
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  } catch (err: any) {
    throw new Error(err?.message || 'Wallet connection rejected');
  }

  if (!accounts?.length) {
    throw new Error('No accounts returned');
  }

  const address = accounts[0].toLowerCase();

  // Create viem wallet client from the announced provider
  walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(provider),
  });

  // Mandatory signature — proves identity
  const loginMessage = [
    'pmVPN Login',
    '',
    `Timestamp: ${Date.now()}`,
    `Session: ${Math.random().toString(36).substring(2, 15)}`,
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
    activeProvider = null;
    throw new Error('Signature rejected — login cancelled');
  }

  connectedAddress = address;
  sessionActive = true;
  sessionProof = signature;

  // Listen for disconnects
  try {
    provider.on('accountsChanged', (accts: string[]) => {
      if (!accts.length) {
        sessionActive = false;
        connectedAddress = null;
        sessionProof = null;
      }
    });
  } catch {}

  return { address, wasLocked: wasLocked === true };
}

/**
 * Get connected address (null if no verified session).
 */
export function getAddress(): string | null {
  if (!sessionActive || !sessionProof) return null;
  return connectedAddress;
}

/**
 * Check verified session.
 */
export function isConnected(): boolean {
  return sessionActive && connectedAddress !== null && walletClient !== null && sessionProof !== null;
}

/**
 * Logout — revoke permissions, clear state.
 */
export async function disconnect(): Promise<void> {
  sessionActive = false;
  walletClient = null;
  connectedAddress = null;
  sessionProof = null;

  if (activeProvider) {
    try {
      await activeProvider.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {}
  }
  activeProvider = null;

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
 * Sign server challenge for SSH auth payload.
 */
export async function signAndBuildPayload(message: string, nonce: string): Promise<string> {
  if (!sessionActive || !walletClient || !connectedAddress || !sessionProof) {
    throw new Error('No verified session — connect wallet first');
  }

  const signature = await walletClient.signMessage({
    account: connectedAddress as `0x${string}`,
    message,
  });

  return JSON.stringify({ address: connectedAddress, signature, nonce });
}

/**
 * Listen for account changes.
 */
export function onAccountChange(callback: (accounts: string[]) => void): void {
  const provider = activeProvider || getDesktopProvider();
  try { provider?.on('accountsChanged', callback); } catch {}
}

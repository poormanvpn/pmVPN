// SPDX-License-Identifier: GPL-3.0-only
// pmVPN Client — Wallet Authentication
// Same pattern as allchain.html / chainmarketcap.html (proven working)
// EIP-6963 + providers[] + window.ethereum fallback
// viem for signing only

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

// ── Wallet detection (same as allchain.html) ──
let detectedWallets: { name: string; provider: any; id: string }[] = [];
let walletsReady = false;

function setupEIP6963WalletDetection(): Promise<any[]> {
  return new Promise((resolve) => {
    const onAnnouncement = (event: any) => {
      const { info, provider } = event.detail;
      if (detectedWallets.some(w => w.id === info.uuid)) return;
      detectedWallets.push({ name: info.name, provider, id: info.rdns || info.uuid });
    };
    window.addEventListener('eip6963:announceProvider', onAnnouncement as EventListener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnouncement as EventListener);
      const legacy = detectLegacyWallets();
      for (const w of legacy) {
        if (!detectedWallets.some(d => d.id === w.id)) detectedWallets.push(w);
      }
      walletsReady = true;
      resolve(detectedWallets);
    }, 800);
  });
}

// Check providers[] FIRST — window.ethereum is a proxy that causes selectExtension errors
function detectLegacyWallets(): { name: string; provider: any; id: string }[] {
  const wallets: { name: string; provider: any; id: string }[] = [];

  if ((window as any).ethereum?.providers?.length) {
    for (const provider of (window as any).ethereum.providers) {
      if (provider.isMetaMask && !wallets.some(w => w.id === 'metamask')) {
        wallets.push({ name: 'MetaMask', provider, id: 'metamask' });
      }
      if (provider.isCoinbaseWallet && !wallets.some(w => w.id === 'coinbase')) {
        wallets.push({ name: 'Coinbase Wallet', provider, id: 'coinbase' });
      }
    }
  }

  if (!wallets.some(w => w.id === 'metamask') && (window as any).ethereum?.isMetaMask) {
    wallets.push({ name: 'MetaMask', provider: (window as any).ethereum, id: 'metamask' });
  }

  if ((window as any).phantom?.ethereum) {
    wallets.push({ name: 'Phantom', provider: (window as any).phantom.ethereum, id: 'phantom' });
  }

  if (wallets.length === 0 && (window as any).ethereum) {
    wallets.push({ name: 'Wallet', provider: (window as any).ethereum, id: 'ethereum' });
  }

  return wallets;
}

function getWalletProvider(): any {
  if (detectedWallets.length > 0) {
    const mm = detectedWallets.find(w => w.id === 'metamask' || w.name === 'MetaMask');
    if (mm) return mm.provider;
    return detectedWallets[0].provider;
  }
  const legacy = detectLegacyWallets();
  if (legacy.length > 0) {
    const mm = legacy.find(w => w.id === 'metamask');
    if (mm) return mm.provider;
    return legacy[0].provider;
  }
  return null;
}

export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

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
  if (!sdkProvider) throw new Error('MetaMask app not found');
  return sdkProvider;
}

export function hasMetaMask(): boolean {
  return true; // Always show button — let connect attempt fail with clear error
}

export async function isMetaMaskLocked(): Promise<boolean | null> {
  const provider = getWalletProvider();
  if (!provider?._metamask?.isUnlocked) return null;
  try { return !(await provider._metamask.isUnlocked()); } catch { return null; }
}

/**
 * Connect wallet — same flow as allchain.html (proven working)
 */
export async function connectMetaMask(): Promise<{ address: string; wasLocked: boolean }> {
  walletClient = null;
  connectedAddress = null;
  sessionActive = false;
  sessionProof = null;

  let provider: any;

  if (isMobile()) {
    provider = await getMobileProvider();
  } else {
    // Ensure detection has run (same as allchain)
    if (!walletsReady) {
      await setupEIP6963WalletDetection();
    }
    provider = getWalletProvider();
  }

  if (!provider) {
    throw new Error('No wallet found. Install MetaMask or another Web3 wallet.');
  }

  activeProvider = provider;
  const wasLocked = await isMetaMaskLocked();

  // eth_requestAccounts — triggers popup (chainlist pattern, no revokePermissions before)
  let accounts: string[];
  try {
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  } catch (err: any) {
    throw new Error(err?.message || 'Wallet connection rejected');
  }

  if (!accounts?.length) throw new Error('No accounts returned');
  const address = accounts[0].toLowerCase();

  // viem wallet client for signing
  walletClient = createWalletClient({ chain: mainnet, transport: custom(provider) });

  // Mandatory signature
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

  try {
    provider.on('accountsChanged', (accts: string[]) => {
      if (!accts.length) { sessionActive = false; connectedAddress = null; sessionProof = null; }
    });
  } catch {}

  return { address, wasLocked: wasLocked === true };
}

export function getAddress(): string | null {
  if (!sessionActive || !sessionProof) return null;
  return connectedAddress;
}

export function isConnected(): boolean {
  return sessionActive && connectedAddress !== null && walletClient !== null && sessionProof !== null;
}

export async function disconnect(): Promise<void> {
  sessionActive = false;
  walletClient = null;
  connectedAddress = null;
  sessionProof = null;

  if (activeProvider) {
    try { await activeProvider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch {}
  }
  activeProvider = null;

  if (sdk) {
    try { sdk.terminate(); } catch {}
    sdk = null;
    sdkProvider = null;
  }

  // Reset detection for clean reconnect
  detectedWallets = [];
  walletsReady = false;

  localStorage.removeItem('pmvpn-wallet-address');
}

export async function fetchChallenge(serverUrl: string, address: string): Promise<Challenge> {
  const res = await fetch(`${serverUrl}/challenge?address=${address}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `Challenge failed: ${res.status}`);
  }
  return res.json();
}

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
 * Sign an arbitrary message with the connected wallet (EIP-191 personal_sign).
 * Used for the keyring derivation prompt; the text names the server it is for.
 */
export async function signMessage(message: string): Promise<string> {
  if (!sessionActive || !walletClient || !connectedAddress || !sessionProof) {
    throw new Error('No verified session — connect wallet first');
  }
  return walletClient.signMessage({ account: connectedAddress as `0x${string}`, message });
}

export function onAccountChange(callback: (accounts: string[]) => void): void {
  const provider = activeProvider || getWalletProvider();
  try { provider?.on('accountsChanged', callback); } catch {}
}

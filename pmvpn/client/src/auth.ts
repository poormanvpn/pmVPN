// pmVPN Client — MetaMask Authentication
// No private keys. MetaMask signs. We verify.

import { createWalletClient, custom, type WalletClient } from 'viem';
import { mainnet } from 'viem/chains';

export interface Challenge {
  nonce: string;
  message: string;
  expires: number;
}

let walletClient: WalletClient | null = null;
let connectedAddress: string | null = null;

/**
 * Check if MetaMask (or any EIP-1193 provider) is available.
 */
export function hasMetaMask(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
}

/**
 * Connect to MetaMask. Returns the connected address.
 * MetaMask popup appears asking the user to connect.
 */
export async function connectMetaMask(): Promise<string> {
  if (!hasMetaMask()) {
    throw new Error('MetaMask not found. Install MetaMask to continue.');
  }

  const ethereum = (window as any).ethereum;

  // Request account access — triggers MetaMask popup
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from MetaMask');
  }

  walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(ethereum),
  });

  connectedAddress = accounts[0].toLowerCase();
  return connectedAddress;
}

/**
 * Get the connected wallet address (null if not connected).
 */
export function getAddress(): string | null {
  return connectedAddress;
}

/**
 * Check if a wallet is connected.
 */
export function isConnected(): boolean {
  return connectedAddress !== null && walletClient !== null;
}

/**
 * Disconnect wallet — true logout.
 * Revokes MetaMask permission so the user must re-approve on next connect.
 * Clears all in-memory wallet state.
 */
export async function disconnect(): Promise<void> {
  // Revoke MetaMask permission (EIP-2255 wallet_revokePermissions)
  // This forces MetaMask to forget this site — next connect requires full approval
  if (hasMetaMask()) {
    try {
      await (window as any).ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Older MetaMask versions may not support this — fall through
    }
  }

  walletClient = null;
  connectedAddress = null;
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
 * MetaMask popup appears asking the user to sign.
 * No private key ever touches this code.
 */
export async function signAndBuildPayload(message: string, nonce: string): Promise<string> {
  if (!walletClient || !connectedAddress) {
    throw new Error('Wallet not connected');
  }

  // MetaMask signs — private key never leaves the extension
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

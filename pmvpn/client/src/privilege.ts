// pmVPN Privilege Gate — asset-based access verification
// MIT License
//
// Transforms the app into a dapp by verifying:
// 1. Wallet signature (proof of identity)
// 2. Asset holding (proof of privilege)
//
// Uses viem for on-chain reads. No ethers dependency.

import { createPublicClient, http, type Address, formatEther, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';

// ERC-20 minimal ABI for balanceOf
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC-721 minimal ABI for balanceOf
const ERC721_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Privilege levels derived from asset holdings
export type PrivilegeLevel = 'none' | 'viewer' | 'operator' | 'admin' | 'owner';

export interface PrivilegeState {
  level: PrivilegeLevel;
  wallet: string;
  signature: string | null;
  ethBalance: string;
  assets: AssetCheck[];
  checkedAt: number;
  canViewDiagnostics: boolean;
  canViewFleet: boolean;
  canManageFleet: boolean;
  canDeploy: boolean;
}

export interface AssetCheck {
  type: 'native' | 'erc20' | 'erc721';
  contract?: string;
  symbol: string;
  balance: string;
  required: string;
  met: boolean;
}

export interface PrivilegeRule {
  level: PrivilegeLevel;
  description: string;
  requirements: AssetRequirement[];
}

export interface AssetRequirement {
  type: 'native' | 'erc20' | 'erc721';
  contract?: string;           // For ERC-20/721
  minBalance: string;          // Human-readable amount
  symbol?: string;
}

// Default privilege rules — configurable per deployment
const DEFAULT_RULES: PrivilegeRule[] = [
  {
    level: 'viewer',
    description: 'View fleet diagnostics and status',
    requirements: [
      { type: 'native', minBalance: '0', symbol: 'ETH' },  // Any wallet with signature
    ],
  },
  {
    level: 'operator',
    description: 'Execute fleet commands and view metrics',
    requirements: [
      { type: 'native', minBalance: '0.01', symbol: 'ETH' },
    ],
  },
  {
    level: 'admin',
    description: 'Full fleet management and deployment',
    requirements: [
      { type: 'native', minBalance: '0.1', symbol: 'ETH' },
    ],
  },
];

// Shared public client for on-chain reads
let publicClient: ReturnType<typeof createPublicClient> | null = null;

function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });
  }
  return publicClient;
}

/**
 * Verify privilege level for a wallet address.
 * Checks ETH balance + configured asset requirements.
 */
export async function verifyPrivilege(
  walletAddress: string,
  sessionSignature: string | null,
  rules: PrivilegeRule[] = DEFAULT_RULES
): Promise<PrivilegeState> {
  const address = walletAddress as Address;
  const client = getPublicClient();
  const assets: AssetCheck[] = [];

  // Check native ETH balance
  let ethBalance = '0';
  try {
    const balance = await client.getBalance({ address });
    ethBalance = formatEther(balance);
    assets.push({
      type: 'native',
      symbol: 'ETH',
      balance: ethBalance,
      required: '0',
      met: true,
    });
  } catch {
    assets.push({
      type: 'native',
      symbol: 'ETH',
      balance: '0',
      required: '0',
      met: false,
    });
  }

  // Check ERC-20 token balances from rules
  for (const rule of rules) {
    for (const req of rule.requirements) {
      if (req.type === 'erc20' && req.contract) {
        const existing = assets.find(a => a.contract === req.contract);
        if (!existing) {
          try {
            const contractAddr = req.contract as Address;
            const [balance, symbol, decimals] = await Promise.all([
              client.readContract({ address: contractAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
              client.readContract({ address: contractAddr, abi: ERC20_ABI, functionName: 'symbol' }),
              client.readContract({ address: contractAddr, abi: ERC20_ABI, functionName: 'decimals' }),
            ]);
            const formatted = formatUnits(balance, decimals);
            assets.push({
              type: 'erc20',
              contract: req.contract,
              symbol: symbol as string,
              balance: formatted,
              required: req.minBalance,
              met: parseFloat(formatted) >= parseFloat(req.minBalance),
            });
          } catch {
            assets.push({
              type: 'erc20',
              contract: req.contract,
              symbol: req.symbol || '???',
              balance: '0',
              required: req.minBalance,
              met: false,
            });
          }
        }
      }

      if (req.type === 'erc721' && req.contract) {
        const existing = assets.find(a => a.contract === req.contract);
        if (!existing) {
          try {
            const balance = await client.readContract({
              address: req.contract as Address,
              abi: ERC721_ABI,
              functionName: 'balanceOf',
              args: [address],
            });
            assets.push({
              type: 'erc721',
              contract: req.contract,
              symbol: req.symbol || 'NFT',
              balance: balance.toString(),
              required: req.minBalance,
              met: balance >= BigInt(req.minBalance),
            });
          } catch {
            assets.push({
              type: 'erc721',
              contract: req.contract,
              symbol: req.symbol || 'NFT',
              balance: '0',
              required: req.minBalance,
              met: false,
            });
          }
        }
      }
    }
  }

  // Determine highest privilege level achieved
  let level: PrivilegeLevel = 'none';

  // Signature is the minimum gate — without it, no privilege
  if (sessionSignature) {
    level = 'viewer'; // Signed = can view

    for (const rule of rules) {
      const allMet = rule.requirements.every(req => {
        if (req.type === 'native') {
          return parseFloat(ethBalance) >= parseFloat(req.minBalance);
        }
        const asset = assets.find(a => a.contract === req.contract);
        return asset?.met ?? false;
      });

      if (allMet) {
        // Upgrade to higher level
        const levels: PrivilegeLevel[] = ['none', 'viewer', 'operator', 'admin', 'owner'];
        if (levels.indexOf(rule.level) > levels.indexOf(level)) {
          level = rule.level;
        }
      }
    }
  }

  return {
    level,
    wallet: walletAddress,
    signature: sessionSignature,
    ethBalance,
    assets,
    checkedAt: Date.now(),
    canViewDiagnostics: level !== 'none',
    canViewFleet: ['viewer', 'operator', 'admin', 'owner'].includes(level),
    canManageFleet: ['operator', 'admin', 'owner'].includes(level),
    canDeploy: ['admin', 'owner'].includes(level),
  };
}

/**
 * Get display info for a privilege level.
 */
export function privilegeDisplay(level: PrivilegeLevel): { label: string; color: string; icon: string } {
  switch (level) {
    case 'owner':    return { label: 'OWNER',    color: '#f9e2af', icon: '◆' };
    case 'admin':    return { label: 'ADMIN',    color: '#cba6f7', icon: '◈' };
    case 'operator': return { label: 'OPERATOR', color: '#89b4fa', icon: '◇' };
    case 'viewer':   return { label: 'VIEWER',   color: '#a6e3a1', icon: '○' };
    default:         return { label: 'LOCKED',   color: '#7f849c', icon: '◌' };
  }
}

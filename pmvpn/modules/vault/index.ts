// SPDX-License-Identifier: GPL-3.0-only
// ╔══════════════════════════════════════════════════════════════════╗
// ║  BANKON Vault Module — pmVPN module system integration         ║
// ║  (c) BANKON — All Rights Reserved                              ║
// ║  License: GPL-3.0 (client-side, cypherpunk2048 standard)       ║
// ║                                                                ║
// ║  github.com/cypherpunk2048 · bankon.pythai.net                 ║
// ╚══════════════════════════════════════════════════════════════════╝

import { logger } from '../../server/src/utils/logger.js';
import { BankonVault } from './credential-vault.js';
import type {
  ClaudeModule,
  CommandDefinition,
  CommandResult,
} from '../registry.js';

export class VaultModule implements ClaudeModule {
  name = 'bankon-vault';
  version = '1.0.0';
  description = 'BANKON Vault — wallet-signature-gated credential storage (GPLv3)';
  author = '(c) BANKON / cypherpunk2048';
  dependencies: string[] = [];

  private vault = new BankonVault();

  async onLoad(): Promise<void> {
    logger.info('BANKON Vault module loaded — wallet is identity, signature proves ownership');
  }

  async onUnload(): Promise<void> {
    this.vault.lock();
    logger.info('BANKON Vault locked — all keys zeroized');
  }

  /**
   * Get the vault instance for programmatic access from other modules.
   */
  getVault(): BankonVault {
    return this.vault;
  }

  commands: CommandDefinition[] = [
    {
      name: 'vault-status',
      aliases: ['vs'],
      description: 'Show BANKON vault status',
      usage: 'vault-status',
      examples: ['vault-status'],
      parameters: [],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (): Promise<CommandResult> => {
        const info = this.vault.info();
        return {
          success: true,
          data: info,
          display: [
            '╔══ BANKON Vault ══╗',
            '',
            `   Status:     ${info?.locked === false ? '🔓 unlocked' : '🔒 locked'}`,
            `   Mode:       ${info?.mode || 'signature'}`,
            `   Entries:    ${info?.entries || 0}`,
            `   Cipher:     ${info?.cipher || 'aes-256-gcm'}`,
            `   KDF:        ${info?.kdf || 'hkdf-sha512'}`,
            `   Version:    ${info?.version || '1.0.0'}`,
            '',
            '   (c) BANKON — cypherpunk2048 standard',
            '╚══════════════════╝',
          ].join('\n'),
          nextActions: ['vault-unlock', 'vault-list'],
        };
      },
    },

    {
      name: 'vault-unlock',
      aliases: ['vu'],
      description: 'Unlock vault with wallet signature (mode: signature|passphrase|combined)',
      usage: 'vault-unlock [--mode <mode>]',
      examples: ['vault-unlock', 'vault-unlock --mode combined'],
      parameters: [
        { name: 'mode', type: 'string', required: false, description: 'Unlock mode: signature, passphrase, combined', default: 'signature' },
      ],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params): Promise<CommandResult> => {
        const mode = params.mode || 'signature';
        return {
          success: true,
          display: [
            '🔐 BANKON Vault Unlock',
            '',
            `   Mode: ${mode}`,
            '',
            '   SIGNATURE  — wallet signs challenge, signature derives key',
            '   THRESHOLD  — 2 of 3 shares: wallet + device + recovery',
            '   PASSPHRASE — PBKDF2 from passphrase (offline/network=0)',
            '   COMBINED   — signature + passphrase (maximum security)',
            '',
            '   The vault key exists only in memory.',
            '   On lock/logout, all keys are zeroized.',
          ].join('\n'),
          nextActions: ['vault-store', 'vault-list'],
        };
      },
    },

    {
      name: 'vault-store',
      aliases: ['vstore', 'vput'],
      description: 'Store a credential (AES-256-GCM encrypted)',
      usage: 'vault-store --id <name> --value <secret>',
      examples: ['vault-store --id api-key --value sk_live_xxx'],
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Credential name' },
        { name: 'value', type: 'string', required: true, description: 'Secret value' },
        { name: 'context', type: 'string', required: false, description: 'Domain context', default: 'default' },
      ],
      permissions: [{ resource: 'manage:providers' }],

      handler: async (params): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) {
          return { success: false, message: 'Vault locked — unlock with wallet signature first' };
        }
        try {
          this.vault.store(params.id, params.value, params.context || 'default');
          return {
            success: true,
            message: `Stored: ${params.id}`,
            display: `🔐 ${params.id} → AES-256-GCM (HKDF-SHA512 per-entry key)`,
            nextActions: ['vault-list'],
          };
        } catch (e: any) {
          return { success: false, message: e.message };
        }
      },
    },

    {
      name: 'vault-get',
      aliases: ['vget'],
      description: 'Retrieve a credential',
      usage: 'vault-get --id <name>',
      examples: ['vault-get --id api-key'],
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Credential name' },
      ],
      permissions: [{ resource: 'manage:providers' }],

      handler: async (params): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) {
          return { success: false, message: 'Vault locked' };
        }
        const value = this.vault.retrieve(params.id);
        if (!value) return { success: false, message: `Not found: ${params.id}` };
        return {
          success: true,
          data: { id: params.id, value },
          display: `🔓 ${params.id}: ${value.slice(0, 6)}${'•'.repeat(Math.max(0, value.length - 6))}`,
        };
      },
    },

    {
      name: 'vault-list',
      aliases: ['vls', 'vlist'],
      description: 'List credential IDs (no secrets)',
      usage: 'vault-list',
      examples: ['vault-list'],
      parameters: [],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) {
          return { success: false, message: 'Vault locked' };
        }
        const entries = this.vault.list();
        return {
          success: true,
          data: { entries },
          display: entries.length === 0
            ? '🔐 Vault empty'
            : ['🔐 Vault:', '', ...entries.map(e =>
                `   ${e.id} [${e.context}] — ${e.accessCount}x accessed`
              )].join('\n'),
        };
      },
    },

    {
      name: 'vault-delete',
      aliases: ['vdel', 'vrm'],
      description: 'Delete a credential',
      usage: 'vault-delete --id <name>',
      examples: ['vault-delete --id old-key'],
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Credential to delete' },
      ],
      permissions: [{ resource: 'terminate:servers' }],

      handler: async (params): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) return { success: false, message: 'Vault locked' };
        return {
          success: this.vault.delete(params.id),
          message: this.vault.delete(params.id) ? `Deleted: ${params.id}` : `Not found: ${params.id}`,
        };
      },
    },

    {
      name: 'vault-lock',
      aliases: ['vlock'],
      description: 'Lock vault — zeroize all keys from memory',
      usage: 'vault-lock',
      examples: ['vault-lock'],
      parameters: [],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (): Promise<CommandResult> => {
        this.vault.lock();
        return {
          success: true,
          display: '🔒 BANKON Vault locked — all encryption keys zeroized from memory',
        };
      },
    },

    {
      name: 'vault-export',
      aliases: ['vexport'],
      description: 'Export vault as encrypted backup blob',
      usage: 'vault-export',
      examples: ['vault-export'],
      parameters: [],
      permissions: [{ resource: 'manage:providers' }],

      handler: async (): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) return { success: false, message: 'Vault locked' };
        const blob = this.vault.export();
        return {
          success: !!blob,
          data: { blob },
          display: blob ? `📦 Exported (${blob.length} bytes, AES-256-GCM encrypted)` : 'Export failed',
        };
      },
    },

    {
      name: 'vault-threshold',
      aliases: ['vthreshold', 'v23'],
      description: 'Create 2-of-3 threshold shares for vault key recovery',
      usage: 'vault-threshold',
      examples: ['vault-threshold'],
      parameters: [],
      permissions: [{ resource: 'manage:providers' }],

      handler: async (): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) return { success: false, message: 'Vault locked' };
        const shares = this.vault.createThresholdShares();
        if (!shares) return { success: false, message: 'Failed to create shares' };
        return {
          success: true,
          data: {
            wallet: `${shares.wallet.slice(0, 8)}...`,
            device: 'stored locally (encrypted)',
            recovery: `${shares.recovery.slice(0, 8)}... (WRITE THIS DOWN)`,
          },
          display: [
            '🔐 2-of-3 Threshold Shares Created',
            '',
            '   Share 1 (wallet):   derived from signature each time',
            '   Share 2 (device):   stored encrypted on this device',
            `   Share 3 (recovery): ${shares.recovery.slice(0, 12)}...`,
            '',
            '   ⚠️  WRITE DOWN THE RECOVERY SHARE',
            '   Any 2 shares unlock the vault.',
            '   Lost 2 shares = vault unrecoverable.',
          ].join('\n'),
        };
      },
    },
  ];
}

export default VaultModule;

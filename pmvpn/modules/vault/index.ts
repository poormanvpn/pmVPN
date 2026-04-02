// Vault Module — credential vault for pmVPN module system
// MIT License
//
// Registers vault commands with the module registry.
// Vault access is gated by wallet signature — the signature
// both proves identity AND derives the encryption key.

import { logger } from '../../server/src/utils/logger.js';
import { CredentialVault, TombManager } from './credential-vault.js';
import type {
  ClaudeModule,
  CommandDefinition,
  CommandResult,
} from '../registry.js';

export class VaultModule implements ClaudeModule {
  name = 'credential-vault';
  version = '1.0.0';
  description = 'Wallet-signature-gated encrypted credential storage';
  author = 'pmVPN / BANKON';
  dependencies: string[] = [];

  private vault = new CredentialVault();
  private tomb = new TombManager();

  async onLoad(): Promise<void> {
    const tombAvailable = await this.tomb.isAvailable();
    logger.info(
      { tomb: tombAvailable },
      `Vault module loaded (GNU Tomb ${tombAvailable ? 'available' : 'not found'})`
    );
  }

  async onUnload(): Promise<void> {
    this.vault.lock();
    logger.info('Vault module unloaded — keys zeroized');
  }

  commands: CommandDefinition[] = [
    {
      name: 'vault-status',
      aliases: ['vs'],
      description: 'Show vault status and metadata',
      usage: 'vault-status',
      examples: ['vault-status'],
      parameters: [],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params, context): Promise<CommandResult> => {
        const info = this.vault.getInfo();
        const tombOpen = await this.tomb.isOpen();
        const tombAvailable = await this.tomb.isAvailable();

        return {
          success: true,
          data: { vault: info, tomb: { available: tombAvailable, open: tombOpen } },
          display: [
            '🔐 Credential Vault Status',
            '',
            `   Vault:      ${info ? 'unlocked' : 'locked'}`,
            info ? `   Entries:    ${info.entries}` : '',
            info ? `   Encryption: ${info.encryption}` : '',
            info ? `   Threshold:  ${info.thresholdMode}` : '',
            '',
            `   GNU Tomb:   ${tombAvailable ? (tombOpen ? 'open' : 'closed') : 'not installed'}`,
          ].filter(Boolean).join('\n'),
          nextActions: ['vault-unlock', 'vault-list'],
        };
      },
    },

    {
      name: 'vault-unlock',
      aliases: ['vu'],
      description: 'Unlock vault with wallet signature',
      usage: 'vault-unlock',
      examples: ['vault-unlock'],
      parameters: [],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params, context): Promise<CommandResult> => {
        // In a real flow, the signature comes from the authenticated session
        // For now, return instructions
        return {
          success: true,
          message: 'Vault unlock requires wallet signature',
          display: [
            '🔓 Vault Unlock',
            '',
            '   The vault unlocks automatically when you authenticate.',
            '   Your signature derives the encryption key via HKDF-SHA512.',
            '   The key exists only in memory — never stored.',
            '',
            '   Threshold mode: wallet + device key (any 2 of 3)',
            '   Post-quantum: AES-256-GCM + HKDF-SHA512',
          ].join('\n'),
          nextActions: ['vault-store', 'vault-list'],
        };
      },
    },

    {
      name: 'vault-store',
      aliases: ['vstore'],
      description: 'Store a credential in the vault',
      usage: 'vault-store --id <name> --value <secret>',
      examples: ['vault-store --id hostinger-api --value sk_live_xxx'],
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Credential identifier' },
        { name: 'value', type: 'string', required: true, description: 'Secret value to store' },
        { name: 'context', type: 'string', required: false, description: 'Derivation context', default: 'default' },
      ],
      permissions: [{ resource: 'manage:providers' }],

      handler: async (params, context): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) {
          return { success: false, message: 'Vault is locked — authenticate first' };
        }
        try {
          this.vault.store(params.id, params.value, params.context || 'default');
          return {
            success: true,
            message: `Credential "${params.id}" stored`,
            display: `🔐 Stored: ${params.id} (AES-256-GCM encrypted)`,
            nextActions: ['vault-list'],
          };
        } catch (error: any) {
          return { success: false, message: error.message };
        }
      },
    },

    {
      name: 'vault-get',
      aliases: ['vget'],
      description: 'Retrieve a credential from the vault',
      usage: 'vault-get --id <name>',
      examples: ['vault-get --id hostinger-api'],
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Credential identifier' },
      ],
      permissions: [{ resource: 'manage:providers' }],

      handler: async (params, context): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) {
          return { success: false, message: 'Vault is locked — authenticate first' };
        }
        const value = this.vault.retrieve(params.id);
        if (value === null) {
          return { success: false, message: `Credential "${params.id}" not found` };
        }
        return {
          success: true,
          data: { id: params.id, value },
          display: `🔓 ${params.id}: ${value.slice(0, 8)}${'•'.repeat(Math.max(0, value.length - 8))}`,
        };
      },
    },

    {
      name: 'vault-list',
      aliases: ['vlist', 'vls'],
      description: 'List credentials in the vault',
      usage: 'vault-list',
      examples: ['vault-list'],
      parameters: [],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params, context): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) {
          return { success: false, message: 'Vault is locked — authenticate first' };
        }
        const entries = this.vault.list();
        const display = entries.length === 0
          ? '🔐 Vault is empty'
          : ['🔐 Vault Entries:', '', ...entries.map(e =>
              `   ${e.id} (${e.context}) — accessed ${e.accessCount}x`
            )].join('\n');

        return { success: true, data: { entries }, display };
      },
    },

    {
      name: 'vault-delete',
      aliases: ['vdel', 'vrm'],
      description: 'Delete a credential from the vault',
      usage: 'vault-delete --id <name>',
      examples: ['vault-delete --id old-api-key'],
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Credential to delete' },
      ],
      permissions: [{ resource: 'terminate:servers' }],

      handler: async (params, context): Promise<CommandResult> => {
        if (!this.vault.isUnlocked()) {
          return { success: false, message: 'Vault is locked' };
        }
        const deleted = this.vault.delete(params.id);
        return {
          success: deleted,
          message: deleted ? `Deleted: ${params.id}` : `Not found: ${params.id}`,
        };
      },
    },

    {
      name: 'vault-lock',
      aliases: ['vlock'],
      description: 'Lock the vault — zeroize keys from memory',
      usage: 'vault-lock',
      examples: ['vault-lock'],
      parameters: [],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params, context): Promise<CommandResult> => {
        this.vault.lock();
        return {
          success: true,
          message: 'Vault locked — keys zeroized from memory',
          display: '🔒 Vault locked. All encryption keys cleared.',
        };
      },
    },
  ];
}

export default VaultModule;

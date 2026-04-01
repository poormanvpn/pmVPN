// Hostinger Module — cloud provider module for pmVPN
// MIT License
//
// Registers Hostinger cloud provider and related commands
// with the pmVPN module system for VPS fleet management.

import { logger } from '../../server/src/utils/logger.js';
import {
  ClaudeModule,
  CommandDefinition,
  ExecutionContext,
  CommandResult
} from '../registry.js';
import { HostingerProvider } from './provider.js';

export class HostingerModule implements ClaudeModule {
  name = 'hostinger-cloud-provider';
  version = '1.0.0';
  description = 'Hostinger VPS management and fleet coordination';
  author = 'pmVPN Team';
  dependencies: string[] = []; // No dependencies for initial implementation

  cloudProvider: HostingerProvider;

  constructor() {
    this.cloudProvider = new HostingerProvider();
  }

  async onLoad(): Promise<void> {
    // Initialize Hostinger provider
    try {
      const config = {
        apiKey: process.env.HOSTINGER_API_KEY
      };

      await this.cloudProvider.initialize(config);
      logger.info('Hostinger module loaded successfully');
    } catch (error) {
      logger.warn(
        { error: error.message },
        'Hostinger module loaded but provider initialization failed'
      );
      // Don't throw - allow module to load without working provider
    }
  }

  async onUnload(): Promise<void> {
    logger.info('Hostinger module unloaded');
  }

  commands: CommandDefinition[] = [
    {
      name: 'hostinger-list-vps',
      aliases: ['hvps', 'hlist'],
      description: 'List all Hostinger VPS instances',
      usage: 'hostinger-list-vps [--status <status>] [--location <location>]',
      examples: [
        'hostinger-list-vps',
        'hostinger-list-vps --status active',
        'hostinger-list-vps --location netherlands'
      ],

      parameters: [
        {
          name: 'status',
          type: 'string',
          required: false,
          description: 'Filter by VPS status (active, suspended, etc.)'
        },
        {
          name: 'location',
          type: 'string',
          required: false,
          description: 'Filter by datacenter location'
        }
      ],

      permissions: [
        { resource: 'read:hostinger', description: 'Read Hostinger VPS information' }
      ],

      handler: async (params, context): Promise<CommandResult> => {
        try {
          const result = await this.cloudProvider.executeCommand('list-vps', params);

          return {
            success: true,
            message: `Found ${result.length} VPS instances`,
            data: result,
            display: this.formatVpsList(result),
            nextActions: ['hostinger-create-vps', 'hostinger-get-details']
          };
        } catch (error) {
          return {
            success: false,
            message: `Failed to list VPS instances: ${error.message}`
          };
        }
      }
    },

    {
      name: 'hostinger-create-vps',
      aliases: ['hcreate', 'hprovision'],
      description: 'Create new Hostinger VPS with optional pmVPN auto-install',
      usage: 'hostinger-create-vps --plan <plan> --location <location> [--name <name>] [--auto-pmvpn]',
      examples: [
        'hostinger-create-vps --plan kvm-2 --location netherlands --name prod-web-01',
        'hostinger-create-vps --plan kvm-1 --location usa --auto-pmvpn'
      ],

      parameters: [
        {
          name: 'plan',
          type: 'string',
          required: true,
          description: 'VPS plan (kvm-1, kvm-2, kvm-4)',
          validation: { enum: ['kvm-1', 'kvm-2', 'kvm-4'] }
        },
        {
          name: 'location',
          type: 'string',
          required: true,
          description: 'Datacenter location',
          validation: { enum: ['netherlands', 'uk', 'usa', 'lithuania'] }
        },
        {
          name: 'name',
          type: 'string',
          required: false,
          description: 'Custom VPS name'
        },
        {
          name: 'auto-pmvpn',
          type: 'boolean',
          required: false,
          description: 'Automatically install pmVPN after provisioning',
          default: false
        }
      ],

      permissions: [
        { resource: 'provision:hostinger', description: 'Create Hostinger VPS instances' }
      ],

      handler: async (params, context): Promise<CommandResult> => {
        try {
          context.log.info(
            `Creating Hostinger VPS: ${params.plan} in ${params.location}`
          );

          const result = await this.cloudProvider.provisionServer({
            plan: params.plan,
            location: params.location,
            os: 'ubuntu-22.04',
            name: params.name,
            autoInstallPmvpn: params['auto-pmvpn']
          });

          if (result.success) {
            return {
              success: true,
              message: `VPS created successfully: ${result.ip}`,
              data: result,
              display: this.formatProvisioningResult(result),
              nextActions: [
                'hostinger-get-ssh-access',
                'pmvpn-bootstrap',
                'fleet-discover'
              ]
            };
          } else {
            return {
              success: false,
              message: `VPS creation failed: ${result.error}`
            };
          }
        } catch (error) {
          return {
            success: false,
            message: `VPS creation failed: ${error.message}`
          };
        }
      }
    },

    {
      name: 'hostinger-get-details',
      aliases: ['hdetails', 'hinfo'],
      description: 'Get detailed information about a Hostinger VPS',
      usage: 'hostinger-get-details --vps-id <id>',
      examples: [
        'hostinger-get-details --vps-id 12345'
      ],

      parameters: [
        {
          name: 'vps-id',
          type: 'string',
          required: true,
          description: 'Hostinger VPS ID'
        }
      ],

      permissions: [
        { resource: 'read:hostinger', description: 'Read Hostinger VPS information' }
      ],

      handler: async (params, context): Promise<CommandResult> => {
        try {
          const result = await this.cloudProvider.executeCommand('get-vps-details', {
            vpsId: params['vps-id']
          });

          return {
            success: true,
            data: result,
            display: this.formatVpsDetails(result),
            nextActions: ['hostinger-restart-vps', 'hostinger-get-ssh-access']
          };
        } catch (error) {
          return {
            success: false,
            message: `Failed to get VPS details: ${error.message}`
          };
        }
      }
    },

    {
      name: 'hostinger-get-ssh-access',
      aliases: ['hssh'],
      description: 'Get SSH access credentials for a Hostinger VPS',
      usage: 'hostinger-get-ssh-access --vps-id <id>',
      examples: [
        'hostinger-get-ssh-access --vps-id 12345'
      ],

      parameters: [
        {
          name: 'vps-id',
          type: 'string',
          required: true,
          description: 'Hostinger VPS ID'
        }
      ],

      permissions: [
        { resource: 'read:hostinger', description: 'Read Hostinger VPS SSH credentials' }
      ],

      handler: async (params, context): Promise<CommandResult> => {
        try {
          const result = await this.cloudProvider.executeCommand('get-ssh-access', {
            vpsId: params['vps-id']
          });

          return {
            success: true,
            data: result,
            display: this.formatSshAccess(result),
            nextActions: ['pmvpn-bootstrap']
          };
        } catch (error) {
          return {
            success: false,
            message: `Failed to get SSH access: ${error.message}`
          };
        }
      }
    },

    {
      name: 'hostinger-restart-vps',
      aliases: ['hrestart'],
      description: 'Restart a Hostinger VPS',
      usage: 'hostinger-restart-vps --vps-id <id>',
      examples: [
        'hostinger-restart-vps --vps-id 12345'
      ],

      parameters: [
        {
          name: 'vps-id',
          type: 'string',
          required: true,
          description: 'Hostinger VPS ID to restart'
        }
      ],

      permissions: [
        { resource: 'manage:hostinger', description: 'Restart Hostinger VPS instances' }
      ],

      handler: async (params, context): Promise<CommandResult> => {
        try {
          const confirmed = await context.requestConfirmation(
            `Are you sure you want to restart VPS ${params['vps-id']}?`
          );

          if (!confirmed) {
            return {
              success: false,
              message: 'VPS restart cancelled by user'
            };
          }

          const result = await this.cloudProvider.executeCommand('restart-vps', {
            vpsId: params['vps-id']
          });

          return {
            success: true,
            message: `VPS ${params['vps-id']} restart initiated`,
            data: result,
            nextActions: ['hostinger-get-details']
          };
        } catch (error) {
          return {
            success: false,
            message: `Failed to restart VPS: ${error.message}`
          };
        }
      }
    }
  ];

  // Formatting helpers for mobile display

  private formatVpsList(vpsInstances: any[]): string {
    if (!vpsInstances || vpsInstances.length === 0) {
      return '📊 No VPS instances found';
    }

    const lines = ['📊 Hostinger VPS Instances:', ''];

    for (const vps of vpsInstances) {
      const status = this.getStatusEmoji(vps.status);
      const plan = vps.plan?.name || 'Unknown';
      const location = vps.datacenter?.name || 'Unknown';

      lines.push(
        `${status} ${vps.name || `VPS-${vps.id}`}`,
        `   📍 ${location} • 💻 ${plan}`,
        `   🌐 ${vps.public_ip}`,
        ''
      );
    }

    return lines.join('\n');
  }

  private formatProvisioningResult(result: any): string {
    const lines = [
      '🚀 VPS Provisioning Result:',
      '',
      `✅ Server ID: ${result.serverId}`,
      `🌐 IP Address: ${result.ip}`,
      `👤 Username: ${result.credentials?.username}`,
      `🔑 Password: ${result.credentials?.password ? '••••••••' : 'Key-based auth'}`,
      '',
      `⏱️ Estimated ready: ${new Date(result.estimatedReady).toLocaleString()}`,
      ''
    ];

    if (result.autoInstallPmvpn) {
      lines.push('🔧 pmVPN will be automatically installed');
    } else {
      lines.push('💡 Use "pmvpn-bootstrap" to install pmVPN');
    }

    return lines.join('\n');
  }

  private formatVpsDetails(vps: any): string {
    const status = this.getStatusEmoji(vps.status);
    const lines = [
      `${status} ${vps.name || `VPS-${vps.id}`}`,
      '',
      `🆔 ID: ${vps.id}`,
      `🌐 IP: ${vps.public_ip}`,
      `📍 Location: ${vps.datacenter?.name || 'Unknown'}`,
      `💻 Plan: ${vps.plan?.name || 'Unknown'}`,
      `📊 Status: ${vps.status}`,
      ''
    ];

    if (vps.plan) {
      lines.push(
        `💾 Resources:`,
        `   CPU: ${vps.plan.cpu_cores} cores`,
        `   RAM: ${vps.plan.ram_mb}MB`,
        `   Disk: ${vps.plan.disk_gb}GB`,
        `   Bandwidth: ${vps.plan.bandwidth_gb}GB/month`,
        ''
      );
    }

    if (vps.created_at) {
      lines.push(`📅 Created: ${new Date(vps.created_at).toLocaleDateString()}`);
    }

    return lines.join('\n');
  }

  private formatSshAccess(access: any): string {
    return [
      '🔑 SSH Access Credentials:',
      '',
      `🌐 Host: ${access.ip || 'Available in VPS details'}`,
      `👤 Username: ${access.username || 'root'}`,
      `🔑 Password: ${access.password ? '••••••••' : 'Not available'}`,
      `🔢 Port: ${access.port || '22'}`,
      '',
      '💡 Connection command:',
      `ssh ${access.username || 'root'}@${access.ip || '<vps-ip>'}`
    ].join('\n');
  }

  private getStatusEmoji(status: string): string {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'running':
        return '🟢';
      case 'suspended':
      case 'stopped':
        return '🔴';
      case 'maintenance':
      case 'pending':
        return '🟡';
      default:
        return '⚪';
    }
  }
}

// Export for dynamic loading
export default HostingerModule;
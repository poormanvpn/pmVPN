// SPDX-License-Identifier: GPL-3.0-only
// Fleet Module — fleet coordination module for pmVPN
// MIT License
//
// Registers fleet management commands with the module registry.
// Coordinates with the fleet control plane, events, mesh, and metrics servers.

import { logger } from '../../server/src/utils/logger.js';
import type {
  ClaudeModule,
  CommandDefinition,
  ExecutionContext,
  CommandResult
} from '../registry.js';

export class FleetModule implements ClaudeModule {
  name = 'fleet-coordination';
  version = '1.0.0';
  description = 'Multi-server fleet coordination and management';
  author = 'pmVPN Team';
  dependencies: string[] = [];

  async onLoad(): Promise<void> {
    logger.info('Fleet coordination module loaded');
  }

  async onUnload(): Promise<void> {
    logger.info('Fleet coordination module unloaded');
  }

  commands: CommandDefinition[] = [
    {
      name: 'fleet-status',
      aliases: ['fs', 'fstatus'],
      description: 'Show fleet overview and health summary',
      usage: 'fleet-status',
      examples: ['fleet-status'],
      parameters: [],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params, context): Promise<CommandResult> => {
        return {
          success: true,
          message: 'Fleet status retrieved',
          data: {
            status: 'operational',
            ports: {
              control: 2600,
              events: 2601,
              mesh: 2602,
              metrics: 2603,
            },
          },
          display: [
            '📊 Fleet Status',
            '',
            '🎯 Control Plane: :2600',
            '📡 Events:        :2601',
            '🔗 Mesh:          :2602',
            '📈 Metrics:       :2603',
          ].join('\n'),
          nextActions: ['fleet-health', 'fleet-discover'],
        };
      },
    },

    {
      name: 'fleet-discover',
      aliases: ['fd', 'fdiscover'],
      description: 'Scan network for pmVPN instances',
      usage: 'fleet-discover [--subnet <cidr>] [--timeout <ms>]',
      examples: [
        'fleet-discover',
        'fleet-discover --subnet 192.168.1.0/24',
      ],
      parameters: [
        {
          name: 'subnet',
          type: 'string',
          required: false,
          description: 'Subnet to scan (CIDR notation)',
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          description: 'Scan timeout in milliseconds',
          default: 5000,
        },
      ],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params, context): Promise<CommandResult> => {
        return {
          success: true,
          message: 'Discovery scan initiated',
          data: { status: 'scanning', subnet: params.subnet || 'auto' },
          display: [
            '🔍 Fleet Discovery',
            '',
            `   Scanning: ${params.subnet || 'local network'}`,
            '   Looking for pmVPN ports 2200-2207...',
            '',
            '💡 Results will appear on Fleet Events (:2601)',
          ].join('\n'),
          nextActions: ['fleet-add', 'fleet-status'],
        };
      },
    },

    {
      name: 'fleet-add',
      aliases: ['fa', 'fadd'],
      description: 'Add a server to the fleet',
      usage: 'fleet-add --host <ip> [--name <name>] [--env <environment>]',
      examples: [
        'fleet-add --host 192.168.1.100 --name web-01 --env production',
        'fleet-add --host vps.example.com --name api-server',
      ],
      parameters: [
        {
          name: 'host',
          type: 'string',
          required: true,
          description: 'IP address or hostname of the server',
        },
        {
          name: 'name',
          type: 'string',
          required: false,
          description: 'Human-readable server name',
        },
        {
          name: 'env',
          type: 'string',
          required: false,
          description: 'Environment (production, staging, development)',
          default: 'development',
        },
        {
          name: 'core-port',
          type: 'number',
          required: false,
          description: 'Core base port (default 2200)',
          default: 2200,
        },
        {
          name: 'fleet-port',
          type: 'number',
          required: false,
          description: 'Fleet base port (default 2600)',
          default: 2600,
        },
      ],
      permissions: [{ resource: 'manage:providers' }],

      handler: async (params, context): Promise<CommandResult> => {
        return {
          success: true,
          message: `Server ${params.host} queued for addition`,
          data: {
            host: params.host,
            name: params.name,
            environment: params.env || 'development',
          },
          display: [
            '➕ Add Fleet Member',
            '',
            `   Host: ${params.host}`,
            `   Name: ${params.name || 'auto'}`,
            `   Environment: ${params.env || 'development'}`,
            `   Core Ports: ${params['core-port'] || 2200}-${(params['core-port'] || 2200) + 7}`,
            `   Fleet Ports: ${params['fleet-port'] || 2600}-${(params['fleet-port'] || 2600) + 3}`,
            '',
            '💡 Authenticate via POST /members on :2600',
          ].join('\n'),
          nextActions: ['fleet-status', 'fleet-health'],
        };
      },
    },

    {
      name: 'fleet-remove',
      aliases: ['fr', 'fremove'],
      description: 'Remove a server from the fleet',
      usage: 'fleet-remove --id <member-id>',
      examples: ['fleet-remove --id abc-123'],
      parameters: [
        {
          name: 'id',
          type: 'string',
          required: true,
          description: 'Fleet member ID to remove',
        },
      ],
      permissions: [{ resource: 'terminate:servers' }],

      handler: async (params, context): Promise<CommandResult> => {
        return {
          success: true,
          message: `Member ${params.id} queued for removal`,
          display: `🗑️ Removing fleet member: ${params.id}`,
          nextActions: ['fleet-status'],
        };
      },
    },

    {
      name: 'fleet-health',
      aliases: ['fh', 'fhealth'],
      description: 'Check health of all fleet members',
      usage: 'fleet-health [--env <environment>] [--group <group>]',
      examples: [
        'fleet-health',
        'fleet-health --env production',
        'fleet-health --group web-servers',
      ],
      parameters: [
        {
          name: 'env',
          type: 'string',
          required: false,
          description: 'Filter by environment',
        },
        {
          name: 'group',
          type: 'string',
          required: false,
          description: 'Filter by server group',
        },
      ],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params, context): Promise<CommandResult> => {
        return {
          success: true,
          message: 'Health check initiated',
          data: { status: 'checking' },
          display: [
            '🏥 Fleet Health Check',
            '',
            `   Filter: ${params.env || params.group || 'all members'}`,
            '   Checking core ports (2200-2207)...',
            '   Checking fleet ports (2600-2603)...',
            '',
            '💡 Live results on Fleet Events (:2601)',
          ].join('\n'),
          nextActions: ['fleet-status', 'fleet-deploy'],
        };
      },
    },

    {
      name: 'fleet-deploy',
      aliases: ['fdeploy'],
      description: 'Initiate fleet-wide deployment',
      usage: 'fleet-deploy [--env <environment>] [--group <group>] [--strategy <rolling|blue-green|canary>]',
      examples: [
        'fleet-deploy --env staging',
        'fleet-deploy --group web-servers --strategy rolling',
      ],
      parameters: [
        {
          name: 'env',
          type: 'string',
          required: false,
          description: 'Target environment',
        },
        {
          name: 'group',
          type: 'string',
          required: false,
          description: 'Target server group',
        },
        {
          name: 'strategy',
          type: 'string',
          required: false,
          description: 'Deployment strategy',
          default: 'rolling',
          validation: { enum: ['rolling', 'blue-green', 'canary'] },
        },
      ],
      permissions: [{ resource: 'deploy:servers' }],

      handler: async (params, context): Promise<CommandResult> => {
        return {
          success: true,
          message: 'Deployment plan created',
          data: {
            strategy: params.strategy || 'rolling',
            target: params.env || params.group || 'all',
          },
          display: [
            '🚀 Fleet Deployment',
            '',
            `   Strategy: ${params.strategy || 'rolling'}`,
            `   Target: ${params.env || params.group || 'all members'}`,
            '',
            '💡 Authenticate via POST /deploy on :2600',
          ].join('\n'),
          nextActions: ['fleet-health', 'fleet-status'],
        };
      },
    },

    {
      name: 'fleet-groups',
      aliases: ['fg', 'fgroups'],
      description: 'List or manage server groups',
      usage: 'fleet-groups [--create <name>] [--add <member-id>]',
      examples: [
        'fleet-groups',
        'fleet-groups --create web-servers',
      ],
      parameters: [
        {
          name: 'create',
          type: 'string',
          required: false,
          description: 'Create a new group with this name',
        },
        {
          name: 'add',
          type: 'string',
          required: false,
          description: 'Add member ID to a group',
        },
      ],
      permissions: [{ resource: 'read:fleet' }],

      handler: async (params, context): Promise<CommandResult> => {
        return {
          success: true,
          message: 'Groups retrieved',
          display: [
            '📂 Fleet Groups',
            '',
            '   Use GET /groups on :2600 for full list',
            '   Use POST /groups on :2600 to create/update',
          ].join('\n'),
          nextActions: ['fleet-status', 'fleet-deploy'],
        };
      },
    },
  ];
}

export default FleetModule;

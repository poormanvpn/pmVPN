# Modular Claude Remote Control Expansion

*Extensible architecture for multi-server AI coordination through pmVPN*

## Module Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CLAUDE COORDINATION CORE                              │
│                                                                                 │
│  ┌─ Base Modules ─────────────────────────────────────────────────────────────┐ │
│  │                                                                             │ │
│  │  ┌─ Connection ┐  ┌─ Auth ──────┐  ┌─ Execution ┐  ┌─ Monitoring ────────┐ │ │
│  │  │ • SSH pools │  │ • Wallet    │  │ • Command   │  │ • Health checks   │ │ │
│  │  │ • WebSocket │  │ • Multi-sig │  │ • Plans     │  │ • Metrics         │ │ │
│  │  │ • HTTP API  │  │ • Delegation│  │ • Rollback  │  │ • Alerts          │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                         ▲                                       │
│                                         │                                       │
│  ┌─ Extension Modules ───────────────────┼─────────────────────────────────────┐ │
│  │                                       │                                     │ │
│  │  ┌─ Fleet ─────┐  ┌─ Deploy ───┐  ┌─ Storage ─┐  ┌─ Network ──────────────┐ │ │
│  │  │ • Discovery │  │ • CI/CD     │  │ • Backup  │  │ • Load balancing    │ │ │
│  │  │ • Grouping  │  │ • Rolling   │  │ • Sync    │  │ • Service mesh      │ │ │
│  │  │ • Scaling   │  │ • Canary    │  │ • Archive │  │ • DNS management    │ │ │
│  │  └─────────────┘  └─────────────┘  └───────────┘  └─────────────────────┘ │ │
│  │                                                                             │ │
│  │  ┌─ Security ──┐  ┌─ Analytics ┐  ┌─ AI/ML ────┐  ┌─ Integration ───────┐ │ │
│  │  │ • Scanning  │  │ • Reporting │  │ • Predict  │  │ • Cloud providers │ │ │
│  │  │ • Compliance│  │ • Trends    │  │ • Optimize │  │ • External APIs   │ │ │
│  │  │ • Auditing  │  │ • Insights  │  │ • Auto-heal│  │ • Webhooks        │ │ │
│  │  └─────────────┘  └─────────────┘  └────────────┘  └───────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                         ▲                                       │
│                                         │                                       │
│  ┌─ Custom Modules ──────────────────────┼─────────────────────────────────────┐ │
│  │                                       │                                     │ │
│  │  • User-defined workflows                                                   │ │
│  │  • Industry-specific operations                                             │ │
│  │  • Third-party integrations                                                │ │
│  │  • Custom command sets                                                      │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Core Module Framework

### 1. Module Registry System

```typescript
interface ClaudeModule {
  // Module metadata
  name: string;
  version: string;
  description: string;
  author: string;
  dependencies: string[];

  // Capabilities
  commands: CommandDefinition[];
  eventHandlers: EventHandler[];
  workflows: WorkflowDefinition[];

  // Lifecycle hooks
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
  onServerConnect?: (server: ServerConnection) => Promise<void>;
  onServerDisconnect?: (server: ServerConnection) => Promise<void>;

  // Configuration
  config: ModuleConfig;
  permissions: Permission[];
}

class ModuleRegistry {
  private modules = new Map<string, ClaudeModule>();
  private loadOrder: string[] = [];

  async loadModule(modulePath: string): Promise<void> {
    const module = await this.importModule(modulePath);
    await this.validateModule(module);
    await this.resolveDependencies(module);

    this.modules.set(module.name, module);

    if (module.onLoad) {
      await module.onLoad();
    }

    this.registerCommands(module);
    this.registerEventHandlers(module);

    logger.info(`Module ${module.name} v${module.version} loaded`);
  }

  async unloadModule(name: string): Promise<void> {
    const module = this.modules.get(name);
    if (!module) return;

    if (module.onUnload) {
      await module.onUnload();
    }

    this.unregisterCommands(module);
    this.unregisterEventHandlers(module);
    this.modules.delete(name);

    logger.info(`Module ${name} unloaded`);
  }

  getModule(name: string): ClaudeModule | undefined {
    return this.modules.get(name);
  }

  listModules(): ModuleInfo[] {
    return Array.from(this.modules.values()).map(m => ({
      name: m.name,
      version: m.version,
      description: m.description,
      loaded: true,
      dependencies: m.dependencies
    }));
  }
}
```

### 2. Command Extension System

```typescript
interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  examples: string[];

  parameters: ParameterDefinition[];
  serverRequirements: ServerFilter;
  permissions: Permission[];

  handler: CommandHandler;
  validator?: CommandValidator;
}

interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'server' | 'file' | 'custom';
  required: boolean;
  description: string;
  default?: any;
  validation?: ValidationRule;
}

type CommandHandler = (
  params: Record<string, any>,
  context: ExecutionContext
) => Promise<CommandResult>;

// Example: Fleet Management Module
const fleetModule: ClaudeModule = {
  name: 'fleet-management',
  version: '1.0.0',
  description: 'Multi-server fleet coordination and management',
  author: 'pmVPN Team',
  dependencies: ['core-auth', 'core-connection'],

  commands: [
    {
      name: 'fleet-status',
      aliases: ['fs', 'status'],
      description: 'Show health status of entire server fleet',
      usage: 'fleet-status [--group <name>] [--environment <env>]',
      examples: [
        'fleet-status',
        'fleet-status --group web-servers',
        'fleet-status --environment production'
      ],

      parameters: [
        {
          name: 'group',
          type: 'string',
          required: false,
          description: 'Filter by server group'
        },
        {
          name: 'environment',
          type: 'string',
          required: false,
          description: 'Filter by environment (prod/staging/dev)'
        }
      ],

      serverRequirements: { any: true },
      permissions: ['read:fleet'],

      handler: async (params, context) => {
        const fleet = context.getFleetManager();
        const filters = {
          group: params.group,
          environment: params.environment
        };

        const status = await fleet.getStatus(filters);

        return {
          success: true,
          data: status,
          display: formatFleetStatus(status)
        };
      }
    },

    {
      name: 'deploy-fleet',
      aliases: ['deploy'],
      description: 'Deploy application across fleet with coordination',
      usage: 'deploy-fleet <app> <version> [--environment <env>] [--strategy <strategy>]',
      examples: [
        'deploy-fleet user-service v1.2.3 --environment staging',
        'deploy-fleet frontend latest --strategy rolling'
      ],

      parameters: [
        {
          name: 'app',
          type: 'string',
          required: true,
          description: 'Application name to deploy'
        },
        {
          name: 'version',
          type: 'string',
          required: true,
          description: 'Version/tag to deploy'
        },
        {
          name: 'environment',
          type: 'string',
          required: false,
          description: 'Target environment',
          default: 'staging'
        },
        {
          name: 'strategy',
          type: 'string',
          required: false,
          description: 'Deployment strategy (rolling/blue-green/canary)',
          default: 'rolling'
        }
      ],

      serverRequirements: {
        hasService: true,
        environment: ['staging', 'production']
      },
      permissions: ['deploy:fleet', 'restart:services'],

      handler: async (params, context) => {
        const deployer = context.getDeploymentManager();

        const plan = await deployer.createDeploymentPlan({
          application: params.app,
          version: params.version,
          environment: params.environment,
          strategy: params.strategy
        });

        // Show plan and ask for confirmation
        await context.showDeploymentPlan(plan);
        const confirmed = await context.requestConfirmation(
          `Deploy ${params.app} v${params.version} to ${params.environment}?`
        );

        if (!confirmed) {
          return { success: false, message: 'Deployment cancelled by user' };
        }

        const result = await deployer.execute(plan);

        return {
          success: result.success,
          data: result,
          display: formatDeploymentResult(result)
        };
      }
    }
  ],

  eventHandlers: [
    {
      event: 'server:connected',
      handler: async (server: ServerConnection) => {
        // Auto-discover services on new server
        const services = await discoverServices(server);
        await updateFleetRegistry(server.id, services);
      }
    },

    {
      event: 'deployment:started',
      handler: async (deployment: DeploymentEvent) => {
        // Send notifications about deployment start
        await notifyStakeholders(deployment);
      }
    }
  ],

  workflows: [
    {
      name: 'emergency-rollback',
      description: 'Emergency rollback across entire fleet',
      triggers: ['command:emergency-rollback', 'alert:critical-failure'],

      steps: [
        { action: 'stop-traffic', servers: 'load-balancers' },
        { action: 'rollback-services', servers: 'application-servers', parallel: true },
        { action: 'verify-rollback', servers: 'application-servers' },
        { action: 'restore-traffic', servers: 'load-balancers' },
        { action: 'notify-completion', servers: 'monitoring' }
      ]
    }
  ],

  config: {
    maxConcurrentDeployments: 3,
    deploymentTimeout: 1800, // 30 minutes
    healthCheckInterval: 30,
    notificationChannels: ['slack', 'email']
  },

  permissions: [
    'read:fleet',
    'deploy:fleet',
    'restart:services',
    'rollback:deployments'
  ]
};
```

### 3. Event System for Module Communication

```typescript
interface EventBus {
  emit(event: string, data: any): void;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  once(event: string, handler: EventHandler): void;
}

class ClaudeEventBus implements EventBus {
  private handlers = new Map<string, EventHandler[]>();

  emit(event: string, data: any): void {
    const eventHandlers = this.handlers.get(event) || [];

    for (const handler of eventHandlers) {
      try {
        handler(data);
      } catch (error) {
        logger.error(`Event handler error for ${event}:`, error);
      }
    }
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  // Standard events emitted by core
  // server:connected, server:disconnected
  // command:executed, command:failed
  // deployment:started, deployment:completed, deployment:failed
  // health:warning, health:critical, health:recovered
  // user:authenticated, user:unauthorized
}
```

## Core Base Modules

### 1. Connection Management Module

```typescript
// pmvpn/modules/core/connection/index.ts
class ConnectionModule implements ClaudeModule {
  name = 'core-connection';
  private connections = new Map<string, PmvpnConnection>();
  private pools = new Map<string, ConnectionPool>();

  async connectToServer(serverId: string): Promise<PmvpnConnection> {
    if (this.connections.has(serverId)) {
      return this.connections.get(serverId)!;
    }

    const serverConfig = await this.getServerConfig(serverId);
    const connection = new PmvpnConnection(serverConfig);

    await connection.authenticate();
    await connection.testAllPorts();

    this.connections.set(serverId, connection);
    this.eventBus.emit('server:connected', { serverId, connection });

    return connection;
  }

  async executeOnServer(
    serverId: string,
    command: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const connection = await this.connectToServer(serverId);
    return await connection.execute(command, options);
  }

  async executeOnFleet(
    serverIds: string[],
    command: string,
    options?: FleetExecutionOptions
  ): Promise<FleetExecutionResult> {
    const executions = serverIds.map(async serverId => {
      try {
        const result = await this.executeOnServer(serverId, command, options);
        return { serverId, success: true, result };
      } catch (error) {
        return { serverId, success: false, error: error.message };
      }
    });

    if (options?.parallel !== false) {
      return await Promise.all(executions);
    } else {
      // Sequential execution
      const results = [];
      for (const execution of executions) {
        results.push(await execution);

        // Stop on first failure if failFast is enabled
        if (options?.failFast && !results[results.length - 1].success) {
          break;
        }
      }
      return results;
    }
  }
}
```

### 2. Fleet Management Module

```typescript
// pmvpn/modules/fleet/index.ts
class FleetModule implements ClaudeModule {
  name = 'fleet-management';

  commands = [
    {
      name: 'fleet-add',
      description: 'Add server to fleet',
      handler: async (params, context) => {
        const { host, name, environment, services } = params;

        // Test connection
        const connection = await context.testConnection(host);
        if (!connection.success) {
          return { success: false, message: 'Cannot connect to server' };
        }

        // Add to fleet registry
        const server: ServerSpec = {
          id: generateServerId(name),
          name,
          host,
          environment,
          services: services || [],
          addedAt: Date.now(),
          addedBy: context.user.wallet
        };

        await this.fleetRegistry.addServer(server);

        return {
          success: true,
          message: `Server ${name} added to fleet`,
          data: server
        };
      }
    },

    {
      name: 'fleet-discover',
      description: 'Automatically discover servers on network',
      handler: async (params, context) => {
        const { network, portRange } = params;

        const discovered = await this.networkScanner.scan({
          network: network || '192.168.1.0/24',
          portRange: portRange || '2200-2207',
          timeout: 5000
        });

        const pmvpnServers = discovered.filter(s => s.pmvpnDetected);

        return {
          success: true,
          message: `Found ${pmvpnServers.length} pmVPN servers`,
          data: pmvpnServers
        };
      }
    },

    {
      name: 'fleet-group',
      description: 'Create or modify server groups',
      handler: async (params, context) => {
        const { action, group, servers } = params;

        switch (action) {
          case 'create':
            await this.fleetRegistry.createGroup(group, servers);
            break;
          case 'add':
            await this.fleetRegistry.addToGroup(group, servers);
            break;
          case 'remove':
            await this.fleetRegistry.removeFromGroup(group, servers);
            break;
          case 'delete':
            await this.fleetRegistry.deleteGroup(group);
            break;
        }

        return { success: true, message: `Group ${group} ${action}d` };
      }
    },

    {
      name: 'fleet-scale',
      description: 'Scale services across fleet',
      handler: async (params, context) => {
        const { service, replicas, environment } = params;

        const servers = await this.fleetRegistry.getByEnvironment(environment);
        const plan = await this.createScalingPlan(service, replicas, servers);

        await context.showExecutionPlan(plan);
        const confirmed = await context.requestConfirmation('Execute scaling plan?');

        if (confirmed) {
          const result = await this.executePlan(plan);
          return { success: true, data: result };
        } else {
          return { success: false, message: 'Scaling cancelled' };
        }
      }
    }
  ];

  private async createScalingPlan(
    service: string,
    targetReplicas: number,
    servers: ServerSpec[]
  ): Promise<ExecutionPlan> {
    const currentReplicas = await this.getCurrentReplicas(service, servers);
    const difference = targetReplicas - currentReplicas;

    if (difference > 0) {
      // Scale up
      return this.createScaleUpPlan(service, difference, servers);
    } else if (difference < 0) {
      // Scale down
      return this.createScaleDownPlan(service, Math.abs(difference), servers);
    } else {
      // No change needed
      return { steps: [], message: 'Service already at target scale' };
    }
  }
}
```

### 3. Deployment Orchestration Module

```typescript
// pmvpn/modules/deployment/index.ts
class DeploymentModule implements ClaudeModule {
  name = 'deployment-orchestration';

  commands = [
    {
      name: 'deploy',
      description: 'Deploy application with various strategies',
      parameters: [
        { name: 'app', type: 'string', required: true },
        { name: 'version', type: 'string', required: true },
        { name: 'environment', type: 'string', required: true },
        { name: 'strategy', type: 'string', required: false, default: 'rolling' }
      ],

      handler: async (params, context) => {
        const deployment = new Deployment({
          application: params.app,
          version: params.version,
          environment: params.environment,
          strategy: params.strategy,
          initiatedBy: context.user.wallet,
          initiatedAt: Date.now()
        });

        // Create deployment plan
        const plan = await this.createDeploymentPlan(deployment);

        // Validate plan
        const validation = await this.validateDeploymentPlan(plan);
        if (!validation.valid) {
          return {
            success: false,
            message: 'Deployment plan validation failed',
            errors: validation.errors
          };
        }

        // Show plan to user
        await context.showDeploymentPlan(plan);

        // Request confirmation
        const confirmed = await context.requestConfirmation(
          `Deploy ${params.app} v${params.version} to ${params.environment}?`
        );

        if (!confirmed) {
          return { success: false, message: 'Deployment cancelled' };
        }

        // Execute deployment
        const result = await this.executeDeployment(deployment, plan);

        // Store deployment record
        await this.deploymentHistory.record(deployment, result);

        return {
          success: result.success,
          message: result.success ? 'Deployment completed successfully' : 'Deployment failed',
          data: result
        };
      }
    },

    {
      name: 'rollback',
      description: 'Rollback to previous version',
      handler: async (params, context) => {
        const { app, environment, version } = params;

        // Find rollback target
        const target = version
          ? await this.findVersionInHistory(app, environment, version)
          : await this.findPreviousVersion(app, environment);

        if (!target) {
          return {
            success: false,
            message: 'No valid rollback target found'
          };
        }

        // Create rollback plan
        const rollbackPlan = await this.createRollbackPlan(app, environment, target);

        // Execute rollback
        const result = await this.executeRollback(rollbackPlan);

        return {
          success: result.success,
          message: result.success
            ? `Rolled back ${app} to ${target.version}`
            : 'Rollback failed',
          data: result
        };
      }
    }
  ];

  private async createDeploymentPlan(deployment: Deployment): Promise<DeploymentPlan> {
    switch (deployment.strategy) {
      case 'rolling':
        return this.createRollingDeploymentPlan(deployment);
      case 'blue-green':
        return this.createBlueGreenDeploymentPlan(deployment);
      case 'canary':
        return this.createCanaryDeploymentPlan(deployment);
      default:
        throw new Error(`Unknown deployment strategy: ${deployment.strategy}`);
    }
  }

  private async createRollingDeploymentPlan(deployment: Deployment): Promise<DeploymentPlan> {
    const servers = await this.getTargetServers(deployment);
    const batchSize = Math.ceil(servers.length / 3); // Deploy in 3 waves

    const steps: DeploymentStep[] = [];

    // Pre-deployment checks
    steps.push({
      name: 'Pre-deployment health check',
      servers: servers.map(s => s.id),
      action: 'health-check',
      parallel: true,
      required: true
    });

    // Rolling deployment in batches
    for (let i = 0; i < servers.length; i += batchSize) {
      const batch = servers.slice(i, i + batchSize);

      steps.push({
        name: `Deploy batch ${Math.floor(i/batchSize) + 1}`,
        servers: batch.map(s => s.id),
        action: 'deploy',
        parallel: true,

        commands: [
          'docker pull ${deployment.image}',
          'docker stop ${deployment.app} || true',
          'docker run -d --name ${deployment.app} ${deployment.image}',
          'health-check --service ${deployment.app} --timeout 60'
        ],

        rollback: [
          'docker stop ${deployment.app}',
          'docker run -d --name ${deployment.app} ${deployment.previousImage}'
        ]
      });

      // Health check between batches
      if (i + batchSize < servers.length) {
        steps.push({
          name: `Health check after batch ${Math.floor(i/batchSize) + 1}`,
          servers: batch.map(s => s.id),
          action: 'health-check',
          parallel: true,
          required: true
        });
      }
    }

    // Post-deployment verification
    steps.push({
      name: 'Post-deployment verification',
      servers: servers.map(s => s.id),
      action: 'verify-deployment',
      parallel: true,
      required: true
    });

    return {
      deployment,
      steps,
      estimatedDuration: this.estimateDeploymentDuration(steps),
      rollbackPlan: this.createRollbackSteps(steps)
    };
  }
}
```

## Integration with Existing pmVPN

### 1. Enhanced Remote Control Script

```typescript
// pmvpn/remote-control-enhanced.ts
#!/usr/bin/env bun

import { ClaudeCoordinator } from './modules/core/coordinator.js';
import { ModuleRegistry } from './modules/core/registry.js';
import { FleetManager } from './modules/fleet/manager.js';

class EnhancedRemoteControl {
  private coordinator: ClaudeCoordinator;
  private moduleRegistry: ModuleRegistry;
  private fleetManager: FleetManager;

  async initialize() {
    // Load core modules
    await this.moduleRegistry.loadModule('./modules/core/connection');
    await this.moduleRegistry.loadModule('./modules/core/auth');
    await this.moduleRegistry.loadModule('./modules/core/execution');

    // Load extension modules
    await this.moduleRegistry.loadModule('./modules/fleet');
    await this.moduleRegistry.loadModule('./modules/deployment');
    await this.moduleRegistry.loadModule('./modules/monitoring');

    // Load custom modules from user directory
    const customModulesDir = '~/.pmvpn/modules';
    const customModules = await this.discoverModules(customModulesDir);
    for (const module of customModules) {
      await this.moduleRegistry.loadModule(module);
    }

    // Initialize coordinator with loaded modules
    this.coordinator = new ClaudeCoordinator({
      moduleRegistry: this.moduleRegistry,
      fleetManager: this.fleetManager
    });
  }

  async startServer() {
    await this.initialize();

    console.log('🔱 pmVPN Enhanced Remote Control');
    console.log(`📱 Connect via claude.ai/code or Claude mobile app`);
    console.log(`🚀 ${this.moduleRegistry.listModules().length} modules loaded`);
    console.log(`🖥️  ${await this.fleetManager.getServerCount()} servers in fleet`);

    // Start Claude Code remote control session
    await this.coordinator.startRemoteControlSession({
      sessionName: 'pmVPN-Fleet',
      capacity: 16,  // Support more concurrent sessions
      features: {
        fleetManagement: true,
        multiServerExecution: true,
        deploymentOrchestration: true,
        realTimeMonitoring: true
      }
    });
  }
}

// CLI interface
if (import.meta.main) {
  const remoteControl = new EnhancedRemoteControl();

  switch (process.argv[2]) {
    case '--fleet':
      await remoteControl.startServer();
      break;

    case '--modules':
      const registry = new ModuleRegistry();
      const modules = registry.listModules();
      console.table(modules);
      break;

    case '--discover':
      const fleet = new FleetManager();
      const discovered = await fleet.discoverServers();
      console.log(`Found ${discovered.length} pmVPN servers:`);
      console.table(discovered);
      break;

    default:
      await remoteControl.startServer();
  }
}
```

### 2. Configuration Structure

```yaml
# ~/.pmvpn/fleet.yml
fleet:
  name: "My Infrastructure"

  environments:
    production:
      criticality: critical
      maintenanceWindows:
        - day: "Sunday"
          start: "02:00"
          duration: "4h"

    staging:
      criticality: important
      autoDeployment: true

    development:
      criticality: optional
      autoHealing: true

  groups:
    web-cluster:
      servers: ["prod-web-01", "prod-web-02", "staging-web-01"]
      loadBalancer: "lb-01"
      healthCheck:
        endpoint: "/health"
        interval: 30

    database-cluster:
      servers: ["prod-db-01", "prod-db-02"]
      replication: master-slave
      backupSchedule: "0 2 * * *"

  servers:
    prod-web-01:
      host: "198.51.100.10"
      environment: production
      services: [nginx, nodejs, docker]
      resources:
        cpu: 4
        memory: 8192
        disk: 100

    prod-db-01:
      host: "198.51.100.20"
      environment: production
      services: [postgresql, redis]
      backupTargets: ["s3://backups/prod-db"]

modules:
  enabled:
    - core-connection
    - core-auth
    - fleet-management
    - deployment-orchestration
    - monitoring-alerts

  custom:
    - path: "~/.pmvpn/modules/custom-deploy"
    - path: "~/.pmvpn/modules/security-scanner"

notifications:
  slack:
    webhook: "${SLACK_WEBHOOK_URL}"
    channels:
      alerts: "#infrastructure-alerts"
      deployments: "#deployments"

  email:
    smtp: "${SMTP_SERVER}"
    recipients: ["ops@company.com"]
```

## Module Development Kit

### 1. Module Template Generator

```bash
# ~/.pmvpn/bin/create-module
#!/bin/bash

MODULE_NAME=$1
MODULE_DIR="~/.pmvpn/modules/${MODULE_NAME}"

mkdir -p "${MODULE_DIR}"

cat > "${MODULE_DIR}/index.ts" << EOF
import { ClaudeModule, CommandDefinition } from '@pmvpn/module-sdk';

export class ${MODULE_NAME^}Module implements ClaudeModule {
  name = '${MODULE_NAME}';
  version = '1.0.0';
  description = 'Custom ${MODULE_NAME} module';

  commands: CommandDefinition[] = [
    {
      name: '${MODULE_NAME}-hello',
      description: 'Hello world command',
      usage: '${MODULE_NAME}-hello [name]',

      parameters: [
        {
          name: 'name',
          type: 'string',
          required: false,
          description: 'Name to greet',
          default: 'World'
        }
      ],

      handler: async (params, context) => {
        return {
          success: true,
          message: \`Hello, \${params.name}!\`
        };
      }
    }
  ];

  async onLoad() {
    console.log(\`\${this.name} module loaded\`);
  }

  async onUnload() {
    console.log(\`\${this.name} module unloaded\`);
  }
}
EOF

cat > "${MODULE_DIR}/package.json" << EOF
{
  "name": "@pmvpn/module-${MODULE_NAME}",
  "version": "1.0.0",
  "description": "Custom ${MODULE_NAME} module for pmVPN",
  "main": "index.ts",
  "dependencies": {
    "@pmvpn/module-sdk": "^1.0.0"
  }
}
EOF

echo "✅ Module ${MODULE_NAME} created at ${MODULE_DIR}"
echo "📝 Edit ${MODULE_DIR}/index.ts to add your functionality"
echo "🚀 Load with: pmvpn-remote-control --load-module ${MODULE_DIR}"
```

### 2. Module SDK

```typescript
// @pmvpn/module-sdk
export interface ModuleSDK {
  // Core services
  getFleetManager(): FleetManager;
  getConnectionManager(): ConnectionManager;
  getDeploymentManager(): DeploymentManager;

  // Execution context
  executeOnServer(serverId: string, command: string): Promise<ExecutionResult>;
  executeOnFleet(serverIds: string[], command: string): Promise<FleetResult>;

  // User interaction
  showMessage(message: string, type?: 'info' | 'warning' | 'error'): Promise<void>;
  requestConfirmation(message: string): Promise<boolean>;
  requestInput(prompt: string, type?: string): Promise<string>;

  // Event system
  emit(event: string, data: any): void;
  on(event: string, handler: EventHandler): void;

  // Storage
  getModuleConfig(key: string): any;
  setModuleConfig(key: string, value: any): Promise<void>;

  // Logging
  log: {
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;
    debug(message: string, data?: any): void;
  };
}
```

## Benefits of Modular Architecture

1. **Extensibility**: Easy to add new functionality without core changes
2. **Maintainability**: Modules are isolated and independently updatable
3. **Community**: Third-party developers can create custom modules
4. **Customization**: Organizations can build industry-specific modules
5. **Testing**: Modules can be tested independently
6. **Performance**: Only load needed modules, keep core lightweight

This modular expansion transforms the existing pmVPN remote control from a single-server tool into a comprehensive, extensible fleet coordination platform while maintaining the mobile-first, natural language interface that makes it so powerful.
// Module Registry — dynamic module loading and lifecycle management
// MIT License
//
// Manages registration, loading, and coordination of pmVPN modules
// including cloud providers, fleet management, and custom extensions.

import { logger } from '../server/src/utils/logger.js';
import { CloudProvider, CloudProviderRegistry } from './core/cloud-provider.js';

export interface ClaudeModule {
  // Module metadata
  name: string;
  version: string;
  description: string;
  author?: string;
  dependencies: string[];              // Required module names

  // Module capabilities
  commands?: CommandDefinition[];
  eventHandlers?: EventHandler[];
  workflows?: WorkflowDefinition[];

  // Lifecycle hooks
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
  onServerConnect?: (server: ServerConnection) => Promise<void>;
  onServerDisconnect?: (server: ServerConnection) => Promise<void>;

  // Configuration
  config?: ModuleConfig;
  permissions?: Permission[];

  // Cloud provider (if this module provides one)
  cloudProvider?: CloudProvider;
}

export interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  examples: string[];

  parameters: ParameterDefinition[];
  serverRequirements?: ServerFilter;
  permissions: Permission[];

  handler: CommandHandler;
  validator?: CommandValidator;
}

export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'server' | 'file' | 'array';
  required: boolean;
  description: string;
  default?: any;
  validation?: ValidationRule;
}

export type CommandHandler = (
  params: Record<string, any>,
  context: ExecutionContext
) => Promise<CommandResult>;

export type CommandValidator = (
  params: Record<string, any>
) => ValidationResult;

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: any;
  display?: string;                     // Formatted output for mobile display
  nextActions?: string[];               // Suggested follow-up actions
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidationRule {
  pattern?: RegExp;
  min?: number;
  max?: number;
  enum?: string[];
  custom?: (value: any) => boolean;
}

export interface ServerFilter {
  provider?: string;
  environment?: string[];
  hasService?: string;
  status?: string;
  any?: boolean;                        // Accept any server
}

export interface EventHandler {
  event: string;
  handler: (data: any) => Promise<void>;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  triggers: string[];                   // Event triggers or command names
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name?: string;
  action: string;
  servers?: string | string[];
  parallel?: boolean;
  condition?: string;
  dependsOn?: string | string[];
  timeout?: number;
  retryCount?: number;
}

export interface ModuleConfig {
  [key: string]: any;
}

export interface Permission {
  resource: string;                     // 'read:fleet', 'deploy:servers', etc.
  description?: string;
}

export interface ServerConnection {
  id: string;
  host: string;
  port: number;
  status: 'connected' | 'disconnected' | 'error';
}

export interface ExecutionContext {
  user: {
    wallet: string;
    permissions: string[];
  };

  getModuleRegistry(): ModuleRegistry;
  getCloudProviderRegistry(): CloudProviderRegistry;

  // UI interaction methods
  showMessage(message: string, type?: 'info' | 'warning' | 'error'): Promise<void>;
  requestConfirmation(message: string): Promise<boolean>;
  requestInput(prompt: string, type?: string): Promise<string>;
  showExecutionPlan(plan: any): Promise<void>;

  // Execution methods
  executeOnServer(serverId: string, command: string): Promise<any>;
  executeOnFleet(serverIds: string[], command: string): Promise<any>;

  // Storage
  getConfig(key: string): any;
  setConfig(key: string, value: any): Promise<void>;

  // Logging
  log: {
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;
    debug(message: string, data?: any): void;
  };
}

/**
 * Central registry for managing all pmVPN modules
 */
export class ModuleRegistry {
  private modules = new Map<string, ClaudeModule>();
  private commands = new Map<string, CommandDefinition>();
  private eventHandlers = new Map<string, EventHandler[]>();
  private loadOrder: string[] = [];

  private cloudProviderRegistry = new CloudProviderRegistry();

  constructor() {
    logger.info('ModuleRegistry initialized');
  }

  /**
   * Load a module from a file path or module instance
   */
  async loadModule(modulePathOrInstance: string | ClaudeModule): Promise<void> {
    let module: ClaudeModule;

    if (typeof modulePathOrInstance === 'string') {
      // Dynamic import from file path
      const moduleExport = await import(modulePathOrInstance);
      module = moduleExport.default || moduleExport;
    } else {
      module = modulePathOrInstance;
    }

    // Validate module structure
    if (!module.name || !module.version) {
      throw new Error(`Invalid module: missing name or version`);
    }

    // Check for conflicts
    if (this.modules.has(module.name)) {
      throw new Error(`Module ${module.name} is already loaded`);
    }

    // Resolve dependencies
    await this.resolveDependencies(module);

    // Store module
    this.modules.set(module.name, module);
    this.loadOrder.push(module.name);

    // Register cloud provider if provided
    if (module.cloudProvider) {
      this.cloudProviderRegistry.register(module.cloudProvider);
      logger.info(
        { provider: module.cloudProvider.name },
        `Cloud provider registered: ${module.cloudProvider.displayName}`
      );
    }

    // Register commands
    if (module.commands) {
      for (const command of module.commands) {
        this.registerCommand(command);
      }
    }

    // Register event handlers
    if (module.eventHandlers) {
      for (const handler of module.eventHandlers) {
        this.registerEventHandler(handler);
      }
    }

    // Call onLoad hook
    if (module.onLoad) {
      await module.onLoad();
    }

    logger.info(
      {
        name: module.name,
        version: module.version,
        commands: module.commands?.length || 0,
        events: module.eventHandlers?.length || 0
      },
      `Module loaded: ${module.name}`
    );
  }

  /**
   * Unload a module by name
   */
  async unloadModule(name: string): Promise<void> {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`Module ${name} is not loaded`);
    }

    // Call onUnload hook
    if (module.onUnload) {
      await module.onUnload();
    }

    // Unregister commands
    if (module.commands) {
      for (const command of module.commands) {
        this.unregisterCommand(command.name);
      }
    }

    // Unregister event handlers
    if (module.eventHandlers) {
      for (const handler of module.eventHandlers) {
        this.unregisterEventHandler(handler);
      }
    }

    // Unregister cloud provider
    if (module.cloudProvider) {
      this.cloudProviderRegistry.unregister(module.cloudProvider.name);
    }

    // Remove from registry
    this.modules.delete(name);
    this.loadOrder = this.loadOrder.filter(n => n !== name);

    logger.info(`Module unloaded: ${name}`);
  }

  /**
   * Get a loaded module by name
   */
  getModule(name: string): ClaudeModule | undefined {
    return this.modules.get(name);
  }

  /**
   * Get all loaded modules
   */
  listModules(): ModuleInfo[] {
    return Array.from(this.modules.values()).map(module => ({
      name: module.name,
      version: module.version,
      description: module.description,
      author: module.author,
      dependencies: module.dependencies,
      loaded: true,
      commandCount: module.commands?.length || 0,
      eventHandlerCount: module.eventHandlers?.length || 0,
      hasCloudProvider: !!module.cloudProvider
    }));
  }

  /**
   * Get the cloud provider registry
   */
  getCloudProviderRegistry(): CloudProviderRegistry {
    return this.cloudProviderRegistry;
  }

  /**
   * Execute a registered command
   */
  async executeCommand(
    commandName: string,
    params: Record<string, any>,
    context: ExecutionContext
  ): Promise<CommandResult> {
    const command = this.commands.get(commandName);
    if (!command) {
      // Try aliases
      for (const [name, cmd] of this.commands) {
        if (cmd.aliases.includes(commandName)) {
          return await this.executeCommand(name, params, context);
        }
      }

      throw new Error(`Unknown command: ${commandName}`);
    }

    // Validate parameters
    if (command.validator) {
      const validation = command.validator(params);
      if (!validation.valid) {
        throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
      }
    }

    // Check permissions
    const hasPermission = this.checkPermissions(context.user.permissions, command.permissions);
    if (!hasPermission) {
      throw new Error(`Insufficient permissions for command: ${commandName}`);
    }

    // Execute command
    try {
      const result = await command.handler(params, context);
      logger.info(
        { command: commandName, success: result.success },
        `Command executed: ${commandName}`
      );
      return result;
    } catch (error) {
      logger.error(
        { command: commandName, error: error.message },
        `Command failed: ${commandName}`
      );
      throw error;
    }
  }

  /**
   * Emit an event to all registered handlers
   */
  async emitEvent(eventName: string, data: any): Promise<void> {
    const handlers = this.eventHandlers.get(eventName) || [];

    await Promise.allSettled(
      handlers.map(handler => {
        try {
          return handler.handler(data);
        } catch (error) {
          logger.error(
            { event: eventName, error: error.message },
            `Event handler error`
          );
          return Promise.resolve();
        }
      })
    );

    if (handlers.length > 0) {
      logger.debug(
        { event: eventName, handlerCount: handlers.length },
        `Event emitted: ${eventName}`
      );
    }
  }

  /**
   * Get all registered commands
   */
  getCommands(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get command by name or alias
   */
  getCommand(name: string): CommandDefinition | undefined {
    const command = this.commands.get(name);
    if (command) return command;

    // Check aliases
    for (const cmd of this.commands.values()) {
      if (cmd.aliases.includes(name)) {
        return cmd;
      }
    }

    return undefined;
  }

  private async resolveDependencies(module: ClaudeModule): Promise<void> {
    for (const dependency of module.dependencies) {
      if (!this.modules.has(dependency)) {
        throw new Error(
          `Module ${module.name} requires dependency ${dependency} which is not loaded`
        );
      }
    }
  }

  private registerCommand(command: CommandDefinition): void {
    if (this.commands.has(command.name)) {
      throw new Error(`Command ${command.name} is already registered`);
    }

    // Check for alias conflicts
    for (const alias of command.aliases) {
      if (this.commands.has(alias)) {
        throw new Error(`Command alias ${alias} conflicts with existing command`);
      }
      for (const existingCommand of this.commands.values()) {
        if (existingCommand.aliases.includes(alias)) {
          throw new Error(`Command alias ${alias} conflicts with existing alias`);
        }
      }
    }

    this.commands.set(command.name, command);
  }

  private unregisterCommand(name: string): void {
    this.commands.delete(name);
  }

  private registerEventHandler(handler: EventHandler): void {
    if (!this.eventHandlers.has(handler.event)) {
      this.eventHandlers.set(handler.event, []);
    }
    this.eventHandlers.get(handler.event)!.push(handler);
  }

  private unregisterEventHandler(handler: EventHandler): void {
    const handlers = this.eventHandlers.get(handler.event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.eventHandlers.delete(handler.event);
      }
    }
  }

  private checkPermissions(userPermissions: string[], requiredPermissions: Permission[]): boolean {
    for (const required of requiredPermissions) {
      if (!userPermissions.includes(required.resource)) {
        return false;
      }
    }
    return true;
  }
}

export interface ModuleInfo {
  name: string;
  version: string;
  description: string;
  author?: string;
  dependencies: string[];
  loaded: boolean;
  commandCount: number;
  eventHandlerCount: number;
  hasCloudProvider: boolean;
}

// Default export for compatibility
export default ModuleRegistry;
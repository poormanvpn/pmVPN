// SPDX-License-Identifier: GPL-3.0-only
// Cloud Provider Interface — standardized provider abstraction
// MIT License
//
// Defines the common interface that all cloud providers must implement
// for seamless integration with the pmVPN fleet coordination system.

export interface ServerSpec {
  id: string;                           // Unique server identifier
  name: string;                         // Human-readable name
  type: 'vps' | 'dedicated' | 'self-hosted' | 'container';

  // pmVPN connection details
  pmvpn: {
    host: string;                       // IP address or hostname
    basePort: number;                   // Base port (usually 2200)
    walletAuth: string;                 // Required wallet address
    detected?: boolean;                 // Whether pmVPN was auto-detected
  };

  // Server resources
  resources: {
    cpu: number;                        // CPU cores
    memory: number;                     // RAM in MB
    disk: number;                       // Storage in GB
    bandwidth?: number;                 // Monthly bandwidth in GB
  };

  // Classification
  environment: 'production' | 'staging' | 'development' | 'testing';
  criticality: 'critical' | 'important' | 'optional';

  // Provider metadata
  provider: string;                     // 'hostinger', 'digitalocean', 'aws', etc.
  providerMetadata?: Record<string, any>; // Provider-specific data

  // Deployment info
  services?: ServiceSpec[];             // Running services
  lastHealthCheck?: number;             // Unix timestamp
  status?: 'healthy' | 'warning' | 'critical' | 'unreachable';
}

export interface ServiceSpec {
  name: string;                         // Service name (nginx, postgresql, etc.)
  port: number;                         // Service port
  status: 'running' | 'stopped' | 'error';
  version?: string;                     // Service version
}

export interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical' | 'unreachable';
  checks: HealthCheck[];
  timestamp: number;
}

export interface HealthCheck {
  name: string;                         // Check name (cpu, memory, disk, etc.)
  status: 'pass' | 'warn' | 'fail';
  value?: number;                       // Current value
  threshold?: number;                   // Warning/error threshold
  message?: string;                     // Human-readable status
}

export interface DeploymentPlan {
  id: string;
  name: string;
  description: string;
  targetServers: string[];              // Server IDs
  steps: DeploymentStep[];
  estimatedDuration: number;            // Minutes
  rollbackPlan?: DeploymentStep[];
}

export interface DeploymentStep {
  name: string;
  servers: string[];
  command: string;
  parallel: boolean;
  timeout: number;                      // Seconds
  required: boolean;                    // Fail deployment if this step fails
  dependsOn?: string[];                 // Previous step names
}

export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  duration: number;                     // Actual duration in seconds
  steps: StepResult[];
  error?: string;
}

export interface StepResult {
  stepName: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

export interface ProvisioningConfig {
  plan: string;                         // VPS plan/size identifier
  location: string;                     // Datacenter location
  os: string;                           // Operating system
  name?: string;                        // Custom server name
  autoInstallPmvpn?: boolean;           // Auto-install pmVPN after provision
  walletMapping?: Record<string, string>; // Wallet→user mappings to configure
}

export interface ProvisioningResult {
  success: boolean;
  serverId: string;
  ip: string;
  credentials?: {
    username: string;
    password?: string;
    privateKey?: string;
  };
  estimatedReady: number;               // Unix timestamp when server will be ready
  error?: string;
}

/**
 * CloudProvider interface that all provider modules must implement
 */
export abstract class CloudProvider {
  abstract readonly name: string;       // Provider identifier (hostinger, aws, etc.)
  abstract readonly displayName: string; // Human-readable name

  /**
   * Initialize the provider with configuration
   * @param config Provider-specific configuration (API keys, etc.)
   */
  abstract initialize(config: Record<string, any>): Promise<void>;

  /**
   * Discover all servers/instances for the authenticated user
   * @param walletAddress Wallet address for authentication context
   * @returns Array of discovered servers in standardized format
   */
  abstract discoverServers(walletAddress: string): Promise<ServerSpec[]>;

  /**
   * Get detailed health status for a specific server
   * @param serverId Server identifier
   * @returns Current health status with metrics
   */
  abstract getHealthStatus(serverId: string): Promise<HealthStatus>;

  /**
   * Execute a provider-specific command
   * @param command Command name
   * @param params Command parameters
   * @returns Command execution result
   */
  abstract executeCommand(command: string, params: any): Promise<any>;

  /**
   * Provision a new server/instance
   * @param config Provisioning configuration
   * @returns Provisioning result with server details
   */
  abstract provisionServer(config: ProvisioningConfig): Promise<ProvisioningResult>;

  /**
   * Get available plans/sizes for provisioning
   * @returns Array of available plans with pricing
   */
  abstract getAvailablePlans(): Promise<ProvisioningPlan[]>;

  /**
   * Get available datacenter locations
   * @returns Array of available locations
   */
  abstract getAvailableLocations(): Promise<ProvisioningLocation[]>;

  /**
   * Terminate/delete a server instance
   * @param serverId Server identifier
   * @returns Success/failure result
   */
  abstract terminateServer(serverId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Check if this provider can manage the given server
   * @param serverSpec Server specification
   * @returns True if this provider can manage the server
   */
  canManageServer(serverSpec: ServerSpec): boolean {
    return serverSpec.provider === this.name;
  }

  /**
   * Transform provider-specific server data to standardized ServerSpec
   * @param providerData Raw data from provider API
   * @returns Standardized server specification
   */
  protected abstract transformToServerSpec(providerData: any): ServerSpec;
}

export interface ProvisioningPlan {
  id: string;
  name: string;
  cpu: number;
  memory: number;                       // MB
  disk: number;                         // GB
  bandwidth: number;                    // GB/month
  priceMonthly: number;                 // USD
  description?: string;
}

export interface ProvisioningLocation {
  id: string;
  name: string;                         // "Amsterdam, Netherlands"
  code: string;                         // "ams"
  country: string;
  continent: string;
  latency?: number;                     // Estimated latency in ms
}

/**
 * Provider registry for managing multiple cloud providers
 */
export class CloudProviderRegistry {
  private providers = new Map<string, CloudProvider>();

  register(provider: CloudProvider): void {
    this.providers.set(provider.name, provider);
  }

  unregister(name: string): void {
    this.providers.delete(name);
  }

  get(name: string): CloudProvider | undefined {
    return this.providers.get(name);
  }

  getAll(): CloudProvider[] {
    return Array.from(this.providers.values());
  }

  getForServer(serverSpec: ServerSpec): CloudProvider | undefined {
    return this.providers.get(serverSpec.provider);
  }

  async discoverAllServers(walletAddress: string): Promise<ServerSpec[]> {
    const discoveries = await Promise.allSettled(
      Array.from(this.providers.values()).map(provider =>
        provider.discoverServers(walletAddress)
      )
    );

    return discoveries
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => (result as PromiseFulfilledResult<ServerSpec[]>).value);
  }
}
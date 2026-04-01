// Hostinger Cloud Provider — MCP integration for VPS management
// MIT License
//
// Integrates Hostinger VPS management through hostinger-api-mcp
// Provides server discovery, provisioning, and fleet coordination.

import { spawn } from 'node:child_process';
import { logger } from '../../server/src/utils/logger.js';
import {
  CloudProvider,
  ServerSpec,
  HealthStatus,
  ProvisioningConfig,
  ProvisioningResult,
  ProvisioningPlan,
  ProvisioningLocation
} from '../core/cloud-provider.js';

export class HostingerProvider extends CloudProvider {
  readonly name = 'hostinger';
  readonly displayName = 'Hostinger VPS';

  private apiKey?: string;
  private mcpProcess?: any;
  private isInitialized = false;

  async initialize(config: Record<string, any>): Promise<void> {
    this.apiKey = config.apiKey || process.env.HOSTINGER_API_KEY;

    if (!this.apiKey) {
      throw new Error('Hostinger API key is required (set HOSTINGER_API_KEY or provide in config)');
    }

    // Test MCP connection by spawning hostinger-api-mcp process
    try {
      await this.testMcpConnection();
      this.isInitialized = true;
      logger.info('Hostinger provider initialized successfully');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize Hostinger provider');
      throw error;
    }
  }

  async discoverServers(walletAddress: string): Promise<ServerSpec[]> {
    if (!this.isInitialized) {
      throw new Error('Hostinger provider not initialized');
    }

    try {
      // Call MCP tool to list VPS instances
      const vpsInstances = await this.callMcpTool('list_vps_instances', {});

      const servers: ServerSpec[] = [];

      for (const vps of vpsInstances) {
        // Test if pmVPN is running on this VPS
        const pmvpnDetected = await this.testPmvpnPorts(vps.public_ip);

        if (pmvpnDetected) {
          servers.push(this.transformToServerSpec(vps));
        }
      }

      logger.info(
        { discovered: servers.length, total: vpsInstances.length },
        'Hostinger server discovery complete'
      );

      return servers;
    } catch (error) {
      logger.error({ error: error.message }, 'Hostinger server discovery failed');
      return []; // Return empty array instead of throwing to allow other providers
    }
  }

  async getHealthStatus(serverId: string): Promise<HealthStatus> {
    try {
      // Extract Hostinger VPS ID from server ID
      const vpsId = serverId.replace('hostinger-', '');

      // Get VPS details from MCP
      const vps = await this.callMcpTool('get_vps_details', { vps_id: vpsId });

      // Determine health status based on VPS state
      let status: 'healthy' | 'warning' | 'critical' | 'unreachable';
      const checks = [];

      if (vps.status === 'active') {
        status = 'healthy';
        checks.push({
          name: 'VPS Status',
          status: 'pass' as const,
          message: 'VPS is running'
        });
      } else if (vps.status === 'suspended') {
        status = 'critical';
        checks.push({
          name: 'VPS Status',
          status: 'fail' as const,
          message: 'VPS is suspended'
        });
      } else {
        status = 'warning';
        checks.push({
          name: 'VPS Status',
          status: 'warn' as const,
          message: `VPS status: ${vps.status}`
        });
      }

      // Add resource checks if available
      if (vps.resources) {
        if (vps.resources.cpu_usage > 80) {
          checks.push({
            name: 'CPU Usage',
            status: 'warn' as const,
            value: vps.resources.cpu_usage,
            threshold: 80,
            message: `CPU usage: ${vps.resources.cpu_usage}%`
          });
        }

        if (vps.resources.memory_usage > 90) {
          checks.push({
            name: 'Memory Usage',
            status: 'warn' as const,
            value: vps.resources.memory_usage,
            threshold: 90,
            message: `Memory usage: ${vps.resources.memory_usage}%`
          });
        }
      }

      return {
        status,
        checks,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(
        { serverId, error: error.message },
        'Failed to get Hostinger VPS health status'
      );

      return {
        status: 'unreachable',
        checks: [{
          name: 'Connection',
          status: 'fail',
          message: error.message
        }],
        timestamp: Date.now()
      };
    }
  }

  async executeCommand(command: string, params: any): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Hostinger provider not initialized');
    }

    switch (command) {
      case 'list-vps':
        return this.callMcpTool('list_vps_instances', params);

      case 'create-vps':
        return this.callMcpTool('create_vps', {
          plan: params.plan || 'kvm-2',
          location: params.location || 'netherlands',
          os: params.os || 'ubuntu-22.04',
          name: params.name || `pmvpn-${Date.now()}`
        });

      case 'get-vps-details':
        return this.callMcpTool('get_vps_details', { vps_id: params.vpsId });

      case 'restart-vps':
        return this.callMcpTool('restart_vps', { vps_id: params.vpsId });

      case 'get-ssh-access':
        return this.callMcpTool('get_ssh_access', { vps_id: params.vpsId });

      default:
        throw new Error(`Unknown Hostinger command: ${command}`);
    }
  }

  async provisionServer(config: ProvisioningConfig): Promise<ProvisioningResult> {
    try {
      logger.info({ config }, 'Provisioning new Hostinger VPS');

      const vps = await this.callMcpTool('create_vps', {
        plan: config.plan,
        location: config.location,
        os: config.os,
        name: config.name || `pmvpn-${Date.now()}`
      });

      // Get SSH credentials
      const sshAccess = await this.callMcpTool('get_ssh_access', {
        vps_id: vps.id
      });

      const result: ProvisioningResult = {
        success: true,
        serverId: `hostinger-${vps.id}`,
        ip: vps.public_ip,
        credentials: {
          username: sshAccess.username || 'root',
          password: sshAccess.password
        },
        estimatedReady: Date.now() + (5 * 60 * 1000) // 5 minutes
      };

      // Auto-install pmVPN if requested
      if (config.autoInstallPmvpn) {
        logger.info({ vpsId: vps.id }, 'Auto-installing pmVPN on new VPS');
        // This would trigger the bootstrap process
        // Implementation would integrate with existing bootstrap.ts
        result.estimatedReady = Date.now() + (10 * 60 * 1000); // 10 minutes with pmVPN
      }

      logger.info({ serverId: result.serverId }, 'Hostinger VPS provisioned successfully');
      return result;

    } catch (error) {
      logger.error({ error: error.message, config }, 'Hostinger VPS provisioning failed');
      return {
        success: false,
        serverId: '',
        ip: '',
        error: error.message
      };
    }
  }

  async getAvailablePlans(): Promise<ProvisioningPlan[]> {
    // Hostinger VPS plans (hardcoded for now - would come from MCP in real implementation)
    return [
      {
        id: 'kvm-1',
        name: 'KVM 1',
        cpu: 1,
        memory: 1024,
        disk: 20,
        bandwidth: 1000,
        priceMonthly: 3.99,
        description: 'Entry-level VPS perfect for development'
      },
      {
        id: 'kvm-2',
        name: 'KVM 2',
        cpu: 2,
        memory: 4096,
        disk: 40,
        bandwidth: 2000,
        priceMonthly: 8.99,
        description: 'Balanced VPS for small applications'
      },
      {
        id: 'kvm-4',
        name: 'KVM 4',
        cpu: 4,
        memory: 8192,
        disk: 80,
        bandwidth: 4000,
        priceMonthly: 18.99,
        description: 'High-performance VPS for production workloads'
      }
    ];
  }

  async getAvailableLocations(): Promise<ProvisioningLocation[]> {
    // Hostinger datacenter locations
    return [
      {
        id: 'netherlands',
        name: 'Amsterdam, Netherlands',
        code: 'ams',
        country: 'Netherlands',
        continent: 'Europe'
      },
      {
        id: 'uk',
        name: 'London, United Kingdom',
        code: 'lon',
        country: 'United Kingdom',
        continent: 'Europe'
      },
      {
        id: 'usa',
        name: 'New York, USA',
        code: 'nyc',
        country: 'United States',
        continent: 'North America'
      },
      {
        id: 'lithuania',
        name: 'Vilnius, Lithuania',
        code: 'vil',
        country: 'Lithuania',
        continent: 'Europe'
      }
    ];
  }

  async terminateServer(serverId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const vpsId = serverId.replace('hostinger-', '');
      await this.callMcpTool('delete_vps', { vps_id: vpsId });

      logger.info({ serverId }, 'Hostinger VPS terminated successfully');
      return { success: true };
    } catch (error) {
      logger.error({ serverId, error: error.message }, 'Failed to terminate Hostinger VPS');
      return { success: false, error: error.message };
    }
  }

  protected transformToServerSpec(vpsData: any): ServerSpec {
    return {
      id: `hostinger-${vpsData.id}`,
      name: vpsData.name || `Hostinger VPS ${vpsData.id}`,
      type: 'vps',

      pmvpn: {
        host: vpsData.public_ip,
        basePort: 2200,
        walletAuth: '', // Would be configured during setup
        detected: true
      },

      resources: {
        cpu: vpsData.plan?.cpu_cores || 1,
        memory: vpsData.plan?.ram_mb || 1024,
        disk: vpsData.plan?.disk_gb || 20,
        bandwidth: vpsData.plan?.bandwidth_gb || 1000
      },

      environment: this.determineEnvironment(vpsData.name),
      criticality: 'important',

      provider: 'hostinger',
      providerMetadata: {
        vpsId: vpsData.id,
        plan: vpsData.plan,
        location: vpsData.datacenter,
        status: vpsData.status,
        created: vpsData.created_at
      },

      status: this.mapHostingerStatus(vpsData.status)
    };
  }

  private async testMcpConnection(): Promise<void> {
    try {
      // Test basic MCP connection by spawning process
      const result = await this.callMcpTool('get_account_info', {});
      logger.debug({ account: result.email }, 'MCP connection test successful');
    } catch (error) {
      throw new Error(`MCP connection test failed: ${error.message}`);
    }
  }

  private async testPmvpnPorts(ip: string): Promise<boolean> {
    // Simple port connectivity test for pmVPN default port
    // In a full implementation, this would test all 8 ports
    return new Promise((resolve) => {
      const testSocket = new (require('net')).Socket();

      testSocket.setTimeout(5000);

      testSocket.on('connect', () => {
        testSocket.destroy();
        resolve(true);
      });

      testSocket.on('timeout', () => {
        testSocket.destroy();
        resolve(false);
      });

      testSocket.on('error', () => {
        resolve(false);
      });

      testSocket.connect(2200, ip);
    });
  }

  private async callMcpTool(tool: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // Spawn hostinger-api-mcp process
      const mcpProcess = spawn('npx', ['hostinger-api-mcp@latest'], {
        env: {
          ...process.env,
          API_TOKEN: this.apiKey
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      mcpProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      mcpProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      mcpProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse MCP response
            // This is a simplified implementation
            // Real MCP protocol would use JSON-RPC over stdio
            const response = JSON.parse(stdout);
            resolve(response.result || response);
          } catch (error) {
            reject(new Error(`Failed to parse MCP response: ${error.message}`));
          }
        } else {
          reject(new Error(`MCP process failed with code ${code}: ${stderr}`));
        }
      });

      // Send MCP request
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: `tools/call`,
        params: {
          name: tool,
          arguments: params
        }
      };

      mcpProcess.stdin.write(JSON.stringify(request) + '\n');
      mcpProcess.stdin.end();

      // Timeout after 30 seconds
      setTimeout(() => {
        mcpProcess.kill();
        reject(new Error('MCP request timeout'));
      }, 30000);
    });
  }

  private determineEnvironment(vpsName: string): 'production' | 'staging' | 'development' | 'testing' {
    const name = vpsName.toLowerCase();

    if (name.includes('prod')) return 'production';
    if (name.includes('staging') || name.includes('stage')) return 'staging';
    if (name.includes('test')) return 'testing';

    return 'development';
  }

  private mapHostingerStatus(status: string): 'healthy' | 'warning' | 'critical' | 'unreachable' {
    switch (status) {
      case 'active':
      case 'running':
        return 'healthy';

      case 'suspended':
      case 'stopped':
        return 'critical';

      case 'maintenance':
      case 'pending':
        return 'warning';

      default:
        return 'unreachable';
    }
  }
}
#!/usr/bin/env node
// Enhanced pmVPN Remote Control — Claude Code with modular fleet coordination
// MIT License
//
// Extends the basic remote control with cloud provider integration
// and fleet management capabilities for handheld infrastructure control.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { logger } from './server/src/utils/logger.js';
import ModuleRegistry from './modules/registry.js';
import HostingerModule from './modules/hostinger/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const SESSION_NAME = process.env.PMVPN_SESSION_NAME || 'pmVPN-Fleet';
const SPAWN_MODE = process.env.PMVPN_SPAWN_MODE || 'worktree';
const CAPACITY = parseInt(process.env.PMVPN_CAPACITY || '16');

interface EnhancedRemoteControlConfig {
  sessionName: string;
  spawnMode: 'worktree' | 'same-dir';
  capacity: number;
  modules: string[];
  features: {
    fleetManagement: boolean;
    cloudProviders: boolean;
    mcpIntegration: boolean;
    mobileOptimization: boolean;
  };
}

class EnhancedRemoteControl {
  private moduleRegistry: ModuleRegistry;
  private config: EnhancedRemoteControlConfig;

  constructor() {
    this.moduleRegistry = new ModuleRegistry();
    this.config = {
      sessionName: SESSION_NAME,
      spawnMode: SPAWN_MODE as 'worktree' | 'same-dir',
      capacity: CAPACITY,
      modules: ['hostinger-cloud-provider'],
      features: {
        fleetManagement: true,
        cloudProviders: true,
        mcpIntegration: true,
        mobileOptimization: true
      }
    };
  }

  async initialize(): Promise<void> {
    console.log('🔱 Initializing Enhanced pmVPN Remote Control');
    console.log('─'.repeat(50));

    try {
      // Initialize module registry
      logger.info('Initializing module registry...');

      // Load Hostinger cloud provider module
      if (this.config.modules.includes('hostinger-cloud-provider')) {
        logger.info('Loading Hostinger cloud provider...');
        const hostingerModule = new HostingerModule();
        await this.moduleRegistry.loadModule(hostingerModule);
      }

      // Future: Load additional modules
      // await this.loadCustomModules();

      // Display loaded modules
      const modules = this.moduleRegistry.listModules();
      const providers = this.moduleRegistry.getCloudProviderRegistry().getAll();

      console.log(`✅ ${modules.length} modules loaded`);
      console.log(`☁️ ${providers.length} cloud providers available`);

      for (const module of modules) {
        console.log(`   📦 ${module.name} v${module.version} (${module.commandCount} commands)`);
      }

      for (const provider of providers) {
        console.log(`   🌩️ ${provider.displayName}`);
      }

      console.log('─'.repeat(50));

    } catch (error) {
      logger.error({ error: error.message }, 'Initialization failed');
      throw error;
    }
  }

  async startRemoteControlSession(): Promise<void> {
    console.log('🚀 Starting Claude Code Remote Control session...');
    console.log('');
    console.log(`📱 Session: ${this.config.sessionName}`);
    console.log(`🔄 Mode: ${this.config.spawnMode}`);
    console.log(`👥 Capacity: ${this.config.capacity} concurrent sessions`);
    console.log('');
    console.log('🌍 Fleet Coordination Features:');
    console.log('   • Multi-cloud VPS management');
    console.log('   • Natural language operations');
    console.log('   • Mobile-first interface');
    console.log('   • Wallet-based authentication');
    console.log('');
    console.log(`📱 Connect via: ${this.getConnectionInstructions()}`);
    console.log('📲 QR Code: Press spacebar to display');
    console.log('');

    await this.launchClaudeCode();
  }

  async startInteractiveSession(): Promise<void> {
    console.log('🎮 Starting Interactive Remote Control session...');
    console.log('This combines local terminal access with remote fleet coordination.');
    console.log('');

    await this.launchClaudeCodeInteractive();
  }

  async showStatus(): Promise<void> {
    console.log('📊 Enhanced Remote Control Status');
    console.log('─'.repeat(50));

    // Check Claude Code
    try {
      const claudeVersion = await this.getClaudeVersion();
      console.log(`✅ Claude Code: ${claudeVersion}`);
    } catch (error) {
      console.log(`❌ Claude Code: Not available (${error.message})`);
      return;
    }

    // Check authentication
    try {
      const authStatus = await this.getAuthStatus();
      console.log(`✅ Authentication: ${authStatus}`);
    } catch (error) {
      console.log(`❌ Authentication: ${error.message}`);
    }

    // Module status
    const modules = this.moduleRegistry.listModules();
    console.log(`📦 Modules: ${modules.length} loaded`);

    for (const module of modules) {
      const status = module.hasCloudProvider ? '☁️' : '📄';
      console.log(`   ${status} ${module.name} v${module.version}`);
    }

    // Provider status
    const providers = this.moduleRegistry.getCloudProviderRegistry().getAll();
    console.log(`🌩️ Cloud Providers: ${providers.length} available`);

    for (const provider of providers) {
      console.log(`   ✅ ${provider.displayName}`);
    }

    // Fleet status (if available)
    try {
      const fleetStatus = await this.getFleetStatus();
      console.log(`🚢 Fleet: ${fleetStatus.servers} servers across ${fleetStatus.providers} providers`);
    } catch (error) {
      console.log(`🚢 Fleet: Status unavailable (${error.message})`);
    }

    console.log('─'.repeat(50));
  }

  async demonstrateCapabilities(): Promise<void> {
    console.log('🎯 pmVPN Fleet Coordination Capabilities');
    console.log('─'.repeat(50));

    const commands = this.moduleRegistry.getCommands();
    const providers = this.moduleRegistry.getCloudProviderRegistry().getAll();

    console.log('💬 Natural Language Commands:');
    console.log('   "Create a new VPS in Amsterdam"');
    console.log('   "Show me the status of all my servers"');
    console.log('   "Deploy the app to staging environment"');
    console.log('   "Backup all databases"');
    console.log('   "Scale the web cluster to 5 instances"');
    console.log('');

    console.log('🔧 Available Commands:');
    for (const cmd of commands.slice(0, 5)) { // Show first 5 commands
      console.log(`   • ${cmd.name} - ${cmd.description}`);
    }
    if (commands.length > 5) {
      console.log(`   ... and ${commands.length - 5} more commands`);
    }
    console.log('');

    console.log('☁️ Cloud Providers:');
    for (const provider of providers) {
      console.log(`   • ${provider.displayName} - VPS management and fleet coordination`);
    }
    console.log('');

    console.log('📱 Mobile Interface:');
    console.log('   • Touch-optimized quick actions');
    console.log('   • Voice command support');
    console.log('   • Real-time fleet monitoring');
    console.log('   • Gesture-based navigation');
    console.log('');

    console.log('🔒 Security:');
    console.log('   • Wallet-based authentication across all providers');
    console.log('   • Role-based permissions (admin/operator/user)');
    console.log('   • Ed25519 + secp256k1 cryptography');
    console.log('   • No central password database');
    console.log('─'.repeat(50));
  }

  // Helper methods

  private getConnectionInstructions(): string {
    return `claude.ai/code or Claude mobile app`;
  }

  private async launchClaudeCode(): Promise<void> {
    const args = [
      'remote-control',
      '--name', this.config.sessionName,
      '--spawn', this.config.spawnMode,
      '--capacity', this.config.capacity.toString(),
      '--verbose'
    ];

    const claudeProcess = spawn('claude', args, {
      cwd: __dirname,
      stdio: 'inherit',
      env: {
        ...process.env,
        PMVPN_ENHANCED_MODE: 'true',
        PMVPN_MODULES: this.config.modules.join(','),
        PMVPN_FEATURES: JSON.stringify(this.config.features)
      }
    });

    claudeProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error({ code }, 'Claude Code remote control exited with error');
        process.exit(code);
      }
    });

    claudeProcess.on('error', (error) => {
      logger.error({ error: error.message }, 'Failed to start Claude Code');
      process.exit(1);
    });
  }

  private async launchClaudeCodeInteractive(): Promise<void> {
    const args = ['--remote-control', this.config.sessionName];

    const claudeProcess = spawn('claude', args, {
      cwd: __dirname,
      stdio: 'inherit'
    });

    claudeProcess.on('close', (code) => {
      process.exit(code || 0);
    });
  }

  private async getClaudeVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const claude = spawn('claude', ['--version'], { stdio: 'pipe' });

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error('Claude Code not found'));
        }
      });
    });
  }

  private async getAuthStatus(): Promise<string> {
    return new Promise((resolve, reject) => {
      const claude = spawn('claude', ['auth', 'status'], { stdio: 'pipe' });

      let output = '';
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          resolve('Authenticated');
        } else {
          reject(new Error('Not authenticated - run: claude auth login'));
        }
      });
    });
  }

  private async getFleetStatus(): Promise<{ servers: number; providers: number }> {
    // This would integrate with the fleet discovery system
    // For now, return mock data
    return {
      servers: 0,
      providers: this.moduleRegistry.getCloudProviderRegistry().getAll().length
    };
  }

  private async loadCustomModules(): Promise<void> {
    // Future: Load modules from ~/.pmvpn/modules/
    // const customModulesDir = join(os.homedir(), '.pmvpn', 'modules');
    // const modules = await this.discoverModules(customModulesDir);
    // for (const module of modules) {
    //   await this.moduleRegistry.loadModule(module);
    // }
  }
}

// CLI interface
async function main() {
  const remoteControl = new EnhancedRemoteControl();

  const command = process.argv[2];

  try {
    switch (command) {
      case '--interactive':
      case '-i':
        await remoteControl.initialize();
        await remoteControl.startInteractiveSession();
        break;

      case '--status':
      case '-s':
        await remoteControl.initialize();
        await remoteControl.showStatus();
        break;

      case '--demo':
      case '-d':
        await remoteControl.initialize();
        await remoteControl.demonstrateCapabilities();
        break;

      case '--help':
      case '-h':
        console.log(`
🔱 Enhanced pmVPN Remote Control

Usage: ${process.argv[1]} [command]

Commands:
  (none)            Start Remote Control server (default)
  --interactive, -i Start interactive session with remote access
  --status, -s      Show system status and loaded modules
  --demo, -d        Demonstrate fleet coordination capabilities
  --help, -h        Show this help

Environment Variables:
  PMVPN_SESSION_NAME   Session name (default: pmVPN-Fleet)
  PMVPN_SPAWN_MODE     worktree or same-dir (default: worktree)
  PMVPN_CAPACITY       Max concurrent sessions (default: 16)
  HOSTINGER_API_KEY    Hostinger API token for VPS management

Examples:
  # Start fleet coordination server
  ./remote-control-enhanced.ts

  # Interactive mode with local + remote access
  ./remote-control-enhanced.ts --interactive

  # Check system status
  ./remote-control-enhanced.ts --status
        `);
        break;

      default:
        await remoteControl.initialize();
        await remoteControl.startRemoteControlSession();
        break;
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { EnhancedRemoteControl };
// SPDX-License-Identifier: GPL-3.0-only
// Provider Gateway — HTTP gateway for cloud provider operations
// MIT License
//
// Port +6 HTTP server that validates wallet signatures and routes
// commands to appropriate cloud provider modules via the registry.

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { logger } from '../../server/src/utils/logger.js';
import { verifyWalletSignature } from '../../server/src/auth/verifier.js';
import { createChallenge, consumeChallenge } from '../../server/src/auth/challenge.js';
import ModuleRegistry, { ExecutionContext, CommandResult } from '../registry.js';
import { CloudProviderRegistry } from './cloud-provider.js';
import type { WalletMap } from '../../server/src/config/wallets.js';

interface ProviderRequest {
  walletAddress: string;
  signature: string;
  nonce: string;
  provider: string;                     // Cloud provider name
  command: string;                      // Command to execute
  parameters: Record<string, any>;      // Command parameters
}

interface ProviderResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
  display?: string;                     // Mobile-formatted display
  nextActions?: string[];               // Suggested follow-up actions
}

interface FleetRequest {
  walletAddress: string;
  signature: string;
  nonce: string;
  action: string;                       // 'discover', 'health', 'deploy', etc.
  parameters: Record<string, any>;
}

export function createProviderGateway(
  moduleRegistry: ModuleRegistry,
  walletMap: WalletMap
) {
  const server = createServer(async (req, res) => {
    await handleRequest(req, res, moduleRegistry, walletMap);
  });

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  moduleRegistry: ModuleRegistry,
  walletMap: WalletMap
): Promise<void> {
  // Set CORS headers for browser clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const path = url.pathname;

    // Route handlers
    if (path === '/status') {
      await handleStatus(req, res, moduleRegistry);
    } else if (path === '/challenge') {
      await handleChallenge(req, res);
    } else if (path === '/provider') {
      await handleProviderRequest(req, res, moduleRegistry, walletMap);
    } else if (path === '/fleet') {
      // Deprecated: fleet endpoints moved to port 2600
      res.setHeader('Deprecation', 'true');
      res.setHeader('Link', '<http://localhost:2600/status>; rel="successor-version"');
      logger.warn('Deprecated /fleet endpoint called — use port 2600 Fleet Control Plane');
      await handleFleetRequest(req, res, moduleRegistry, walletMap);
    } else if (path === '/providers') {
      await handleProviderList(req, res, moduleRegistry);
    } else if (path === '/commands') {
      await handleCommandList(req, res, moduleRegistry);
    } else {
      await sendError(res, 404, 'Not Found');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Provider gateway error');
    await sendError(res, 500, 'Internal Server Error', error.message);
  }
}

/**
 * GET /status - Gateway and module status
 */
async function handleStatus(
  req: IncomingMessage,
  res: ServerResponse,
  moduleRegistry: ModuleRegistry
): Promise<void> {
  const modules = moduleRegistry.listModules();
  const providers = moduleRegistry.getCloudProviderRegistry().getAll();

  const status = {
    version: '1.0.0',
    uptime: process.uptime(),
    modules: modules.length,
    cloudProviders: providers.length,
    moduleList: modules.map(m => ({
      name: m.name,
      version: m.version,
      commands: m.commandCount,
      hasProvider: m.hasCloudProvider
    })),
    providerList: providers.map(p => ({
      name: p.name,
      displayName: p.displayName
    }))
  };

  await sendJson(res, 200, status);
}

/**
 * POST /challenge - Request authentication challenge
 */
async function handleChallenge(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (req.method !== 'POST') {
    await sendError(res, 405, 'Method Not Allowed');
    return;
  }

  const body = await readBody(req);
  const { address } = JSON.parse(body);

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    await sendError(res, 400, 'Invalid wallet address');
    return;
  }

  const challenge = createChallenge(address);
  if (!challenge) {
    await sendError(res, 503, 'Challenge store full, try again');
    return;
  }

  await sendJson(res, 200, challenge);
}

/**
 * POST /provider - Execute provider command
 */
async function handleProviderRequest(
  req: IncomingMessage,
  res: ServerResponse,
  moduleRegistry: ModuleRegistry,
  walletMap: WalletMap
): Promise<void> {
  if (req.method !== 'POST') {
    await sendError(res, 405, 'Method Not Allowed');
    return;
  }

  try {
    const body = await readBody(req);
    const request: ProviderRequest = JSON.parse(body);

    // Validate request structure
    if (!request.walletAddress || !request.signature || !request.nonce) {
      await sendError(res, 400, 'Missing authentication fields');
      return;
    }

    if (!request.provider || !request.command) {
      await sendError(res, 400, 'Missing provider or command');
      return;
    }

    // Verify authentication
    const authResult = await authenticateRequest(request, walletMap);
    if (!authResult.success) {
      await sendError(res, 401, authResult.error!);
      return;
    }

    // Get cloud provider
    const cloudRegistry = moduleRegistry.getCloudProviderRegistry();
    const provider = cloudRegistry.get(request.provider);
    if (!provider) {
      await sendError(res, 404, `Unknown provider: ${request.provider}`);
      return;
    }

    // Create execution context
    const context = createExecutionContext(
      request.walletAddress,
      authResult.user!,
      moduleRegistry
    );

    // Execute provider command
    const result = await provider.executeCommand(request.command, request.parameters);

    // Transform result for mobile consumption
    const response: ProviderResponse = {
      success: true,
      data: result,
      display: formatForMobile(request.command, result)
    };

    await sendJson(res, 200, response);

    // Emit event for logging/analytics
    moduleRegistry.emitEvent('provider:command', {
      wallet: request.walletAddress,
      provider: request.provider,
      command: request.command,
      success: true
    });

  } catch (error) {
    logger.error(
      { error: error.message },
      'Provider command execution failed'
    );

    const response: ProviderResponse = {
      success: false,
      error: error.message
    };

    await sendJson(res, 500, response);
  }
}

/**
 * POST /fleet - Fleet-wide operations
 */
async function handleFleetRequest(
  req: IncomingMessage,
  res: ServerResponse,
  moduleRegistry: ModuleRegistry,
  walletMap: WalletMap
): Promise<void> {
  if (req.method !== 'POST') {
    await sendError(res, 405, 'Method Not Allowed');
    return;
  }

  try {
    const body = await readBody(req);
    const request: FleetRequest = JSON.parse(body);

    // Authenticate request
    const authResult = await authenticateRequest(request, walletMap);
    if (!authResult.success) {
      await sendError(res, 401, authResult.error!);
      return;
    }

    // Execute fleet operation
    let result: any;

    switch (request.action) {
      case 'discover':
        result = await handleFleetDiscovery(request, moduleRegistry);
        break;

      case 'health':
        result = await handleFleetHealth(request, moduleRegistry);
        break;

      case 'deploy':
        result = await handleFleetDeployment(request, moduleRegistry);
        break;

      default:
        await sendError(res, 400, `Unknown fleet action: ${request.action}`);
        return;
    }

    const response: ProviderResponse = {
      success: true,
      data: result,
      display: formatForMobile(`fleet-${request.action}`, result)
    };

    await sendJson(res, 200, response);

  } catch (error) {
    logger.error({ error: error.message }, 'Fleet operation failed');

    const response: ProviderResponse = {
      success: false,
      error: error.message
    };

    await sendJson(res, 500, response);
  }
}

/**
 * GET /providers - List available providers
 */
async function handleProviderList(
  req: IncomingMessage,
  res: ServerResponse,
  moduleRegistry: ModuleRegistry
): Promise<void> {
  const providers = moduleRegistry.getCloudProviderRegistry().getAll();

  const providerList = providers.map(provider => ({
    name: provider.name,
    displayName: provider.displayName
  }));

  await sendJson(res, 200, { providers: providerList });
}

/**
 * GET /commands - List available commands
 */
async function handleCommandList(
  req: IncomingMessage,
  res: ServerResponse,
  moduleRegistry: ModuleRegistry
): Promise<void> {
  const commands = moduleRegistry.getCommands();

  const commandList = commands.map(cmd => ({
    name: cmd.name,
    aliases: cmd.aliases,
    description: cmd.description,
    usage: cmd.usage,
    examples: cmd.examples,
    parameters: cmd.parameters.map(p => ({
      name: p.name,
      type: p.type,
      required: p.required,
      description: p.description
    }))
  }));

  await sendJson(res, 200, { commands: commandList });
}

// Helper functions

async function authenticateRequest(
  request: { walletAddress: string; signature: string; nonce: string },
  walletMap: WalletMap
): Promise<{ success: boolean; user?: any; error?: string }> {
  // Consume and verify nonce
  const message = consumeChallenge(request.nonce);
  if (!message) {
    return { success: false, error: 'Invalid or expired nonce' };
  }

  // Verify wallet signature
  const signatureValid = await verifyWalletSignature(
    request.walletAddress,
    message,
    request.signature
  );

  if (!signatureValid) {
    return { success: false, error: 'Invalid signature' };
  }

  // Check wallet registration
  const walletEntry = walletMap.get(request.walletAddress.toLowerCase());
  if (!walletEntry) {
    return { success: false, error: 'Wallet not registered' };
  }

  return {
    success: true,
    user: {
      wallet: request.walletAddress,
      username: walletEntry.user,
      role: walletEntry.role,
      permissions: getPermissionsForRole(walletEntry.role)
    }
  };
}

function getPermissionsForRole(role: string): string[] {
  // Define role-based permissions
  switch (role) {
    case 'admin':
      return [
        'read:fleet',
        'deploy:servers',
        'manage:providers',
        'provision:servers',
        'terminate:servers'
      ];
    case 'operator':
      return [
        'read:fleet',
        'deploy:servers',
        'provision:servers'
      ];
    case 'user':
    default:
      return [
        'read:fleet'
      ];
  }
}

function createExecutionContext(
  walletAddress: string,
  user: any,
  moduleRegistry: ModuleRegistry
): ExecutionContext {
  return {
    user: {
      wallet: walletAddress,
      permissions: user.permissions
    },

    getModuleRegistry: () => moduleRegistry,
    getCloudProviderRegistry: () => moduleRegistry.getCloudProviderRegistry(),

    // Mock implementations - would be replaced with actual UI integration
    showMessage: async (message: string, type?: string) => {
      logger.info({ message, type }, 'UI Message');
    },

    requestConfirmation: async (message: string) => {
      logger.info({ message }, 'Confirmation Request (auto-approved)');
      return true; // Auto-approve for now
    },

    requestInput: async (prompt: string) => {
      logger.info({ prompt }, 'Input Request');
      return '';
    },

    showExecutionPlan: async (plan: any) => {
      logger.info({ plan }, 'Execution Plan');
    },

    executeOnServer: async (serverId: string, command: string) => {
      // Would integrate with existing SSH execution
      throw new Error('executeOnServer not implemented yet');
    },

    executeOnFleet: async (serverIds: string[], command: string) => {
      // Would coordinate across multiple servers
      throw new Error('executeOnFleet not implemented yet');
    },

    getConfig: (key: string) => {
      // Would read from configuration
      return null;
    },

    setConfig: async (key: string, value: any) => {
      // Would write to configuration
    },

    log: {
      info: (message: string, data?: any) => logger.info(data, message),
      warn: (message: string, data?: any) => logger.warn(data, message),
      error: (message: string, data?: any) => logger.error(data, message),
      debug: (message: string, data?: any) => logger.debug(data, message)
    }
  };
}

async function handleFleetDiscovery(
  request: FleetRequest,
  moduleRegistry: ModuleRegistry
): Promise<any> {
  const cloudRegistry = moduleRegistry.getCloudProviderRegistry();
  const servers = await cloudRegistry.discoverAllServers(request.walletAddress);

  return {
    servers: servers.length,
    providers: cloudRegistry.getAll().map(p => p.name),
    serverList: servers.map(server => ({
      id: server.id,
      name: server.name,
      type: server.type,
      provider: server.provider,
      host: server.pmvpn.host,
      status: server.status || 'unknown',
      environment: server.environment,
      resources: server.resources
    }))
  };
}

async function handleFleetHealth(
  request: FleetRequest,
  moduleRegistry: ModuleRegistry
): Promise<any> {
  // Would implement fleet-wide health checking
  return {
    overall: 'healthy',
    servers: {
      total: 0,
      healthy: 0,
      warning: 0,
      critical: 0,
      unreachable: 0
    }
  };
}

async function handleFleetDeployment(
  request: FleetRequest,
  moduleRegistry: ModuleRegistry
): Promise<any> {
  // Would implement coordinated deployment
  return {
    deploymentId: 'deploy-' + Date.now(),
    status: 'planning',
    message: 'Deployment planning not yet implemented'
  };
}

function formatForMobile(command: string, data: any): string {
  // Format data for mobile display
  // This is a simple implementation - would be more sophisticated
  if (typeof data === 'object') {
    return JSON.stringify(data, null, 2);
  }
  return String(data);
}

// Utility functions

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

async function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: any
): Promise<void> {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

async function sendError(
  res: ServerResponse,
  statusCode: number,
  message: string,
  details?: string
): Promise<void> {
  const error = {
    error: message,
    details: details || undefined
  };

  await sendJson(res, statusCode, error);
}
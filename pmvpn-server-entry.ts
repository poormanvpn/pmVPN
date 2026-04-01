// PMVPN Server Entry Point — runs from project root
// This wrapper ensures proper module resolution for the enhanced pmVPN server

import { logger } from './pmvpn/server/src/utils/logger.js';
import { loadOrGenerateHostKey } from './pmvpn/server/src/utils/hostkey.js';
import { loadWalletMap } from './pmvpn/server/src/config/wallets.js';
import { createSSHServer } from './pmvpn/server/src/ssh/server.js';
import { createChallengeServer } from './pmvpn/server/src/api/challenge.js';
import { createWsBridge } from './pmvpn/server/src/ws/bridge.js';
import { BIND_HOST, portFor, PORT_OFFSET, PORT_NAMES } from './pmvpn/server/src/config/ports.js';
import { PROTOCOL_VERSION } from './pmvpn/server/src/shared.js';

// Modular components
import ModuleRegistry from './pmvpn/modules/registry.js';
import { createProviderGateway } from './pmvpn/modules/core/provider-gateway.js';

// Fleet components
import { loadFleetConfig } from './pmvpn/server/src/config/fleet.js';
import { fleetPortFor, FLEET_PORT_OFFSET, FLEET_PORT_NAMES } from './pmvpn/server/src/config/fleet-ports.js';
import { createFleetControlPlane } from './pmvpn/modules/fleet/control-plane.js';
import { createFleetEvents } from './pmvpn/modules/fleet/events.js';
import { createFleetMesh } from './pmvpn/modules/fleet/mesh.js';
import { createFleetMetrics } from './pmvpn/modules/fleet/metrics.js';

async function main(): Promise<void> {
  logger.info({ version: PROTOCOL_VERSION }, 'PMVPN server starting with modular architecture');

  // Load Ed25519 host key
  const hostKey = loadOrGenerateHostKey();

  // Load wallet-user mappings
  const walletMap = loadWalletMap();
  if (walletMap.size === 0) {
    logger.warn('no wallet mappings loaded — set WALLET_USER_MAP or create ~/.pmvpn/wallets.json');
  } else {
    logger.info({ count: walletMap.size }, 'wallet mappings loaded');
  }

  // Initialize module registry
  const moduleRegistry = new ModuleRegistry();
  logger.info('Module registry initialized');

  // Load core modules and cloud providers
  try {
    // Load Hostinger module
    const { default: HostingerModule } = await import('./pmvpn/modules/hostinger/index.js');
    const hostingerModule = new HostingerModule();
    await moduleRegistry.loadModule(hostingerModule);
    logger.info('Hostinger cloud provider module loaded');

    // Future: Load other cloud provider modules here
    logger.info('All available modules loaded successfully');
  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to load some modules (will continue without them)');
  }

  // --- SSH ports ---

  // Port +0: Interactive shell
  const shellServer = createSSHServer(hostKey, walletMap, 'shell');
  shellServer.listen(portFor(PORT_OFFSET.SSH_SHELL), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.SSH_SHELL), service: PORT_NAMES[0] }, 'listening');
  });

  // Port +1: SFTP
  const sftpServer = createSSHServer(hostKey, walletMap, 'sftp');
  sftpServer.listen(portFor(PORT_OFFSET.SFTP), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.SFTP), service: PORT_NAMES[1] }, 'listening');
  });

  // Port +2: Exec (non-interactive)
  const execServer = createSSHServer(hostKey, walletMap, 'exec');
  execServer.listen(portFor(PORT_OFFSET.SSH_EXEC), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.SSH_EXEC), service: PORT_NAMES[2] }, 'listening');
  });

  // Port +3: Challenge API (HTTP)
  const challengeServer = createChallengeServer(walletMap);
  challengeServer.listen(portFor(PORT_OFFSET.CHALLENGE), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.CHALLENGE), service: PORT_NAMES[3] }, 'listening');
  });

  // Port +4: WebSocket Bridge (browser terminal + file browser)
  const wsBridge = createWsBridge(walletMap);
  wsBridge.listen(portFor(PORT_OFFSET.TUNNEL), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.TUNNEL), service: 'WS Bridge' }, 'listening');
  });

  // Port +5: File Sync (SSH — shell role for now, specializes later)
  const syncServer = createSSHServer(hostKey, walletMap, 'shell');
  syncServer.listen(portFor(PORT_OFFSET.FILE_SYNC), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.FILE_SYNC), service: PORT_NAMES[5] }, 'listening');
  });

  // Port +6: Provider Gateway (HTTP — cloud provider coordination)
  const providerGateway = createProviderGateway(moduleRegistry, walletMap);
  providerGateway.listen(portFor(PORT_OFFSET.CLAUDE_AI), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.CLAUDE_AI), service: 'Provider Gateway' }, 'listening');
  });

  // Port +7: Admin API (HTTP)
  const adminServer = createChallengeServer(walletMap);
  adminServer.listen(portFor(PORT_OFFSET.ADMIN), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.ADMIN), service: PORT_NAMES[7] }, 'listening');
  });

  // --- Fleet ports (optional, requires ~/.pmvpn/fleet.json) ---

  const fleetServers: { name: string; server: any }[] = [];
  const fleetConfig = loadFleetConfig();

  if (fleetConfig) {
    logger.info(
      { role: fleetConfig.role, members: fleetConfig.members.length, nodeId: fleetConfig.nodeId },
      'Fleet mode enabled'
    );

    // Load fleet module
    try {
      const { default: FleetModule } = await import('./pmvpn/modules/fleet/index.js');
      const fleetModule = new FleetModule();
      await moduleRegistry.loadModule(fleetModule);
      logger.info('Fleet coordination module loaded');
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to load fleet module');
    }

    // Port 2600: Fleet Control Plane
    const controlPlane = createFleetControlPlane(moduleRegistry, walletMap, fleetConfig);
    controlPlane.listen(fleetPortFor(FLEET_PORT_OFFSET.CONTROL), BIND_HOST, () => {
      logger.info(
        { port: fleetPortFor(FLEET_PORT_OFFSET.CONTROL), service: FLEET_PORT_NAMES[0] },
        'listening'
      );
    });
    fleetServers.push({ name: 'controlPlane', server: controlPlane });

    // Port 2601: Fleet Events
    const fleetEvents = createFleetEvents(moduleRegistry, walletMap, fleetConfig);
    fleetEvents.listen(fleetPortFor(FLEET_PORT_OFFSET.EVENTS), BIND_HOST, () => {
      logger.info(
        { port: fleetPortFor(FLEET_PORT_OFFSET.EVENTS), service: FLEET_PORT_NAMES[1] },
        'listening'
      );
    });
    fleetServers.push({ name: 'fleetEvents', server: fleetEvents });

    // Port 2602: Fleet Mesh (conditional)
    if (fleetConfig.settings.meshEnabled) {
      const mesh = createFleetMesh(walletMap, fleetConfig);
      mesh.listen(fleetPortFor(FLEET_PORT_OFFSET.MESH), BIND_HOST, () => {
        logger.info(
          { port: fleetPortFor(FLEET_PORT_OFFSET.MESH), service: FLEET_PORT_NAMES[2] },
          'listening'
        );
      });
      fleetServers.push({ name: 'mesh', server: mesh });
    }

    // Port 2603: Fleet Metrics (conditional)
    if (fleetConfig.settings.metricsEnabled) {
      const metrics = createFleetMetrics(moduleRegistry, walletMap, fleetConfig);
      metrics.listen(fleetPortFor(FLEET_PORT_OFFSET.METRICS), BIND_HOST, () => {
        logger.info(
          { port: fleetPortFor(FLEET_PORT_OFFSET.METRICS), service: FLEET_PORT_NAMES[3] },
          'listening'
        );
      });
      fleetServers.push({ name: 'metrics', server: metrics });
    }
  } else {
    logger.info('Fleet disabled — no ~/.pmvpn/fleet.json found (single-server mode)');
  }

  // --- Summary ---
  logger.info('─'.repeat(50));
  const totalPorts = 8 + fleetServers.length;
  logger.info(`PMVPN server ready — ${totalPorts} ports active`);
  logger.info('  Core (2200-2207):');
  logger.info(`    SSH Shell:        ${BIND_HOST}:${portFor(PORT_OFFSET.SSH_SHELL)}`);
  logger.info(`    SFTP:             ${BIND_HOST}:${portFor(PORT_OFFSET.SFTP)}`);
  logger.info(`    SSH Exec:         ${BIND_HOST}:${portFor(PORT_OFFSET.SSH_EXEC)}`);
  logger.info(`    Challenge API:    ${BIND_HOST}:${portFor(PORT_OFFSET.CHALLENGE)}`);
  logger.info(`    WS Bridge:        ${BIND_HOST}:${portFor(PORT_OFFSET.TUNNEL)}`);
  logger.info(`    File Sync:        ${BIND_HOST}:${portFor(PORT_OFFSET.FILE_SYNC)}`);
  logger.info(`    Provider Gateway: ${BIND_HOST}:${portFor(PORT_OFFSET.CLAUDE_AI)}`);
  logger.info(`    Admin:            ${BIND_HOST}:${portFor(PORT_OFFSET.ADMIN)}`);
  if (fleetConfig) {
    logger.info(`  Fleet (${fleetPortFor(0)}-${fleetPortFor(3)}):`);
    logger.info(`    Fleet Control:    ${BIND_HOST}:${fleetPortFor(FLEET_PORT_OFFSET.CONTROL)}`);
    logger.info(`    Fleet Events:     ${BIND_HOST}:${fleetPortFor(FLEET_PORT_OFFSET.EVENTS)}`);
    if (fleetConfig.settings.meshEnabled) {
      logger.info(`    Fleet Mesh:       ${BIND_HOST}:${fleetPortFor(FLEET_PORT_OFFSET.MESH)}`);
    }
    if (fleetConfig.settings.metricsEnabled) {
      logger.info(`    Fleet Metrics:    ${BIND_HOST}:${fleetPortFor(FLEET_PORT_OFFSET.METRICS)}`);
    }
  }
  logger.info('─'.repeat(50));

  // Graceful shutdown
  const shutdown = () => {
    logger.info('shutting down pmVPN server');
    shellServer.close();
    sftpServer.close();
    execServer.close();
    challengeServer.close();
    wsBridge.close();
    syncServer.close();
    providerGateway.close();
    adminServer.close();
    for (const { server } of fleetServers) {
      server.close();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start PMVPN server with modular architecture');
  process.exit(1);
});
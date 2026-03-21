// PMVPN Server — entry point
// MIT License
//
// Boots SSH servers on 8 ports with wallet-based authentication.
// Keys are identity. Verification replaces trust.

import { loadOrGenerateHostKey } from './utils/hostkey.js';
import { loadWalletMap } from './config/wallets.js';
import { createSSHServer } from './ssh/server.js';
import { createChallengeServer } from './api/challenge.js';
import { createWsBridge } from './ws/bridge.js';
import { BIND_HOST, portFor, PORT_OFFSET, PORT_NAMES } from './config/ports.js';
import { logger } from './utils/logger.js';
import { PROTOCOL_VERSION } from './shared.js';

async function main(): Promise<void> {
  logger.info({ version: PROTOCOL_VERSION }, 'PMVPN server starting');

  // Load Ed25519 host key
  const hostKey = loadOrGenerateHostKey();

  // Load wallet-user mappings
  const walletMap = loadWalletMap();
  if (walletMap.size === 0) {
    logger.warn('no wallet mappings loaded — set WALLET_USER_MAP or create ~/.pmvpn/wallets.json');
  } else {
    logger.info({ count: walletMap.size }, 'wallet mappings loaded');
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

  // Port +6: Claude AI (SSH — shell role, Claude proxy in Phase 4)
  const claudeServer = createSSHServer(hostKey, walletMap, 'shell');
  claudeServer.listen(portFor(PORT_OFFSET.CLAUDE_AI), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.CLAUDE_AI), service: PORT_NAMES[6] }, 'listening');
  });

  // Port +7: Admin API (HTTP)
  const adminServer = createChallengeServer(walletMap);
  adminServer.listen(portFor(PORT_OFFSET.ADMIN), BIND_HOST, () => {
    logger.info({ port: portFor(PORT_OFFSET.ADMIN), service: PORT_NAMES[7] }, 'listening');
  });

  // --- Summary ---
  logger.info('─'.repeat(50));
  logger.info('PMVPN server ready — 8 ports active');
  logger.info(`  SSH Shell:      ${BIND_HOST}:${portFor(PORT_OFFSET.SSH_SHELL)}`);
  logger.info(`  SFTP:           ${BIND_HOST}:${portFor(PORT_OFFSET.SFTP)}`);
  logger.info(`  SSH Exec:       ${BIND_HOST}:${portFor(PORT_OFFSET.SSH_EXEC)}`);
  logger.info(`  Challenge API:  ${BIND_HOST}:${portFor(PORT_OFFSET.CHALLENGE)}`);
  logger.info(`  WS Bridge:      ${BIND_HOST}:${portFor(PORT_OFFSET.TUNNEL)}`);
  logger.info(`  File Sync:      ${BIND_HOST}:${portFor(PORT_OFFSET.FILE_SYNC)}`);
  logger.info(`  Claude AI:      ${BIND_HOST}:${portFor(PORT_OFFSET.CLAUDE_AI)}`);
  logger.info(`  Admin:          ${BIND_HOST}:${portFor(PORT_OFFSET.ADMIN)}`);
  logger.info('─'.repeat(50));

  // Graceful shutdown
  const shutdown = () => {
    logger.info('shutting down');
    shellServer.close();
    sftpServer.close();
    execServer.close();
    challengeServer.close();
    wsBridge.close();
    syncServer.close();
    claudeServer.close();
    adminServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start PMVPN server');
  process.exit(1);
});

// SSH server factory — hardened per OpenBSD standards
// MIT License
//
// Ed25519 only. curve25519-sha256. chacha20-poly1305.
// No RSA. No NIST curves. No agent forwarding. No X11.
// Minimal banner. 3 max auth tries.

import ssh2 from 'ssh2';
const { Server: SSH2Server } = ssh2;
import { handleConnection } from './handler.js';
import { logger } from '../utils/logger.js';
import type { WalletMap } from '../config/wallets.js';

type PortRole = 'shell' | 'sftp' | 'exec' | 'tunnel';

/** Default keyring index for a role — the port offset it normally listens on. */
const DEFAULT_PORT_INDEX: Record<PortRole, number> = { shell: 0, sftp: 1, exec: 2, tunnel: 4 };

/**
 * Create a hardened ssh2 Server bound to a specific port and role.
 * `portIndex` is the port offset (0..N-1); keyring key i is accepted only when
 * i === portIndex. Pass it explicitly when a role is reused on another port
 * (file sync runs the shell role on +5).
 */
export function createSSHServer(
  hostKey: Buffer,
  walletMap: WalletMap,
  role: PortRole,
  portIndex: number = DEFAULT_PORT_INDEX[role],
): SSH2Server {
  const server = new SSH2Server({
    hostKeys: [hostKey],
    algorithms: {
      kex: [
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
      ],
      cipher: [
        'chacha20-poly1305@openssh.com',
        'aes256-gcm@openssh.com',
        'aes256-gcm',
        'aes256-ctr',  // fallback for older clients
      ],
      serverHostKey: [
        'ssh-ed25519',
      ],
      hmac: [
        'hmac-sha2-256-etm@openssh.com',  // only for non-AEAD ciphers
      ],
      compress: ['none'],
    },
    ident: 'PMVPN',
  }, (client, info) => {
    const clientInfo = {
      ip: info.ip,
      port: info.port,
    };
    handleConnection(client, clientInfo, walletMap, role, portIndex);
  });

  server.on('error', (err) => {
    logger.error({ err, role }, 'SSH server error');
  });

  return server;
}

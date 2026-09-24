// Port configuration
// MIT License

import {
  DEFAULT_BASE_PORT,
  DEFAULT_KEYRING_SIZE,
  MAX_KEYRING_SIZE,
  PORT_OFFSET,
  PORT_NAMES,
  NUM_PORTS,
} from '../shared.js';

export { PORT_OFFSET, PORT_NAMES, NUM_PORTS };

export const BASE_PORT = parseInt(process.env.PMVPN_BASE_PORT || String(DEFAULT_BASE_PORT), 10);
export const BIND_HOST = process.env.PMVPN_HOST || '0.0.0.0';

export function portFor(offset: number): number {
  return BASE_PORT + offset;
}

/**
 * Keyring size the server accepts at enrolment. Default 8 = one key per core
 * port. Raise it (PMVPN_KEYRING_SIZE=12) to let fleet or future services claim
 * indices 8+; keys beyond the ports actually bound are stored but never usable.
 */
export const KEYRING_SIZE = Math.min(
  MAX_KEYRING_SIZE,
  Math.max(1, parseInt(process.env.PMVPN_KEYRING_SIZE || String(DEFAULT_KEYRING_SIZE), 10) || DEFAULT_KEYRING_SIZE),
);

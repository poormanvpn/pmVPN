// Port configuration
// MIT License

import {
  DEFAULT_BASE_PORT,
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

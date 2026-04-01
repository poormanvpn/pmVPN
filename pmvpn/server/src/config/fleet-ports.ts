// Fleet port configuration
// MIT License
//
// Mirrors config/ports.ts for the fleet port range (2600+).

import {
  DEFAULT_FLEET_BASE_PORT,
  FLEET_PORT_OFFSET,
  FLEET_PORT_NAMES,
  NUM_FLEET_PORTS,
} from '../fleet-shared.js';

import { BIND_HOST } from './ports.js';

export { FLEET_PORT_OFFSET, FLEET_PORT_NAMES, NUM_FLEET_PORTS, BIND_HOST };

export const FLEET_BASE_PORT = parseInt(
  process.env.PMVPN_FLEET_BASE_PORT || String(DEFAULT_FLEET_BASE_PORT),
  10
);

export function fleetPortFor(offset: number): number {
  return FLEET_BASE_PORT + offset;
}

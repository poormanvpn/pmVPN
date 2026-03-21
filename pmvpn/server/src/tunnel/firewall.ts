// pmVPN Firewall — iptables rules for transparent proxying
// MIT License
//
// Sets up and tears down iptables NAT rules to redirect
// traffic for specified subnets through the tunnel.
// Requires root/sudo on the client machine.
//
// Inspired by sshuttle's firewall.py NAT method.

import { execSync } from 'node:child_process';
import { logger } from '../utils/logger.js';

const CHAIN_PREFIX = 'pmvpn';

interface FirewallRule {
  subnet: string;    // CIDR: "10.0.0.0/8"
  exclude: boolean;  // true = skip this subnet
}

/**
 * Set up iptables NAT rules to redirect traffic through the tunnel.
 *
 * Creates a custom chain in the nat table and redirects matching
 * traffic to the local tunnel listener port.
 */
export function setupFirewall(
  listenPort: number,
  dnsPort: number | null,
  rules: FirewallRule[],
): void {
  const chain = `${CHAIN_PREFIX}-${listenPort}`;

  logger.info({ chain, port: listenPort, rules: rules.length }, 'setting up firewall');

  try {
    // Create custom chain
    ipt(`-t nat -N ${chain}`);

    // Add rules for each subnet
    for (const rule of rules) {
      if (rule.exclude) {
        // Exclude: return from chain (don't redirect)
        ipt(`-t nat -A ${chain} -d ${rule.subnet} -p tcp -j RETURN`);
      } else {
        // Include: redirect to tunnel listener
        ipt(`-t nat -A ${chain} -d ${rule.subnet} -p tcp -j REDIRECT --to-ports ${listenPort}`);
      }
    }

    // DNS interception
    if (dnsPort) {
      ipt(`-t nat -A ${chain} -p udp --dport 53 -j REDIRECT --to-ports ${dnsPort}`);
    }

    // Insert chain into OUTPUT and PREROUTING
    ipt(`-t nat -I OUTPUT 1 -j ${chain}`);
    ipt(`-t nat -I PREROUTING 1 -j ${chain}`);

    logger.info({ chain }, 'firewall rules active');
  } catch (err) {
    logger.error({ err }, 'firewall setup failed — cleaning up');
    teardownFirewall(listenPort);
    throw err;
  }
}

/**
 * Remove all iptables rules created by setupFirewall.
 */
export function teardownFirewall(listenPort: number): void {
  const chain = `${CHAIN_PREFIX}-${listenPort}`;

  logger.info({ chain }, 'tearing down firewall');

  // Remove references from OUTPUT and PREROUTING
  try { ipt(`-t nat -D OUTPUT -j ${chain}`); } catch {}
  try { ipt(`-t nat -D PREROUTING -j ${chain}`); } catch {}

  // Flush and delete custom chain
  try { ipt(`-t nat -F ${chain}`); } catch {}
  try { ipt(`-t nat -X ${chain}`); } catch {}

  logger.info({ chain }, 'firewall rules removed');
}

/**
 * Execute an iptables command.
 */
function ipt(args: string): void {
  const cmd = `iptables ${args}`;
  logger.debug({ cmd }, 'iptables');
  execSync(cmd, { stdio: 'pipe' });
}

/**
 * Check if iptables is available and we have permission to use it.
 */
export function checkFirewallAccess(): { available: boolean; root: boolean } {
  try {
    execSync('iptables -t nat -L -n', { stdio: 'pipe' });
    return { available: true, root: true };
  } catch {
    try {
      execSync('which iptables', { stdio: 'pipe' });
      return { available: true, root: false };
    } catch {
      return { available: false, root: false };
    }
  }
}

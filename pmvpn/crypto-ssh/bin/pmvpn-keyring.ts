// SPDX-License-Identifier: GPL-3.0-only
#!/usr/bin/env node
// pmvpn-keyring — derive and package the pmVPN keyring from a wallet signature
// MIT License
//
// Usage:
//   pmvpn-keyring message --host-fp SHA256:…
//       Print the exact text to personal_sign (do this in your wallet).
//
//   pmvpn-keyring derive --signature 0x… --host-fp SHA256:… --address 0x… \
//       --host vps.example.net --base-port 2200 --user w1234abcd \
//       --host-key 'ssh-ed25519 AAAA…' [--alias vps1] [--size 8] --out DIR
//       Write k<i>-<slug>, .pub files, ssh_config, known_hosts, keyring.json
//       (public entries for POST /keyring) and pmvpn-keyring-<alias>.sh into DIR.
//
//   pmvpn-keyring enrol --server http://host:2203 --address 0x… --signature 0x… \
//       --nonce … --host-fp SHA256:… --keyring DIR/keyring.json
//       POST the public entries to the server after signing its challenge nonce.
//
// The signature must be over `message`; a wallet that signs deterministically
// (MetaMask, Ledger, viem/ethers local accounts) yields the same ring every time.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  derivationMessage, seedFromSignature, deriveKeyring, wipeKeyring, toPublicEntries,
  renderSshConfig, renderKnownHosts, renderBundleScript, keyFileName, DEFAULT_KEYRING_SIZE,
} from '../src/keyring.js';

function parseArgs(argv: string[]): { cmd: string; opts: Record<string, string> } {
  const [cmd = 'help', ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++; } else { opts[key] = 'true'; }
    }
  }
  return { cmd, opts };
}

function need(opts: Record<string, string>, key: string): string {
  const v = opts[key];
  if (!v) { console.error(`missing --${key}`); process.exit(2); }
  return v;
}

function usage(): void {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).slice(1, 22).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}

async function main(): Promise<void> {
  const { cmd, opts } = parseArgs(process.argv.slice(2));

  if (cmd === 'message') {
    console.log(derivationMessage(need(opts, 'host-fp')));
    return;
  }

  if (cmd === 'derive') {
    const hostFp = need(opts, 'host-fp');
    const address = need(opts, 'address');
    const out = need(opts, 'out');
    const size = opts.size ? parseInt(opts.size, 10) : DEFAULT_KEYRING_SIZE;
    const seed = seedFromSignature(need(opts, 'signature'));
    const ring = deriveKeyring(seed, hostFp, address, { size });
    seed.fill(0);

    mkdirSync(out, { recursive: true, mode: 0o700 });
    for (const k of ring) {
      writeFileSync(join(out, keyFileName(k)), k.privateKeyOpenSSH, { mode: 0o600 });
      writeFileSync(join(out, keyFileName(k) + '.pub'), k.publicKeyLine + '\n', { mode: 0o644 });
    }
    writeFileSync(join(out, 'keyring.json'), JSON.stringify({
      version: 1, hostFingerprint: hostFp, address: address.toLowerCase(), size, keys: toPublicEntries(ring),
    }, null, 2) + '\n');

    if (opts.host && opts.user && opts['host-key']) {
      const target = {
        host: opts.host,
        basePort: opts['base-port'] ? parseInt(opts['base-port'], 10) : 2200,
        user: opts.user,
        hostKeyPublicLine: opts['host-key'],
        alias: opts.alias,
      };
      const alias = (opts.alias || opts.host).toLowerCase().replace(/[^a-z0-9.-]/g, '-');
      writeFileSync(join(out, 'ssh_config'), renderSshConfig(target, ring));
      writeFileSync(join(out, 'known_hosts'), renderKnownHosts(target, ring));
      writeFileSync(join(out, `pmvpn-keyring-${alias}.sh`), renderBundleScript(target, ring), { mode: 0o700 });
      console.log(`bundle: ${join(out, `pmvpn-keyring-${alias}.sh`)}`);
    } else {
      console.log('keys written; pass --host --user --host-key to also render ssh_config, known_hosts and the bundle');
    }
    for (const k of ring) console.log(`${k.index}\t${k.slug}\t${k.fingerprint}`);
    wipeKeyring(ring);
    return;
  }

  if (cmd === 'enrol' || cmd === 'enroll') {
    const server = need(opts, 'server').replace(/\/$/, '');
    const ringFile = JSON.parse(readFileSync(need(opts, 'keyring'), 'utf-8'));
    const body = {
      address: need(opts, 'address'),
      signature: need(opts, 'signature'),
      nonce: need(opts, 'nonce'),
      hostFingerprint: opts['host-fp'] || ringFile.hostFingerprint,
      keys: ringFile.keys.map((k: any) => ({ index: k.index, publicKey: k.publicKey })),
    };
    const res = await fetch(`${server}/keyring`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { console.error(`enrol failed: HTTP ${res.status}`, json); process.exit(1); }
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  usage();
  process.exit(cmd === 'help' ? 0 : 2);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });

#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// pmvpn-keyring — log in from wallet credentials; derive and package the keyring

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { login, logout } from '../src/login.js';
import { enrolMessage } from '../src/enrol.js';
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

const USAGE = `pmvpn-keyring — your wallet is your SSH key

Log in from wallet credentials (derive, enrol, install, then plain ssh works):
  pmvpn-keyring login --host HOST (--host-fp SHA256:… | --tofu) [--alias NAME]
      [--base-port 2200] [--api URL] [--size 8] [--json] <wallet>
  pmvpn-keyring logout --host HOST [--alias NAME] [--base-port 2200] [--api URL] <wallet>

<wallet> is one of:
  --address 0x… --sign-cmd 'CMD'   CMD prints a signature for $PMVPN_SIGN_MESSAGE, e.g.
                                   cast wallet sign --ledger "$PMVPN_SIGN_MESSAGE"
  --address 0x…                    paste each signature from your wallet when asked
  --key-file PATH                  hex private key, mode 0600 (dedicated agent wallet)
  PMVPN_WALLET_KEY in the env      same, for CI and agents

Manual steps:
  pmvpn-keyring message --host-fp SHA256:…
      Print the exact text to personal_sign.
  pmvpn-keyring derive --signature 0x… --host-fp SHA256:… --address 0x… --out DIR
      [--host H --base-port 2200 --user U --host-key 'ssh-ed25519 AAAA…' --alias A --size 8]
      Write keys, keyring.json and, with the target options, ssh_config, known_hosts and a bundle.
  pmvpn-keyring message --nonce N --keyring DIR/keyring.json
      Print the enrolment text for nonce N (from GET /challenge) and exactly these keys.
  pmvpn-keyring enrol --server http://host:2203 --address 0x… --signature 0x… --nonce N
      --keyring DIR/keyring.json [--host-fp SHA256:…]
      POST the public keys with a signature over that enrolment text.
`;

function usage(): void {
  console.log(USAGE);
}

async function main(): Promise<void> {
  const { cmd, opts } = parseArgs(process.argv.slice(2));

  if (cmd === 'login' || cmd === 'logout') {
    const wallet = { address: opts.address, keyFile: opts['key-file'], signCmd: opts['sign-cmd'] };
    const where = {
      host: need(opts, 'host'),
      basePort: opts['base-port'] ? parseInt(opts['base-port'], 10) : undefined,
      api: opts.api,
      alias: opts.alias,
    };
    if (cmd === 'logout') {
      const out = await logout({ ...wallet, ...where, hostFp: opts['host-fp'] });
      console.log(`${out.revoked ? 'ring revoked on the server' : 'the server had no ring for this wallet'}; removed local keys for ${out.alias}`);
      process.exit(0);
    }
    const out = await login({
      ...wallet,
      ...where,
      size: opts.size ? parseInt(opts.size, 10) : undefined,
      hostFp: opts['host-fp'],
      tofu: opts.tofu === 'true',
    });
    if (opts.json === 'true') {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`logged in to ${where.host} as ${out.user} (${out.address})`);
      console.log(`host key ${out.hostFingerprint}`);
      console.log(`  ssh    ${out.hosts.shell}              interactive terminal`);
      console.log(`  ssh -t ${out.hosts.shell} claude       interactive program on the server`);
      console.log(`  ssh    ${out.hosts.exec} 'uptime'      scripted command`);
      console.log(`  sftp   ${out.hosts.sftp}               file transfer`);
      console.log(`  rsync -a ./site/ ${out.hosts.sync}:www/`);
    }
    process.exit(0); // the prompt's reader may still hold stdin open
  }

  if (cmd === 'message') {
    if (opts.nonce) {
      // Step two of a manual enrolment: the text that authorises exactly these keys.
      const ringFile = JSON.parse(readFileSync(need(opts, 'keyring'), 'utf-8'));
      const fp = opts['host-fp'] || ringFile.hostFingerprint;
      console.log(enrolMessage(fp, opts.nonce, ringFile.keys.map((k: any) => ({ index: k.index, publicKey: k.publicKey }))));
      return;
    }
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

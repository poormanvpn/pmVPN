// SPDX-License-Identifier: GPL-3.0-only
// crypto-ssh keyring tests — run with `pnpm test` (tsx --test)
// MIT License
//
// The fixed vector below is the cross-implementation contract: the PARSEC Rust
// keyring must produce these exact public keys from the same signature.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  derivationMessage, seedFromSignature, deriveKeyring, wipeKeyring, keyInfo,
  bytesToHex, parsePublicKeyLine, fingerprintSSH, renderSshConfig, renderKnownHosts,
  renderBundleScript, authorizedKeysOptions, portSlug, toPublicEntries,
} from '../src/keyring.js';
import { extractOpenSSHEd25519Seed } from '../src/ssh-to-wallet.js';
import { deriveEd25519FromWallet } from '../src/wallet-to-ssh.js';

// Hardhat account #0 signing the derivation message for a fixed test host fingerprint.
// fp = "SHA256:" + base64(sha256("pmvpn-test-host-key")) without padding.
const VECTOR = {
  hostFingerprint: 'SHA256:wZPdcojKK1rCWcApjBEKI5piPGxoBkpCspJCHRTNsBI',
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  message: 'PMVPN-KEYRING:v1:SHA256:wZPdcojKK1rCWcApjBEKI5piPGxoBkpCspJCHRTNsBI',
  signature: '0x78b7f01bd9be52e9566f5b1bcea8ac7c056f664bdf564ca85ffef89db535694c65f55ae2732b390dc953531abb95eebc0b54f86baa818f132d460272618705eb1c',
  masterSeed: 'b74e843d08b5d4b6b6aca126489e5ee07ab35ce09f07a60c5572ee3f08661eae',
  publicKeys: [
    'AAAAC3NzaC1lZDI1NTE5AAAAIERMsT1YzwkOlUYYxpAIZpi+mOUuTGgBFku+FS7qCy8s',
    'AAAAC3NzaC1lZDI1NTE5AAAAIITrpDJZwaMHXjrdd8fT4B2t7euVYtaecYO0EcNNCpnC',
    'AAAAC3NzaC1lZDI1NTE5AAAAIPzXjwmnjDWE9XwTc/L82QlHs8g7B9tabKU2xTmAqTXM',
    'AAAAC3NzaC1lZDI1NTE5AAAAIFYNxGwUvkGuTk6MOnzfT8PUJ2M4AHrpvmkd7yNwZ0KP',
    'AAAAC3NzaC1lZDI1NTE5AAAAIIAmDpfbLX1MVC46IOy4f1oerqueVDh7papVxpVOq0pW',
    'AAAAC3NzaC1lZDI1NTE5AAAAIBlhLnekOKb15vMwJUTCJbINxFH3qsqvGEgnnLhFqFER',
    'AAAAC3NzaC1lZDI1NTE5AAAAIFQm5zta8U+/Ezj85MSqExR5JUujdEBO1C469IKZooHj',
    'AAAAC3NzaC1lZDI1NTE5AAAAIOOvGfLO5GCcZ/aKUj1vY0eqp5gtx2rAJpRCNGIsTR1w',
  ],
  fingerprints: [
    'SHA256:oYOwj3c8WyOaTNv0OyJgToqMNyrHMIAVX/1X25x7zwg',
    'SHA256:TdZ84wbpgGG1A+6bG/Vr1W7AnKoCU4S6R8+g5Nrt2Go',
    'SHA256:twEcVP15sp8kmPphmgvVjpNsIF1L5Wrl/AIn2YwH+oA',
    'SHA256:vd5UVAjCmaX3hl5I1imzyMDODlLr9OKqbMr/2dYNjUE',
    'SHA256:wDQllBhRpMBukPmRXPchT+cDiG3XmoAyqfyIVlvAWZc',
    'SHA256:I8VduQVoe+lhMFXhVJt5paAJfRN2Riv5rVt/qO5LiXI',
    'SHA256:DF7THDwLBhmZVCBQyn51Y5ii+YHb3mT/ivP2/4Nm8zM',
    'SHA256:RC83MB2Gvc8jj1YsVtGEae98UGgvDQBzoOH42t0cwRM',
  ],
};

function hasSshKeygen(): boolean {
  try { execFileSync('ssh-keygen', ['-?'], { stdio: 'ignore' }); return true; } catch (e: any) { return e?.status === 1 || e?.status === 255; }
}

test('derivation message is bound to the host fingerprint', () => {
  assert.equal(derivationMessage(VECTOR.hostFingerprint), VECTOR.message);
  assert.equal(derivationMessage(VECTOR.hostFingerprint + '='), VECTOR.message, 'padding is stripped');
  assert.throws(() => derivationMessage('MD5:aa:bb'), /SHA256/);
});

test('master seed is SHA-256 of the signature', () => {
  assert.equal(bytesToHex(seedFromSignature(VECTOR.signature)), VECTOR.masterSeed);
  assert.throws(() => seedFromSignature('0x1234'), /64 or 65 bytes/);
});

test('fixed vector: eight keys, byte-identical, port-scoped comments', () => {
  const ring = deriveKeyring(seedFromSignature(VECTOR.signature), VECTOR.hostFingerprint, VECTOR.address);
  assert.equal(ring.length, 8);
  ring.forEach((k, i) => {
    assert.equal(k.index, i);
    assert.equal(k.slug, portSlug(i));
    assert.equal(k.publicKeyLine.split(' ')[1], VECTOR.publicKeys[i], `public key ${i}`);
    assert.equal(k.fingerprint, VECTOR.fingerprints[i], `fingerprint ${i}`);
    assert.equal(k.comment, `pmvpn:${VECTOR.address.toLowerCase()}:k${i}:${portSlug(i)}`);
    assert.equal(keyInfo(VECTOR.hostFingerprint, i), `ed25519:${VECTOR.hostFingerprint}:${i}:${portSlug(i)}`);
  });
  const seen = new Set(ring.map((k) => k.fingerprint));
  assert.equal(seen.size, 8, 'every index yields a distinct key');
  wipeKeyring(ring);
  assert.ok(ring.every((k) => k.seed.every((b) => b === 0)), 'wipe zeroes seeds');
});

test('derivation is deterministic and size-extensible', () => {
  const seed = seedFromSignature(VECTOR.signature);
  const a = deriveKeyring(seed, VECTOR.hostFingerprint, VECTOR.address, { size: 12 });
  const b = deriveKeyring(seed, VECTOR.hostFingerprint, VECTOR.address, { size: 8 });
  for (let i = 0; i < 8; i++) assert.equal(a[i].publicKeyLine, b[i].publicKeyLine, 'prefix is stable when size grows');
  assert.equal(a[8].slug, 'k8');
  assert.equal(a[11].comment.endsWith(':k11:k11'), true);
  assert.throws(() => deriveKeyring(seed, VECTOR.hostFingerprint, VECTOR.address, { size: 0 }));
  assert.throws(() => deriveKeyring(seed, VECTOR.hostFingerprint, VECTOR.address, { size: 65 }));
});

test('a different host fingerprint yields a different ring', () => {
  const seed = seedFromSignature(VECTOR.signature);
  const other = 'SHA256:' + 'A'.repeat(43);
  const a = deriveKeyring(seed, VECTOR.hostFingerprint, VECTOR.address);
  const b = deriveKeyring(seed, other, VECTOR.address);
  assert.notEqual(a[0].publicKeyLine.split(' ')[1], b[0].publicKeyLine.split(' ')[1]);
});

test('openssh-key-v1 output round-trips through the existing parser', () => {
  const ring = deriveKeyring(seedFromSignature(VECTOR.signature), VECTOR.hostFingerprint, VECTOR.address, { size: 2 });
  for (const k of ring) {
    const seed = extractOpenSSHEd25519Seed(k.privateKeyOpenSSH);
    assert.equal(bytesToHex(new Uint8Array(seed)), bytesToHex(k.seed));
    const parsed = parsePublicKeyLine(k.publicKeyLine);
    assert.equal(bytesToHex(parsed.publicKey), bytesToHex(k.publicKey));
    assert.equal(parsed.comment, k.comment);
    assert.equal(fingerprintSSH(parsed.publicKey), k.fingerprint);
  }
});

test('ssh-keygen agrees with our public keys and fingerprints', { skip: !hasSshKeygen() && 'ssh-keygen not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pmvpn-ring-'));
  try {
    const ring = deriveKeyring(seedFromSignature(VECTOR.signature), VECTOR.hostFingerprint, VECTOR.address);
    for (const k of ring) {
      const f = join(dir, `k${k.index}`);
      writeFileSync(f, k.privateKeyOpenSSH, { mode: 0o600 });
      const pub = execFileSync('ssh-keygen', ['-y', '-f', f]).toString().trim().split(' ');
      assert.equal(pub[1], VECTOR.publicKeys[k.index], `ssh-keygen -y for key ${k.index}`);
      const fpr = execFileSync('ssh-keygen', ['-lf', f]).toString().trim().split(' ')[1];
      assert.equal(fpr, k.fingerprint, `ssh-keygen -lf for key ${k.index}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wallet-private-key derivation (legacy path) still works under ESM and emits both formats', () => {
  // Hardhat #0 private key; the ring above is the signature path, this is the raw-key path.
  const k = deriveEd25519FromWallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    VECTOR.address,
    'ssh-auth',
  );
  assert.match(k.privateKeyPEM, /BEGIN PRIVATE KEY/);
  assert.match(k.privateKeyOpenSSH, /BEGIN OPENSSH PRIVATE KEY/);
  assert.equal(k.publicKeySSH.endsWith(`pmvpn:${VECTOR.address.toLowerCase()}:ssh-auth`), true);
  const seed = extractOpenSSHEd25519Seed(k.privateKeyOpenSSH);
  assert.equal(seed.length, 32);
  const again = deriveEd25519FromWallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', VECTOR.address, 'ssh-auth');
  assert.equal(again.publicKeySSH, k.publicKeySSH, 'deterministic');
  // Pinned so the legacy path cannot silently change.
  assert.equal(k.publicKeySSH.split(' ')[1], 'AAAAC3NzaC1lZDI1NTE5AAAAIK4ukv2zdF8EBqHYd54pCMKV6jJdWU4zh10rfY5ZePmK');
});

test('delivery renderers: ssh_config, known_hosts, bundle', () => {
  const ring = deriveKeyring(seedFromSignature(VECTOR.signature), VECTOR.hostFingerprint, VECTOR.address);
  const target = {
    host: 'vps.example.net', basePort: 2200, user: 'wf39fd6e5', alias: 'vps1',
    hostKeyPublicLine: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIERMsT1YzwkOlUYYxpAIZpi+mOUuTGgBFku+FS7qCy8s host',
  };
  const cfg = renderSshConfig(target, ring);
  assert.match(cfg, /Host vps1-shell\n  HostName vps.example.net\n  Port 2200\n  User wf39fd6e5\n  IdentityFile ~\/.pmvpn\/keys\/vps1\/k0-shell/);
  assert.match(cfg, /Host vps1-sftp\n  HostName vps.example.net\n  Port 2201/);
  assert.match(cfg, /Host vps1-admin\n  HostName vps.example.net\n  Port 2207/);
  const kh = renderKnownHosts(target, ring);
  assert.equal(kh.split('\n').filter(Boolean).length, 8);
  assert.match(kh, /^\[vps.example.net\]:2200 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIERMsT1YzwkOlUYYxpAIZpi\+mOUuTGgBFku\+FS7qCy8s$/m);
  const abs = renderSshConfig(target, ring, { keyDir: '/x/y' });
  assert.match(abs, /IdentityFile \/x\/y\/k0-shell\n  IdentitiesOnly yes\n  UserKnownHostsFile \/x\/y\/known_hosts/);
  const sh = renderBundleScript(target, ring);
  assert.match(sh, /^#!\/bin\/sh/);
  assert.match(sh, /IdentityFile \$DIR\/k1-sftp/);
  assert.equal((sh.match(/<<'PMVPN_KEY'/g) || []).length, 8);
  assert.match(sh, /-----BEGIN OPENSSH PRIVATE KEY-----/);
  assert.match(sh, /Include \$DIR\/ssh_config/);
  assert.equal(sh.includes('$('), false, 'no command substitution in the bundle');
  assert.equal(authorizedKeysOptions(0), '');
  assert.equal(authorizedKeysOptions(1), 'restrict,command="internal-sftp"');
  assert.equal(authorizedKeysOptions(4), 'restrict,port-forwarding');
  assert.equal(authorizedKeysOptions(9), 'restrict');
  assert.equal(toPublicEntries(ring)[2].fingerprint, VECTOR.fingerprints[2]);
});

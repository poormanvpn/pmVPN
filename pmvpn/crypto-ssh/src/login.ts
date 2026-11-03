// SPDX-License-Identifier: GPL-3.0-only
// Log in from wallet credentials, for terminals and agents with no browser wallet.
//
//   /status → pin the host → sign the derivation message → derive the ring →
//   sign a fresh challenge → POST /keyring (public keys only) → install the bundle
//
// Afterwards plain `ssh <alias>-exec`, `sftp`, rsync and git work with no wallet in
// the loop, and the signature never leaves this process.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  DEFAULT_KEYRING_SIZE, SSH_PORT_INDICES, aliasOf, deriveKeyring, derivationMessage, fingerprintSSH,
  parsePublicKeyLine, renderBundleScript, seedFromSignature, toPublicEntries, wipeKeyring,
} from './keyring.js';
import { addressFromPrivateKey, recoverPersonalSigner, signPersonalMessage } from './personal-sign.js';
import { enrolMessage, revokeMessage } from './enrol.js';

export type Signer = (message: string) => Promise<string>;

export interface WalletCredential {
  address: string;
  sign: Signer;
}

export interface CredentialOptions {
  address?: string;
  /** File holding a hex private key, mode 0600 or stricter. */
  keyFile?: string;
  /** Shell command that prints a signature for $PMVPN_SIGN_MESSAGE. */
  signCmd?: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Resolve the signing source, strongest custody first: an external signer such as a
 * hardware wallet, then a pasted signature when an address alone is given, then a raw
 * key from a file or PMVPN_WALLET_KEY. A raw key is never read from the command line,
 * where other local users could see it in the process list.
 */
export function resolveCredential(opts: CredentialOptions, env: NodeJS.ProcessEnv = process.env): WalletCredential {
  const given = opts.address?.toLowerCase();
  if (given && !ADDRESS_RE.test(given)) throw new Error('--address must be 0x + 40 hex chars');

  if (opts.signCmd) {
    if (!given) throw new Error('--sign-cmd needs --address');
    const cmd = opts.signCmd;
    return {
      address: given,
      sign: async (message) => execFileSync('sh', ['-c', cmd], {
        env: { ...env, PMVPN_SIGN_MESSAGE: message },
        stdio: ['inherit', 'pipe', 'inherit'],
        encoding: 'utf-8',
      }).trim(),
    };
  }

  let rawKey = env.PMVPN_WALLET_KEY?.trim();
  if (opts.keyFile) {
    const mode = statSync(opts.keyFile).mode;
    if (mode & 0o077) throw new Error(`${opts.keyFile} is readable by other users; chmod 600 it`);
    rawKey = readFileSync(opts.keyFile, 'utf-8').trim();
  }
  if (rawKey) {
    const key = rawKey;
    const address = addressFromPrivateKey(key);
    if (given && given !== address) throw new Error(`the key belongs to ${address}, not ${given}`);
    return { address, sign: async (message) => signPersonalMessage(key, message) };
  }

  if (!given) throw new Error('name a wallet: --address with --sign-cmd or a pasted signature, or --key-file, or PMVPN_WALLET_KEY');
  return { address: given, sign: promptForSignature };
}

// Lines are queued as they arrive, so several signatures can be piped in at once:
// readline would otherwise drop what comes after the first answer when stdin hits EOF.
const lines: string[] = [];
const waiting: Array<(line: string | null) => void> = [];
let stdinClosed = false;
let reader: ReturnType<typeof createInterface> | null = null;

function readLine(prompt: string): Promise<string> {
  process.stderr.write(prompt);
  if (!reader) {
    reader = createInterface({ input: process.stdin });
    reader.on('line', (line) => {
      const next = waiting.shift();
      if (next) next(line); else lines.push(line);
    });
    reader.on('close', () => {
      stdinClosed = true;
      for (const next of waiting.splice(0)) next(null);
    });
  }
  return new Promise((resolve, reject) => {
    const settle = (line: string | null) => (line === null ? reject(new Error('stdin closed before a signature arrived')) : resolve(line));
    if (lines.length) settle(lines.shift()!);
    else if (stdinClosed) settle(null);
    else waiting.push(settle);
  });
}

async function promptForSignature(message: string): Promise<string> {
  process.stderr.write(`\nSign this exact text in your wallet (personal_sign):\n\n  ${message}\n\n`);
  return (await readLine('Signature (0x…): ')).trim();
}

/** Sign, then prove the signature came from the expected wallet. */
async function signChecked(cred: WalletCredential, message: string): Promise<string> {
  const signature = await cred.sign(message);
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error('the signer did not return a 65-byte 0x signature');
  const signer = recoverPersonalSigner(signature, message);
  if (signer !== cred.address) throw new Error(`that signature is from ${signer}, not ${cred.address}`);
  return signature;
}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}${body?.error ? ` — ${body.error}` : ''}`);
  return body;
}

async function freshChallenge(api: string, address: string): Promise<{ nonce: string; message: string }> {
  const c = await getJson(`${api}/challenge?address=${address}`);
  if (typeof c?.nonce !== 'string' || typeof c?.message !== 'string') throw new Error('malformed challenge response');
  return c;
}

function warnIfPlaintext(api: string): void {
  const { protocol, hostname } = new URL(api);
  if (protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    process.stderr.write(`warning: ${api} is plain HTTP. An on-path attacker could relay the signed challenge and enrol their own keys. Use a private network, or --api with an HTTPS proxy.\n`);
  }
}

export interface LoginOptions extends CredentialOptions {
  host: string;
  basePort?: number;
  /** Challenge API URL when it is not http://host:base+3, such as an HTTPS proxy. */
  api?: string;
  alias?: string;
  size?: number;
  /** Expected server host key fingerprint. */
  hostFp?: string;
  /** Accept whatever fingerprint the server reports, on this first contact only. */
  tofu?: boolean;
}

export interface LoginResult {
  alias: string;
  user: string;
  address: string;
  hostFingerprint: string;
  keyDir: string;
  /** Host aliases that speak SSH, by slug. */
  hosts: Record<string, string>;
}

export async function login(opts: LoginOptions): Promise<LoginResult> {
  const cred = resolveCredential(opts);
  const basePort = opts.basePort ?? 2200;
  const api = (opts.api ?? `http://${opts.host.includes(':') ? `[${opts.host}]` : opts.host}:${basePort + 3}`).replace(/\/$/, '');
  warnIfPlaintext(api);

  // /status arrives unauthenticated, so the fingerprint it reports proves nothing
  // unless it matches a pin. A swapped server would otherwise look like the real one.
  const status = await getJson(`${api}/status`);
  const fp = String(status?.hostFingerprint ?? '').replace(/=$/, '');
  derivationMessage(fp); // throws unless this is a well-formed fingerprint
  if (opts.hostFp) {
    if (opts.hostFp.replace(/=$/, '') !== fp) throw new Error(`host fingerprint mismatch: expected ${opts.hostFp}, server reports ${fp}`);
  } else if (!opts.tofu) {
    throw new Error(`refusing an unverified host. The server reports ${fp}. Check it out of band and pass --host-fp, or pass --tofu to trust it now.`);
  }

  const derivationSig = await signChecked(cred, derivationMessage(fp));
  const seed = seedFromSignature(derivationSig);
  const ring = deriveKeyring(seed, fp, cred.address, { size: opts.size ?? DEFAULT_KEYRING_SIZE });
  seed.fill(0);

  try {
    // Fetched only now because a nonce lives 60 seconds and the first prompt may take longer.
    const challenge = await freshChallenge(api, cred.address);
    const keys = toPublicEntries(ring).map((k) => ({ index: k.index, publicKey: k.publicKey }));
    const enrolled = await getJson(`${api}/keyring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: cred.address,
        // Built here, never taken from the server: it names our pinned host and our keys.
        signature: await signChecked(cred, enrolMessage(fp, challenge.nonce, keys)),
        nonce: challenge.nonce,
        hostFingerprint: fp,
        keys,
      }),
    });

    // The reply is untrusted input to a shell script we are about to run. The render
    // step validates user and host; the host key must also be the one we pinned.
    if (fingerprintSSH(parsePublicKeyLine(String(enrolled?.hostKey)).publicKey) !== fp) {
      throw new Error('the server enrolled the ring under a different host key than it reported');
    }
    const target = {
      host: opts.host,
      basePort: Number.isInteger(enrolled?.basePort) ? enrolled.basePort : basePort,
      user: String(enrolled?.user),
      hostKeyPublicLine: String(enrolled.hostKey),
      alias: opts.alias,
    };
    // Fed over stdin so private keys only ever reach disk at their final 0600 paths.
    execFileSync('sh', ['-s'], { input: renderBundleScript(target, ring), stdio: ['pipe', 'ignore', 'inherit'] });

    const alias = aliasOf(target);
    const hosts: Record<string, string> = {};
    for (const k of ring) if (SSH_PORT_INDICES.includes(k.index)) hosts[k.slug] = `${alias}-${k.slug}`;
    return {
      alias,
      user: target.user,
      address: cred.address,
      hostFingerprint: fp,
      keyDir: join(homedir(), '.pmvpn', 'keys', alias),
      hosts,
    };
  } finally {
    wipeKeyring(ring);
  }
}

export interface LogoutOptions extends CredentialOptions {
  host: string;
  hostFp?: string;
  basePort?: number;
  api?: string;
  alias?: string;
}

/** Revoke the ring on the server, close live connections, remove the local keys. */
export async function logout(opts: LogoutOptions): Promise<{ revoked: boolean; alias: string }> {
  const cred = resolveCredential(opts);
  const basePort = opts.basePort ?? 2200;
  const api = (opts.api ?? `http://${opts.host.includes(':') ? `[${opts.host}]` : opts.host}:${basePort + 3}`).replace(/\/$/, '');
  warnIfPlaintext(api);

  const status = await getJson(`${api}/status`);
  const fp = String(status?.hostFingerprint ?? '').replace(/=$/, '');
  if (opts.hostFp && opts.hostFp.replace(/=$/, '') !== fp) throw new Error(`host fingerprint mismatch: expected ${opts.hostFp}, server reports ${fp}`);
  const challenge = await freshChallenge(api, cred.address);
  const result = await getJson(`${api}/keyring`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: cred.address, signature: await signChecked(cred, revokeMessage(fp, challenge.nonce)), nonce: challenge.nonce }),
  });

  const alias = aliasOf({ host: opts.host, alias: opts.alias });
  const dir = join(homedir(), '.pmvpn', 'keys', alias);
  const config = join(dir, 'ssh_config');
  if (existsSync(config)) {
    // A multiplexed master outlives its key file, so close each one before deleting.
    for (const line of readFileSync(config, 'utf-8').split('\n')) {
      const host = line.match(/^Host (\S+)$/)?.[1];
      if (!host) continue;
      try { execFileSync('ssh', ['-F', config, '-O', 'exit', host], { stdio: 'ignore' }); } catch {}
    }
  }
  rmSync(dir, { recursive: true, force: true });

  const userConfig = join(homedir(), '.ssh', 'config');
  if (existsSync(userConfig)) {
    const include = `Include ${config}`;
    const kept = readFileSync(userConfig, 'utf-8').split('\n').filter((l) => l !== include);
    writeFileSync(userConfig, kept.join('\n'));
  }
  return { revoked: result?.revoked === true, alias };
}


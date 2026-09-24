// Keyring HTTP routes — mounted on the challenge port (+3) and admin port (+7)
// MIT License
//
//   POST   /keyring            enrol: { address, signature, nonce, hostFingerprint, keys[] }
//   GET    /keyring?address=   public view: indices + fingerprints
//   DELETE /keyring            revoke: { address, signature, nonce }
//
// Enrolment reuses the exact challenge → viem → provision path SSH auth uses, so
// a ring can only ever be installed by the wallet that owns the account.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { consumeChallenge } from '../auth/challenge.js';
import { verifyWalletSignature } from '../auth/verifier.js';
import { provisionWallet } from '../auth/provision.js';
import { getKeyring, saveKeyring, deleteKeyring, syncAuthorizedKeys } from '../auth/keyring.js';
import { hostKeyFingerprint, hostKeyPublicLine } from '../utils/hostkey.js';
import { BASE_PORT, KEYRING_SIZE } from '../config/ports.js';
import { logger } from '../utils/logger.js';
import type { WalletMap } from '../config/wallets.js';
import type { KeyringEnrolRequest, KeyringEnrolResponse, KeyringEntry } from '../shared.js';

const MAX_BODY = 64 * 1024;

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')); }
      catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function hostFromRequest(req: IncomingMessage): string {
  const h = (req.headers.host || 'localhost').replace(/:\d+$/, '');
  return h.replace(/^\[|\]$/g, '');
}

function aliasOf(host: string): string {
  return host.toLowerCase().replace(/[^a-z0-9.-]/g, '-') || 'pmvpn';
}

export function renderSshConfig(host: string, user: string, keys: KeyringEntry[]): string {
  const alias = aliasOf(host);
  const dir = `~/.pmvpn/keys/${alias}`;
  const out = [`# pmVPN keyring for ${host} — one Host per port, one key per Host.`, ''];
  for (const k of keys) {
    out.push(
      `Host ${alias}-${k.slug}`,
      `  HostName ${host}`,
      `  Port ${BASE_PORT + k.index}`,
      `  User ${user}`,
      `  IdentityFile ${dir}/k${k.index}-${k.slug}`,
      `  IdentitiesOnly yes`,
      `  PreferredAuthentications publickey`,
      `  ForwardAgent no`,
      '',
    );
  }
  return out.join('\n');
}

export function renderKnownHosts(host: string, keys: KeyringEntry[]): string {
  const hk = hostKeyPublicLine();
  return keys.map((k) => `[${host}]:${BASE_PORT + k.index} ${hk}`).join('\n') + '\n';
}

/**
 * Returns true when the request was handled.
 */
export async function handleKeyringRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  walletMap: WalletMap,
  sendJSON: (res: ServerResponse, status: number, body: unknown) => void,
): Promise<boolean> {
  if (url.pathname !== '/keyring') return false;

  // GET — public: which indices are enrolled, and their fingerprints
  if (req.method === 'GET') {
    const address = (url.searchParams.get('address') || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) { sendJSON(res, 400, { error: 'missing or invalid address parameter' }); return true; }
    const ring = getKeyring(address);
    if (!ring) { sendJSON(res, 404, { error: 'no keyring enrolled', keyringSize: KEYRING_SIZE }); return true; }
    sendJSON(res, 200, {
      address: ring.address,
      hostFingerprint: ring.hostFingerprint,
      enrolledAt: ring.enrolledAt,
      keyringSize: KEYRING_SIZE,
      keys: ring.keys.map((k) => ({ index: k.index, slug: k.slug, fingerprint: k.fingerprint })),
    });
    return true;
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') { sendJSON(res, 405, { error: 'method not allowed' }); return true; }

  let body: Partial<KeyringEnrolRequest>;
  try { body = await readJson(req); } catch (err: any) { sendJSON(res, 400, { error: err.message }); return true; }

  const { address, signature, nonce } = body;
  if (!address || !signature || !nonce) { sendJSON(res, 400, { error: 'address, signature and nonce are required' }); return true; }

  // Same three steps as SSH password auth: nonce → signature → provision
  const message = consumeChallenge(nonce);
  if (!message) { sendJSON(res, 401, { error: 'invalid or expired nonce' }); return true; }
  const valid = await verifyWalletSignature(address, message, signature);
  if (!valid) { sendJSON(res, 401, { error: 'invalid signature' }); return true; }
  const prov = provisionWallet(address, walletMap);
  if (!prov.ok || !prov.entry) { sendJSON(res, 403, { error: prov.error || 'provisioning failed' }); return true; }
  const addr = address.toLowerCase();

  if (req.method === 'DELETE') {
    const had = deleteKeyring(addr);
    syncAuthorizedKeys(prov.entry.user, addr, null);
    sendJSON(res, 200, { revoked: had });
    return true;
  }

  // POST — enrol
  const fp = hostKeyFingerprint();
  if (typeof body.hostFingerprint !== 'string' || body.hostFingerprint.replace(/=$/, '') !== fp) {
    sendJSON(res, 400, { error: 'host fingerprint mismatch — derive the ring for this server', hostFingerprint: fp });
    return true;
  }
  let ring;
  try {
    ring = saveKeyring(addr, fp, body.keys as any);
  } catch (err: any) {
    sendJSON(res, 400, { error: err.message, keyringSize: KEYRING_SIZE });
    return true;
  }
  const mirrored = syncAuthorizedKeys(prov.entry.user, addr, ring);
  const host = hostFromRequest(req);
  const out: KeyringEnrolResponse = {
    enrolled: ring.keys.length,
    address: addr,
    user: prov.entry.user,
    hostFingerprint: fp,
    hostKey: hostKeyPublicLine(),
    basePort: BASE_PORT,
    keyringSize: KEYRING_SIZE,
    keys: ring.keys,
    sshConfig: renderSshConfig(host, prov.entry.user, ring.keys),
    knownHosts: renderKnownHosts(host, ring.keys),
  };
  logger.info({ address: addr, user: prov.entry.user, keys: ring.keys.length, mirrored }, 'keyring enrolment complete');
  sendJSON(res, 200, out);
  return true;
}

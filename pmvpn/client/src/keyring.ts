// pmVPN Client — Keys tab: derive, enrol, export and revoke the port-scoped keyring
//
// One wallet signature → eight Ed25519 keys, one per port, derived in the browser
// with the same code the server and PARSEC use (crypto-ssh/src/keyring.ts). The
// private halves never leave this device except inside the bundle the participant
// downloads; the server only ever receives public lines.

import {
  derivationMessage, seedFromSignature, deriveKeyring, wipeKeyring, toPublicEntries,
  renderBundleScript, type KeyringKey,
} from '@pmvpn/crypto-ssh/keyring';
import { fetchChallenge, signAndBuildPayload, signMessage } from './auth';

function mk(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

interface EnrolResponse {
  enrolled: number;
  user: string;
  hostFingerprint: string;
  hostKey: string;
  basePort: number;
  keyringSize: number;
  keys: { index: number; slug: string; fingerprint: string }[];
}

interface RingState {
  keys: KeyringKey[];
  hostFingerprint: string;
  enrol: EnrolResponse | null;
}

// The most recent ring's shell public line, for the "Deploy SSH Key" tool.
let lastShellPublicLine: string | null = null;
export function getKeyringShellPublicLine(): string | null {
  return lastShellPublicLine;
}

export function createKeysPanel(
  conn: { name: string; host: string; port: string },
  walletAddress: string,
  log: (msg: string, level?: string) => void,
): { element: HTMLElement; refresh: () => void; destroy: () => void } {
  const basePort = parseInt(conn.port, 10);
  const api = `http://${conn.host}:${basePort + 3}`;
  let ring: RingState | null = null;
  let serverFp: string | null = null;
  let keyringSize = 8;

  const root = mk('div', 'pmvpn-share-panel pmvpn-keys-panel');

  // ── Status ──
  const statusSection = mk('div', 'pmvpn-share-section');
  statusSection.innerHTML = '<div class="pmvpn-share-title">Keyring</div>';
  const statusText = mk('div', 'pmvpn-keys-status', 'checking server…');
  const explain = mk('div', 'pmvpn-keys-explain',
    'One wallet signature derives one Ed25519 key per port. Key <code>k0</code> opens the shell port only, '
    + '<code>k1</code> SFTP only, and so on — a leaked key opens one service, never the machine. '
    + 'The keys are standard openssh-key-v1 files: <code>ssh</code>, <code>sftp</code>, <code>scp</code>, '
    + '<code>rsync</code>, <code>git</code> and paramiko all use them without pmVPN in the loop.');
  statusSection.append(statusText, explain);

  // ── Actions ──
  const actions = mk('div', 'pmvpn-share-section');
  actions.innerHTML = '<div class="pmvpn-share-title">Actions</div>';
  const row = mk('div', 'pmvpn-keys-actions');
  const deriveBtn = document.createElement('button');
  deriveBtn.className = 'pmvpn-btn pmvpn-btn-primary';
  deriveBtn.textContent = 'Derive & Enrol';
  const bundleBtn = document.createElement('button');
  bundleBtn.className = 'pmvpn-btn pmvpn-btn-secondary';
  bundleBtn.textContent = 'Download bundle';
  bundleBtn.disabled = true;
  const revokeBtn = document.createElement('button');
  revokeBtn.className = 'pmvpn-btn pmvpn-btn-danger';
  revokeBtn.textContent = 'Revoke';
  revokeBtn.disabled = true;
  row.append(deriveBtn, bundleBtn, revokeBtn);
  const hint = mk('div', 'pmvpn-keys-hint', 'Derive asks your wallet to sign a message that names this server\'s host key. No gas, no transaction.');
  actions.append(row, hint);

  // ── Key list ──
  const listSection = mk('div', 'pmvpn-share-section');
  listSection.innerHTML = '<div class="pmvpn-share-title">Keys</div>';
  const list = mk('div', 'pmvpn-share-list');
  listSection.appendChild(list);

  root.append(statusSection, actions, listSection);

  function renderList(keys: { index: number; slug: string; fingerprint: string }[], enrolled: boolean) {
    list.innerHTML = '';
    if (!keys.length) { list.innerHTML = '<div class="pmvpn-keys-empty">No keyring for this wallet on this server yet.</div>'; return; }
    for (const k of keys) {
      const item = mk('div', 'pmvpn-share-item pmvpn-keys-item');
      item.innerHTML =
        `<span class="pmvpn-keys-index">k${k.index}</span>`
        + `<span class="pmvpn-keys-slug">${esc(k.slug)}</span>`
        + `<span class="pmvpn-keys-port">:${basePort + k.index}</span>`
        + `<code class="pmvpn-keys-fp">${esc(k.fingerprint)}</code>`
        + `<span class="pmvpn-keys-state">${enrolled ? 'enrolled' : 'local'}</span>`;
      list.appendChild(item);
    }
  }

  async function refresh() {
    try {
      const st = await fetch(`${api}/status`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
      serverFp = st.hostFingerprint || null;
      keyringSize = st.keyringSize || 8;
      if (!serverFp) {
        statusText.textContent = `server v${st.version} does not expose a host fingerprint — upgrade it to 0.1.1+`;
        deriveBtn.disabled = true;
        return;
      }
      deriveBtn.disabled = false;
      const res = await fetch(`${api}/keyring?address=${walletAddress}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const g = await res.json();
        statusText.innerHTML = `host <code>${esc(serverFp)}</code> · ${g.keys.length} of ${keyringSize} keys enrolled ${new Date(g.enrolledAt).toLocaleString()}`;
        revokeBtn.disabled = false;
        if (!ring) renderList(g.keys, true);
      } else {
        statusText.innerHTML = `host <code>${esc(serverFp)}</code> · no keyring enrolled (server accepts ${keyringSize})`;
        revokeBtn.disabled = true;
        if (!ring) renderList([], false);
      }
    } catch (e: any) {
      statusText.textContent = `server unreachable: ${e?.message || e}`;
      deriveBtn.disabled = true;
    }
  }

  async function signedAuth(): Promise<{ address: string; signature: string; nonce: string }> {
    const ch = await fetchChallenge(api, walletAddress);
    return JSON.parse(await signAndBuildPayload(ch.message, ch.nonce));
  }

  deriveBtn.addEventListener('click', async () => {
    if (!serverFp) return;
    deriveBtn.disabled = true;
    try {
      log(`${conn.name}: keyring — sign the derivation message for ${serverFp.slice(0, 20)}…`, 'info');
      const sig = await signMessage(derivationMessage(serverFp));
      const seed = seedFromSignature(sig);
      const keys = deriveKeyring(seed, serverFp, walletAddress, { size: keyringSize });
      seed.fill(0);
      if (ring) wipeKeyring(ring.keys);
      ring = { keys, hostFingerprint: serverFp, enrol: null };
      lastShellPublicLine = keys[0].publicKeyLine;
      renderList(keys, false);
      log(`${conn.name}: keyring — ${keys.length} keys derived, enrolling…`, 'info');

      const auth = await signedAuth();
      const res = await fetch(`${api}/keyring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auth, hostFingerprint: serverFp, keys: toPublicEntries(keys).map((k) => ({ index: k.index, publicKey: k.publicKey })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      ring.enrol = body as EnrolResponse;
      renderList(keys, true);
      bundleBtn.disabled = false;
      revokeBtn.disabled = false;
      statusText.innerHTML = `host <code>${esc(serverFp)}</code> · ${body.enrolled} keys enrolled as <code>${esc(body.user)}</code>`;
      log(`${conn.name}: keyring — ${body.enrolled} keys enrolled for ${body.user}. Download the bundle to use them from ssh/sftp/paramiko.`, 'success');
    } catch (e: any) {
      log(`${conn.name}: keyring — ${e?.message || e}`, 'error');
    } finally {
      deriveBtn.disabled = false;
    }
  });

  bundleBtn.addEventListener('click', () => {
    if (!ring?.enrol) return;
    const alias = (conn.name || conn.host).toLowerCase().replace(/[^a-z0-9.-]/g, '-') || 'pmvpn';
    const script = renderBundleScript({
      host: conn.host,
      basePort: ring.enrol.basePort || basePort,
      user: ring.enrol.user,
      hostKeyPublicLine: ring.enrol.hostKey,
      alias,
    }, ring.keys);
    const blob = new Blob([script], { type: 'text/x-shellscript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pmvpn-keyring-${alias}.sh`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    log(`${conn.name}: keyring — bundle saved. Run: sh ${a.download}  then  ssh ${alias}-shell`, 'success');
  });

  revokeBtn.addEventListener('click', async () => {
    revokeBtn.disabled = true;
    try {
      const auth = await signedAuth();
      const res = await fetch(`${api}/keyring`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auth) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (ring) { wipeKeyring(ring.keys); ring = null; }
      lastShellPublicLine = null;
      bundleBtn.disabled = true;
      renderList([], false);
      log(`${conn.name}: keyring revoked on the server (delete ~/.pmvpn/keys/<alias> locally)`, 'success');
      await refresh();
    } catch (e: any) {
      log(`${conn.name}: keyring — ${e?.message || e}`, 'error');
      revokeBtn.disabled = false;
    }
  });

  function destroy() {
    if (ring) { wipeKeyring(ring.keys); ring = null; }
  }

  return { element: root, refresh, destroy };
}

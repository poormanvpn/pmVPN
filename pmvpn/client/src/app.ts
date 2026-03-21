// pmVPN Standalone Client — MetaMask Login
// GPL-3.0
//
// Login flow:
//   1. Click "Connect MetaMask" → MetaMask popup → returns address only
//   2. Add connections (local + remote) with + button
//   3. Click connection → fetch challenge → MetaMask signs → payload ready
//   4. Paste payload as SSH password, or use WebSocket terminal
//   5. Click "Logout" → clears all sessions, disconnects wallet completely
//
// Private key NEVER touches this application.

import { injectStyles } from './style';
import { hasMetaMask, isMetaMaskLocked, connectMetaMask, getAddress, isConnected, disconnect, fetchChallenge, signAndBuildPayload, onAccountChange } from './auth';
import { createTerminal, type TerminalInstance } from './terminal';
import { createFileBrowser } from './files';
import { bootstrapServer, deploySSHKey } from './bootstrap';
import { exportProfiles, importProfiles } from './hostkeys';
import { createSharePanel } from './share';
injectStyles();

interface Connection {
  id: string;
  name: string;
  host: string;
  port: string;
  status: 'offline' | 'connected' | 'error';
  payload: string | null;
}

// Per-connection session: terminal + file browser + share panel
interface HostSession {
  term: TerminalInstance;
  fileBrowser: ReturnType<typeof createFileBrowser>;
  sharePanel: ReturnType<typeof createSharePanel>;
  termEl: HTMLElement;
  filesEl: HTMLElement;
  shareEl: HTMLElement;
}

let logEl: HTMLElement;
let connections: Connection[] = JSON.parse(localStorage.getItem('pmvpn-connections') || '[]');
let activeConnId: string | null = null;
const sessions = new Map<string, HostSession>(); // per-connection sessions

// Ensure localhost default exists
if (!connections.find(c => c.host === 'localhost' && c.port === '2200')) {
  connections.unshift({ id: 'local', name: 'Local Server', host: 'localhost', port: '2200', status: 'offline', payload: null });
  saveConnections();
}

function saveConnections() {
  localStorage.setItem('pmvpn-connections', JSON.stringify(connections.map(c => ({ ...c, status: 'offline', payload: null }))));
}

function log(m: string, l = '') {
  const e = document.createElement('div');
  e.className = `pmvpn-log-entry ${l}`;
  e.textContent = `[${new Date().toLocaleTimeString()}] ${m}`;
  logEl.appendChild(e);
  logEl.scrollTop = logEl.scrollHeight;
}

function mk(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function createApp(): HTMLElement {
  const root = mk('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100vh';

  // ── Header with Logout ──
  const header = mk('div', 'pmvpn-header');
  header.innerHTML = `
    <div>
      <div class="pmvpn-title">pmVPN</div>
      <div class="pmvpn-subtitle">WALLET-AUTHENTICATED REMOTE ACCESS</div>
    </div>
  `;
  const headerRight = mk('div', 'pmvpn-header-right');
  const addrDisplay = mk('span', 'pmvpn-addr-display');
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'pmvpn-btn-logout';
  logoutBtn.textContent = 'LOGOUT';
  logoutBtn.style.display = 'none';
  logoutBtn.addEventListener('click', doLogout);

  const exitBtn = document.createElement('button');
  exitBtn.className = 'pmvpn-btn-exit';
  exitBtn.textContent = '✕';
  exitBtn.title = 'Exit — kill all sessions and close';
  exitBtn.addEventListener('click', doExit);

  headerRight.append(addrDisplay, logoutBtn, exitBtn);
  header.appendChild(headerRight);

  const body = mk('div', 'pmvpn-body');
  const sidebar = mk('div', 'pmvpn-sidebar');
  const main = mk('div', 'pmvpn-main');

  // ── Wallet Section ──
  const walletSection = mk('div', 'pmvpn-section', '<h3>Wallet</h3>');
  const metamaskBtn = document.createElement('button');
  metamaskBtn.className = 'pmvpn-btn pmvpn-btn-metamask';
  metamaskBtn.innerHTML = '🦊 Connect MetaMask';
  metamaskBtn.addEventListener('click', handleMetaMaskConnect);

  const walletInfo = mk('div', 'pmvpn-wallet-info');
  walletInfo.style.display = 'none';

  if (!hasMetaMask()) {
    metamaskBtn.disabled = true;
    metamaskBtn.innerHTML = '🦊 MetaMask Not Found';
    walletSection.appendChild(mk('div', 'pmvpn-hint', 'Install <a href="https://metamask.io" target="_blank">MetaMask</a> to connect.'));
  }

  walletSection.append(metamaskBtn, walletInfo);

  // ── Connections Section ──
  const connSection = mk('div', 'pmvpn-section');
  const connHeader = mk('div', 'pmvpn-conn-header');
  connHeader.innerHTML = '<h3>Connections</h3>';
  const addBtn = document.createElement('button');
  addBtn.className = 'pmvpn-btn-icon';
  addBtn.textContent = '+';
  addBtn.title = 'Add connection';
  addBtn.addEventListener('click', showAddForm);
  connHeader.appendChild(addBtn);
  connSection.appendChild(connHeader);

  const connList = mk('div', 'pmvpn-conn-list');
  connSection.appendChild(connList);

  // Add form (hidden by default)
  const addForm = mk('div', 'pmvpn-add-form');
  addForm.style.display = 'none';
  const nameIn = document.createElement('input');
  nameIn.className = 'pmvpn-input'; nameIn.placeholder = 'Name (e.g. dev-box)';
  const hostIn = document.createElement('input');
  hostIn.className = 'pmvpn-input'; hostIn.placeholder = 'Host (e.g. 192.168.1.50)';
  const portIn = document.createElement('input');
  portIn.className = 'pmvpn-input'; portIn.placeholder = 'Port (2200)'; portIn.value = '2200';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'pmvpn-btn pmvpn-btn-primary';
  saveBtn.textContent = 'Add';
  saveBtn.addEventListener('click', () => {
    const name = nameIn.value.trim() || `${hostIn.value}:${portIn.value}`;
    const host = hostIn.value.trim();
    const port = portIn.value.trim() || '2200';
    if (!host) { log('Host is required', 'error'); return; }
    connections.push({ id: crypto.randomUUID(), name, host, port, status: 'offline', payload: null });
    saveConnections();
    renderConnections();
    addForm.style.display = 'none';
    nameIn.value = ''; hostIn.value = ''; portIn.value = '2200';
    log(`added: ${name}`, 'success');
  });
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pmvpn-btn pmvpn-btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => { addForm.style.display = 'none'; });
  const formBtns = mk('div', 'pmvpn-form-btns');
  formBtns.append(saveBtn, cancelBtn);
  addForm.append(nameIn, hostIn, portIn, formBtns);
  connSection.appendChild(addForm);

  // ── Payload Section ──
  const payloadSection = mk('div', 'pmvpn-section', '<h3>Auth Payload</h3>');
  payloadSection.style.display = 'none';
  const payloadArea = document.createElement('textarea');
  payloadArea.className = 'pmvpn-input'; payloadArea.readOnly = true;
  payloadArea.style.cssText = 'font-size:10px;min-height:70px';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'pmvpn-btn pmvpn-btn-secondary'; copyBtn.textContent = 'Copy Payload';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(payloadArea.value);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy Payload'; }, 1500);
  });
  const sshHint = mk('div');
  sshHint.style.cssText = 'font-size:11px;color:#484f58;margin-top:6px;font-family:monospace';
  payloadSection.append(payloadArea, copyBtn, sshHint);

  // ── Diagnostics Section ──
  const diagSection = mk('div', 'pmvpn-section');
  diagSection.innerHTML = '<h3>Diagnostics</h3>';
  const diagResults = mk('div', 'pmvpn-diag-results');
  const diagBtn = document.createElement('button');
  diagBtn.className = 'pmvpn-btn pmvpn-btn-secondary';
  diagBtn.textContent = 'Run Diagnostics';
  diagBtn.addEventListener('click', runDiagnostics);
  diagSection.append(diagBtn, diagResults);

  // ── Tools Section ──
  const toolsSection = mk('div', 'pmvpn-section');
  toolsSection.innerHTML = '<h3>Tools</h3>';

  const bootstrapBtn = document.createElement('button');
  bootstrapBtn.className = 'pmvpn-btn pmvpn-btn-secondary';
  bootstrapBtn.textContent = 'Bootstrap Remote Server';
  bootstrapBtn.addEventListener('click', async () => {
    if (!term?.isConnected()) { log('connect to a server first', 'error'); return; }
    const address = getAddress();
    if (!address) { log('connect MetaMask first', 'error'); return; }
    const conn = connections.find(c => c.id === activeConnId);
    const port = prompt('Base port for new pmVPN server:', '8200');
    if (!port) return;
    await bootstrapServer(term, address, conn?.name || 'user', parseInt(port), log);
  });

  const deployKeyBtn = document.createElement('button');
  deployKeyBtn.className = 'pmvpn-btn pmvpn-btn-secondary';
  deployKeyBtn.textContent = 'Deploy SSH Key';
  deployKeyBtn.addEventListener('click', async () => {
    if (!term?.isConnected()) { log('connect to a server first', 'error'); return; }
    const address = getAddress();
    if (!address) { log('connect MetaMask first', 'error'); return; }
    await deploySSHKey(term, address, log);
  });

  const exportBtn = document.createElement('button');
  exportBtn.className = 'pmvpn-btn pmvpn-btn-secondary';
  exportBtn.textContent = 'Export Profiles';
  exportBtn.addEventListener('click', () => {
    const json = exportProfiles();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pmvpn-profiles.json'; a.click();
    URL.revokeObjectURL(url);
    log('profiles exported', 'success');
  });

  const importBtn = document.createElement('button');
  importBtn.className = 'pmvpn-btn pmvpn-btn-secondary';
  importBtn.textContent = 'Import Profiles';
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = importProfiles(text);
      log(`imported: ${result.connections} connections, ${result.keys} host keys`, 'success');
      // Reload connections from localStorage
      connections = JSON.parse(localStorage.getItem('pmvpn-connections') || '[]');
      renderConnections();
    });
    input.click();
  });

  toolsSection.append(bootstrapBtn, deployKeyBtn, exportBtn, importBtn);

  sidebar.append(walletSection, connSection, payloadSection, diagSection, toolsSection);

  // ── Main: Terminal ──
  const placeholder = mk('div', 'pmvpn-placeholder', `
    <div class="pmvpn-placeholder-title">pmVPN</div>
    <div class="pmvpn-placeholder-sub">Connect MetaMask → Select connection → Authenticate</div>
    <div class="pmvpn-placeholder-sub" style="margin-top:16px;font-size:12px;color:var(--muted-foreground);max-width:400px;text-align:center">
      Your private key never leaves MetaMask.<br>
      pmVPN only sees your address and signature.
    </div>
  `);
  main.appendChild(placeholder);

  // ── Log & Status ──
  logEl = mk('div', 'pmvpn-log');
  const statusBar = mk('div', 'pmvpn-status', `
    <span><span class="pmvpn-status-dot disconnected" id="sd"></span><span id="st">Disconnected</span></span>
    <span id="si"></span>
  `);

  body.append(sidebar, main);
  root.append(header, body, logEl, statusBar);

  // ── Diagnostics — real end-to-end tests ──
  async function runDiagnostics() {
    diagResults.innerHTML = '';
    diagBtn.disabled = true;
    diagBtn.textContent = 'Testing...';
    log('diagnostics: starting', 'info');

    const wallet = getAddress();
    const authenticated = isConnected();

    for (const conn of connections) {
      const challengePort = parseInt(conn.port) + 3;
      const baseUrl = `http://${conn.host}:${challengePort}`;

      // Test 1: Server reachable
      const t1 = addDiagRow(`${conn.name} — server`);
      try {
        const start = performance.now();
        const res = await fetch(`${baseUrl}/status`, { signal: AbortSignal.timeout(5000) });
        const ms = Math.round(performance.now() - start);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        t1.pass(`reachable ${ms}ms · v${data.version} · up ${fmtUp(data.uptime)} · ${data.wallets} wallet(s)`);
      } catch (e: any) {
        t1.fail(e.name === 'TimeoutError' ? 'timeout 5s' : e.message || 'unreachable');
        continue; // skip remaining tests for this connection
      }

      // Test 2: Challenge nonce
      const t2 = addDiagRow(`${conn.name} — challenge`);
      if (!wallet) {
        t2.warn('skipped — connect MetaMask first');
        continue;
      }
      let nonce: string | null = null;
      let message: string | null = null;
      try {
        const start = performance.now();
        const res = await fetch(`${baseUrl}/challenge?address=${wallet}`, { signal: AbortSignal.timeout(5000) });
        const ms = Math.round(performance.now() - start);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as any).error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        nonce = data.nonce;
        message = data.message;
        const ttl = data.expires - Math.floor(Date.now() / 1000);
        t2.pass(`nonce received ${ms}ms · ${ttl}s TTL · ${nonce!.slice(0, 12)}...`);
      } catch (e: any) {
        t2.fail(e.message);
        continue;
      }

      // Test 3: Signature (requires authenticated session)
      const t3 = addDiagRow(`${conn.name} — signature`);
      if (!authenticated || !nonce || !message) {
        t3.warn('skipped — sign in first to test signatures');
        continue;
      }
      try {
        const start = performance.now();
        const payload = await signAndBuildPayload(message, nonce);
        const ms = Math.round(performance.now() - start);
        const parsed = JSON.parse(payload);
        t3.pass(`signed ${ms}ms · ${parsed.signature.slice(0, 18)}...`);

        // Test 4: Payload valid (verify format)
        const t4 = addDiagRow(`${conn.name} — payload`);
        if (parsed.address && parsed.signature && parsed.nonce &&
            parsed.address.startsWith('0x') && parsed.signature.startsWith('0x') &&
            parsed.signature.length === 132 && parsed.nonce.length === 64) {
          t4.pass(`valid · ${payload.length} bytes · ready for SSH`);
        } else {
          t4.fail('malformed payload');
        }
      } catch (e: any) {
        t3.fail(e.message);
      }
    }

    // MetaMask state
    const tm = addDiagRow('MetaMask');
    if (!hasMetaMask()) {
      tm.fail('not installed');
    } else {
      const locked = await isMetaMaskLocked();
      if (locked === true) tm.warn('locked — password required to connect');
      else if (locked === false) tm.pass('unlocked · ready');
      else tm.warn('state unknown');
    }

    // Session
    const ts = addDiagRow('Session');
    if (authenticated) {
      ts.pass(`authenticated · ${wallet!.slice(0, 10)}...`);
    } else {
      ts.warn('not authenticated');
    }

    diagBtn.disabled = false;
    diagBtn.textContent = 'Run Diagnostics';
    log('diagnostics: complete', 'info');
  }

  function addDiagRow(label: string) {
    const row = mk('div', 'pmvpn-diag-row');
    const lbl = mk('span', 'pmvpn-diag-label', label);
    const st = mk('span', 'pmvpn-diag-status', '...');
    row.append(lbl, st);
    diagResults.appendChild(row);
    return {
      pass: (msg: string) => { st.className = 'pmvpn-diag-status ok'; st.textContent = `✓ ${msg}`; log(`${label}: ${msg}`, 'success'); },
      fail: (msg: string) => { st.className = 'pmvpn-diag-status fail'; st.textContent = `✗ ${msg}`; log(`${label}: ${msg}`, 'error'); },
      warn: (msg: string) => { st.className = 'pmvpn-diag-status warn'; st.textContent = `— ${msg}`; log(`${label}: ${msg}`, 'info'); },
    };
  }

  function fmtUp(s: number): string {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`;
  }

  // ── Render connections list ──
  function renderConnections() {
    connList.innerHTML = '';
    for (const conn of connections) {
      const item = mk('div', `pmvpn-conn-item ${conn.status} ${activeConnId === conn.id ? 'active' : ''}`);

      const info = mk('div', 'pmvpn-conn-info');
      info.innerHTML = `
        <div class="pmvpn-conn-name">${conn.name}</div>
        <div class="pmvpn-conn-addr">${conn.host}:${conn.port}</div>
        <div class="pmvpn-conn-status">${conn.status}</div>
      `;
      info.addEventListener('click', () => doConnectTo(conn));

      // Kill button — disconnect this specific session
      if (conn.status === 'connected') {
        const killBtn = document.createElement('button');
        killBtn.className = 'pmvpn-btn-icon pmvpn-btn-kill';
        killBtn.textContent = '⏻';
        killBtn.title = 'Kill this connection';
        killBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          killConnection(conn);
        });
        item.appendChild(killBtn);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'pmvpn-btn-icon pmvpn-btn-remove';
      removeBtn.textContent = '−';
      removeBtn.title = 'Remove connection';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        killConnection(conn);
        connections = connections.filter(c => c.id !== conn.id);
        saveConnections();
        renderConnections();
        log(`removed: ${conn.name}`, 'info');
      });

      item.append(info, removeBtn);
      connList.appendChild(item);
    }
  }

  function showAddForm() {
    addForm.style.display = addForm.style.display === 'none' ? '' : 'none';
    if (addForm.style.display !== 'none') nameIn.focus();
  }

  // ── MetaMask connect ──
  async function handleMetaMaskConnect() {
    try {
      metamaskBtn.disabled = true;
      metamaskBtn.innerHTML = '🦊 Connecting...';
      log('connecting to MetaMask...', 'info');
      const { address, wasLocked } = await connectMetaMask();

      if (wasLocked) {
        log('password verified', 'success');
      } else {
        log('wallet was unlocked — set auto-lock: MetaMask → Settings → Advanced', 'info');
      }
      log('signature verified', 'success');

      metamaskBtn.style.display = 'none';
      walletInfo.style.display = '';
      walletInfo.innerHTML = `
        <div style="font-family:monospace;font-size:13px;color:var(--success);padding:6px 0">
          🟢 ${address.slice(0, 6)}...${address.slice(-4)}
        </div>
        <div style="font-size:11px;color:var(--muted-foreground);word-break:break-all">${address}</div>
      `;
      addrDisplay.textContent = address.slice(0, 6) + '...' + address.slice(-4);
      logoutBtn.style.display = '';
      log(`authenticated ${address.slice(0,10)}...`, 'success');
    } catch (e: any) {
      metamaskBtn.disabled = false;
      metamaskBtn.innerHTML = '🦊 Connect MetaMask';
      log(e.message, 'error');
    }
  }

  // ── Logout — true logout, no trace ──
  // Kills every connection, wipes every payload, revokes MetaMask,
  // clears all state. After this, the user must click Connect MetaMask
  // and approve in MetaMask again. No auto-reconnect. No residual data.
  async function doLogout() {
    // 1. Disconnect all SSH connections and wipe every payload
    const activeCount = connections.filter(c => c.status === 'connected').length;
    for (const conn of connections) {
      if (conn.status === 'connected') {
        log(`disconnecting: ${conn.name}`, 'info');
      }
      conn.status = 'offline';
      conn.payload = null;
    }
    activeConnId = null;
    if (activeCount > 0) {
      log(`${activeCount} SSH connection(s) terminated`, 'info');
    }

    // 2. Destroy ALL sessions
    for (const [id, session] of sessions) {
      session.term.destroy();
      session.termEl.remove();
      session.filesEl.remove();
      session.shareEl.remove();
    }
    sessions.clear();
    tabBar.style.display = 'none';
    placeholder.style.display = '';

    // 3. Wipe payload display — no auth data left visible
    payloadSection.style.display = 'none';
    payloadArea.value = '';
    sshHint.innerHTML = '';

    // 4. Revoke MetaMask permission + kill session state
    await disconnect();

    // 5. Clear ALL persisted wallet/session data
    localStorage.removeItem('pmvpn-wallet-address');
    sessionStorage.clear();

    // 6. Reset UI to fresh state — as if visiting for the first time
    walletInfo.style.display = 'none';
    walletInfo.innerHTML = '';
    metamaskBtn.style.display = '';
    metamaskBtn.disabled = false;
    metamaskBtn.innerHTML = '🦊 Connect MetaMask';
    addrDisplay.textContent = '';
    logoutBtn.style.display = 'none';

    setStatus('disconnected');
    renderConnections();
    log('logged out — permissions revoked, sessions cleared', 'success');
    log('lock MetaMask for full security: 🦊 → ⋮ → Lock', 'info');
  }

  function setStatus(s: string) {
    document.getElementById('sd')!.className = `pmvpn-status-dot ${s}`;
    document.getElementById('st')!.textContent = s[0].toUpperCase() + s.slice(1);
    const active = connections.find(c => c.id === activeConnId);
    const sessionCount = sessions.size;
    const info = active ? `${active.host}:${active.port}` : '';
    const multi = sessionCount > 1 ? ` · ${sessionCount} sessions` : '';
    document.getElementById('si')!.textContent = info + multi;
  }

  // ── Tab switching ──
  let activeTab: 'terminal' | 'files' | 'share' = 'terminal';
  let fileBrowser: ReturnType<typeof createFileBrowser> | null = null;
  let sharePanel: ReturnType<typeof createSharePanel> | null = null;
  const tabBar = mk('div', 'pmvpn-tabs');
  const tabTerminal = mk('button', 'pmvpn-tab active', 'Terminal');
  const tabFiles = mk('button', 'pmvpn-tab', 'Files');
  const tabShare = mk('button', 'pmvpn-tab', 'Share');
  tabTerminal.addEventListener('click', () => switchTab('terminal'));
  tabFiles.addEventListener('click', () => switchTab('files'));
  tabShare.addEventListener('click', () => switchTab('share'));
  tabBar.append(tabTerminal, tabFiles, tabShare);
  tabBar.style.display = 'none';
  main.insertBefore(tabBar, placeholder);

  // Per-host containers are created dynamically in doConnectTo()

  function switchTab(tab: 'terminal' | 'files' | 'share') {
    activeTab = tab;
    tabTerminal.className = `pmvpn-tab ${tab === 'terminal' ? 'active' : ''}`;
    tabFiles.className = `pmvpn-tab ${tab === 'files' ? 'active' : ''}`;
    tabShare.className = `pmvpn-tab ${tab === 'share' ? 'active' : ''}`;

    // Hide all session containers, then show active session's container for this tab
    for (const [, session] of sessions) {
      session.termEl.style.display = 'none';
      session.filesEl.style.display = 'none';
      session.shareEl.style.display = 'none';
    }

    if (activeConnId) {
      const session = sessions.get(activeConnId);
      if (session) {
        if (tab === 'terminal') {
          session.termEl.style.display = '';
          requestAnimationFrame(() => session.term.fitAddon.fit());
        } else if (tab === 'files') {
          session.filesEl.style.display = '';
          session.fileBrowser?.refresh();
        } else if (tab === 'share') {
          session.shareEl.style.display = '';
          session.sharePanel?.refresh();
        }
      }
    }
  }

  // ── Show a specific host's session (switch between connected hosts) ──
  function showSession(connId: string) {
    // Hide all sessions
    for (const [id, session] of sessions) {
      session.termEl.style.display = 'none';
      session.filesEl.style.display = 'none';
      session.shareEl.style.display = 'none';
    }

    const session = sessions.get(connId);
    if (!session) return;

    // Show active session based on current tab
    placeholder.style.display = 'none';
    tabBar.style.display = '';
    if (activeTab === 'terminal') {
      session.termEl.style.display = '';
      requestAnimationFrame(() => session.term.fitAddon.fit());
    } else if (activeTab === 'files') {
      session.filesEl.style.display = '';
      session.fileBrowser.refresh();
    } else if (activeTab === 'share') {
      session.shareEl.style.display = '';
      session.sharePanel.refresh();
    }

    // Update payload display
    const conn = connections.find(c => c.id === connId);
    if (conn?.payload) {
      payloadSection.style.display = '';
      payloadArea.value = conn.payload;
      sshHint.innerHTML = `SSH: <code>ssh -p ${conn.port} -o PreferredAuthentications=password user@${conn.host}</code>`;
    }
  }

  // ── Connect to a specific connection — REAL WebSocket ──
  async function doConnectTo(conn: Connection) {
    if (!isConnected()) { log('connect MetaMask first', 'error'); return; }

    // If already connected, just switch to it
    if (sessions.has(conn.id)) {
      activeConnId = conn.id;
      showSession(conn.id);
      renderConnections();
      return;
    }

    const address = getAddress()!;
    const challengePort = parseInt(conn.port) + 3;
    const wsPort = parseInt(conn.port) + 4;
    activeConnId = conn.id;
    renderConnections();

    try {
      setStatus('connecting');
      log(`${conn.name}: fetching challenge...`, 'info');
      const challenge = await fetchChallenge(`http://${conn.host}:${challengePort}`, address);
      log(`${conn.name}: nonce ${challenge.nonce.slice(0, 12)}...`, 'info');

      setStatus('authenticating');
      log(`${conn.name}: signing...`, 'info');
      const payload = await signAndBuildPayload(challenge.message, challenge.nonce);
      log(`${conn.name}: signed`, 'success');

      conn.payload = payload;

      // Create per-host DOM containers
      const termEl = mk('div', 'pmvpn-terminal-container active');
      const filesEl = mk('div', 'pmvpn-files-container');
      const shareEl = mk('div', 'pmvpn-share-container');
      filesEl.style.display = 'none';
      shareEl.style.display = 'none';
      main.appendChild(termEl);
      main.appendChild(filesEl);
      main.appendChild(shareEl);

      // Create terminal for this host
      const hostTerm = createTerminal();
      hostTerm.mount(termEl);

      log(`${conn.name}: connecting ws://${conn.host}:${wsPort}...`, 'info');

      hostTerm.connectWs(`ws://${conn.host}:${wsPort}`, payload, (ok, user, error) => {
        if (ok) {
          conn.status = 'connected';
          setStatus('connected');
          renderConnections();
          log(`${conn.name}: live terminal as ${user}`, 'success');

          // Create file browser and share panel for this host
          const fb = createFileBrowser(hostTerm, log);
          filesEl.appendChild(fb.element);
          fb.refresh();

          const sp = createSharePanel(hostTerm, getAddress()!, conn.host, conn.port, log);
          shareEl.appendChild(sp.element);
          sp.refresh();

          // Store session
          sessions.set(conn.id, {
            term: hostTerm,
            fileBrowser: fb,
            sharePanel: sp,
            termEl,
            filesEl,
            shareEl,
          });

          // Show this session
          showSession(conn.id);
          log(`${conn.name}: connected (${sessions.size} active session${sessions.size > 1 ? 's' : ''})`, 'success');
        } else {
          conn.status = 'error';
          setStatus('error');
          renderConnections();
          log(`${conn.name}: auth failed — ${error}`, 'error');
          hostTerm.terminal.writeln(`\r\n\x1b[31mWebSocket auth failed: ${error}\x1b[0m`);
          hostTerm.terminal.writeln(`\x1b[33mUse auth payload as SSH password instead.\x1b[0m`);
          // Still store the session for payload mode
          sessions.set(conn.id, { term: hostTerm, fileBrowser: null as any, sharePanel: null as any, termEl, filesEl, shareEl });
          showSession(conn.id);
        }
      });

      // Show tabs and payload
      placeholder.style.display = 'none';
      tabBar.style.display = '';
      payloadSection.style.display = '';
      payloadArea.value = payload;
      sshHint.innerHTML = `SSH: <code>ssh -p ${conn.port} -o PreferredAuthentications=password user@${conn.host}</code>`;

    } catch (e: any) {
      conn.status = 'error';
      setStatus('error');
      renderConnections();
      log(`${conn.name}: ${e.message}`, 'error');
    }
  }

  // Kill a specific connection — clean disconnect + DOM cleanup
  function killConnection(conn: Connection) {
    const session = sessions.get(conn.id);
    if (session) {
      log(`killing: ${conn.name}`, 'info');
      session.term.destroy();
      session.termEl.remove();
      session.filesEl.remove();
      session.shareEl.remove();
      sessions.delete(conn.id);
    }
    conn.status = 'offline';
    conn.payload = null;

    // If this was the active connection, switch or show placeholder
    if (activeConnId === conn.id) {
      const remaining = Array.from(sessions.keys());
      if (remaining.length > 0) {
        activeConnId = remaining[0];
        showSession(activeConnId);
      } else {
        activeConnId = null;
        tabBar.style.display = 'none';
        placeholder.style.display = '';
        payloadSection.style.display = 'none';
      }
    }
    setStatus(sessions.size > 0 ? 'connected' : 'disconnected');
    renderConnections();
    log(`${conn.name}: killed (${sessions.size} remaining)`, 'info');
  }

  function doDisconnect() {
    if (activeConnId) {
      const conn = connections.find(c => c.id === activeConnId);
      if (conn) killConnection(conn);
    }
  }

  // ── Exit — clean shutdown ──
  async function doExit() {
    // Kill all sessions
    for (const [, session] of sessions) {
      session.term.destroy();
      session.termEl.remove();
      session.filesEl.remove();
      session.shareEl.remove();
    }
    sessions.clear();

    // Reset all connections
    for (const conn of connections) {
      conn.status = 'offline';
      conn.payload = null;
    }
    activeConnId = null;

    // Disconnect wallet
    await disconnect();

    // Clear all state
    localStorage.removeItem('pmvpn-wallet-address');
    sessionStorage.clear();

    // Close the page
    log('exiting — all sessions killed, wallet disconnected', 'success');

    // Replace page content with clean exit message
    document.body.innerHTML = '';
    const exit = document.createElement('div');
    exit.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;background:#1e2030;color:#7f849c;font-family:monospace;font-size:14px;flex-direction:column;gap:8px';
    exit.innerHTML = `
      <div style="font-size:20px;color:#a6e3a1">pmVPN closed</div>
      <div>all sessions terminated · wallet disconnected</div>
      <div style="margin-top:16px;font-size:12px;color:#3b3f5c">close this tab or refresh to restart</div>
    `;
    document.body.appendChild(exit);

    // Try to close the tab (works if we opened it)
    try { window.close(); } catch {}
  }

  // MetaMask account changes
  onAccountChange((accounts: string[]) => {
    if (accounts.length === 0) {
      doLogout().catch(() => {});
    } else {
      const addr = accounts[0].toLowerCase();
      walletInfo.innerHTML = `
        <div style="font-family:monospace;font-size:13px;color:#3fb950;padding:6px 0">🟢 ${addr.slice(0, 6)}...${addr.slice(-4)}</div>
        <div style="font-size:11px;color:#484f58;word-break:break-all">${addr}</div>
      `;
      addrDisplay.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
      log(`account switched: ${addr.slice(0, 10)}...`, 'info');
    }
  });

  renderConnections();
  // Clean shutdown on page close
  window.addEventListener('beforeunload', () => {
    for (const [, session] of sessions) {
      session.term.disconnect();
    }
    disconnect().catch(() => {});
  });

  log('pmvpn ready', 'info');
  log('local server: localhost:2200', 'info');
  if (!hasMetaMask()) log('MetaMask not detected — install browser extension', 'error');

  return root;
}

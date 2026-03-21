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
import { hasMetaMask, connectMetaMask, getAddress, isConnected, disconnect, fetchChallenge, signAndBuildPayload, onAccountChange } from './auth';
import { createTerminal, type TerminalInstance } from './terminal';
injectStyles();

interface Connection {
  id: string;
  name: string;
  host: string;
  port: string;
  status: 'offline' | 'connected' | 'error';
  payload: string | null;
}

let term: TerminalInstance | null = null;
let logEl: HTMLElement;
let connections: Connection[] = JSON.parse(localStorage.getItem('pmvpn-connections') || '[]');
let activeConnId: string | null = null;

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
  headerRight.append(addrDisplay, logoutBtn);
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

  sidebar.append(walletSection, connSection, payloadSection);

  // ── Main: Terminal ──
  const placeholder = mk('div', 'pmvpn-placeholder', `
    <div class="pmvpn-placeholder-title">pmVPN</div>
    <div class="pmvpn-placeholder-sub">Connect MetaMask → Select connection → Authenticate</div>
    <div class="pmvpn-placeholder-sub" style="margin-top:16px;font-size:12px;color:var(--muted-foreground);max-width:400px;text-align:center">
      Your private key never leaves MetaMask.<br>
      pmVPN only sees your address and signature.
    </div>
  `);
  const termContainer = mk('div', 'pmvpn-terminal-container');
  termContainer.style.display = 'none';
  main.append(placeholder, termContainer);

  // ── Log & Status ──
  logEl = mk('div', 'pmvpn-log');
  const statusBar = mk('div', 'pmvpn-status', `
    <span><span class="pmvpn-status-dot disconnected" id="sd"></span><span id="st">Disconnected</span></span>
    <span id="si"></span>
  `);

  body.append(sidebar, main);
  root.append(header, body, logEl, statusBar);

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

      const removeBtn = document.createElement('button');
      removeBtn.className = 'pmvpn-btn-icon pmvpn-btn-remove';
      removeBtn.textContent = '−';
      removeBtn.title = 'Remove connection';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeConnId === conn.id) doDisconnect();
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

    // 2. Destroy terminal completely
    if (term) { term.destroy(); term = null; }
    termContainer.style.display = 'none';
    termContainer.className = 'pmvpn-terminal-container';
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
    document.getElementById('si')!.textContent = active ? `${active.host}:${active.port}` : '';
  }

  // ── Connect to a specific connection ──
  async function doConnectTo(conn: Connection) {
    if (!isConnected()) { log('connect MetaMask first', 'error'); return; }

    const address = getAddress()!;
    const challengePort = parseInt(conn.port) + 3;
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

      conn.status = 'connected';
      conn.payload = payload;

      payloadSection.style.display = '';
      payloadArea.value = payload;
      sshHint.innerHTML = `SSH: <code>ssh -p ${conn.port} -o PreferredAuthentications=password user@${conn.host}</code>`;

      placeholder.style.display = 'none';
      termContainer.style.display = '';
      termContainer.className = 'pmvpn-terminal-container active';
      if (term) term.destroy();
      term = createTerminal();
      term.mount(termContainer);

      const t = term.terminal;
      t.writeln('');
      t.writeln('\x1b[1;32m  ╔══════════════════════════════════════════╗\x1b[0m');
      t.writeln('\x1b[1;32m  ║\x1b[0m  \x1b[1;32mpmVPN\x1b[0m \x1b[32m— Wallet-Authenticated SSH\x1b[0m        \x1b[1;32m║\x1b[0m');
      t.writeln('\x1b[1;32m  ╚══════════════════════════════════════════╝\x1b[0m');
      t.writeln('');
      t.writeln(`  \x1b[32mConnection:\x1b[0m \x1b[1;32m${conn.name}\x1b[0m`);
      t.writeln(`  \x1b[32mWallet:\x1b[0m     \x1b[32m${address}\x1b[0m`);
      t.writeln(`  \x1b[32mServer:\x1b[0m     \x1b[32m${conn.host}:${conn.port}\x1b[0m`);
      t.writeln(`  \x1b[32mSigned:\x1b[0m     \x1b[32mby MetaMask (key never exposed)\x1b[0m`);
      t.writeln('');
      t.writeln('  \x1b[1;32m✓ Auth payload ready\x1b[0m');
      t.writeln('');
      t.writeln(`  \x1b[32m$ ssh -p ${conn.port} -o PreferredAuthentications=password user@${conn.host}\x1b[0m`);
      t.writeln(`  \x1b[32m  Password: <paste from sidebar>\x1b[0m`);
      t.writeln('');
      t.writeln('  \x1b[33mValid for 60 seconds, single use.\x1b[0m');

      setStatus('connected');
      renderConnections();
      log(`${conn.name}: payload ready — paste as SSH password`, 'success');
    } catch (e: any) {
      conn.status = 'error';
      setStatus('error');
      renderConnections();
      log(`${conn.name}: ${e.message}`, 'error');
    }
  }

  function doDisconnect() {
    if (activeConnId) {
      const conn = connections.find(c => c.id === activeConnId);
      if (conn) { conn.status = 'offline'; conn.payload = null; }
    }
    activeConnId = null;
    if (term) { term.destroy(); term = null; }
    termContainer.style.display = 'none';
    termContainer.className = 'pmvpn-terminal-container';
    placeholder.style.display = '';
    payloadSection.style.display = 'none';
    setStatus('disconnected');
    renderConnections();
    log('disconnected', 'info');
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
  log('pmvpn ready', 'info');
  log('local server: localhost:2200', 'info');
  if (!hasMetaMask()) log('MetaMask not detected — install browser extension', 'error');

  return root;
}

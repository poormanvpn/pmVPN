// pmVPN Standalone Client — MetaMask Login
// GPL-3.0
//
// Login flow:
//   1. User clicks "Connect MetaMask" → MetaMask popup asks permission
//   2. MetaMask returns the user's public address (no key exposed)
//   3. User enters server host:port and clicks "Connect"
//   4. Client fetches a challenge nonce from server (port +3)
//   5. Client asks MetaMask to sign the challenge → MetaMask popup
//   6. MetaMask returns the signature (private key never leaves MetaMask)
//   7. Client builds auth payload: { address, signature, nonce }
//   8. Payload is used as the SSH password for wallet-authenticated login
//
// The private key NEVER touches this application.
// MetaMask handles all signing. We only see the address and signature.

import { injectStyles } from './style';
import { hasMetaMask, connectMetaMask, getAddress, isConnected, disconnect, fetchChallenge, signAndBuildPayload, onAccountChange } from './auth';
import { createTerminal, type TerminalInstance } from './terminal';
injectStyles();

let term: TerminalInstance | null = null;
let logEl: HTMLElement;
const S = {
  host: localStorage.getItem('pmvpn-host') || 'localhost',
  port: localStorage.getItem('pmvpn-port') || '2200',
  status: 'disconnected',
  payload: null as string | null,
};

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

  // Header
  const header = mk('div', 'pmvpn-header', `
    <div>
      <div class="pmvpn-title">pmVPN</div>
      <div class="pmvpn-subtitle">WALLET-AUTHENTICATED REMOTE ACCESS</div>
    </div>
    <div class="pmvpn-subtitle" id="pa"></div>
  `);

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

  const disconnectWalletBtn = document.createElement('button');
  disconnectWalletBtn.className = 'pmvpn-btn pmvpn-btn-secondary';
  disconnectWalletBtn.textContent = 'Disconnect Wallet';
  disconnectWalletBtn.style.display = 'none';
  disconnectWalletBtn.addEventListener('click', () => {
    disconnect();
    walletInfo.style.display = 'none';
    disconnectWalletBtn.style.display = 'none';
    metamaskBtn.style.display = '';
    metamaskBtn.disabled = false;
    metamaskBtn.innerHTML = '🦊 Connect MetaMask';
    document.getElementById('pa')!.textContent = '';
    log('Wallet disconnected', 'info');
  });

  if (!hasMetaMask()) {
    metamaskBtn.disabled = true;
    metamaskBtn.innerHTML = '🦊 MetaMask Not Found';
    walletSection.appendChild(mk('div', 'pmvpn-hint', 'Install <a href="https://metamask.io" target="_blank">MetaMask</a> to connect your wallet.'));
  }

  walletSection.append(metamaskBtn, walletInfo, disconnectWalletBtn);

  // ── How It Works ──
  const flowSection = mk('div', 'pmvpn-section');
  flowSection.innerHTML = `
    <h3>How It Works</h3>
    <div class="pmvpn-flow">
      <div class="pmvpn-flow-step">1. <strong>Connect MetaMask</strong> — reveals your address only</div>
      <div class="pmvpn-flow-step">2. <strong>Enter server</strong> — host and base port</div>
      <div class="pmvpn-flow-step">3. <strong>Connect</strong> — fetches challenge nonce from server</div>
      <div class="pmvpn-flow-step">4. <strong>MetaMask signs</strong> — private key never leaves MetaMask</div>
      <div class="pmvpn-flow-step">5. <strong>Auth payload</strong> — use as SSH password</div>
    </div>
  `;

  // ── Server Section ──
  const serverSection = mk('div', 'pmvpn-section', '<h3>Server</h3>');
  const hostIn = document.createElement('input');
  hostIn.className = 'pmvpn-input'; hostIn.placeholder = 'host (e.g. 192.168.1.50)'; hostIn.value = S.host;
  hostIn.addEventListener('input', () => { S.host = hostIn.value; localStorage.setItem('pmvpn-host', S.host); });
  const portIn = document.createElement('input');
  portIn.className = 'pmvpn-input'; portIn.placeholder = 'base port'; portIn.value = S.port;
  portIn.addEventListener('input', () => { S.port = portIn.value; localStorage.setItem('pmvpn-port', S.port); });

  const connectBtn = document.createElement('button');
  connectBtn.className = 'pmvpn-btn pmvpn-btn-primary'; connectBtn.textContent = 'Connect';
  connectBtn.addEventListener('click', doConnect);

  const disconnectBtn = document.createElement('button');
  disconnectBtn.className = 'pmvpn-btn pmvpn-btn-danger'; disconnectBtn.textContent = 'Disconnect';
  disconnectBtn.style.display = 'none';
  disconnectBtn.addEventListener('click', doDisconnect);

  serverSection.append(hostIn, portIn, connectBtn, disconnectBtn);

  // ── Auth Payload Section ──
  const payloadSection = mk('div', 'pmvpn-section', '<h3>Auth Payload</h3>');
  payloadSection.style.display = 'none';
  const payloadArea = document.createElement('textarea');
  payloadArea.className = 'pmvpn-input'; payloadArea.readOnly = true;
  payloadArea.style.cssText = 'font-size:10px;min-height:80px';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'pmvpn-btn pmvpn-btn-secondary'; copyBtn.textContent = 'Copy Payload';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(payloadArea.value);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy Payload'; }, 1500);
  });
  const sshHint = mk('div');
  sshHint.style.cssText = 'font-size:11px;color:#484f58;margin-top:8px;font-family:monospace';
  payloadSection.append(payloadArea, copyBtn, sshHint);

  sidebar.append(walletSection, flowSection, serverSection, payloadSection);

  // ── Main: Terminal ──
  const placeholder = mk('div', 'pmvpn-placeholder', `
    <div class="pmvpn-placeholder-title">pmVPN</div>
    <div class="pmvpn-placeholder-sub">Connect MetaMask → Enter server → Connect</div>
    <div class="pmvpn-placeholder-sub" style="margin-top:16px;font-size:11px;color:#30363d;max-width:400px;text-align:center">
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

  // ── Handlers ──

  async function handleMetaMaskConnect(): Promise<void> {
    try {
      metamaskBtn.disabled = true;
      metamaskBtn.innerHTML = '🦊 Connecting...';
      log('Requesting MetaMask connection...', 'info');

      const address = await connectMetaMask();

      metamaskBtn.style.display = 'none';
      walletInfo.style.display = '';
      walletInfo.innerHTML = `
        <div style="font-family:monospace;font-size:13px;color:#3fb950;padding:8px 0">
          🟢 ${address.slice(0, 6)}...${address.slice(-4)}
        </div>
        <div style="font-size:11px;color:#484f58;word-break:break-all">${address}</div>
      `;
      disconnectWalletBtn.style.display = '';
      document.getElementById('pa')!.textContent = address.slice(0, 6) + '...' + address.slice(-4);

      log(`Connected: ${address}`, 'success');
    } catch (e: any) {
      metamaskBtn.disabled = false;
      metamaskBtn.innerHTML = '🦊 Connect MetaMask';
      log(`MetaMask: ${e.message}`, 'error');
    }
  }

  function setStatus(s: string): void {
    S.status = s;
    document.getElementById('sd')!.className = `pmvpn-status-dot ${s}`;
    document.getElementById('st')!.textContent = s[0].toUpperCase() + s.slice(1);
    document.getElementById('si')!.textContent = s === 'connected' ? `${S.host}:${S.port}` : '';
    connectBtn.style.display = s === 'connected' ? 'none' : '';
    disconnectBtn.style.display = s === 'connected' ? '' : 'none';
  }

  async function doConnect(): Promise<void> {
    if (!isConnected()) {
      log('Connect MetaMask first', 'error');
      return;
    }

    const address = getAddress()!;
    const challengePort = parseInt(S.port) + 3;

    try {
      // Step 1: Fetch challenge from server
      setStatus('connecting');
      log(`Fetching challenge from ${S.host}:${challengePort}...`, 'info');
      const challenge = await fetchChallenge(`http://${S.host}:${challengePort}`, address);
      log(`Nonce: ${challenge.nonce.slice(0, 16)}... (expires in ${challenge.expires - Math.floor(Date.now() / 1000)}s)`, 'info');

      // Step 2: MetaMask signs the challenge (popup appears)
      setStatus('authenticating');
      log('Requesting MetaMask signature...', 'info');
      const payload = await signAndBuildPayload(challenge.message, challenge.nonce);
      log('Signature received from MetaMask', 'success');

      // Step 3: Show auth payload
      S.payload = payload;
      payloadSection.style.display = '';
      payloadArea.value = payload;
      sshHint.innerHTML = `
        <br>Use as SSH password:<br>
        <code>ssh -p ${S.port} -o PreferredAuthentications=password \\<br>
        &nbsp;&nbsp;-o PubkeyAuthentication=no user@${S.host}</code>
      `;

      // Step 4: Show terminal with connection info
      placeholder.style.display = 'none';
      termContainer.style.display = '';
      if (term) term.destroy();
      term = createTerminal();
      term.mount(termContainer);

      const t = term.terminal;
      t.writeln('\x1b[1;34m╔══════════════════════════════════════════╗\x1b[0m');
      t.writeln('\x1b[1;34m║\x1b[0m  \x1b[1;37mpmVPN\x1b[0m — Wallet-Authenticated SSH        \x1b[1;34m║\x1b[0m');
      t.writeln('\x1b[1;34m╚══════════════════════════════════════════╝\x1b[0m');
      t.writeln('');
      t.writeln(`  \x1b[36mWallet:\x1b[0m  ${address}`);
      t.writeln(`  \x1b[36mServer:\x1b[0m  ${S.host}:${S.port}`);
      t.writeln(`  \x1b[36mNonce:\x1b[0m   ${challenge.nonce.slice(0, 24)}...`);
      t.writeln(`  \x1b[36mSigned:\x1b[0m  by MetaMask (key never exposed)`);
      t.writeln('');
      t.writeln('  \x1b[32m✓ Auth payload ready\x1b[0m');
      t.writeln('');
      t.writeln('  \x1b[37mTo connect, paste the payload as your SSH password:\x1b[0m');
      t.writeln('');
      t.writeln(`  \x1b[90m$ ssh -p ${S.port} -o PreferredAuthentications=password user@${S.host}\x1b[0m`);
      t.writeln(`  \x1b[90m  Password: <paste auth payload from sidebar>\x1b[0m`);
      t.writeln('');
      t.writeln('  \x1b[33mThe payload is valid for 60 seconds, single use.\x1b[0m');
      t.writeln('');

      setStatus('connected');
      log('Auth payload ready — paste as SSH password', 'success');

    } catch (e: any) {
      setStatus('error');
      log(`Failed: ${e.message}`, 'error');
    }
  }

  function doDisconnect(): void {
    if (term) { term.destroy(); term = null; }
    termContainer.style.display = 'none';
    placeholder.style.display = '';
    payloadSection.style.display = 'none';
    S.payload = null;
    setStatus('disconnected');
    log('Disconnected', 'info');
  }

  // Listen for MetaMask account changes
  onAccountChange((accounts) => {
    if (accounts.length === 0) {
      disconnect();
      walletInfo.style.display = 'none';
      disconnectWalletBtn.style.display = 'none';
      metamaskBtn.style.display = '';
      metamaskBtn.disabled = false;
      metamaskBtn.innerHTML = '🦊 Connect MetaMask';
      document.getElementById('pa')!.textContent = '';
      log('MetaMask disconnected', 'info');
    } else {
      const addr = accounts[0].toLowerCase();
      walletInfo.innerHTML = `
        <div style="font-family:monospace;font-size:13px;color:#3fb950;padding:8px 0">
          🟢 ${addr.slice(0, 6)}...${addr.slice(-4)}
        </div>
        <div style="font-size:11px;color:#484f58;word-break:break-all">${addr}</div>
      `;
      document.getElementById('pa')!.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
      log(`Account changed: ${addr.slice(0, 10)}...`, 'info');
    }
  });

  log('pmVPN client ready', 'info');
  if (!hasMetaMask()) {
    log('MetaMask not detected — install MetaMask browser extension', 'error');
  }

  return root;
}

// dApp Diagnostics Panel — privilege-gated fleet/provider response viewer
// MIT License
//
// Fetches live data from Provider Gateway (:2206) and Fleet Control Plane (:2600)
// and renders it in the UI. Access gated by wallet signature + asset holding.

import { verifyPrivilege, privilegeDisplay, type PrivilegeState, type PrivilegeLevel } from './privilege';

interface DiagEndpoint {
  label: string;
  url: string;
  minLevel: PrivilegeLevel;
  formatter?: (data: any) => string;
}

/**
 * Create the dApp Diagnostics panel element.
 * Returns the panel root and a refresh function.
 */
export function createDappDiagnostics(
  getAddress: () => string | null,
  getSignature: () => string | null,
  log: (msg: string, level?: string) => void
): { element: HTMLElement; refresh: () => Promise<void> } {

  const root = document.createElement('div');
  root.className = 'pmvpn-section dapp-diagnostics';

  // Header with privilege badge
  const header = document.createElement('div');
  header.className = 'dapp-diag-header';
  header.innerHTML = '<h3>dApp Diagnostics</h3>';

  const badge = document.createElement('span');
  badge.className = 'dapp-privilege-badge';
  badge.textContent = '◌ LOCKED';
  header.appendChild(badge);

  // Privilege details (asset holdings)
  const privilegeInfo = document.createElement('div');
  privilegeInfo.className = 'dapp-privilege-info';

  // Gate overlay
  const gate = document.createElement('div');
  gate.className = 'dapp-gate';
  gate.innerHTML = `
    <div class="dapp-gate-icon">◌</div>
    <div class="dapp-gate-text">Connect wallet to verify identity</div>
    <div class="dapp-gate-sub">Signature proves identity. Asset holding proves privilege.</div>
  `;

  // Response grid (hidden until privilege verified)
  const responseGrid = document.createElement('div');
  responseGrid.className = 'dapp-response-grid';

  // Controls
  const controls = document.createElement('div');
  controls.className = 'dapp-controls';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'pmvpn-btn pmvpn-btn-secondary dapp-refresh-btn';
  refreshBtn.textContent = 'Refresh Fleet Data';

  const verifyBtn = document.createElement('button');
  verifyBtn.className = 'pmvpn-btn dapp-verify-btn';
  verifyBtn.textContent = 'Verify Privilege';

  controls.append(verifyBtn, refreshBtn);

  root.append(header, privilegeInfo, gate, controls, responseGrid);

  // State
  let currentPrivilege: PrivilegeState | null = null;

  // Verify privilege
  async function doVerify() {
    const address = getAddress();
    const signature = getSignature();

    if (!address) {
      updateGate('Connect MetaMask to verify identity', false);
      return;
    }

    badge.textContent = '... verifying';
    badge.style.color = 'var(--warning)';
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';

    try {
      currentPrivilege = await verifyPrivilege(address, signature);
      const display = privilegeDisplay(currentPrivilege.level);

      badge.textContent = `${display.icon} ${display.label}`;
      badge.style.color = display.color;

      // Update privilege info display
      renderPrivilegeInfo(currentPrivilege);

      if (currentPrivilege.level === 'none') {
        updateGate('Signature required for access', false);
        log(`privilege: ${display.label} — sign in to verify identity`, 'info');
      } else {
        gate.style.display = 'none';
        responseGrid.style.display = '';
        refreshBtn.style.display = '';
        log(`privilege: ${display.label} for ${address.slice(0, 10)}... (${currentPrivilege.ethBalance.slice(0, 8)} ETH)`, 'success');
        await fetchEndpoints();
      }
    } catch (err: any) {
      badge.textContent = '◌ ERROR';
      badge.style.color = 'var(--destructive)';
      log(`privilege verification failed: ${err.message}`, 'error');
    }

    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify Privilege';
  }

  function updateGate(text: string, hidden: boolean) {
    gate.style.display = hidden ? 'none' : '';
    gate.querySelector('.dapp-gate-text')!.textContent = text;
    responseGrid.style.display = 'none';
    refreshBtn.style.display = 'none';
  }

  function renderPrivilegeInfo(priv: PrivilegeState) {
    const display = privilegeDisplay(priv.level);
    privilegeInfo.innerHTML = '';

    // Wallet row
    const walletRow = document.createElement('div');
    walletRow.className = 'dapp-priv-row';
    walletRow.innerHTML = `
      <span class="dapp-priv-label">Wallet</span>
      <span class="dapp-priv-value">${priv.wallet.slice(0, 6)}...${priv.wallet.slice(-4)}</span>
    `;
    privilegeInfo.appendChild(walletRow);

    // Signature row
    const sigRow = document.createElement('div');
    sigRow.className = 'dapp-priv-row';
    sigRow.innerHTML = `
      <span class="dapp-priv-label">Signature</span>
      <span class="dapp-priv-value" style="color:${priv.signature ? 'var(--success)' : 'var(--destructive)'}">${priv.signature ? 'verified' : 'missing'}</span>
    `;
    privilegeInfo.appendChild(sigRow);

    // Asset rows
    for (const asset of priv.assets) {
      const row = document.createElement('div');
      row.className = 'dapp-priv-row';
      row.innerHTML = `
        <span class="dapp-priv-label">${asset.symbol}</span>
        <span class="dapp-priv-value" style="color:${asset.met ? 'var(--success)' : 'var(--muted-foreground)'}">
          ${parseFloat(asset.balance).toFixed(4)}${asset.required !== '0' ? ` / ${asset.required} req` : ''}
        </span>
      `;
      privilegeInfo.appendChild(row);
    }

    // Access rights
    const rightsRow = document.createElement('div');
    rightsRow.className = 'dapp-priv-row dapp-priv-rights';
    const rights = [
      priv.canViewDiagnostics ? 'diagnostics' : null,
      priv.canViewFleet ? 'fleet' : null,
      priv.canManageFleet ? 'manage' : null,
      priv.canDeploy ? 'deploy' : null,
    ].filter(Boolean);
    rightsRow.innerHTML = `
      <span class="dapp-priv-label">Access</span>
      <span class="dapp-priv-value">${rights.length ? rights.join(' · ') : 'none'}</span>
    `;
    privilegeInfo.appendChild(rightsRow);
  }

  // Fetch fleet/provider endpoints and render responses
  async function fetchEndpoints() {
    if (!currentPrivilege || currentPrivilege.level === 'none') return;

    responseGrid.innerHTML = '';

    // Determine connection host from first connection in localStorage
    const connections = JSON.parse(localStorage.getItem('pmvpn-connections') || '[]');
    const host = connections[0]?.host || 'localhost';

    const endpoints: DiagEndpoint[] = [
      {
        label: 'Provider Gateway',
        url: `http://${host}:2206/status`,
        minLevel: 'viewer',
        formatter: fmtProviderStatus,
      },
      {
        label: 'Providers',
        url: `http://${host}:2206/providers`,
        minLevel: 'viewer',
        formatter: fmtProviders,
      },
      {
        label: 'Commands',
        url: `http://${host}:2206/commands`,
        minLevel: 'viewer',
        formatter: fmtCommands,
      },
      {
        label: 'Fleet Status',
        url: `http://${host}:2600/status`,
        minLevel: 'viewer',
        formatter: fmtFleetStatus,
      },
      {
        label: 'Fleet Members',
        url: `http://${host}:2600/members`,
        minLevel: 'operator',
        formatter: fmtFleetMembers,
      },
      {
        label: 'Fleet Topology',
        url: `http://${host}:2600/topology`,
        minLevel: 'operator',
        formatter: fmtTopology,
      },
      {
        label: 'Fleet Mesh',
        url: `http://${host}:2602/status`,
        minLevel: 'operator',
        formatter: fmtMeshStatus,
      },
      {
        label: 'Fleet Health',
        url: `http://${host}:2603/health`,
        minLevel: 'viewer',
        formatter: fmtHealthData,
      },
      {
        label: 'Metrics',
        url: `http://${host}:2603/metrics`,
        minLevel: 'admin',
      },
    ];

    const levels: PrivilegeLevel[] = ['none', 'viewer', 'operator', 'admin', 'owner'];
    const currentIdx = levels.indexOf(currentPrivilege.level);

    for (const ep of endpoints) {
      const reqIdx = levels.indexOf(ep.minLevel);
      const card = document.createElement('div');
      card.className = 'dapp-response-card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'dapp-response-header';

      const labelEl = document.createElement('span');
      labelEl.className = 'dapp-response-label';
      labelEl.textContent = ep.label;

      const statusEl = document.createElement('span');
      statusEl.className = 'dapp-response-status';

      cardHeader.append(labelEl, statusEl);

      const bodyEl = document.createElement('pre');
      bodyEl.className = 'dapp-response-body';

      card.append(cardHeader, bodyEl);
      responseGrid.appendChild(card);

      if (currentIdx < reqIdx) {
        // Insufficient privilege
        const reqDisplay = privilegeDisplay(ep.minLevel);
        statusEl.textContent = `${reqDisplay.icon} ${reqDisplay.label} required`;
        statusEl.style.color = 'var(--muted-foreground)';
        bodyEl.textContent = `Requires ${reqDisplay.label} privilege`;
        bodyEl.style.color = 'var(--muted-foreground)';
        card.classList.add('dapp-locked');
        continue;
      }

      // Fetch the endpoint
      statusEl.textContent = '...';
      statusEl.style.color = 'var(--warning)';

      try {
        const start = performance.now();
        const res = await fetch(ep.url, { signal: AbortSignal.timeout(5000) });
        const ms = Math.round(performance.now() - start);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const contentType = res.headers.get('content-type') || '';
        let body: string;

        if (contentType.includes('application/json')) {
          const data = await res.json();
          body = ep.formatter ? ep.formatter(data) : JSON.stringify(data, null, 2);
        } else {
          body = await res.text();
          // Truncate long text responses (e.g., Prometheus metrics)
          if (body.length > 2000) {
            body = body.slice(0, 2000) + '\n... (truncated)';
          }
        }

        statusEl.textContent = `${ms}ms`;
        statusEl.style.color = 'var(--success)';
        bodyEl.textContent = body;
        log(`dapp: ${ep.label} fetched (${ms}ms)`, 'success');
      } catch (err: any) {
        statusEl.textContent = 'error';
        statusEl.style.color = 'var(--destructive)';
        bodyEl.textContent = err.message || 'unreachable';
        bodyEl.style.color = 'var(--destructive)';
        log(`dapp: ${ep.label} failed — ${err.message}`, 'error');
      }
    }
  }

  // Event handlers
  verifyBtn.addEventListener('click', doVerify);
  refreshBtn.addEventListener('click', fetchEndpoints);
  refreshBtn.style.display = 'none';

  return {
    element: root,
    refresh: async () => {
      if (getAddress()) await doVerify();
    },
  };
}

// --- Response formatters (human-readable for mobile) ---

function fmtProviderStatus(data: any): string {
  const lines = [
    `Version:    ${data.version}`,
    `Uptime:     ${fmtUptime(data.uptime)}`,
    `Modules:    ${data.modules}`,
    `Providers:  ${data.cloudProviders}`,
  ];
  if (data.moduleList?.length) {
    lines.push('', 'Modules:');
    for (const m of data.moduleList) {
      lines.push(`  ${m.name} v${m.version} (${m.commands} cmds${m.hasProvider ? ', cloud' : ''})`);
    }
  }
  if (data.providerList?.length) {
    lines.push('', 'Providers:');
    for (const p of data.providerList) {
      lines.push(`  ${p.displayName} (${p.name})`);
    }
  }
  return lines.join('\n');
}

function fmtProviders(data: any): string {
  if (!data.providers?.length) return 'No providers registered';
  return data.providers.map((p: any) => `${p.displayName} (${p.name})`).join('\n');
}

function fmtCommands(data: any): string {
  if (!data.commands?.length) return 'No commands registered';
  return data.commands.map((c: any) =>
    `${c.name} [${c.aliases?.join(', ') || ''}]\n  ${c.description}`
  ).join('\n\n');
}

function fmtFleetStatus(data: any): string {
  return [
    `Node:       ${data.nodeId?.slice(0, 8)}...`,
    `Role:       ${data.role}`,
    `Uptime:     ${fmtUptime(data.uptime)}`,
    `Members:    ${data.members?.total || 0}`,
    `  Healthy:  ${data.members?.healthy || 0}`,
    `  Warning:  ${data.members?.warning || 0}`,
    `  Critical: ${data.members?.critical || 0}`,
    `  Unreach:  ${data.members?.unreachable || 0}`,
    `Groups:     ${data.groups?.join(', ') || 'none'}`,
  ].join('\n');
}

function fmtFleetMembers(data: any): string {
  if (!data.members?.length) return 'No fleet members';
  return data.members.map((m: any) =>
    `${m.name} (${m.host}:${m.coreBasePort})\n  env: ${m.environment}  tags: ${m.tags?.join(', ') || '-'}`
  ).join('\n\n');
}

function fmtTopology(data: any): string {
  const lines = [
    `Coordinator: ${data.nodeId?.slice(0, 8)}... (${data.role})`,
    `Members: ${data.members?.length || 0}`,
  ];
  if (data.members?.length) {
    for (const m of data.members) {
      lines.push(`  ${m.name} @ ${m.host}:${m.coreBasePort} [${m.environment}]`);
    }
  }
  if (data.groups && Object.keys(data.groups).length) {
    lines.push('', 'Groups:');
    for (const [name, ids] of Object.entries(data.groups)) {
      lines.push(`  ${name}: ${(ids as string[]).join(', ')}`);
    }
  }
  return lines.join('\n');
}

function fmtMeshStatus(data: any): string {
  return [
    `Node:        ${data.nodeId?.slice(0, 8)}...`,
    `Role:        ${data.role}`,
    `Peers:       ${data.peers?.total || 0}`,
    `  Connected: ${data.peers?.connected || 0}`,
    `  Stale:     ${data.peers?.stale || 0}`,
    `Stale TTL:   ${data.staleTimeoutMs}ms`,
    `Uptime:      ${fmtUptime(data.uptime)}`,
  ].join('\n');
}

function fmtHealthData(data: any): string {
  const lines = [
    `Node:    ${data.nodeId?.slice(0, 8)}...`,
    `Role:    ${data.role}`,
    `Uptime:  ${fmtUptime(data.uptime)}`,
    `Memory:  ${fmtBytes(data.memory?.rss)} RSS, ${fmtBytes(data.memory?.heapUsed)} heap`,
  ];
  if (data.members?.length) {
    lines.push('', 'Members:');
    for (const m of data.members) {
      lines.push(`  ${m.name} (${m.host}) — ${m.status}`);
    }
  }
  return lines.join('\n');
}

function fmtUptime(s: number): string {
  if (!s) return '0s';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtBytes(b: number): string {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

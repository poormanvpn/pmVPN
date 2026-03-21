// pmVPN Client — P2P File Sharing UI
// Create shares, add files, generate invites, browse received shares.

import type { TerminalInstance } from './terminal';

function mk(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createSharePanel(
  term: TerminalInstance,
  walletAddress: string,
  serverHost: string,
  serverPort: string,
  log: (msg: string, level?: string) => void,
): { element: HTMLElement; refresh: () => void } {

  const root = mk('div', 'pmvpn-share-panel');

  // ── Create Share ──
  const createSection = mk('div', 'pmvpn-share-section');
  createSection.innerHTML = '<div class="pmvpn-share-title">Create Share</div>';

  const nameIn = document.createElement('input');
  nameIn.className = 'pmvpn-input';
  nameIn.placeholder = 'Share name';
  nameIn.value = 'Shared Files';

  const createBtn = document.createElement('button');
  createBtn.className = 'pmvpn-btn pmvpn-btn-primary';
  createBtn.textContent = 'Create Share';
  createBtn.addEventListener('click', handleCreate);

  createSection.append(nameIn, createBtn);

  // ── Active Shares ──
  const sharesSection = mk('div', 'pmvpn-share-section');
  sharesSection.innerHTML = '<div class="pmvpn-share-title">Your Shares</div>';
  const sharesList = mk('div', 'pmvpn-share-list');
  sharesSection.appendChild(sharesList);

  // ── Receive Share ──
  const receiveSection = mk('div', 'pmvpn-share-section');
  receiveSection.innerHTML = '<div class="pmvpn-share-title">Receive Share</div>';

  const inviteIn = document.createElement('textarea');
  inviteIn.className = 'pmvpn-input';
  inviteIn.placeholder = 'Paste share invite JSON here...';
  inviteIn.style.minHeight = '60px';
  inviteIn.style.fontSize = '11px';

  const receiveBtn = document.createElement('button');
  receiveBtn.className = 'pmvpn-btn pmvpn-btn-primary';
  receiveBtn.textContent = 'Open Share';
  receiveBtn.addEventListener('click', handleReceive);

  receiveSection.append(inviteIn, receiveBtn);

  // ── Shared Files View ──
  const filesView = mk('div', 'pmvpn-share-files');
  filesView.style.display = 'none';

  root.append(createSection, sharesSection, receiveSection, filesView);

  // ── Handlers ──

  async function handleCreate() {
    if (!term.isConnected()) { log('connect first', 'error'); return; }
    try {
      const result = await sendShare('create', { name: nameIn.value });
      if (result.ok) {
        log(`share created: ${result.share.id.slice(0, 12)}...`, 'success');
        nameIn.value = 'Shared Files';
        refresh();
      } else {
        log(`share error: ${result.error}`, 'error');
      }
    } catch (e: any) {
      log(`share error: ${e.message}`, 'error');
    }
  }

  async function handleReceive() {
    if (!term.isConnected()) { log('connect first', 'error'); return; }
    try {
      const invite = JSON.parse(inviteIn.value);
      const shareId = invite.shareId;
      if (!shareId) { log('invalid invite — no shareId', 'error'); return; }
      showShareFiles(shareId);
    } catch {
      log('invalid invite JSON', 'error');
    }
  }

  async function refresh() {
    if (!term.isConnected()) {
      sharesList.innerHTML = '<div class="pmvpn-share-empty">not connected</div>';
      return;
    }

    try {
      const result = await sendShare('list', {});
      if (!result.ok || !result.shares) {
        sharesList.innerHTML = '<div class="pmvpn-share-empty">no shares</div>';
        return;
      }

      sharesList.innerHTML = '';
      for (const share of result.shares) {
        const item = mk('div', 'pmvpn-share-item');
        item.innerHTML = `
          <div class="pmvpn-share-name">${share.name}</div>
          <div class="pmvpn-share-meta">${share.files.length} file(s) · ${share.downloads} download(s)</div>
        `;

        const actions = mk('div', 'pmvpn-share-actions');

        // Add file button
        const addFileBtn = document.createElement('button');
        addFileBtn.className = 'pmvpn-btn-icon';
        addFileBtn.textContent = '+';
        addFileBtn.title = 'Add file';
        addFileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleAddFile(share.id);
        });

        // Get invite button
        const inviteBtn = document.createElement('button');
        inviteBtn.className = 'pmvpn-btn-icon';
        inviteBtn.textContent = '🔗';
        inviteBtn.title = 'Copy invite';
        inviteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await handleGetInvite(share.id);
        });

        // View files
        const viewBtn = document.createElement('button');
        viewBtn.className = 'pmvpn-btn-icon';
        viewBtn.textContent = '📁';
        viewBtn.title = 'View files';
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showShareFiles(share.id);
        });

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'pmvpn-btn-icon pmvpn-btn-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Delete share';
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete share "${share.name}"?`)) return;
          await sendShare('remove', { shareId: share.id });
          log(`share deleted: ${share.name}`, 'info');
          refresh();
        });

        actions.append(addFileBtn, inviteBtn, viewBtn, removeBtn);
        item.appendChild(actions);
        sharesList.appendChild(item);
      }

      if (result.shares.length === 0) {
        sharesList.innerHTML = '<div class="pmvpn-share-empty">no active shares</div>';
      }
    } catch (e: any) {
      sharesList.innerHTML = `<div class="pmvpn-share-empty">${e.message}</div>`;
    }
  }

  async function handleAddFile(shareId: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      log(`uploading ${file.name} to share...`, 'info');
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const result = await sendShare('add-file', {
        shareId,
        filename: file.name,
        data: base64,
      });
      if (result.ok) {
        log(`added ${file.name} to share`, 'success');
        refresh();
      } else {
        log(`add file failed: ${result.error}`, 'error');
      }
    });
    input.click();
  }

  async function handleGetInvite(shareId: string) {
    try {
      const result = await sendShare('invite', {
        shareId,
        host: serverHost,
        port: parseInt(serverPort),
      });
      if (result.ok) {
        const invite = JSON.stringify({
          shareId: result.shareId,
          host: serverHost,
          port: parseInt(serverPort),
          creator: walletAddress,
          message: result.message,
        }, null, 2);
        await navigator.clipboard.writeText(invite);
        log('invite copied to clipboard — send to receiver', 'success');
      } else {
        log(`invite error: ${result.error}`, 'error');
      }
    } catch (e: any) {
      log(`invite error: ${e.message}`, 'error');
    }
  }

  async function showShareFiles(shareId: string) {
    filesView.style.display = '';
    filesView.innerHTML = '<div class="pmvpn-share-loading">loading...</div>';

    try {
      const result = await sendShare('files', { shareId });
      if (!result.ok) {
        filesView.innerHTML = `<div class="pmvpn-share-empty">${result.error}</div>`;
        return;
      }

      filesView.innerHTML = '';
      const header = mk('div', 'pmvpn-share-files-header');
      header.innerHTML = `<strong>${result.share.name}</strong> · ${result.files.length} file(s)`;
      const closeBtn = document.createElement('button');
      closeBtn.className = 'pmvpn-btn-icon';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => { filesView.style.display = 'none'; });
      header.appendChild(closeBtn);
      filesView.appendChild(header);

      for (const file of result.files) {
        const row = mk('div', 'pmvpn-share-file-row');
        row.innerHTML = `
          <span class="pmvpn-file-icon">📄</span>
          <span class="pmvpn-file-name">${file.name}</span>
          <span class="pmvpn-file-size">${fmtSize(file.size)}</span>
        `;
        row.addEventListener('click', () => downloadShareFile(shareId, file.name, file.size));
        filesView.appendChild(row);
      }
    } catch (e: any) {
      filesView.innerHTML = `<div class="pmvpn-share-empty">${e.message}</div>`;
    }
  }

  async function downloadShareFile(shareId: string, filename: string, size: number) {
    log(`downloading ${filename}...`, 'info');
    try {
      const result = await sendShare('download', { shareId, filename });
      if (result.ok && result.data) {
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        log(`downloaded ${filename} (${fmtSize(size)})`, 'success');
      } else {
        log(`download failed: ${result.error}`, 'error');
      }
    } catch (e: any) {
      log(`download error: ${e.message}`, 'error');
    }
  }

  // Send share command over WebSocket
  function sendShare(cmd: string, params: Record<string, any>): Promise<any> {
    return term.sendTyped('share', cmd, params);
  }

  return { element: root, refresh };
}

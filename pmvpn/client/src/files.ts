// pmVPN Client — File Browser
// Browse, download, upload files via WebSocket SFTP commands.

import type { TerminalInstance } from './terminal';

interface FileEntry {
  name: string;
  size: number;
  modified: string;
  type: 'file' | 'directory';
  permissions: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function createFileBrowser(
  term: TerminalInstance,
  log: (msg: string, level?: string) => void,
): { element: HTMLElement; refresh: () => void } {
  let currentPath = '/';

  const root = document.createElement('div');
  root.className = 'pmvpn-files';

  // Breadcrumb
  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'pmvpn-breadcrumb';
  root.appendChild(breadcrumb);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'pmvpn-files-toolbar';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'pmvpn-btn-icon';
  refreshBtn.textContent = '↻';
  refreshBtn.title = 'Refresh';
  refreshBtn.addEventListener('click', () => loadDir(currentPath));

  const mkdirBtn = document.createElement('button');
  mkdirBtn.className = 'pmvpn-btn-icon';
  mkdirBtn.textContent = '+';
  mkdirBtn.title = 'New folder';
  mkdirBtn.addEventListener('click', handleMkdir);

  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'pmvpn-btn-icon';
  uploadBtn.textContent = '↑';
  uploadBtn.title = 'Upload file';
  uploadBtn.addEventListener('click', handleUpload);

  toolbar.append(refreshBtn, mkdirBtn, uploadBtn);
  root.appendChild(toolbar);

  // File list
  const fileList = document.createElement('div');
  fileList.className = 'pmvpn-file-list';
  root.appendChild(fileList);

  // Status
  const status = document.createElement('div');
  status.className = 'pmvpn-files-status';
  root.appendChild(status);

  // Hidden file input for uploads
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = `uploading: ${file.name}...`;
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const remotePath = currentPath === '/' ? file.name : `${currentPath}/${file.name}`;
      const result = await term.sendSftp('put', remotePath, base64);
      if (result.ok) {
        log(`uploaded: ${file.name} (${fmtSize(file.size)})`, 'success');
        loadDir(currentPath);
      } else {
        log(`upload failed: ${result.error}`, 'error');
      }
    } catch (e: any) {
      log(`upload error: ${e.message}`, 'error');
    }
    status.textContent = '';
    fileInput.value = '';
  });
  root.appendChild(fileInput);

  async function loadDir(path: string): Promise<void> {
    if (!term.isConnected()) {
      fileList.innerHTML = '<div class="pmvpn-files-empty">not connected</div>';
      return;
    }

    currentPath = path;
    fileList.innerHTML = '<div class="pmvpn-files-loading">loading...</div>';
    renderBreadcrumb();

    try {
      const result = await term.sendSftp('ls', path);
      if (!result.ok) {
        fileList.innerHTML = `<div class="pmvpn-files-empty">${result.error}</div>`;
        return;
      }

      fileList.innerHTML = '';

      // Parent directory link
      if (path !== '/' && path !== '') {
        const parentPath = path.split('/').slice(0, -1).join('/') || '/';
        const parentRow = createRow('..', '', '', 'directory', '');
        parentRow.addEventListener('click', () => loadDir(parentPath));
        fileList.appendChild(parentRow);
      }

      const entries = result.entries as FileEntry[];
      status.textContent = `${entries.length} item${entries.length !== 1 ? 's' : ''}`;

      for (const entry of entries) {
        const row = createRow(
          entry.name,
          entry.type === 'file' ? fmtSize(entry.size) : '',
          fmtDate(entry.modified),
          entry.type,
          entry.permissions,
        );

        if (entry.type === 'directory') {
          row.addEventListener('click', () => {
            const newPath = path === '/' ? entry.name : `${path}/${entry.name}`;
            loadDir(newPath);
          });
        } else {
          row.addEventListener('click', () => handleDownload(path, entry));
        }

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'pmvpn-file-action';
        delBtn.textContent = '✕';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete ${entry.name}?`)) return;
          const fullPath = path === '/' ? entry.name : `${path}/${entry.name}`;
          const result = await term.sendSftp('rm', fullPath);
          if (result.ok) {
            log(`deleted: ${entry.name}`, 'info');
            loadDir(currentPath);
          } else {
            log(`delete failed: ${result.error}`, 'error');
          }
        });
        row.appendChild(delBtn);

        fileList.appendChild(row);
      }
    } catch (e: any) {
      fileList.innerHTML = `<div class="pmvpn-files-empty">${e.message}</div>`;
    }
  }

  function createRow(name: string, size: string, modified: string, type: string, perms: string): HTMLElement {
    const row = document.createElement('div');
    row.className = `pmvpn-file-row ${type}`;
    row.innerHTML = `
      <span class="pmvpn-file-icon">${type === 'directory' ? '📁' : '📄'}</span>
      <span class="pmvpn-file-name">${name}</span>
      <span class="pmvpn-file-size">${size}</span>
      <span class="pmvpn-file-date">${modified}</span>
    `;
    return row;
  }

  function renderBreadcrumb(): void {
    const parts = currentPath.split('/').filter(Boolean);
    breadcrumb.innerHTML = '';

    const homeLink = document.createElement('span');
    homeLink.className = 'pmvpn-breadcrumb-item';
    homeLink.textContent = '~';
    homeLink.addEventListener('click', () => loadDir('/'));
    breadcrumb.appendChild(homeLink);

    let accumulated = '';
    for (const part of parts) {
      accumulated += '/' + part;
      const sep = document.createElement('span');
      sep.className = 'pmvpn-breadcrumb-sep';
      sep.textContent = '/';
      breadcrumb.appendChild(sep);

      const link = document.createElement('span');
      link.className = 'pmvpn-breadcrumb-item';
      link.textContent = part;
      const target = accumulated;
      link.addEventListener('click', () => loadDir(target));
      breadcrumb.appendChild(link);
    }
  }

  async function handleDownload(dirPath: string, entry: FileEntry): Promise<void> {
    status.textContent = `downloading: ${entry.name}...`;
    try {
      const fullPath = dirPath === '/' ? entry.name : `${dirPath}/${entry.name}`;
      const result = await term.sendSftp('get', fullPath);
      if (!result.ok) {
        log(`download failed: ${result.error}`, 'error');
        status.textContent = '';
        return;
      }

      // Decode base64 and trigger browser download
      const binary = atob(result.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);

      log(`downloaded: ${entry.name} (${fmtSize(entry.size)})`, 'success');
    } catch (e: any) {
      log(`download error: ${e.message}`, 'error');
    }
    status.textContent = '';
  }

  function handleUpload(): void {
    fileInput.click();
  }

  async function handleMkdir(): Promise<void> {
    const name = prompt('Folder name:');
    if (!name) return;
    const fullPath = currentPath === '/' ? name : `${currentPath}/${name}`;
    try {
      const result = await term.sendSftp('mkdir', fullPath);
      if (result.ok) {
        log(`created folder: ${name}`, 'success');
        loadDir(currentPath);
      } else {
        log(`mkdir failed: ${result.error}`, 'error');
      }
    } catch (e: any) {
      log(`mkdir error: ${e.message}`, 'error');
    }
  }

  function refresh(): void {
    loadDir(currentPath);
  }

  return { element: root, refresh };
}

// pmVPN Client — Terminal via WebSocket Bridge
// Connects to pmVPN server port +4 (WS Bridge).
// Auth payload sent as first message. Shell I/O follows.

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  mount: (el: HTMLElement) => void;
  connectWs: (url: string, authPayload: string, onAuth: (ok: boolean, user?: string, error?: string) => void) => void;
  sendSftp: (cmd: string, path: string, data?: string) => Promise<any>;
  disconnect: () => void;
  destroy: () => void;
  isConnected: () => boolean;
}

export function createTerminal(): TerminalInstance {
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    allowTransparency: true,
    theme: {
      background: 'rgba(0, 0, 0, 0)',
      foreground: '#33ff33',
      cursor: '#33ff33',
      cursorAccent: '#000000',
      selectionBackground: '#1a4a1a',
      selectionForeground: '#66ff66',
      black: '#0a0a0a',
      red: '#ff4444',
      green: '#33ff33',
      yellow: '#ffff33',
      blue: '#3399ff',
      magenta: '#ff33ff',
      cyan: '#33ffff',
      white: '#cccccc',
      brightBlack: '#555555',
      brightRed: '#ff6666',
      brightGreen: '#66ff66',
      brightYellow: '#ffff66',
      brightBlue: '#66bbff',
      brightMagenta: '#ff66ff',
      brightCyan: '#66ffff',
      brightWhite: '#ffffff',
    },
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  let ws: WebSocket | null = null;
  let sftpId = 0;
  const sftpCallbacks = new Map<number, (result: any) => void>();

  function mount(el: HTMLElement): void {
    terminal.open(el);
    requestAnimationFrame(() => fitAddon.fit());
    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      // Send resize to server
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'shell',
          resize: true,
          cols: terminal.cols,
          rows: terminal.rows,
        }));
      }
    });
    observer.observe(el);
  }

  function connectWs(
    url: string,
    authPayload: string,
    onAuth: (ok: boolean, user?: string, error?: string) => void,
  ): void {
    disconnect();
    ws = new WebSocket(url);

    ws.onopen = () => {
      // Send auth as first message
      const payload = JSON.parse(authPayload);
      ws!.send(JSON.stringify({ type: 'auth', payload }));
    };

    ws.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'auth') {
        if (msg.ok) {
          onAuth(true, msg.user);
          // Terminal input → server
          terminal.onData((data) => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'shell', data }));
            }
          });
          // Send initial size
          ws!.send(JSON.stringify({
            type: 'shell',
            cols: terminal.cols,
            rows: terminal.rows,
          }));
        } else {
          onAuth(false, undefined, msg.error);
          disconnect();
        }
        return;
      }

      if (msg.type === 'shell' && msg.data) {
        terminal.write(msg.data);
        return;
      }

      if ((msg.type === 'sftp' || msg.type === 'share') && msg.id !== undefined) {
        const cb = sftpCallbacks.get(msg.id);
        if (cb) {
          sftpCallbacks.delete(msg.id);
          cb(msg.result);
        }
        return;
      }
    };

    ws.onclose = () => {
      terminal.writeln('\r\n\x1b[33mdisconnected\x1b[0m');
      ws = null;
    };

    ws.onerror = () => {
      terminal.writeln('\r\n\x1b[31mconnection error\x1b[0m');
    };
  }

  function sendSftp(cmd: string, path: string, data?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'));
        return;
      }
      const id = ++sftpId;
      const timeout = setTimeout(() => {
        sftpCallbacks.delete(id);
        reject(new Error('sftp timeout'));
      }, 30000);

      sftpCallbacks.set(id, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });

      const msg: any = { type: 'sftp', id, cmd, path };
      if (data !== undefined) msg.data = data;
      ws.send(JSON.stringify(msg));
    });
  }

  function disconnect(): void {
    if (ws) { ws.close(); ws = null; }
    sftpCallbacks.clear();
  }

  function destroy(): void {
    disconnect();
    terminal.dispose();
  }

  /**
   * Send any typed message over WebSocket and wait for response by id.
   */
  function sendTyped(type: string, cmd: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'));
        return;
      }
      const id = ++sftpId;
      const timeout = setTimeout(() => {
        sftpCallbacks.delete(id);
        reject(new Error('timeout'));
      }, 30000);

      // Register callback — works for any type that returns { id, result }
      sftpCallbacks.set(id, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });

      ws.send(JSON.stringify({ type, id, cmd, ...params }));
    });
  }

  function isConnected(): boolean {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  return { terminal, fitAddon, mount, connectWs, sendSftp, sendTyped, disconnect, destroy, isConnected };
}

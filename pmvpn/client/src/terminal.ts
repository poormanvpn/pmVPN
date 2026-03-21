// pmVPN Client — Terminal via WebSocket bridge
// xterm.js terminal connected to the server's WebSocket terminal bridge

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket | null;
  mount: (el: HTMLElement) => void;
  connect: (url: string) => void;
  disconnect: () => void;
  destroy: () => void;
}

export function createTerminal(): TerminalInstance {
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', monospace",
    theme: {
      // Tokyo Night — matching gnugui token palette
      background: '#1a1b26',
      foreground: '#a9b1d6',
      cursor: '#c0caf5',
      cursorAccent: '#1a1b26',
      selectionBackground: '#33467c',
      selectionForeground: '#c0caf5',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5',
    },
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  let ws: WebSocket | null = null;

  function mount(el: HTMLElement): void {
    terminal.open(el);
    requestAnimationFrame(() => fitAddon.fit());

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(el);
  }

  function connect(url: string): void {
    disconnect();
    ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      terminal.writeln('\x1b[32mConnected.\x1b[0m\r\n');
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        terminal.write(event.data);
      } else {
        terminal.write(new Uint8Array(event.data));
      }
    };

    ws.onclose = () => {
      terminal.writeln('\r\n\x1b[33mDisconnected.\x1b[0m');
      ws = null;
    };

    ws.onerror = () => {
      terminal.writeln('\r\n\x1b[31mConnection error.\x1b[0m');
    };

    terminal.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  function disconnect(): void {
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  function destroy(): void {
    disconnect();
    terminal.dispose();
  }

  return { terminal, fitAddon, ws, mount, connect, disconnect, destroy };
}

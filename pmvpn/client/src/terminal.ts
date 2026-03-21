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
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      cursorAccent: '#0d1117',
      selectionBackground: '#264f78',
      selectionForeground: '#ffffff',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39d353',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d364',
      brightWhite: '#f0f6fc',
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

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
    allowTransparency: true,
    theme: {
      // Classic Linux terminal — green on black
      background: 'rgba(0, 0, 0, 0)',  // transparent — container provides bg
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

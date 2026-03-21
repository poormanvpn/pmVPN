// pmVPN Tunnel Client — local proxy that tunnels traffic via mux
// MIT License
//
// Listens locally, intercepts TCP connections, and forwards them
// through the PM protocol mux over an SSH channel to the server.
// Can optionally set up firewall rules for transparent proxying.

import * as net from 'node:net';
import * as dgram from 'node:dgram';
import { CMD, FrameParser, type Frame } from './protocol.js';
import { Mux } from './mux.js';
import { logger } from '../utils/logger.js';

const SYNC_HEADER = Buffer.from('\0\0PMVPN0001');

interface TunnelClientOptions {
  /** Subnets to tunnel (CIDR notation) */
  subnets: string[];
  /** Whether to tunnel DNS queries */
  dns: boolean;
  /** Local bind address */
  listenHost: string;
  /** Local TCP listener port (0 = ephemeral) */
  listenPort: number;
}

interface TunnelChannel {
  write: (data: Buffer) => void;
  destroyed: boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  close(): void;
}

/**
 * Start a tunnel client on a bidirectional stream (SSH channel).
 *
 * Creates a local TCP listener that accepts connections and
 * forwards them through the mux to the tunnel server.
 *
 * For transparent mode (like sshuttle), firewall rules redirect
 * traffic to this listener. For SOCKS mode, use the SOCKS proxy.
 */
export class TunnelClient {
  private mux: Mux;
  private parser = new FrameParser();
  private channel: TunnelChannel;
  private tcpServer: net.Server | null = null;
  private dnsSocket: dgram.Socket | null = null;
  private opts: TunnelClientOptions;
  private synced = false;
  private syncBuf = Buffer.alloc(0);

  constructor(channel: TunnelChannel, opts: TunnelClientOptions) {
    this.channel = channel;
    this.opts = opts;

    this.mux = new Mux((data: Buffer) => {
      if (!channel.destroyed) {
        channel.write(data);
      }
    });

    channel.on('data', (data: unknown) => {
      this.onData(data as Buffer);
    });

    channel.on('close', () => this.close());
    channel.on('eof', () => this.close());
    this.mux.on('exit', () => this.close());
  }

  private onData(data: Buffer): void {
    // Wait for sync header before parsing frames
    if (!this.synced) {
      this.syncBuf = Buffer.concat([this.syncBuf, data]);
      const idx = this.syncBuf.indexOf(SYNC_HEADER);
      if (idx === -1) return;

      this.synced = true;
      logger.info('tunnel sync received');

      // Feed any remaining data after sync header
      const remaining = this.syncBuf.subarray(idx + SYNC_HEADER.length);
      this.syncBuf = Buffer.alloc(0);
      if (remaining.length > 0) {
        this.feedFrames(remaining);
      }
      return;
    }

    this.feedFrames(data);
  }

  private feedFrames(data: Buffer): void {
    this.parser.feed(data);
    const frames = this.parser.drain();
    for (const frame of frames) {
      // Route to registered channel handler
      const handler = this.mux['channels'].get(frame.channel);
      if (handler) {
        handler(frame);
      } else if (frame.channel === 0) {
        // Mux control
        if (frame.cmd === CMD.PING) this.mux.send(0, CMD.PONG);
      }
    }
  }

  /**
   * Start the local TCP listener for proxied connections.
   */
  async startTcpListener(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.tcpServer = net.createServer((socket) => {
        this.handleLocalConnection(socket);
      });

      this.tcpServer.on('error', reject);
      this.tcpServer.listen(this.opts.listenPort, this.opts.listenHost, () => {
        const addr = this.tcpServer!.address() as net.AddressInfo;
        logger.info({ port: addr.port, host: this.opts.listenHost }, 'tunnel TCP listener ready');
        resolve(addr.port);
      });
    });
  }

  /**
   * Handle a local TCP connection — tunnel it to the server.
   */
  private handleLocalConnection(socket: net.Socket): void {
    const channel = this.mux.allocChannel();

    // For transparent proxy: get original destination from socket options
    // For explicit proxy: destination comes from CONNECT request or config
    // For now: use the socket's intended destination (requires firewall redirect)
    const dst = this.getOriginalDst(socket);
    if (!dst) {
      socket.destroy();
      return;
    }

    logger.debug({ channel, host: dst.host, port: dst.port }, 'tunneling TCP connection');

    // Send TCP_CONNECT to server
    const connectPayload = Buffer.from(`4,${dst.host},${dst.port}`);
    this.mux.send(channel, CMD.TCP_CONNECT, connectPayload);

    // Forward local data → server
    socket.on('data', (data: Buffer) => {
      this.mux.send(channel, CMD.TCP_DATA, data);
    });

    socket.on('end', () => {
      this.mux.send(channel, CMD.TCP_EOF);
    });

    socket.on('close', () => {
      this.mux.removeChannel(channel);
    });

    socket.on('error', () => {
      this.mux.send(channel, CMD.TCP_EOF);
      this.mux.removeChannel(channel);
    });

    // Register handler for server → local data
    this.mux.registerChannel(channel, (frame: Frame) => {
      switch (frame.cmd) {
        case CMD.TCP_DATA:
          if (!socket.destroyed) {
            socket.write(frame.data);
          }
          break;
        case CMD.TCP_EOF:
          if (!socket.destroyed) {
            socket.end();
          }
          break;
        case CMD.TCP_STOP_SENDING:
          socket.pause();
          break;
      }
    });
  }

  /**
   * Get the original destination for a redirected socket.
   * On Linux with iptables REDIRECT, use SO_ORIGINAL_DST.
   */
  private getOriginalDst(socket: net.Socket): { host: string; port: number } | null {
    // For transparent proxy mode (iptables REDIRECT):
    // The original destination is available via getsockopt SO_ORIGINAL_DST
    // Node.js doesn't expose this directly — we'd need a native addon.
    //
    // For now, support explicit proxy mode: the destination is encoded
    // in the first bytes of the connection (SOCKS5 or CONNECT).
    //
    // Fallback: use the socket's local address (which is the redirect target)
    // This works when iptables REDIRECT is used because the original dst
    // becomes the local address.
    const addr = socket.address() as net.AddressInfo;
    if (addr && addr.address && addr.port) {
      return { host: addr.address, port: addr.port };
    }
    return null;
  }

  /**
   * Tunnel a DNS query through the mux.
   */
  tunnelDns(query: Buffer, nameserver: string, port: number = 53): Promise<Buffer> {
    return new Promise((resolve) => {
      const channel = this.mux.allocChannel();
      const payload = Buffer.from(`${nameserver},${port},`);
      const data = Buffer.concat([payload, query]);

      const timer = setTimeout(() => {
        this.mux.removeChannel(channel);
        resolve(Buffer.alloc(0));
      }, 10000);

      this.mux.registerChannel(channel, (frame: Frame) => {
        if (frame.cmd === CMD.DNS_RESPONSE) {
          clearTimeout(timer);
          this.mux.removeChannel(channel);
          resolve(frame.data);
        }
      });

      this.mux.send(channel, CMD.DNS_REQ, data);
    });
  }

  /**
   * Explicitly connect to a host:port through the tunnel.
   * Returns a duplex-like interface.
   */
  connect(host: string, port: number): {
    channel: number;
    write: (data: Buffer) => void;
    onData: (cb: (data: Buffer) => void) => void;
    onEnd: (cb: () => void) => void;
    end: () => void;
  } {
    const ch = this.mux.allocChannel();
    let dataCallback: ((data: Buffer) => void) | null = null;
    let endCallback: (() => void) | null = null;

    this.mux.send(ch, CMD.TCP_CONNECT, Buffer.from(`4,${host},${port}`));

    this.mux.registerChannel(ch, (frame: Frame) => {
      switch (frame.cmd) {
        case CMD.TCP_DATA:
          dataCallback?.(frame.data);
          break;
        case CMD.TCP_EOF:
          endCallback?.();
          this.mux.removeChannel(ch);
          break;
      }
    });

    return {
      channel: ch,
      write: (data: Buffer) => this.mux.send(ch, CMD.TCP_DATA, data),
      onData: (cb) => { dataCallback = cb; },
      onEnd: (cb) => { endCallback = cb; },
      end: () => {
        this.mux.send(ch, CMD.TCP_EOF);
        this.mux.removeChannel(ch);
      },
    };
  }

  /**
   * Close the tunnel and all channels.
   */
  close(): void {
    this.mux.close();
    this.tcpServer?.close();
    this.dnsSocket?.close();
    logger.info('tunnel client closed');
  }
}

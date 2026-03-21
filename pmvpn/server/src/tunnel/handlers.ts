// pmVPN Tunnel Handlers — TCP proxy, UDP relay, DNS forwarder
// MIT License
//
// Each handler manages one multiplexed channel.
// Inspired by sshuttle server.py handlers.

import * as net from 'node:net';
import * as dgram from 'node:dgram';
import { CMD, type Frame } from './protocol.js';
import type { Mux } from './mux.js';
import { logger } from '../utils/logger.js';

/**
 * Parse a TCP_CONNECT payload: "family,host,port"
 */
function parseTcpConnect(data: Buffer): { family: number; host: string; port: number } | null {
  const str = data.toString('utf-8');
  const parts = str.split(',');
  if (parts.length < 3) return null;

  const family = parts[0] === '6' || parts[0] === 'AF_INET6' ? 6 : 4;
  const host = parts[1];
  const port = parseInt(parts[2], 10);

  if (!host || isNaN(port) || port < 1 || port > 65535) return null;
  return { family, host, port };
}

/**
 * Handle a TCP_CONNECT request — opens a real TCP connection
 * and bridges data through the mux channel.
 */
export function handleTcpConnect(mux: Mux, frame: Frame): void {
  const channel = frame.channel;
  const target = parseTcpConnect(frame.data);

  if (!target) {
    logger.warn({ channel }, 'invalid TCP_CONNECT payload');
    mux.send(channel, CMD.TCP_EOF);
    return;
  }

  logger.debug({ channel, host: target.host, port: target.port }, 'TCP connect');

  const socket = new net.Socket();
  let connected = false;
  let remoteEof = false;

  // Timeout for connection attempt
  socket.setTimeout(15000);

  socket.connect(target.port, target.host, () => {
    connected = true;
    socket.setTimeout(0); // Clear connect timeout
    logger.debug({ channel, host: target.host, port: target.port }, 'TCP connected');
  });

  // Data from remote → send to client via mux
  socket.on('data', (data: Buffer) => {
    mux.send(channel, CMD.TCP_DATA, data);
  });

  socket.on('end', () => {
    mux.send(channel, CMD.TCP_EOF);
  });

  socket.on('close', () => {
    mux.removeChannel(channel);
  });

  socket.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
      logger.debug({ channel, err: err.message }, 'TCP socket error');
    }
    mux.send(channel, CMD.TCP_EOF);
    mux.removeChannel(channel);
  });

  socket.on('timeout', () => {
    logger.debug({ channel }, 'TCP connect timeout');
    socket.destroy();
    mux.send(channel, CMD.TCP_EOF);
    mux.removeChannel(channel);
  });

  // Register channel handler for data from client → remote
  mux.registerChannel(channel, (f: Frame) => {
    switch (f.cmd) {
      case CMD.TCP_DATA:
        if (connected && !socket.destroyed) {
          socket.write(f.data);
        }
        break;
      case CMD.TCP_EOF:
        remoteEof = true;
        if (!socket.destroyed) {
          socket.end();
        }
        break;
      case CMD.TCP_STOP_SENDING:
        socket.pause();
        break;
      case CMD.EXIT:
        socket.destroy();
        mux.removeChannel(channel);
        break;
    }
  });
}

/**
 * Handle UDP_OPEN — create a UDP socket for relaying datagrams.
 */
export function handleUdpOpen(mux: Mux, frame: Frame): void {
  const channel = frame.channel;
  const socket = dgram.createSocket('udp4');
  let lastActivity = Date.now();

  socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    lastActivity = Date.now();
    // Encode: "host,port," + raw data
    const header = Buffer.from(`${rinfo.address},${rinfo.port},`);
    mux.send(channel, CMD.UDP_DATA, Buffer.concat([header, msg]));
  });

  socket.on('error', (err) => {
    logger.debug({ channel, err: err.message }, 'UDP socket error');
    socket.close();
    mux.send(channel, CMD.UDP_CLOSE);
    mux.removeChannel(channel);
  });

  socket.bind(0); // Bind to ephemeral port

  // Inactivity timeout (30s)
  const timer = setInterval(() => {
    if (Date.now() - lastActivity > 30000) {
      socket.close();
      mux.send(channel, CMD.UDP_CLOSE);
      mux.removeChannel(channel);
      clearInterval(timer);
    }
  }, 10000);

  mux.registerChannel(channel, (f: Frame) => {
    lastActivity = Date.now();
    switch (f.cmd) {
      case CMD.UDP_DATA: {
        // Parse: "host,port," + raw data
        const str = f.data.toString('utf-8');
        const firstComma = str.indexOf(',');
        const secondComma = str.indexOf(',', firstComma + 1);
        if (firstComma === -1 || secondComma === -1) break;

        const host = str.slice(0, firstComma);
        const port = parseInt(str.slice(firstComma + 1, secondComma), 10);
        const payload = f.data.subarray(secondComma + 1);

        if (host && port > 0 && port <= 65535) {
          socket.send(payload, port, host);
        }
        break;
      }
      case CMD.UDP_CLOSE:
        socket.close();
        mux.removeChannel(channel);
        clearInterval(timer);
        break;
    }
  });
}

/**
 * Handle DNS_REQ — forward DNS query to system resolver.
 */
export function handleDnsReq(mux: Mux, frame: Frame): void {
  const channel = frame.channel;

  // Parse: "nameserver,port," + raw DNS query
  const str = frame.data.toString('utf-8');
  const firstComma = str.indexOf(',');
  const secondComma = str.indexOf(',', firstComma + 1);

  let nameserver = '127.0.0.53'; // systemd-resolved default
  let port = 53;
  let query: Buffer;

  if (firstComma !== -1 && secondComma !== -1) {
    nameserver = str.slice(0, firstComma) || nameserver;
    port = parseInt(str.slice(firstComma + 1, secondComma), 10) || 53;
    query = frame.data.subarray(secondComma + 1);
  } else {
    query = frame.data;
  }

  const socket = dgram.createSocket('udp4');

  socket.on('message', (msg: Buffer) => {
    mux.send(channel, CMD.DNS_RESPONSE, msg);
    socket.close();
  });

  socket.on('error', () => {
    mux.send(channel, CMD.DNS_RESPONSE, Buffer.alloc(0));
    socket.close();
  });

  // Timeout: 10 seconds
  const timer = setTimeout(() => {
    mux.send(channel, CMD.DNS_RESPONSE, Buffer.alloc(0));
    socket.close();
  }, 10000);

  socket.send(query, port, nameserver, () => {
    // Sent — wait for response
  });

  socket.on('close', () => {
    clearTimeout(timer);
  });
}

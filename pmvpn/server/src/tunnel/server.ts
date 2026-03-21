// pmVPN Tunnel Server — multiplexed VPN over SSH channel
// MIT License
//
// Runs inside an SSH session. The SSH channel becomes the transport
// for multiplexed TCP/UDP/DNS connections. Client sends connect
// requests, server opens real sockets and bridges data.

import { CMD, type Frame, FrameParser, encodeFrame, type CmdType } from './protocol.js';
import { handleTcpConnect, handleUdpOpen, handleDnsReq } from './handlers.js';
import { Mux } from './mux.js';
import { logger } from '../utils/logger.js';

// Sync header — client must verify before starting
const SYNC_HEADER = Buffer.from('\0\0PMVPN0001');

interface TunnelChannel {
  write: (data: Buffer) => void;
  destroyed: boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners(event?: string): void;
  close(): void;
}

/**
 * Start a tunnel server on a bidirectional stream (SSH channel).
 *
 * Protocol:
 *   1. Server sends SYNC_HEADER
 *   2. Client sends PM-framed commands (TCP_CONNECT, UDP_OPEN, DNS_REQ)
 *   3. Server opens real connections, bridges data via PM frames
 *   4. Bidirectional until EXIT or channel close
 *
 * Returns a cleanup function.
 */
export function startTunnelServer(
  channel: TunnelChannel,
  username: string,
): () => void {
  logger.info({ user: username }, 'tunnel server starting');

  // Send sync header so client knows we're ready
  channel.write(SYNC_HEADER);

  // Create multiplexer — writes frames to SSH channel
  const mux = new Mux((data: Buffer) => {
    if (!channel.destroyed) {
      channel.write(data);
    }
  });

  // Frame parser for incoming data
  const parser = new FrameParser();

  channel.on('data', (data: unknown) => {
    parser.feed(data as Buffer);
    const frames = parser.drain();

    for (const frame of frames) {
      dispatch(frame);
    }
  });

  function dispatch(frame: Frame): void {
    // Mux control (channel 0)
    if (frame.channel === 0) {
      switch (frame.cmd) {
        case CMD.PING:
          mux.send(0, CMD.PONG);
          break;
        case CMD.EXIT:
          cleanup();
          break;
      }
      return;
    }

    // Check if channel already has a handler
    const existing = mux['channels'].get(frame.channel);
    if (existing) {
      existing(frame);
      return;
    }

    // New channel — route by command type
    switch (frame.cmd) {
      case CMD.TCP_CONNECT:
        handleTcpConnect(mux, frame);
        break;
      case CMD.UDP_OPEN:
        handleUdpOpen(mux, frame);
        break;
      case CMD.DNS_REQ:
        handleDnsReq(mux, frame);
        break;
      default:
        logger.debug(
          { channel: frame.channel, cmd: frame.cmd },
          'unknown command on new channel'
        );
    }
  }

  // Cleanup
  let closed = false;
  function cleanup(): void {
    if (closed) return;
    closed = true;
    logger.info({ user: username, channels: mux.channelCount }, 'tunnel server closing');
    mux.close();
    if (!channel.destroyed) {
      channel.close();
    }
  }

  channel.on('close', () => cleanup());
  channel.on('eof', () => cleanup());
  mux.on('exit', () => cleanup());

  logger.info({ user: username }, 'tunnel server ready');
  return cleanup;
}

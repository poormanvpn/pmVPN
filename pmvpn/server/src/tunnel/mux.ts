// pmVPN Multiplexer — routes frames to channel handlers
// MIT License
//
// Multiplexes multiple TCP/UDP/DNS streams over a single
// SSH channel using the PM binary protocol.

import { EventEmitter } from 'node:events';
import { CMD, encodeFrame, FrameParser, type Frame, type CmdType, CMD_NAMES } from './protocol.js';
import { logger } from '../utils/logger.js';

const FLOW_CONTROL_THRESHOLD = 32768; // 32KB buffer before flow control kicks in

export type ChannelHandler = (frame: Frame) => void;

/**
 * Multiplexer — manages channels over a single bidirectional stream.
 *
 * Usage:
 *   const mux = new Mux(writeFn);
 *   mux.onFrame(incomingData);  // feed incoming bytes
 *   mux.send(channel, CMD.TCP_DATA, payload);  // send outbound
 */
export class Mux extends EventEmitter {
  private channels = new Map<number, ChannelHandler>();
  private parser = new FrameParser();
  private nextChannel = 1;
  private outbufSize = 0;
  private waitingPong = false;
  private writeFn: (data: Buffer) => void;

  constructor(writeFn: (data: Buffer) => void) {
    super();
    this.writeFn = writeFn;
  }

  /**
   * Allocate a new channel ID.
   */
  allocChannel(): number {
    const ch = this.nextChannel;
    this.nextChannel = (this.nextChannel + 1) & 0xFFFF;
    if (this.nextChannel === 0) this.nextChannel = 1; // 0 reserved for mux control
    return ch;
  }

  /**
   * Register a handler for a channel.
   */
  registerChannel(channel: number, handler: ChannelHandler): void {
    this.channels.set(channel, handler);
  }

  /**
   * Remove a channel handler.
   */
  removeChannel(channel: number): void {
    this.channels.delete(channel);
  }

  /**
   * Send a frame to the remote side.
   */
  send(channel: number, cmd: CmdType, data: Buffer = Buffer.alloc(0)): void {
    const frame = encodeFrame({ channel, cmd, data });
    this.outbufSize += frame.length;
    this.writeFn(frame);

    // Flow control: if buffer is large, send PING and wait
    if (this.outbufSize > FLOW_CONTROL_THRESHOLD && !this.waitingPong) {
      this.waitingPong = true;
      const pingFrame = encodeFrame({ channel: 0, cmd: CMD.PING, data: Buffer.alloc(0) });
      this.writeFn(pingFrame);
    }
  }

  /**
   * Feed incoming raw bytes into the parser and dispatch frames.
   */
  onData(data: Buffer): void {
    this.parser.feed(data);
    const frames = this.parser.drain();

    for (const frame of frames) {
      // Mux-level control messages (channel 0)
      if (frame.channel === 0) {
        this.handleControl(frame);
        continue;
      }

      const handler = this.channels.get(frame.channel);
      if (handler) {
        handler(frame);
      } else if (frame.cmd === CMD.TCP_CONNECT) {
        // New inbound connection request — emit for server to handle
        this.emit('connect', frame);
      } else {
        logger.debug(
          { channel: frame.channel, cmd: CMD_NAMES[frame.cmd] },
          'frame for unknown channel'
        );
      }
    }
  }

  private handleControl(frame: Frame): void {
    switch (frame.cmd) {
      case CMD.PING:
        this.send(0, CMD.PONG);
        break;
      case CMD.PONG:
        this.outbufSize = 0;
        this.waitingPong = false;
        break;
      case CMD.EXIT:
        this.emit('exit');
        break;
      default:
        logger.debug({ cmd: CMD_NAMES[frame.cmd] }, 'unknown mux control command');
    }
  }

  /**
   * Get active channel count.
   */
  get channelCount(): number {
    return this.channels.size;
  }

  /**
   * Close all channels and signal exit.
   */
  close(): void {
    this.send(0, CMD.EXIT);
    this.channels.clear();
  }
}

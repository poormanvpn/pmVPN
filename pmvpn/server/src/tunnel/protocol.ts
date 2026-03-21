// pmVPN Tunnel Protocol — binary multiplexing over SSH
// MIT License
//
// Inspired by sshuttle's ssnet.py protocol.
// Reimplemented in TypeScript for production use.
//
// Frame format (8 bytes header + variable payload):
//   "PM" (2 bytes magic)
//   channel_id (uint16 BE)
//   command (uint16 BE)
//   data_length (uint16 BE)
//   payload (0..65535 bytes)

// --- Commands ---

export const CMD = {
  EXIT: 0,             // Shutdown channel or mux
  PING: 1,             // Flow control: request PONG
  PONG: 2,             // Flow control: acknowledge PING
  TCP_CONNECT: 3,      // Client → Server: open TCP connection
  TCP_STOP_SENDING: 4, // Flow control: pause
  TCP_EOF: 5,          // End of stream (half-close)
  TCP_DATA: 6,         // Bidirectional: payload data
  UDP_OPEN: 7,         // Open UDP channel
  UDP_DATA: 8,         // UDP datagram
  UDP_CLOSE: 9,        // Close UDP channel
  DNS_REQ: 10,         // DNS query
  DNS_RESPONSE: 11,    // DNS response
  ROUTES: 12,          // Server → Client: available routes
  HOST_REQ: 13,        // Request host resolution
  HOST_LIST: 14,       // Host resolution results
} as const;

export type CmdType = typeof CMD[keyof typeof CMD];

export const CMD_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CMD).map(([k, v]) => [v, k])
);

// --- Magic bytes ---
const MAGIC = Buffer.from('PM');
const HEADER_SIZE = 8;
const MAX_PAYLOAD = 65535;

// --- Frame ---

export interface Frame {
  channel: number;   // uint16
  cmd: CmdType;      // uint16
  data: Buffer;      // 0..65535 bytes
}

/**
 * Encode a frame into a Buffer for transmission.
 */
export function encodeFrame(frame: Frame): Buffer {
  const len = frame.data.length;
  if (len > MAX_PAYLOAD) {
    throw new Error(`payload too large: ${len} > ${MAX_PAYLOAD}`);
  }

  const buf = Buffer.allocUnsafe(HEADER_SIZE + len);
  buf[0] = 0x50; // 'P'
  buf[1] = 0x4D; // 'M'
  buf.writeUInt16BE(frame.channel, 2);
  buf.writeUInt16BE(frame.cmd, 4);
  buf.writeUInt16BE(len, 6);
  if (len > 0) {
    frame.data.copy(buf, HEADER_SIZE);
  }
  return buf;
}

/**
 * Frame parser — accumulates bytes and yields complete frames.
 * Call feed() with incoming data, check frames array for results.
 */
export class FrameParser {
  private buf: Buffer = Buffer.alloc(0);
  public frames: Frame[] = [];

  /**
   * Feed raw bytes into the parser. Parsed frames accumulate in this.frames.
   */
  feed(data: Buffer): void {
    this.buf = Buffer.concat([this.buf, data]);

    while (this.buf.length >= HEADER_SIZE) {
      // Verify magic
      if (this.buf[0] !== 0x50 || this.buf[1] !== 0x4D) {
        // Scan for next magic bytes (resync)
        let found = -1;
        for (let i = 1; i < this.buf.length - 1; i++) {
          if (this.buf[i] === 0x50 && this.buf[i + 1] === 0x4D) {
            found = i;
            break;
          }
        }
        if (found === -1) {
          // Keep last byte (might be start of magic)
          this.buf = this.buf.subarray(this.buf.length - 1);
          return;
        }
        this.buf = this.buf.subarray(found);
        continue;
      }

      const dataLen = this.buf.readUInt16BE(6);
      const totalLen = HEADER_SIZE + dataLen;

      if (this.buf.length < totalLen) {
        return; // Need more data
      }

      const frame: Frame = {
        channel: this.buf.readUInt16BE(2),
        cmd: this.buf.readUInt16BE(4) as CmdType,
        data: Buffer.from(this.buf.subarray(HEADER_SIZE, totalLen)),
      };

      this.frames.push(frame);
      this.buf = this.buf.subarray(totalLen);
    }
  }

  /**
   * Drain all parsed frames.
   */
  drain(): Frame[] {
    const result = this.frames;
    this.frames = [];
    return result;
  }
}

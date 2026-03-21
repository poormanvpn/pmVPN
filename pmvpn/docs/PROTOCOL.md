# PM Tunnel Protocol Specification

*Binary multiplexing protocol for TCP/UDP/DNS over SSH*

Updated: 2026-03-20 | Version: 0.1.0

---

## Overview

The PM protocol multiplexes multiple network streams over a single SSH channel. Each stream gets a unique 16-bit channel ID. All data is framed with 8-byte headers for efficient parsing.

Inspired by sshuttle's ssnet.py protocol. Reimplemented in TypeScript for production use within pmVPN.

---

## Wire Format

### Frame Structure

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|     'P' (0x50)| 'M' (0x4D)   |        Channel ID             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        Command                |        Data Length            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                        Payload Data                           |
|                    (0 to 65535 bytes)                          |
+---------------------------------------------------------------+
```

- **Magic** (2 bytes): `0x50 0x4D` ("PM") — identifies PM protocol frames
- **Channel ID** (uint16 BE): Logical stream identifier. Channel 0 is reserved for mux control
- **Command** (uint16 BE): Operation code (see Command Table)
- **Data Length** (uint16 BE): Payload size in bytes (0–65535)
- **Payload**: Variable-length data specific to the command

### Byte Order

All multi-byte integers are **big-endian** (network byte order).

### Maximum Frame Size

Header (8 bytes) + Payload (65535 bytes) = **65543 bytes** maximum.

---

## Sync Header

Before PM protocol frames begin, the server sends a sync header:

```
\0\0PMVPN0001
```

This 12-byte sequence signals protocol readiness. The client must verify this header before sending any frames. Bytes before the sync header are discarded.

---

## Commands

### Mux Control (Channel 0)

| Code | Name | Payload | Description |
|------|------|---------|-------------|
| 0 | EXIT | (none) | Shutdown the entire mux. All channels closed. |
| 1 | PING | (none) | Flow control: request acknowledgment |
| 2 | PONG | (none) | Flow control: acknowledge PING |

### TCP Streams

| Code | Name | Direction | Payload | Description |
|------|------|-----------|---------|-------------|
| 3 | TCP_CONNECT | C→S | `"<family>,<host>,<port>"` | Request TCP connection to destination |
| 4 | TCP_STOP_SENDING | Both | (none) | Pause data flow (backpressure) |
| 5 | TCP_EOF | Both | (none) | Half-close: no more data from sender |
| 6 | TCP_DATA | Both | Raw bytes | Bidirectional payload data |

**TCP_CONNECT payload format:**
```
<family>,<host>,<port>
```
- `family`: `4` or `AF_INET` for IPv4, `6` or `AF_INET6` for IPv6
- `host`: IP address or hostname
- `port`: Destination port (1–65535)

Example: `4,10.0.0.5,443`

### UDP Datagrams

| Code | Name | Direction | Payload | Description |
|------|------|-----------|---------|-------------|
| 7 | UDP_OPEN | C→S | (none) | Open UDP relay on new channel |
| 8 | UDP_DATA | Both | `"<host>,<port>,"` + raw data | UDP datagram with addressing |
| 9 | UDP_CLOSE | Both | (none) | Close UDP relay |

**UDP_DATA payload format:**
```
<host>,<port>,<raw_datagram_bytes>
```

UDP channels timeout after **30 seconds** of inactivity.

### DNS Queries

| Code | Name | Direction | Payload | Description |
|------|------|-----------|---------|-------------|
| 10 | DNS_REQ | C→S | `"<nameserver>,<port>,"` + raw DNS query | Forward DNS query |
| 11 | DNS_RESPONSE | S→C | Raw DNS response | DNS answer |

DNS requests timeout after **10 seconds**.

---

## Flow Control

The mux implements latency-based flow control to prevent memory exhaustion:

1. Sender tracks cumulative output buffer size
2. When buffer exceeds **32KB** (`FLOW_CONTROL_THRESHOLD`):
   - Sender emits `PING` on channel 0
   - Sender continues writing but marks itself as "waiting"
3. When receiver processes `PING`:
   - Receiver replies with `PONG` on channel 0
4. When sender receives `PONG`:
   - Buffer counter resets to 0
   - "Waiting" flag cleared

This prevents unbounded memory growth when one side produces data faster than the other can consume it.

---

## Channel Lifecycle

### TCP Connection

```
Client                          Server
──────                          ──────
TCP_CONNECT (ch=42)  ──────►   Open socket to host:port
                                Register handler for ch=42
TCP_DATA (ch=42)     ──────►   Write to socket
                     ◄──────   TCP_DATA (ch=42) from socket
TCP_EOF (ch=42)      ──────►   Half-close socket write
                     ◄──────   TCP_EOF (ch=42) socket read done
                                Cleanup ch=42
```

### UDP Relay

```
Client                          Server
──────                          ──────
UDP_OPEN (ch=50)     ──────►   Bind ephemeral UDP socket
UDP_DATA (ch=50)     ──────►   Send datagram to dest
                     ◄──────   UDP_DATA (ch=50) response
                                ... (30s inactivity timeout)
UDP_CLOSE (ch=50)    ──────►   Close socket
```

### DNS Query

```
Client                          Server
──────                          ──────
DNS_REQ (ch=60)      ──────►   Forward to nameserver
                     ◄──────   DNS_RESPONSE (ch=60)
                                Channel auto-closed
```

---

## Error Handling

- If a TCP connection fails, the server sends `TCP_EOF` on that channel
- If a socket error occurs mid-stream, the handler sends `TCP_EOF` and deregisters the channel
- Unknown commands on unregistered channels are logged and ignored
- Malformed frames trigger a resync scan for the next valid magic bytes ("PM")

---

## Security Considerations

- The PM protocol runs **inside** an authenticated SSH session — all traffic is encrypted by SSH
- Channel IDs are local to each mux instance — no cross-session leakage
- The protocol does not authenticate at the frame level (SSH handles this)
- Maximum payload size (65535) prevents single-frame memory bombs
- Flow control prevents slow-reader memory exhaustion
- Nonce store has a hard cap of 1000 pending challenges to prevent memory exhaustion

---

## Implementation Reference

| Component | File | Language |
|-----------|------|----------|
| Frame encoding/parsing | `server/src/tunnel/protocol.ts` | TypeScript |
| Multiplexer | `server/src/tunnel/mux.ts` | TypeScript |
| TCP/UDP/DNS handlers | `server/src/tunnel/handlers.ts` | TypeScript |
| Tunnel server | `server/src/tunnel/server.ts` | TypeScript |
| Tunnel client | `server/src/tunnel/client.ts` | TypeScript |
| Firewall (iptables) | `server/src/tunnel/firewall.ts` | TypeScript |

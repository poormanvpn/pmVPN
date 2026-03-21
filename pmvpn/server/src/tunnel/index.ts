// pmVPN Tunnel Module
// MIT License
//
// In-house VPN tunneling over SSH — multiplexed TCP/UDP/DNS.
// Inspired by sshuttle, reimplemented in TypeScript for production.
//
// Architecture:
//   Client ──SSH──→ Server
//     │                │
//     │  PM Protocol   │
//     │  (binary mux)  │
//     │                │
//     ├─ TCP streams   ├─→ Real TCP connections
//     ├─ UDP datagrams ├─→ Real UDP sockets
//     └─ DNS queries   └─→ System DNS resolver
//
// The PM protocol multiplexes all streams over a single SSH channel
// using 8-byte headers: "PM" + channel(2) + command(2) + length(2)

export { CMD, encodeFrame, FrameParser, type Frame } from './protocol.js';
export { Mux } from './mux.js';
export { startTunnelServer } from './server.js';
export { TunnelClient } from './client.js';
export { setupFirewall, teardownFirewall, checkFirewallAccess } from './firewall.js';
export { handleTcpConnect, handleUdpOpen, handleDnsReq } from './handlers.js';

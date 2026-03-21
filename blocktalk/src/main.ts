// blocktalk — wallet-to-wallet messaging
// MIT License
//
// Send encrypted, wallet-signed messages between Ethereum addresses.
// No server required for messaging — messages are signed locally
// and can be transmitted via any channel (HTTP, WebSocket, QR, clipboard).
//
// When combined with pmVPN, blocktalk enables P2P file sharing:
//   1. Sender creates a pmVPN share
//   2. Sender sends share invite via blocktalk message
//   3. Receiver opens pmVPN, connects, downloads files
//
// Message format:
//   {
//     from: "0xSenderAddress",
//     to: "0xReceiverAddress",
//     timestamp: 1679900000,
//     content: "encrypted message text",
//     signature: "0x...",  // sender signs the message
//     type: "text" | "share-invite" | "file"
//   }

import { createApp } from './app';

const root = document.getElementById('app')!;
root.appendChild(createApp());

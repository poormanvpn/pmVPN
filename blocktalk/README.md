# blocktalk

*Wallet-to-wallet messaging — no server, no account, transport agnostic*

---

Messages are signed by your wallet and verified by the receiver. No server required. No account to create. Transport agnostic — clipboard, QR code, HTTP relay, email.

## How It Works

1. Connect MetaMask
2. Add a contact (their wallet address)
3. Type a message → MetaMask signs it
4. Message copied to clipboard → send via any channel
5. Receiver pastes the signed message → blocktalk verifies the signature

## Message Format

```json
{
  "from": "0xSenderAddress",
  "to": "0xReceiverAddress",
  "timestamp": 1679900000,
  "content": "hello from my wallet",
  "type": "text",
  "nonce": "unique-per-message",
  "signature": "0x..."
}
```

The signature proves the sender controls the wallet. The receiver verifies with `viem.verifyMessage()` — pure local crypto.

## pmVPN Integration

blocktalk can carry pmVPN share invites:

1. Sender creates a pmVPN share (files staged on server)
2. Sender sends the share invite as a blocktalk message (type: `share-invite`)
3. Receiver opens pmVPN, pastes the invite, connects, downloads files

## Run

```bash
cd blocktalk
pnpm install
pnpm run dev
# → http://localhost:1421/
```

## License

MIT

---

*cypherpunk2048 — Code is law. Keys are identity. Verification replaces trust.*

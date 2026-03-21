// blocktalk — Message creation, signing, verification
// MIT License
//
// Messages are wallet-signed JSON objects. The sender's wallet
// signs the message content, proving authorship. The receiver
// verifies the signature, proving the message hasn't been tampered with.
//
// No server needed. Messages can travel through any channel:
// - Copy/paste (clipboard)
// - QR code
// - HTTP relay
// - pmVPN share invite
// - Email, chat, carrier pigeon

import { verifyMessage } from 'viem';

export interface BlocktalkMessage {
  from: string;          // sender wallet address
  to: string;            // receiver wallet address (or '*' for broadcast)
  timestamp: number;     // unix ms
  content: string;       // message text (plaintext or encrypted)
  type: 'text' | 'share-invite' | 'file' | 'key-exchange';
  signature: string;     // sender's wallet signature over the canonical form
  nonce: string;         // unique per message, prevents replay
}

/**
 * Build the canonical string that gets signed.
 * Both sender and receiver must produce the same string from the same message.
 */
export function canonicalize(msg: Omit<BlocktalkMessage, 'signature'>): string {
  return [
    'blocktalk message',
    '',
    `from: ${msg.from.toLowerCase()}`,
    `to: ${msg.to.toLowerCase()}`,
    `type: ${msg.type}`,
    `timestamp: ${msg.timestamp}`,
    `nonce: ${msg.nonce}`,
    '',
    msg.content,
  ].join('\n');
}

/**
 * Create a message ready for signing.
 * Returns the message object (without signature) and the string to sign.
 */
export function createMessage(
  from: string,
  to: string,
  content: string,
  type: BlocktalkMessage['type'] = 'text',
): { message: Omit<BlocktalkMessage, 'signature'>; signable: string } {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const message = {
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    timestamp: Date.now(),
    content,
    type,
    nonce,
  };

  return { message, signable: canonicalize(message) };
}

/**
 * Verify a blocktalk message signature.
 * Returns true if the signature is valid and matches the sender address.
 */
export async function verifyBlocktalkMessage(msg: BlocktalkMessage): Promise<boolean> {
  try {
    const signable = canonicalize(msg);
    const valid = await verifyMessage({
      address: msg.from as `0x${string}`,
      message: signable,
      signature: msg.signature as `0x${string}`,
    });
    return valid;
  } catch {
    return false;
  }
}

/**
 * Encode a message as a compact JSON string for transmission.
 */
export function encodeMessage(msg: BlocktalkMessage): string {
  return JSON.stringify(msg);
}

/**
 * Decode a message from JSON. Returns null if invalid.
 */
export function decodeMessage(json: string): BlocktalkMessage | null {
  try {
    const msg = JSON.parse(json) as BlocktalkMessage;
    if (!msg.from || !msg.to || !msg.signature || !msg.content) return null;
    return msg;
  } catch {
    return null;
  }
}

/**
 * Check if a message is intended for a specific wallet.
 */
export function isForMe(msg: BlocktalkMessage, myAddress: string): boolean {
  return msg.to === '*' || msg.to.toLowerCase() === myAddress.toLowerCase();
}

/**
 * Check if a message has expired (older than maxAge ms).
 */
export function isExpired(msg: BlocktalkMessage, maxAgeMs: number = 24 * 60 * 60 * 1000): boolean {
  return Date.now() - msg.timestamp > maxAgeMs;
}

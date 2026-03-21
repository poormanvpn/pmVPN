// Nonce challenge store — replay protection
// MIT License
//
// Each nonce is single-use with a 60-second TTL.
// Ported from crypto-ssh nonce pattern, hardened.

import { randomBytes } from 'node:crypto';
import { PROTOCOL_PREFIX } from '../shared.js';
import type { ChallengeResponse } from '../shared.js';
import { logger } from '../utils/logger.js';

const NONCE_TTL_MS = 60_000;
const MAX_PENDING = 1000; // prevent memory exhaustion

interface PendingChallenge {
  message: string;
  expires: number;   // Unix ms
}

const store = new Map<string, PendingChallenge>();

// Periodic cleanup of expired nonces
setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of store) {
    if (now > entry.expires) {
      store.delete(nonce);
    }
  }
}, 10_000);

/**
 * Generate a fresh challenge for a wallet address.
 * Returns { nonce, message, expires } — the client signs `message`.
 */
export function createChallenge(address: string): ChallengeResponse | null {
  if (store.size >= MAX_PENDING) {
    logger.warn('challenge store full — rejecting new challenge');
    return null;
  }

  const nonce = randomBytes(32).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${PROTOCOL_PREFIX}:${nonce}:${timestamp}`;
  const expires = timestamp + Math.floor(NONCE_TTL_MS / 1000);

  store.set(nonce, { message, expires: Date.now() + NONCE_TTL_MS });

  logger.debug({ nonce: nonce.slice(0, 8), address }, 'challenge created');
  return { nonce, message, expires };
}

/**
 * Consume a nonce — returns the signed message if valid, null if expired/unknown.
 * Single-use: nonce is deleted on retrieval.
 */
export function consumeChallenge(nonce: string): string | null {
  const entry = store.get(nonce);
  if (!entry) {
    logger.warn({ nonce: nonce.slice(0, 8) }, 'unknown nonce');
    return null;
  }

  // Always delete — single use
  store.delete(nonce);

  if (Date.now() > entry.expires) {
    logger.warn({ nonce: nonce.slice(0, 8) }, 'expired nonce');
    return null;
  }

  return entry.message;
}

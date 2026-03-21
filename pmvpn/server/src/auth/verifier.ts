// Wallet signature verification using viem
// MIT License
//
// Pure local secp256k1 recovery — no RPC needed.
// Matches bankon-greeter pattern (viem verifyMessage).

import { verifyMessage } from 'viem';
import { logger } from '../utils/logger.js';

/**
 * Verify that `signature` was produced by `claimedAddress` signing `message`.
 * Returns true if signature is valid and matches the claimed address.
 */
export async function verifyWalletSignature(
  claimedAddress: string,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    const valid = await verifyMessage({
      address: claimedAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      logger.warn({ address: claimedAddress }, 'signature verification failed');
    }

    return valid;
  } catch (err) {
    logger.error({ err, address: claimedAddress }, 'signature verification error');
    return false;
  }
}

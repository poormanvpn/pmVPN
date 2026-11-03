// SPDX-License-Identifier: GPL-3.0-only
// EIP-191 personal_sign: sign with a local key, recover a signer. Isomorphic.
// secp256k1 signing is RFC 6979 deterministic, so a keyring derived from a
// signature made here equals the ring from any other deterministic wallet.

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, utf8 } from './keyring.js';

function personalHash(message: string): Uint8Array {
  const body = utf8(message);
  const prefix = utf8(`\x19Ethereum Signed Message:\n${body.length}`);
  const joined = new Uint8Array(prefix.length + body.length);
  joined.set(prefix);
  joined.set(body, prefix.length);
  return keccak_256(joined);
}

function addressOf(uncompressedPublicKey: Uint8Array): string {
  return `0x${bytesToHex(keccak_256(uncompressedPublicKey.subarray(1)).subarray(12))}`;
}

/** Lowercase address of a raw secp256k1 private key. */
export function addressFromPrivateKey(privateKeyHex: string): string {
  return addressOf(secp256k1.getPublicKey(hexToBytes(privateKeyHex), false));
}

/** 65-byte r ‖ s ‖ v signature as 0x hex, v in {27, 28}. */
export function signPersonalMessage(privateKeyHex: string, message: string): string {
  const sig = secp256k1.sign(personalHash(message), hexToBytes(privateKeyHex), { lowS: true });
  return `0x${sig.toCompactHex()}${(27 + sig.recovery!).toString(16)}`;
}

/** Lowercase address that produced this signature over this message. */
export function recoverPersonalSigner(signatureHex: string, message: string): string {
  const raw = hexToBytes(signatureHex);
  if (raw.length !== 65) throw new Error(`signature must be 65 bytes (got ${raw.length})`);
  const v = raw[64] >= 27 ? raw[64] - 27 : raw[64];
  if (v !== 0 && v !== 1) throw new Error('signature has an invalid recovery byte');
  const point = secp256k1.Signature.fromCompact(raw.subarray(0, 64)).addRecoveryBit(v).recoverPublicKey(personalHash(message));
  return addressOf(point.toRawBytes(false));
}

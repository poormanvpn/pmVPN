// SPDX-License-Identifier: GPL-3.0-only
// Action-bound messages for keyring enrolment and revocation. Isomorphic.
//
// A plain login challenge says nothing about what it authorises, so a signature seen
// on an unencrypted link could enrol the observer's keys. These messages name the
// host, the single-use nonce and, for enrolment, a hash of the exact keys. A captured
// enrolment signature can only ever enrol the keys it was made for.
//
// Mirrored in server/src/api/keyring.ts. Changing a format is a protocol change.

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8 } from './keyring.js';

export const ENROL_PREFIX = 'PMVPN-ENROL:v1:';
export const REVOKE_PREFIX = 'PMVPN-REVOKE:v1:';

/** SHA-256 over "<index> <base64 blob>\n" lines sorted by index; comments are ignored. */
export function keysDigest(keys: Array<{ index: number; publicKey: string }>): string {
  const lines = [...keys]
    .sort((a, b) => a.index - b.index)
    .map((k) => {
      const parts = k.publicKey.trim().split(/\s+/);
      const i = parts.indexOf('ssh-ed25519');
      if (i === -1 || !parts[i + 1]) throw new Error(`key ${k.index} is not an ssh-ed25519 line`);
      return `${k.index} ${parts[i + 1]}\n`;
    })
    .join('');
  return bytesToHex(sha256(utf8(lines)));
}

export function enrolMessage(hostFingerprint: string, nonce: string, keys: Array<{ index: number; publicKey: string }>): string {
  return `${ENROL_PREFIX}${hostFingerprint.replace(/=$/, '')}:${nonce}:${keysDigest(keys)}`;
}

export function revokeMessage(hostFingerprint: string, nonce: string): string {
  return `${REVOKE_PREFIX}${hostFingerprint.replace(/=$/, '')}:${nonce}`;
}

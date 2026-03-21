// pmVPN Client — Host Key TOFU (Trust On First Use)
// Stores server fingerprints on first connect, verifies on reconnect.

const STORAGE_KEY = 'pmvpn-hostkeys';

interface HostKeyEntry {
  host: string;
  port: string;
  fingerprint: string;
  firstSeen: string;
  lastSeen: string;
}

function loadKeys(): Record<string, HostKeyEntry> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveKeys(keys: Record<string, HostKeyEntry>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

function hostId(host: string, port: string): string {
  return `${host}:${port}`;
}

/**
 * Record a server's fingerprint on first connect.
 * Returns 'new' if first time, 'match' if known and matches,
 * 'mismatch' if known but different (possible MITM).
 */
export function verifyHostKey(
  host: string,
  port: string,
  fingerprint: string,
): 'new' | 'match' | 'mismatch' {
  const keys = loadKeys();
  const id = hostId(host, port);
  const existing = keys[id];

  if (!existing) {
    // First time — trust and store
    keys[id] = {
      host,
      port,
      fingerprint,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    saveKeys(keys);
    return 'new';
  }

  if (existing.fingerprint === fingerprint) {
    // Known and matches
    existing.lastSeen = new Date().toISOString();
    saveKeys(keys);
    return 'match';
  }

  // MISMATCH — possible MITM
  return 'mismatch';
}

/**
 * Get stored fingerprint for a host.
 */
export function getStoredFingerprint(host: string, port: string): string | null {
  const keys = loadKeys();
  return keys[hostId(host, port)]?.fingerprint || null;
}

/**
 * Accept a new fingerprint (after user confirms mismatch).
 */
export function acceptNewFingerprint(host: string, port: string, fingerprint: string): void {
  const keys = loadKeys();
  keys[hostId(host, port)] = {
    host,
    port,
    fingerprint,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
  saveKeys(keys);
}

/**
 * Remove a host's stored fingerprint.
 */
export function removeHostKey(host: string, port: string): void {
  const keys = loadKeys();
  delete keys[hostId(host, port)];
  saveKeys(keys);
}

/**
 * Get all stored host keys.
 */
export function getAllHostKeys(): HostKeyEntry[] {
  return Object.values(loadKeys());
}

/**
 * Export all host keys as JSON (for backup/transfer).
 */
export function exportHostKeys(): string {
  return JSON.stringify(loadKeys(), null, 2);
}

/**
 * Import host keys from JSON.
 */
export function importHostKeys(json: string): number {
  try {
    const imported = JSON.parse(json) as Record<string, HostKeyEntry>;
    const keys = loadKeys();
    let count = 0;
    for (const [id, entry] of Object.entries(imported)) {
      if (!keys[id]) {
        keys[id] = entry;
        count++;
      }
    }
    saveKeys(keys);
    return count;
  } catch {
    return 0;
  }
}

/**
 * Export connection profiles (host list + host keys).
 */
export function exportProfiles(): string {
  return JSON.stringify({
    connections: JSON.parse(localStorage.getItem('pmvpn-connections') || '[]'),
    hostkeys: loadKeys(),
    exported: new Date().toISOString(),
  }, null, 2);
}

/**
 * Import connection profiles.
 */
export function importProfiles(json: string): { connections: number; keys: number } {
  try {
    const data = JSON.parse(json);
    let connCount = 0;
    let keyCount = 0;

    if (data.connections) {
      const existing = JSON.parse(localStorage.getItem('pmvpn-connections') || '[]');
      const existingIds = new Set(existing.map((c: any) => `${c.host}:${c.port}`));
      for (const conn of data.connections) {
        if (!existingIds.has(`${conn.host}:${conn.port}`)) {
          existing.push(conn);
          connCount++;
        }
      }
      localStorage.setItem('pmvpn-connections', JSON.stringify(existing));
    }

    if (data.hostkeys) {
      const keys = loadKeys();
      for (const [id, entry] of Object.entries(data.hostkeys)) {
        if (!keys[id]) {
          keys[id] = entry as HostKeyEntry;
          keyCount++;
        }
      }
      saveKeys(keys);
    }

    return { connections: connCount, keys: keyCount };
  } catch {
    return { connections: 0, keys: 0 };
  }
}

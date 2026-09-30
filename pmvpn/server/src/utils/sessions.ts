// SPDX-License-Identifier: GPL-3.0-only
// Active session registry — tracks all authenticated connections
// MIT License
//
// Shared across SSH handler, WS bridge, and diagnostics endpoint.
// No secrets stored — only connection metadata for admin visibility.

export interface ActiveSession {
  id: string;
  wallet: string;           // Full wallet address (admin-only visibility)
  username: string;          // Linux username
  role: string;              // 'admin' | 'user'
  type: 'ssh-shell' | 'ssh-sftp' | 'ssh-exec' | 'websocket' | 'tunnel';
  clientIP: string;
  clientPort: number;
  connectedAt: number;       // Unix timestamp ms
  lastActivity: number;      // Unix timestamp ms
}

const sessions = new Map<string, ActiveSession>();
let sessionCounter = 0;

/**
 * Register a new session. Returns the session ID.
 */
export function registerSession(
  wallet: string,
  username: string,
  role: string,
  type: ActiveSession['type'],
  clientIP: string,
  clientPort: number
): string {
  const id = `s${++sessionCounter}-${Date.now().toString(36)}`;
  const now = Date.now();
  sessions.set(id, {
    id,
    wallet,
    username,
    role,
    type,
    clientIP,
    clientPort,
    connectedAt: now,
    lastActivity: now,
  });
  return id;
}

/**
 * Update last activity timestamp for a session.
 */
export function touchSession(id: string): void {
  const s = sessions.get(id);
  if (s) s.lastActivity = Date.now();
}

/**
 * Remove a session when the connection closes.
 */
export function removeSession(id: string): void {
  sessions.delete(id);
}

/**
 * Get all active sessions (for diagnostics).
 */
export function getActiveSessions(): ActiveSession[] {
  return Array.from(sessions.values());
}

/**
 * Get sessions for a specific wallet address.
 */
export function getSessionsForWallet(wallet: string): ActiveSession[] {
  const w = wallet.toLowerCase();
  return Array.from(sessions.values()).filter(s => s.wallet === w);
}

/**
 * Get session count by type.
 */
export function getSessionCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions.values()) {
    counts[s.type] = (counts[s.type] || 0) + 1;
  }
  return counts;
}

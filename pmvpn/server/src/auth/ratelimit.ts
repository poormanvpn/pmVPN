// SPDX-License-Identifier: GPL-3.0-only
// Fixed-window request limiter keyed by client address. In memory, bounded.

const MAX_KEYS = 10_000;

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  /** Count one request for `key`; false once the key is over its limit for this window. */
  allow(key: string): boolean {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || now >= entry.resetAt) {
      if (this.hits.size >= MAX_KEYS) this.sweep(now);
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  private sweep(now: number): void {
    for (const [k, v] of this.hits) if (now >= v.resetAt) this.hits.delete(k);
    // Still full: drop the oldest half rather than grow without bound.
    if (this.hits.size >= MAX_KEYS) {
      let n = 0;
      for (const k of this.hits.keys()) { if (n++ > MAX_KEYS / 2) break; this.hits.delete(k); }
    }
  }
}

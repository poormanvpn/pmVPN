// SPDX-License-Identifier: GPL-3.0-only
// HTML escaping for text that reaches innerHTML. Anything a server, a file name,
// an imported profile or the chain supplies goes through esc() first.

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

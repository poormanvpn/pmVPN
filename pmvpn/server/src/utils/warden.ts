// Jail warden self-injection
// MIT License
//
// On boot, when running as root, copy the jail warden scripts shipped
// with the server into /usr/local/bin so that auto-registration in
// ssh/handler.ts and ws/bridge.ts can call them.
//
// Idempotent and version-aware: each script carries `VERSION="N"`, and we
// reinstall when the on-disk copy is missing or the version differs.

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// server/dist/utils/warden.js → server/scripts/
// server/src/utils/warden.ts  → server/scripts/
const SCRIPTS_SRC = join(__dirname, '..', '..', 'scripts');

const TARGET_DIR = '/usr/local/bin';

const SCRIPTS: ReadonlyArray<{ src: string; dest: string }> = [
  { src: 'pmvpn-create-user.sh', dest: 'pmvpn-create-user.sh' },
  { src: 'pmvpn-warden.sh',      dest: 'pmvpn-warden' },
];

function extractVersion(contents: string): string | null {
  const m = contents.match(/^VERSION="([^"]+)"/m);
  return m ? m[1] : null;
}

/**
 * Ensure the warden scripts are installed under /usr/local/bin.
 * No-op if not running as root or sources aren't present.
 */
export function ensureWardenInstalled(): void {
  if (process.platform !== 'linux') return;

  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;
  if (uid !== 0) {
    logger.debug({ uid }, 'warden self-inject skipped (not root)');
    return;
  }

  if (!existsSync(SCRIPTS_SRC)) {
    logger.warn({ scriptsDir: SCRIPTS_SRC }, 'warden scripts source dir missing — bundled install will be unavailable');
    return;
  }

  try { mkdirSync(TARGET_DIR, { recursive: true }); } catch {}

  for (const { src, dest } of SCRIPTS) {
    const srcPath = join(SCRIPTS_SRC, src);
    const destPath = join(TARGET_DIR, dest);

    if (!existsSync(srcPath)) {
      logger.warn({ srcPath }, 'warden script missing in bundle');
      continue;
    }

    const srcBody = readFileSync(srcPath, 'utf-8');
    const srcVer = extractVersion(srcBody);

    if (existsSync(destPath)) {
      const destBody = readFileSync(destPath, 'utf-8');
      const destVer = extractVersion(destBody);
      if (srcVer && destVer === srcVer) {
        logger.debug({ dest, version: destVer }, 'warden up to date');
        continue;
      }
    }

    try {
      writeFileSync(destPath, srcBody);
      chmodSync(destPath, 0o755);
      logger.info({ dest: destPath, version: srcVer }, 'warden script installed');
    } catch (err: any) {
      logger.warn({ err: err.message, destPath }, 'warden install failed');
    }
  }
}

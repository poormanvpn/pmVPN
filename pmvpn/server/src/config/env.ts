// SPDX-License-Identifier: GPL-3.0-only
// .env loader. Import this FIRST from every entry point: other modules read
// process.env while they load, and ES imports evaluate in order.
//
// Order: PMVPN_ENV_FILE alone if set, otherwise ./.env then ~/.pmvpn/.env.
// A variable already in the environment (systemd, the shell) always wins, and
// so does the file loaded first.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const loadedEnvFiles: string[] = [];

const explicit = process.env.PMVPN_ENV_FILE;
const candidates = explicit ? [explicit] : [join(process.cwd(), '.env'), join(homedir(), '.pmvpn', '.env')];

for (const path of candidates) {
  if (!existsSync(path)) {
    if (explicit) throw new Error(`PMVPN_ENV_FILE not found: ${path}`);
    continue;
  }
  process.loadEnvFile(path);
  loadedEnvFiles.push(path);
}

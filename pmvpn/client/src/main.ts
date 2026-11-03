// SPDX-License-Identifier: GPL-3.0-only
// pmVPN Standalone Client
// GPL-3.0
//
// Wallet-authenticated terminal client.
// Connects to a pmVPN server via the Challenge API + WebSocket bridge.

import '@xterm/xterm/css/xterm.css'; // bundled, not fetched from a CDN at runtime
import { createApp } from './app';

const app = document.getElementById('app')!;
app.appendChild(createApp());

// pmVPN Standalone Client
// GPL-3.0
//
// Wallet-authenticated terminal client.
// Connects to a pmVPN server via the Challenge API + WebSocket bridge.

import { createApp } from './app';

const app = document.getElementById('app')!;
app.appendChild(createApp());

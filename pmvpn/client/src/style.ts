// pmVPN Client Styles
// Theming: gnugui/tauri-theme semantic tokens
// Landing: lighter, readable. Terminal: green-on-black classic Linux.

const CSS = `

/* ══════════════════════════════════════════════════════
   THEME TOKENS
   Lighter palette for readability. Green terminal post-connect.
   ══════════════════════════════════════════════════════ */

:root {
  /* Surface layers — lifted from pure black for readability */
  --background:           #1e2030;
  --card:                 #262840;
  --popover:              #2e3150;
  --muted:                #363a56;
  --sidebar:              #232540;
  --sidebar-border:       #363a56;

  /* Text — brighter for contrast */
  --foreground:           #cdd6f4;
  --muted-foreground:     #7f849c;
  --card-foreground:      #e0e4f7;
  --popover-foreground:   #e0e4f7;

  /* Interactive */
  --primary:              #89b4fa;
  --primary-foreground:   #11111b;
  --secondary:            #363a56;
  --secondary-foreground: #cdd6f4;
  --accent:               #cba6f7;
  --accent-foreground:    #11111b;
  --destructive:          #f38ba8;
  --destructive-foreground: #11111b;

  /* Semantic */
  --success:              #a6e3a1;
  --warning:              #f9e2af;
  --info:                 #89b4fa;

  /* UI boundaries — visible but not harsh */
  --border:               #3b3f5c;
  --input:                #2a2d48;
  --ring:                 #89b4fa;

  /* Chart */
  --chart-1:              #89b4fa;
  --chart-2:              #a6e3a1;
  --chart-3:              #f9e2af;
  --chart-4:              #cba6f7;
  --chart-5:              #f38ba8;

  /* MetaMask */
  --metamask:             #e2761b;
  --metamask-hover:       #f6851b;

  /* Terminal green — classic Linux */
  --terminal-bg:          #0a0a0a;
  --terminal-fg:          #33ff33;
  --terminal-dim:         #1a6b1a;
  --terminal-bright:      #66ff66;
  --terminal-border:      #1a3a1a;

  /* Radius & transitions */
  --radius:               8px;
  --radius-lg:            12px;
  --transition-fast:      0.15s ease;
  --transition-normal:    0.25s ease;
}

/* ══════════════════════════════════════════════════════
   GLOBAL
   ══════════════════════════════════════════════════════ */

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
               'Helvetica Neue', Arial, sans-serif;
  background: var(--background);
  color: var(--foreground);
  height: 100vh;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ══════════════════════════════════════════════════════
   HEADER
   ══════════════════════════════════════════════════════ */

.pmvpn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
}

.pmvpn-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--primary);
  letter-spacing: 1.5px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.pmvpn-subtitle {
  font-size: 10px;
  color: var(--muted-foreground);
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.pmvpn-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pmvpn-addr-display {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--success);
  padding: 3px 8px;
  background: rgba(166,227,161,0.1);
  border-radius: var(--radius);
  border: 1px solid rgba(166,227,161,0.2);
}

/* ══════════════════════════════════════════════════════
   LOGOUT
   ══════════════════════════════════════════════════════ */

.pmvpn-btn-logout {
  padding: 5px 14px;
  background: transparent;
  border: 1px solid var(--destructive);
  border-radius: var(--radius);
  color: var(--destructive);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  transition: all var(--transition-fast);
}

.pmvpn-btn-logout:hover {
  background: var(--destructive);
  color: var(--destructive-foreground);
  box-shadow: 0 0 20px rgba(243,139,168,0.25);
}

/* ══════════════════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════════════════ */

.pmvpn-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.pmvpn-sidebar {
  width: 300px;
  min-width: 300px;
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--sidebar);
}

.pmvpn-section {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.pmvpn-section h3 {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--muted-foreground);
  margin-bottom: 10px;
  font-weight: 600;
}

/* ══════════════════════════════════════════════════════
   INPUTS
   ══════════════════════════════════════════════════════ */

.pmvpn-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--card-foreground);
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.pmvpn-input:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 2px rgba(137,180,250,0.15);
}

.pmvpn-input::placeholder { color: var(--muted-foreground); opacity: 0.7; }

textarea.pmvpn-input {
  resize: vertical;
  min-height: 60px;
  font-size: 11px;
}

/* ══════════════════════════════════════════════════════
   BUTTONS
   ══════════════════════════════════════════════════════ */

.pmvpn-btn {
  width: 100%;
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-top: 8px;
}

.pmvpn-btn-primary {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

.pmvpn-btn-primary:hover {
  filter: brightness(1.15);
  box-shadow: 0 0 16px rgba(137,180,250,0.2);
}

.pmvpn-btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: none;
  box-shadow: none;
}

.pmvpn-btn-danger {
  background: var(--destructive);
  color: var(--destructive-foreground);
  border-color: var(--destructive);
}

.pmvpn-btn-danger:hover {
  filter: brightness(1.15);
  box-shadow: 0 0 16px rgba(243,139,168,0.2);
}

.pmvpn-btn-secondary {
  background: var(--secondary);
  color: var(--secondary-foreground);
}

.pmvpn-btn-secondary:hover { background: var(--muted); }

.pmvpn-btn-metamask {
  background: linear-gradient(135deg, var(--metamask) 0%, #cd6116 100%);
  color: #fff;
  border-color: var(--metamask);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.3px;
}

.pmvpn-btn-metamask:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--metamask-hover) 0%, var(--metamask) 100%);
  box-shadow: 0 0 24px rgba(226,118,27,0.3);
}

.pmvpn-btn-metamask:disabled { opacity: 0.4; cursor: not-allowed; }

.pmvpn-btn-icon {
  width: 26px;
  height: 26px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.pmvpn-btn-icon:hover { background: var(--muted); border-color: var(--muted-foreground); }
.pmvpn-btn-remove { color: var(--muted-foreground); }
.pmvpn-btn-remove:hover { color: var(--destructive); border-color: var(--destructive); }

.pmvpn-btn-kill {
  color: var(--warning);
  font-size: 12px;
}
.pmvpn-btn-kill:hover {
  color: var(--destructive);
  border-color: var(--destructive);
  background: rgba(243,139,168,0.08);
}

.pmvpn-btn-exit {
  width: 28px;
  height: 28px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  margin-left: 4px;
}

.pmvpn-btn-exit:hover {
  color: var(--destructive);
  border-color: var(--destructive);
  background: rgba(243,139,168,0.08);
}

/* ══════════════════════════════════════════════════════
   CONNECTION LIST
   ══════════════════════════════════════════════════════ */

.pmvpn-conn-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pmvpn-conn-header h3 { margin: 0; }
.pmvpn-conn-list { margin-top: 8px; }

.pmvpn-conn-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  margin-bottom: 3px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition-fast);
  border-left: 3px solid transparent;
}

.pmvpn-conn-item:hover { background: var(--card); }
.pmvpn-conn-item.active { background: var(--popover); border-left-color: var(--primary); }
.pmvpn-conn-item.connected .pmvpn-conn-status { color: var(--success); }
.pmvpn-conn-item.error .pmvpn-conn-status { color: var(--destructive); }

.pmvpn-conn-info { flex: 1; min-width: 0; }

.pmvpn-conn-name { font-weight: 500; font-size: 13px; color: var(--card-foreground); }
.pmvpn-conn-addr { font-size: 11px; color: var(--muted-foreground); font-family: 'JetBrains Mono', monospace; }
.pmvpn-conn-status { font-size: 9px; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }

/* ══════════════════════════════════════════════════════
   ADD FORM
   ══════════════════════════════════════════════════════ */

.pmvpn-add-form { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.pmvpn-add-form .pmvpn-input { margin-bottom: 6px; }
.pmvpn-form-btns { display: flex; gap: 6px; }
.pmvpn-form-btns .pmvpn-btn { flex: 1; }

/* Diagnostics */
.pmvpn-diag-results {
  margin-top: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.pmvpn-diag-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 5px 0;
  border-bottom: 1px solid rgba(59, 63, 92, 0.3);
  gap: 8px;
}

.pmvpn-diag-label {
  color: var(--card-foreground);
  font-weight: 500;
  white-space: nowrap;
  min-width: 80px;
}

.pmvpn-diag-status {
  color: var(--muted-foreground);
  text-align: right;
  word-break: break-word;
}

.pmvpn-diag-status.ok { color: var(--success); }
.pmvpn-diag-status.fail { color: var(--destructive); }
.pmvpn-diag-status.warn { color: var(--warning); }

/* ══════════════════════════════════════════════════════
   WALLET & HINTS
   ══════════════════════════════════════════════════════ */

.pmvpn-wallet-info { padding: 6px 0; }
.pmvpn-hint { font-size: 11px; color: var(--muted-foreground); margin-top: 8px; }
.pmvpn-hint a { color: var(--primary); text-decoration: none; }
.pmvpn-hint a:hover { text-decoration: underline; }

.pmvpn-flow { font-size: 12px; color: var(--foreground); }
.pmvpn-flow-step {
  padding: 4px 0;
  border-left: 2px solid var(--border);
  padding-left: 10px;
  margin-bottom: 2px;
  color: var(--muted-foreground);
}
.pmvpn-flow-step strong { color: var(--card-foreground); }

/* ══════════════════════════════════════════════════════
   MAIN AREA — PLACEHOLDER (pre-connect)
   ══════════════════════════════════════════════════════ */

.pmvpn-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--background);
}

.pmvpn-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--muted-foreground);
}

.pmvpn-placeholder-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--foreground);
  letter-spacing: 2px;
  font-family: 'JetBrains Mono', monospace;
  opacity: 0.6;
}

.pmvpn-placeholder-sub { font-size: 13px; }

/* ══════════════════════════════════════════════════════
   TERMINAL — Linux green-on-black with transparency
   Post-connect: classic hacker terminal aesthetic
   ══════════════════════════════════════════════════════ */

.pmvpn-terminal-container {
  flex: 1;
  padding: 3px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid var(--terminal-border);
  border-radius: var(--radius);
  margin: 4px;
  box-shadow:
    inset 0 0 60px rgba(0, 255, 0, 0.03),
    0 0 30px rgba(0, 0, 0, 0.5);
  position: relative;
}

/* Subtle scanline overlay for CRT feel */
.pmvpn-terminal-container::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 255, 0, 0.015) 0px,
    rgba(0, 255, 0, 0.015) 1px,
    transparent 1px,
    transparent 3px
  );
  pointer-events: none;
  border-radius: var(--radius);
  z-index: 1;
}

/* Green glow border on terminal when active */
.pmvpn-terminal-container.active {
  border-color: rgba(51, 255, 51, 0.3);
  box-shadow:
    inset 0 0 60px rgba(0, 255, 0, 0.04),
    0 0 20px rgba(51, 255, 51, 0.08),
    0 0 60px rgba(0, 0, 0, 0.6);
}

.pmvpn-terminal-container .xterm { height: 100%; }

/* Override xterm viewport for transparency */
.pmvpn-terminal-container .xterm-viewport {
  background: transparent !important;
}

.pmvpn-terminal-container .xterm-screen {
  background: transparent !important;
}

/* ══════════════════════════════════════════════════════
   LOG
   ══════════════════════════════════════════════════════ */

.pmvpn-log {
  padding: 8px 16px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--muted-foreground);
  max-height: 120px;
  overflow-y: auto;
  border-top: 1px solid var(--border);
  background: var(--sidebar);
}

.pmvpn-log-entry { padding: 1px 0; white-space: pre-wrap; word-break: break-all; }
.pmvpn-log-entry.error { color: var(--destructive); }
.pmvpn-log-entry.success { color: var(--success); }
.pmvpn-log-entry.info { color: var(--info); }

/* ══════════════════════════════════════════════════════
   STATUS BAR
   ══════════════════════════════════════════════════════ */

.pmvpn-status {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--card);
  border-top: 1px solid var(--border);
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--muted-foreground);
}

.pmvpn-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 6px;
  transition: all var(--transition-normal);
}

.pmvpn-status-dot.connected {
  background: var(--terminal-fg);
  box-shadow: 0 0 10px rgba(51,255,51,0.6);
}

.pmvpn-status-dot.connecting {
  background: var(--warning);
  box-shadow: 0 0 8px rgba(249,226,175,0.5);
  animation: pulse 1.5s ease-in-out infinite;
}

.pmvpn-status-dot.authenticating {
  background: var(--accent);
  box-shadow: 0 0 8px rgba(203,166,247,0.5);
  animation: pulse 1s ease-in-out infinite;
}

.pmvpn-status-dot.disconnected { background: var(--muted-foreground); }

.pmvpn-status-dot.error {
  background: var(--destructive);
  box-shadow: 0 0 8px rgba(243,139,168,0.5);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ══════════════════════════════════════════════════════
   SCROLLBAR
   ══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   TABS
   ══════════════════════════════════════════════════════ */

.pmvpn-tabs {
  display: flex;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  padding: 0 4px;
}

.pmvpn-tab {
  padding: 8px 20px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.pmvpn-tab:hover { color: var(--foreground); }
.pmvpn-tab.active {
  color: var(--terminal-fg);
  border-bottom-color: var(--terminal-fg);
}

/* ══════════════════════════════════════════════════════
   FILE BROWSER
   ══════════════════════════════════════════════════════ */

.pmvpn-files-container {
  flex: 1;
  overflow-y: auto;
  background: var(--background);
}

.pmvpn-files {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.pmvpn-breadcrumb {
  padding: 8px 16px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.pmvpn-breadcrumb-item {
  color: var(--primary);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
}

.pmvpn-breadcrumb-item:hover { background: var(--muted); }
.pmvpn-breadcrumb-sep { color: var(--muted-foreground); margin: 0 2px; }

.pmvpn-files-toolbar {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.pmvpn-file-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.pmvpn-file-row {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  cursor: pointer;
  transition: background var(--transition-fast);
  font-size: 13px;
  gap: 8px;
}

.pmvpn-file-row:hover { background: var(--card); }
.pmvpn-file-row.directory .pmvpn-file-name { color: var(--primary); font-weight: 500; }
.pmvpn-file-row.file .pmvpn-file-name { color: var(--foreground); }

.pmvpn-file-icon { font-size: 14px; width: 20px; text-align: center; }
.pmvpn-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pmvpn-file-size { width: 80px; text-align: right; color: var(--muted-foreground); font-family: 'JetBrains Mono', monospace; font-size: 11px; }
.pmvpn-file-date { width: 140px; text-align: right; color: var(--muted-foreground); font-size: 11px; }

.pmvpn-file-action {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
  transition: all var(--transition-fast);
}

.pmvpn-file-action:hover { color: var(--destructive); background: rgba(243,139,168,0.1); }

.pmvpn-files-status {
  padding: 6px 16px;
  font-size: 11px;
  color: var(--muted-foreground);
  border-top: 1px solid var(--border);
  font-family: 'JetBrains Mono', monospace;
}

.pmvpn-files-empty, .pmvpn-files-loading {
  padding: 40px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 13px;
}

/* ══════════════════════════════════════════════════════
   SHARE (P2P)
   ══════════════════════════════════════════════════════ */

.pmvpn-share-container {
  flex: 1;
  overflow-y: auto;
  background: var(--background);
  padding: 16px;
}

.pmvpn-share-panel { max-width: 600px; margin: 0 auto; }

.pmvpn-share-section {
  margin-bottom: 16px;
  padding: 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.pmvpn-share-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--card-foreground);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.pmvpn-share-list { margin-top: 8px; }

.pmvpn-share-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: var(--radius);
  background: var(--popover);
  transition: background var(--transition-fast);
}

.pmvpn-share-item:hover { background: var(--muted); }

.pmvpn-share-name { font-size: 13px; color: var(--card-foreground); font-weight: 500; }
.pmvpn-share-meta { font-size: 11px; color: var(--muted-foreground); }
.pmvpn-share-actions { display: flex; gap: 4px; }

.pmvpn-share-empty, .pmvpn-share-loading {
  padding: 16px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 12px;
}

.pmvpn-share-files {
  margin-top: 12px;
  padding: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.pmvpn-share-files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--card-foreground);
}

.pmvpn-share-file-row {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  gap: 8px;
  cursor: pointer;
  border-radius: var(--radius);
  transition: background var(--transition-fast);
  font-size: 13px;
}

.pmvpn-share-file-row:hover { background: var(--popover); }

/* ══════════════════════════════════════════════════════
   SCROLLBAR
   ══════════════════════════════════════════════════════ */

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--muted); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
`;

export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

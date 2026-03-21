// pmVPN Client Styles
// Theming architecture inspired by gnugui/tauri-theme
// https://github.com/gnugui/tauri-theme
//
// 30 semantic CSS custom properties. Swap :root values to retheme entirely.
// Default: Tokyo Night — dark, sharp, high contrast.

const CSS = `

/* ══════════════════════════════════════════════════════
   THEME TOKENS — gnugui semantic design token system
   Change these to retheme the entire application.
   ══════════════════════════════════════════════════════ */

:root {
  /* Surface layers */
  --background:           #1a1b26;
  --card:                 #1f2335;
  --popover:              #24283b;
  --muted:                #292e42;
  --sidebar:              #16161e;
  --sidebar-border:       #292e42;

  /* Text */
  --foreground:           #a9b1d6;
  --muted-foreground:     #565f89;
  --card-foreground:      #c0caf5;
  --popover-foreground:   #c0caf5;

  /* Interactive */
  --primary:              #7aa2f7;
  --primary-foreground:   #1a1b26;
  --secondary:            #292e42;
  --secondary-foreground: #a9b1d6;
  --accent:               #bb9af7;
  --accent-foreground:    #1a1b26;
  --destructive:          #f7768e;
  --destructive-foreground: #1a1b26;

  /* Semantic */
  --success:              #9ece6a;
  --warning:              #e0af68;
  --info:                 #7aa2f7;

  /* UI boundaries */
  --border:               #292e42;
  --input:                #1f2335;
  --ring:                 #7aa2f7;

  /* Chart colors */
  --chart-1:              #7aa2f7;
  --chart-2:              #9ece6a;
  --chart-3:              #e0af68;
  --chart-4:              #bb9af7;
  --chart-5:              #f7768e;

  /* MetaMask brand */
  --metamask:             #e2761b;
  --metamask-hover:       #f6851b;

  /* Radius */
  --radius:               8px;
  --radius-lg:            12px;

  /* Transitions */
  --transition-fast:      0.15s ease;
  --transition-normal:    0.25s ease;
}

/* ══════════════════════════════════════════════════════
   GLOBAL RESET & BASE
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
  -moz-osx-font-smoothing: grayscale;
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
  backdrop-filter: blur(12px);
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
  background: rgba(158,206,106,0.08);
  border-radius: var(--radius);
  border: 1px solid rgba(158,206,106,0.15);
}

/* ══════════════════════════════════════════════════════
   LOGOUT — unmistakable, always clear
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
  box-shadow: 0 0 20px rgba(247,118,142,0.25);
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
  box-shadow: 0 0 0 2px rgba(122,162,247,0.15);
}

.pmvpn-input::placeholder {
  color: var(--muted);
}

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
  box-shadow: 0 0 16px rgba(122,162,247,0.2);
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
  box-shadow: 0 0 16px rgba(247,118,142,0.2);
}

.pmvpn-btn-secondary {
  background: var(--secondary);
  color: var(--secondary-foreground);
}

.pmvpn-btn-secondary:hover {
  background: var(--muted);
}

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

.pmvpn-btn-metamask:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

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

.pmvpn-btn-icon:hover {
  background: var(--muted);
  border-color: var(--muted-foreground);
}

.pmvpn-btn-remove { color: var(--muted-foreground); }
.pmvpn-btn-remove:hover { color: var(--destructive); border-color: var(--destructive); }

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

.pmvpn-conn-item:hover {
  background: var(--card);
}

.pmvpn-conn-item.active {
  background: var(--popover);
  border-left-color: var(--primary);
}

.pmvpn-conn-item.connected .pmvpn-conn-status { color: var(--success); }
.pmvpn-conn-item.error .pmvpn-conn-status { color: var(--destructive); }

.pmvpn-conn-info { flex: 1; min-width: 0; }

.pmvpn-conn-name {
  font-weight: 500;
  font-size: 13px;
  color: var(--card-foreground);
}

.pmvpn-conn-addr {
  font-size: 11px;
  color: var(--muted-foreground);
  font-family: 'JetBrains Mono', monospace;
}

.pmvpn-conn-status {
  font-size: 9px;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

/* ══════════════════════════════════════════════════════
   ADD FORM
   ══════════════════════════════════════════════════════ */

.pmvpn-add-form {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.pmvpn-add-form .pmvpn-input { margin-bottom: 6px; }

.pmvpn-form-btns { display: flex; gap: 6px; }
.pmvpn-form-btns .pmvpn-btn { flex: 1; }

/* ══════════════════════════════════════════════════════
   WALLET INFO & HINTS
   ══════════════════════════════════════════════════════ */

.pmvpn-wallet-info { padding: 6px 0; }

.pmvpn-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 8px;
}

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
   MAIN AREA
   ══════════════════════════════════════════════════════ */

.pmvpn-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--background);
}

.pmvpn-terminal-container {
  flex: 1;
  padding: 2px;
}

.pmvpn-terminal-container .xterm { height: 100%; }

.pmvpn-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--muted);
}

.pmvpn-placeholder-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--muted-foreground);
  letter-spacing: 2px;
  font-family: 'JetBrains Mono', monospace;
}

.pmvpn-placeholder-sub {
  font-size: 13px;
  color: var(--muted-foreground);
}

/* ══════════════════════════════════════════════════════
   LOG & STATUS BAR
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

.pmvpn-log-entry {
  padding: 1px 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.pmvpn-log-entry.error { color: var(--destructive); }
.pmvpn-log-entry.success { color: var(--success); }
.pmvpn-log-entry.info { color: var(--info); }

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
  background: var(--success);
  box-shadow: 0 0 8px rgba(158,206,106,0.5);
}

.pmvpn-status-dot.connecting {
  background: var(--warning);
  box-shadow: 0 0 8px rgba(224,175,104,0.5);
  animation: pulse 1.5s ease-in-out infinite;
}

.pmvpn-status-dot.authenticating {
  background: var(--accent);
  box-shadow: 0 0 8px rgba(187,154,247,0.5);
  animation: pulse 1s ease-in-out infinite;
}

.pmvpn-status-dot.disconnected { background: var(--muted-foreground); }

.pmvpn-status-dot.error {
  background: var(--destructive);
  box-shadow: 0 0 8px rgba(247,118,142,0.5);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ══════════════════════════════════════════════════════
   SCROLLBAR
   ══════════════════════════════════════════════════════ */

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--muted);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
`;

export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

// pmVPN Client Styles — injected at runtime
// Dark theme matching the cypherpunk aesthetic

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
  background: #0d1117;
  color: #c9d1d9;
  height: 100vh;
  overflow: hidden;
}

#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.pmvpn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
}

.pmvpn-title {
  font-size: 16px;
  font-weight: 700;
  color: #58a6ff;
  letter-spacing: 1px;
}

.pmvpn-subtitle {
  font-size: 11px;
  color: #484f58;
  letter-spacing: 0.5px;
}

.pmvpn-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.pmvpn-sidebar {
  width: 300px;
  min-width: 300px;
  border-right: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: #0d1117;
}

.pmvpn-section {
  padding: 16px;
  border-bottom: 1px solid #21262d;
}

.pmvpn-section h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #484f58;
  margin-bottom: 12px;
}

.pmvpn-input-group {
  margin-bottom: 8px;
}

.pmvpn-input-group label {
  display: block;
  font-size: 11px;
  color: #8b949e;
  margin-bottom: 3px;
}

.pmvpn-input {
  width: 100%;
  padding: 8px 10px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 13px;
  font-family: monospace;
  outline: none;
}

.pmvpn-input:focus {
  border-color: #58a6ff;
  box-shadow: 0 0 0 1px rgba(88,166,255,0.3);
}

.pmvpn-input::placeholder {
  color: #30363d;
}

textarea.pmvpn-input {
  resize: vertical;
  min-height: 60px;
  font-size: 11px;
}

.pmvpn-btn {
  width: 100%;
  padding: 10px;
  border: 1px solid #21262d;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 8px;
}

.pmvpn-btn-primary {
  background: #238636;
  color: #fff;
  border-color: #2ea043;
}

.pmvpn-btn-primary:hover {
  background: #2ea043;
}

.pmvpn-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pmvpn-btn-danger {
  background: #da3633;
  color: #fff;
  border-color: #f85149;
}

.pmvpn-btn-danger:hover {
  background: #f85149;
}

.pmvpn-btn-secondary {
  background: #21262d;
  color: #c9d1d9;
}

.pmvpn-btn-secondary:hover {
  background: #30363d;
}

.pmvpn-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.pmvpn-terminal-container {
  flex: 1;
  padding: 4px;
}

.pmvpn-terminal-container .xterm {
  height: 100%;
}

.pmvpn-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: #30363d;
}

.pmvpn-placeholder-title {
  font-size: 20px;
  font-weight: 600;
}

.pmvpn-placeholder-sub {
  font-size: 13px;
}

.pmvpn-status {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #161b22;
  border-top: 1px solid #21262d;
  font-size: 12px;
  font-family: monospace;
  color: #484f58;
}

.pmvpn-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.pmvpn-status-dot.connected { background: #3fb950; box-shadow: 0 0 8px rgba(63,185,80,0.5); }
.pmvpn-status-dot.connecting { background: #d29922; box-shadow: 0 0 8px rgba(210,153,34,0.5); }
.pmvpn-status-dot.disconnected { background: #484f58; }
.pmvpn-status-dot.error { background: #f85149; box-shadow: 0 0 8px rgba(248,81,73,0.5); }

.pmvpn-log {
  padding: 12px 16px;
  font-size: 11px;
  font-family: monospace;
  color: #8b949e;
  max-height: 150px;
  overflow-y: auto;
  border-top: 1px solid #21262d;
  background: #0d1117;
}

.pmvpn-log-entry {
  padding: 2px 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.pmvpn-log-entry.error { color: #f85149; }
.pmvpn-log-entry.success { color: #3fb950; }
.pmvpn-log-entry.info { color: #58a6ff; }

.pmvpn-btn-metamask {
  background: linear-gradient(135deg, #e2761b 0%, #cd6116 100%);
  color: #fff;
  border-color: #e2761b;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.3px;
}

.pmvpn-btn-metamask:hover:not(:disabled) {
  background: linear-gradient(135deg, #f6851b 0%, #e2761b 100%);
  box-shadow: 0 0 20px rgba(226,118,27,0.3);
}

.pmvpn-btn-metamask:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pmvpn-wallet-info {
  padding: 8px 0;
}

.pmvpn-hint {
  font-size: 11px;
  color: #484f58;
  margin-top: 8px;
}

.pmvpn-hint a {
  color: #58a6ff;
  text-decoration: none;
}

.pmvpn-hint a:hover {
  text-decoration: underline;
}

.pmvpn-flow {
  font-size: 12px;
  color: #8b949e;
}

.pmvpn-flow-step {
  padding: 4px 0;
  border-left: 2px solid #21262d;
  padding-left: 10px;
  margin-bottom: 2px;
}

.pmvpn-flow-step strong {
  color: #c9d1d9;
}

/* Header */
.pmvpn-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pmvpn-addr-display {
  font-family: monospace;
  font-size: 12px;
  color: #3fb950;
}

/* Logout button — always visible, unmistakable */
.pmvpn-btn-logout {
  padding: 6px 16px;
  background: transparent;
  border: 1px solid #da3633;
  border-radius: 6px;
  color: #da3633;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: all 0.15s;
}

.pmvpn-btn-logout:hover {
  background: #da3633;
  color: #fff;
  box-shadow: 0 0 16px rgba(218,54,51,0.3);
}

/* Connection list */
.pmvpn-conn-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pmvpn-conn-header h3 {
  margin: 0;
}

.pmvpn-btn-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #21262d;
  background: #161b22;
  color: #c9d1d9;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.pmvpn-btn-icon:hover {
  background: #21262d;
  border-color: #30363d;
}

.pmvpn-btn-remove {
  color: #484f58;
  font-size: 16px;
}

.pmvpn-btn-remove:hover {
  color: #f85149;
  border-color: #f85149;
}

.pmvpn-conn-list {
  margin-top: 8px;
}

.pmvpn-conn-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}

.pmvpn-conn-item:hover { background: #161b22; }
.pmvpn-conn-item.active { background: #1c2128; border-left-color: #58a6ff; }
.pmvpn-conn-item.connected .pmvpn-conn-status { color: #3fb950; }
.pmvpn-conn-item.error .pmvpn-conn-status { color: #f85149; }

.pmvpn-conn-info {
  flex: 1;
  min-width: 0;
}

.pmvpn-conn-name {
  font-weight: 500;
  font-size: 13px;
  color: #c9d1d9;
}

.pmvpn-conn-addr {
  font-size: 11px;
  color: #484f58;
  font-family: monospace;
}

.pmvpn-conn-status {
  font-size: 10px;
  color: #484f58;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Add form */
.pmvpn-add-form {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #21262d;
}

.pmvpn-add-form .pmvpn-input {
  margin-bottom: 6px;
}

.pmvpn-form-btns {
  display: flex;
  gap: 6px;
}

.pmvpn-form-btns .pmvpn-btn {
  flex: 1;
}
`;

export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

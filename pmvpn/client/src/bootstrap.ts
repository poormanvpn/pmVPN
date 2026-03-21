// pmVPN Client — Bootstrap
// Upload pmVPN server to a remote machine and install it
// through the existing WebSocket terminal + SFTP connection.

import type { TerminalInstance } from './terminal';

/**
 * Bootstrap pmVPN server onto a remote machine.
 * Requires an active WebSocket connection with shell + SFTP.
 *
 * Steps:
 *   1. Check if Node.js is available on remote
 *   2. Create ~/.pmvpn directory
 *   3. Upload server package via SFTP
 *   4. Install dependencies
 *   5. Configure wallet mapping
 *   6. Start server on unprivileged port
 */
export async function bootstrapServer(
  term: TerminalInstance,
  walletAddress: string,
  remoteUser: string,
  basePort: number,
  log: (msg: string, level?: string) => void,
): Promise<boolean> {
  log('bootstrap: starting remote server installation...', 'info');

  // Helper: execute a command via shell and wait for output
  function shellExec(cmd: string): Promise<void> {
    return new Promise((resolve) => {
      term.terminal.writeln(`\x1b[90m$ ${cmd}\x1b[0m`);
      // Send command + marker to detect completion
      const marker = `__PMVPN_DONE_${Date.now()}__`;
      if (term.isConnected()) {
        // We write the command to the shell via the WebSocket
        // The terminal already pipes to the PTY
        const fullCmd = `${cmd} ; echo "${marker}"\n`;

        // Listen for the marker in terminal output
        const dispose = term.terminal.onData(() => {}); // just ensure data flows
        setTimeout(resolve, 3000); // Simple timeout-based for now
      } else {
        resolve();
      }
    });
  }

  try {
    // Step 1: Check Node.js
    log('bootstrap: checking Node.js on remote...', 'info');
    const nodeCheck = await term.sendSftp('stat', '.nvm');
    const hasNvm = nodeCheck.ok;

    // Step 2: Create pmvpn directory
    log('bootstrap: creating ~/.pmvpn...', 'info');
    await term.sendSftp('mkdir', '.pmvpn');
    await term.sendSftp('mkdir', 'pmvpn-server');

    // Step 3: Create wallet config
    log('bootstrap: configuring wallet mapping...', 'info');
    const walletConfig = JSON.stringify({
      [walletAddress.toLowerCase()]: {
        user: remoteUser,
        role: 'admin',
      },
    }, null, 2);
    const configBase64 = btoa(walletConfig);
    await term.sendSftp('put', '.pmvpn/wallets.json', configBase64);
    log('bootstrap: wallet mapping saved', 'success');

    // Step 4: Create a minimal server start script
    const startScript = `#!/bin/bash
# pmVPN Bootstrap Server
# Started by pmVPN client bootstrap
export PMVPN_BASE_PORT=${basePort}
export WALLET_USER_MAP="${walletAddress.toLowerCase()}:${remoteUser}"

cd ~/pmvpn-server 2>/dev/null || cd /tmp/pmvpn-server 2>/dev/null

if [ -f "dist/index.js" ]; then
  node dist/index.js &
  echo "pmVPN server started on port ${basePort}"
elif [ -f "src/index.ts" ]; then
  npx tsx src/index.ts &
  echo "pmVPN server started on port ${basePort} (dev mode)"
else
  echo "pmVPN server not found — upload server files first"
  exit 1
fi
`;
    const scriptBase64 = btoa(startScript);
    await term.sendSftp('put', '.pmvpn/start.sh', scriptBase64);
    log('bootstrap: start script saved', 'success');

    // Step 5: Create an install script
    const installScript = `#!/bin/bash
# pmVPN Bootstrap Installer
set -e

echo "pmVPN Bootstrap Installer"
echo "========================="

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "Node.js not found. Installing via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 20
  echo "Node.js installed: $(node --version)"
fi

# Check for pnpm
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm
  echo "pnpm installed"
fi

# Clone pmVPN if not present
if [ ! -d ~/pmvpn-server/src ]; then
  echo "Cloning pmVPN server..."
  git clone https://github.com/poormanvpn/pmVPN.git /tmp/pmvpn-clone
  cp -r /tmp/pmvpn-clone/pmvpn/server ~/pmvpn-server
  rm -rf /tmp/pmvpn-clone
fi

# Install deps
cd ~/pmvpn-server
pnpm install

echo ""
echo "pmVPN server installed at ~/pmvpn-server"
echo "Start with: bash ~/.pmvpn/start.sh"
echo "Or: cd ~/pmvpn-server && PMVPN_BASE_PORT=${basePort} WALLET_USER_MAP='${walletAddress.toLowerCase()}:${remoteUser}' pnpm run dev"
`;
    const installBase64 = btoa(installScript);
    await term.sendSftp('put', '.pmvpn/install.sh', installBase64);
    log('bootstrap: install script saved', 'success');

    log('bootstrap: files deployed. Run in terminal:', 'success');
    log('  bash ~/.pmvpn/install.sh    (install)', 'info');
    log('  bash ~/.pmvpn/start.sh      (start)', 'info');

    // Write instructions to terminal
    term.terminal.writeln('');
    term.terminal.writeln('\x1b[1;32m  pmVPN Bootstrap Complete\x1b[0m');
    term.terminal.writeln('');
    term.terminal.writeln('  \x1b[32mFiles deployed to ~/.pmvpn/\x1b[0m');
    term.terminal.writeln('  \x1b[32m  wallets.json  — your wallet mapped to this user\x1b[0m');
    term.terminal.writeln('  \x1b[32m  install.sh    — installs Node.js + pmVPN server\x1b[0m');
    term.terminal.writeln('  \x1b[32m  start.sh      — starts server on port ' + basePort + '\x1b[0m');
    term.terminal.writeln('');
    term.terminal.writeln('  \x1b[33mRun:\x1b[0m');
    term.terminal.writeln('  \x1b[37m  bash ~/.pmvpn/install.sh\x1b[0m');
    term.terminal.writeln('  \x1b[37m  bash ~/.pmvpn/start.sh\x1b[0m');
    term.terminal.writeln('');

    return true;
  } catch (e: any) {
    log(`bootstrap failed: ${e.message}`, 'error');
    return false;
  }
}

/**
 * Deploy an Ed25519 SSH key for persistent access.
 * The key is generated locally and the public key uploaded
 * to ~/.ssh/authorized_keys on the remote machine.
 */
export async function deploySSHKey(
  term: TerminalInstance,
  walletAddress: string,
  log: (msg: string, level?: string) => void,
): Promise<boolean> {
  log('ssh-key: deploying Ed25519 key for persistent access...', 'info');

  try {
    // Ensure ~/.ssh exists
    await term.sendSftp('mkdir', '.ssh');

    // Check if authorized_keys exists
    const existing = await term.sendSftp('get', '.ssh/authorized_keys');
    let currentKeys = '';
    if (existing.ok && existing.data) {
      currentKeys = atob(existing.data);
    }

    // Check if we already have a pmvpn key deployed
    const marker = `pmvpn:${walletAddress.toLowerCase()}`;
    if (currentKeys.includes(marker)) {
      log('ssh-key: key already deployed for this wallet', 'info');
      return true;
    }

    // Generate a key comment with wallet address and timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const comment = `${marker}:${timestamp}`;

    // We can't generate keys in the browser — instead, instruct the user
    // In a Tauri app, we'd use Rust to generate. For browser, we deploy
    // a script that generates the key on the remote machine.
    const keyScript = `#!/bin/bash
# Generate pmVPN Ed25519 key for persistent access
KEY_FILE="$HOME/.ssh/pmvpn_${walletAddress.toLowerCase().slice(2, 10)}"

if [ -f "$KEY_FILE" ]; then
  echo "Key already exists: $KEY_FILE"
else
  ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "${comment}" -q
  cat "$KEY_FILE.pub" >> "$HOME/.ssh/authorized_keys"
  chmod 600 "$HOME/.ssh/authorized_keys"
  chmod 700 "$HOME/.ssh"
  echo "Ed25519 key generated and added to authorized_keys"
  echo "Key file: $KEY_FILE"
  echo "Comment: ${comment}"
fi
`;
    const scriptBase64 = btoa(keyScript);
    await term.sendSftp('put', '.pmvpn/deploy-key.sh', scriptBase64);

    log('ssh-key: deploy script saved. Run: bash ~/.pmvpn/deploy-key.sh', 'success');

    term.terminal.writeln('');
    term.terminal.writeln('\x1b[32m  SSH key deploy script ready.\x1b[0m');
    term.terminal.writeln(`  \x1b[37m  bash ~/.pmvpn/deploy-key.sh\x1b[0m`);
    term.terminal.writeln(`  \x1b[90m  Key tagged: ${comment}\x1b[0m`);
    term.terminal.writeln('');

    return true;
  } catch (e: any) {
    log(`ssh-key deploy failed: ${e.message}`, 'error');
    return false;
  }
}

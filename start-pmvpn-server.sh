#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only

# PMVPN Server Launcher
# Starts the pmVPN server with modular architecture from the correct directory

# Ensure we're in the project root
cd "$(dirname "$0")"

echo "Starting pmVPN server with modular architecture..."
echo "Working directory: $(pwd)"

# Run the server using tsx from the server directory (for node_modules resolution)
# but with the entry point at the project root (for ES module import paths)
cd pmvpn/server
# The entry point lives at the repo root, outside server/, so Node needs to be told
# where server/node_modules is (the fleet modules import ws from there).
NODE_PATH="$(pwd)/node_modules${NODE_PATH:+:$NODE_PATH}" exec pnpm exec tsx ../../pmvpn-server-entry.ts
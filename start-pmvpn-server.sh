#!/bin/bash

# PMVPN Server Launcher
# Starts the pmVPN server with modular architecture from the correct directory

# Ensure we're in the project root
cd "$(dirname "$0")"

echo "Starting pmVPN server with modular architecture..."
echo "Working directory: $(pwd)"

# Run the server using tsx from the server directory (for node_modules resolution)
# but with the entry point at the project root (for ES module import paths)
cd pmvpn/server
pnpm exec tsx ../../pmvpn-server-entry.ts
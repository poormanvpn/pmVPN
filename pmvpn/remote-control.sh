#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# pmVPN Remote Control — Claude Code session launcher
# MIT License
#
# Starts a Claude Code Remote Control server pointed at the pmVPN project.
# Access the session from any browser (claude.ai/code) or the Claude mobile app.
#
# Usage:
#   ./remote-control.sh                  # Default: server mode, worktree isolation
#   ./remote-control.sh --interactive    # Interactive mode (local terminal + remote)
#   ./remote-control.sh --attach         # Attach remote control to existing session
#   ./remote-control.sh --status         # Show Claude Code version and auth status

set -euo pipefail

# --- Configuration ---
PMVPN_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_NAME="pmVPN"
SPAWN_MODE="worktree"
CAPACITY=8

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

banner() {
  echo -e "${CYAN}${BOLD}"
  echo "  ┌─────────────────────────────────────────┐"
  echo "  │         pmVPN Remote Control             │"
  echo "  │   Claude Code on your phone, tablet,     │"
  echo "  │   or any browser — running locally.      │"
  echo "  └─────────────────────────────────────────┘"
  echo -e "${RESET}"
}

check_claude() {
  if ! command -v claude &>/dev/null; then
    echo -e "${RED}Error: claude command not found.${RESET}"
    echo "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/getting-started"
    exit 1
  fi

  local version
  version=$(claude --version 2>/dev/null || echo "unknown")
  echo -e "${GREEN}Claude Code version: ${version}${RESET}"
}

check_auth() {
  echo -e "Checking authentication..."
  if claude auth status &>/dev/null 2>&1; then
    echo -e "${GREEN}Authenticated with claude.ai${RESET}"
  else
    echo -e "${RED}Not authenticated. Run: claude auth login${RESET}"
    exit 1
  fi
}

mode_server() {
  banner
  check_claude
  echo ""
  echo -e "${BOLD}Starting Remote Control server...${RESET}"
  echo -e "  Project:  ${CYAN}${PMVPN_DIR}${RESET}"
  echo -e "  Name:     ${CYAN}${SESSION_NAME}${RESET}"
  echo -e "  Spawn:    ${CYAN}${SPAWN_MODE}${RESET}"
  echo -e "  Capacity: ${CYAN}${CAPACITY}${RESET}"
  echo ""
  echo -e "Connect from ${BOLD}claude.ai/code${RESET} or the Claude mobile app."
  echo -e "Press ${BOLD}spacebar${RESET} to show QR code for phone access."
  echo ""

  cd "$PMVPN_DIR"
  exec claude remote-control \
    --name "$SESSION_NAME" \
    --spawn "$SPAWN_MODE" \
    --capacity "$CAPACITY" \
    --verbose
}

mode_interactive() {
  banner
  check_claude
  echo ""
  echo -e "${BOLD}Starting interactive session with Remote Control...${RESET}"
  echo ""

  cd "$PMVPN_DIR"
  exec claude --remote-control "$SESSION_NAME"
}

mode_attach() {
  banner
  echo -e "${BOLD}Attaching Remote Control to current session...${RESET}"
  echo "Run this inside an active Claude Code session:"
  echo ""
  echo "  /remote-control $SESSION_NAME"
  echo ""
  echo "Or start a new interactive session:"
  echo ""
  echo "  claude --remote-control \"$SESSION_NAME\""
  echo ""
}

mode_status() {
  check_claude
  echo ""
  claude auth status 2>&1 || true
}

# --- Main ---
case "${1:-}" in
  --interactive|-i)
    mode_interactive
    ;;
  --attach|-a)
    mode_attach
    ;;
  --status|-s)
    mode_status
    ;;
  --help|-h)
    banner
    echo "Usage: $0 [option]"
    echo ""
    echo "Options:"
    echo "  (none)            Start Remote Control server (default)"
    echo "  --interactive, -i Start interactive session with remote access"
    echo "  --attach, -a      Show instructions to attach to existing session"
    echo "  --status, -s      Check Claude Code version and auth status"
    echo "  --help, -h        Show this help"
    echo ""
    echo "Environment:"
    echo "  SESSION_NAME      Session title (default: pmVPN)"
    echo "  SPAWN_MODE        worktree or same-dir (default: worktree)"
    echo "  CAPACITY          Max concurrent sessions (default: 8)"
    ;;
  *)
    mode_server
    ;;
esac

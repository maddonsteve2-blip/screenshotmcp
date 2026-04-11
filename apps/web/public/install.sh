#!/usr/bin/env bash
# ScreenshotsMCP — one-line installer
# Usage: curl -fsSL https://screenshotsmcp.com/install.sh | bash
# With client: curl -fsSL https://screenshotsmcp.com/install.sh | bash -s -- cursor
# AI agents: run `npx screenshotsmcp setup` or `npx screenshotsmcp setup --client windsurf`
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}  ScreenshotsMCP Installer${RESET}"
echo ""

# --- Check Node.js ---
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found.${RESET}"
  echo -e "  Install Node.js 18+ from ${DIM}https://nodejs.org${RESET}"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${YELLOW}⚠ Node.js v${NODE_VERSION} detected. ScreenshotsMCP requires v18+.${RESET}"
  echo -e "  Upgrade at ${DIM}https://nodejs.org${RESET}"
  exit 1
fi
echo -e "${GREEN}✓${RESET} Node.js v$(node -v | sed 's/v//') detected"

# --- Check if already installed ---
if command -v screenshotsmcp &> /dev/null; then
  CURRENT=$(screenshotsmcp --version 2>/dev/null || echo "unknown")
  echo -e "${GREEN}✓${RESET} screenshotsmcp already installed (v${CURRENT})"
  echo -e "${DIM}  Updating...${RESET}"
  npm update -g screenshotsmcp
else
  echo -e "${DIM}  Installing screenshotsmcp...${RESET}"
  npm install -g screenshotsmcp
fi

echo -e "${GREEN}✓${RESET} screenshotsmcp installed (v$(screenshotsmcp --version 2>/dev/null || echo 'latest'))"
echo ""

# --- Accept argument: curl ... | bash -s -- cursor ---
ARG_CLIENT="${1:-}"

# --- Run interactive setup (always lets user choose/confirm) ---
if [ -n "$ARG_CLIENT" ]; then
  screenshotsmcp setup --client "$ARG_CLIENT"
else
  screenshotsmcp setup
fi

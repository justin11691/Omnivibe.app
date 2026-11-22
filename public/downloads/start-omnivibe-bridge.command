#!/bin/bash
cd "$(dirname "$0")"
echo "Starting OmniVibe Studio Local Companion Bridge (ws://127.0.0.1:47890)..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. Download from https://nodejs.org/"
  read -p "Press Enter to exit..."
  exit 1
fi
node ./omnivibe-local-companion-bridge.mjs

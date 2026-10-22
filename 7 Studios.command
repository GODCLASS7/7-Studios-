#!/bin/bash
# Double-click to open 7 Studios on this Mac. It runs here, in this window, until you
# press Ctrl+C or close the window; nothing is shared with other computers.
cd "$(dirname "$0")" || exit 1
if curl -s -o /dev/null --max-time 1 http://127.0.0.1:7777/api/status; then
  echo "7 Studios is already running: opening it."
  open "http://127.0.0.1:7777"
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed yet. Run the one-time setup first:  bash scripts/install.sh"
  read -r -p "Press Return to close."
  exit 1
fi
[ -d node_modules ] || npm i --loglevel=error
npm run app

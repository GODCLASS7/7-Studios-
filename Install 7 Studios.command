#!/bin/bash
# Double-click to set up 7 Studios on this Mac, put it in Launchpad, and open it.
# Needs Homebrew first (its .pkg installer: https://github.com/Homebrew/brew/releases/latest).
# Safe to run again.
cd "$(dirname "$0")" || exit 1
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
if ! bash scripts/install.sh; then
  echo
  echo "Setup stopped: the message above says what's missing. Fix it, then double-click this file again."
  read -r -p "Press Return to close."
  exit 1
fi
bash scripts/make-mac-app.sh || true
echo
echo "Opening 7 Studios. Keep this window open while you use it; close it to stop."
npm run app

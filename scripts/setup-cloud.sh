#!/usr/bin/env bash
# One-time setup for Claude Code cloud containers (Linux glibc).
# The lockfile only pins the musl compositor; install the glibc one to match.
set -euo pipefail
cd "$(dirname "$0")/.."
npm i --loglevel=error
VERSION=$(node -p "require('./node_modules/remotion/package.json').version")
npm i --no-save --loglevel=error "@remotion/compositor-linux-x64-gnu@${VERSION}"
echo "Cloud setup done (Remotion ${VERSION})."

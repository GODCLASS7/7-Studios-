#!/usr/bin/env bash
# One-paste setup on a Mac or Linux computer. Run it from the unzipped project folder:
#
#   bash scripts/install.sh
#
# Checks Node and ffmpeg (installs them with Homebrew on a Mac that has it; on Linux it
# prints the command, since that needs your password), installs the packages, builds
# the sound-effects pack, creates .env from the template (no keys: add your own), starts
# a git history if there isn't one, and ends with `npm run doctor`. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n▸ %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

say "Node"
if ! have node; then
  if [ "$(uname)" = "Darwin" ] && have brew; then
    brew install node@22 && brew link --overwrite node@22
  else
    echo "Node is not installed. Install Node 22 LTS from https://nodejs.org (or: sudo apt install nodejs npm), then run this again."
    exit 1
  fi
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(!(a>22||(a===22&&b>=13)||(a===20&&b>=19))){console.error("Node "+process.versions.node+" is too old: install Node 22 LTS from https://nodejs.org"); process.exit(1)}'
node --version

say "ffmpeg"
if ! have ffmpeg; then
  if [ "$(uname)" = "Darwin" ] && have brew; then
    brew install ffmpeg
  else
    echo "ffmpeg is not installed. Run: sudo apt install ffmpeg   (or your system's package manager), then run this again."
    exit 1
  fi
fi
ffmpeg -hide_banner -version | head -1

say "Packages"
npm i --loglevel=error
if [ "$(uname)" = "Linux" ] && [ ! -f /etc/alpine-release ]; then
  # The lockfile pins the musl compositor; standard Linux needs the glibc one.
  VERSION=$(node -p "require('./node_modules/remotion/package.json').version")
  npm i --no-save --loglevel=error "@remotion/compositor-linux-x64-gnu@${VERSION}"
fi

say "Sound effects"
[ -f public/audio/sfx/pop.wav ] || npm run --silent sfx

say "Keys"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from the template. Add your own keys there (never paste them into a chat)."
else
  echo ".env already exists; left as it is."
fi

say "History"
if [ ! -d .git ]; then
  git init -q && git add -A && git -c user.name="motion-studio" -c user.email="studio@localhost" commit -qm "Start Motion Studio" && echo "Started a git history. Push it to a private repo for a backup (npm run doctor shows how)."
else
  echo "Git history already there."
fi

say "Check"
npm run --silent doctor || true
echo
echo "Done. Start the preview with: npm run dev"

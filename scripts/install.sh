#!/usr/bin/env bash
# One-paste setup on a Mac or Linux computer. Run it from the unzipped project folder:
#
#   bash scripts/install.sh
#
# Checks Node and ffmpeg (installs them with Homebrew on a Mac, and says how to get
# Homebrew if it's missing; on Linux it prints the command, since that needs your
# password), installs the packages, builds
# the sound-effects pack, creates .env from the template (no keys: add your own), starts
# a git history if there isn't one, and ends with `npm run doctor`. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n▸ %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
MAC=false; [ "$(uname)" = "Darwin" ] && MAC=true

if $MAC; then
  # Homebrew on Apple silicon lives in /opt/homebrew, which new Terminal windows only
  # find once ~/.zprofile says so (Homebrew's own "next steps").
  if ! have brew && [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
  if [ -x /opt/homebrew/bin/brew ] && ! grep -qs "brew shellenv" "$HOME/.zprofile"; then
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
    echo "Added Homebrew to ~/.zprofile, so new Terminal windows find Node and ffmpeg."
  fi
  if ! have brew && { ! have node || ! have ffmpeg; }; then
    echo "This Mac needs Homebrew first: it installs Node and ffmpeg. Paste this line, press Return and follow its steps:"
    echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo "Then close Terminal, open it again in this folder and run: bash scripts/install.sh"
    exit 1
  fi
fi

say "Node"
if ! have node; then
  if $MAC; then
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
  if $MAC; then
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

# Unzipping can drop the "runnable" mark, and macOS may hold back a downloaded launcher.
chmod +x "7 Studios.command" scripts/*.sh 2>/dev/null || true
if $MAC; then xattr -d com.apple.quarantine "7 Studios.command" 2>/dev/null || true; fi

say "History"
if [ -d .git ]; then
  echo "Git history already there."
elif ! git --version >/dev/null 2>&1; then
  echo "Skipped: git isn't installed (on a Mac: xcode-select --install). The studio works without it."
else
  git init -q && git add -A && git -c user.name="7-studios" -c user.email="studio@localhost" commit -qm "Start 7 Studios" && echo "Started a git history. Push it to a private repo for a backup (npm run doctor shows how)."
fi

say "Check"
npm run --silent doctor || true
echo
echo "Done. Open 7 Studios with: npm run app   (or double-click \"7 Studios.command\")"
if $MAC; then echo "Put it in your Dock as an app: bash scripts/make-mac-app.sh"; fi

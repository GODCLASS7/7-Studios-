#!/bin/bash
# Make "7 Studios.app" in ~/Applications, with the 7 Studios icon, so it opens from
# Launchpad, Spotlight or the Dock like any app. It starts the studio in a Terminal
# window (close that window to stop it) and opens it in your browser.
#
#   bash scripts/make-mac-app.sh
#
# Run it again after moving the studio folder.
set -e
[ "$(uname)" = "Darwin" ] || { echo "This makes a macOS app; run it on your Mac."; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/7 Studios.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>7 Studios</string>
  <key>CFBundleDisplayName</key><string>7 Studios</string>
  <key>CFBundleIdentifier</key><string>local.seven-studios.launcher</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>7studios</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict>
</plist>
PLIST
cat > "$APP/Contents/MacOS/7studios" <<LAUNCH
#!/bin/bash
open -a Terminal "$ROOT/7 Studios.command"
LAUNCH
chmod +x "$APP/Contents/MacOS/7studios" "$ROOT/7 Studios.command"
# The icon, from the app's own 512 px icon.
SET="$(mktemp -d)/icon.iconset"
mkdir -p "$SET"
SRC="$ROOT/app/ui/public/icon-512.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$SET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ $d -le 512 ] && sips -z $d $d "$SRC" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$APP/Contents/Resources/icon.icns"
touch "$APP"
echo "✔ $APP"
echo "  Open it from Launchpad or Spotlight; to keep it in the Dock, right-click its Dock icon → Options → Keep in Dock."

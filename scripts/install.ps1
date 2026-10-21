# One-paste setup on Windows. Run it from the unzipped project folder, in PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
#
# Checks Node and ffmpeg (installs them with winget if they're missing), installs the
# packages, builds the sound-effects pack, creates .env from the template (no keys: add
# your own), starts a git history if there isn't one, and ends with `npm run doctor`.
# Safe to run again.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Say($t) { Write-Host "`n> $t" -ForegroundColor Cyan }
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }

Say "Node"
if (-not (Have node)) {
  if (Have winget) { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements; Refresh-Path }
  else { Write-Host "Install Node 22 LTS from https://nodejs.org, then run this again."; exit 1 }
}
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(!(a>22||(a===22&&b>=13)||(a===20&&b>=19))){console.error("Node "+process.versions.node+" is too old: install Node 22 LTS from https://nodejs.org"); process.exit(1)}'
if ($LASTEXITCODE -ne 0) { exit 1 }
node --version

Say "ffmpeg"
if (-not (Have ffmpeg)) {
  if (Have winget) { winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements; Refresh-Path }
  else { Write-Host "Install a full ffmpeg build (https://www.gyan.dev/ffmpeg/builds/) and add it to PATH, then run this again."; exit 1 }
}
(ffmpeg -hide_banner -version | Select-Object -First 1)

Say "Packages"
npm i --loglevel=error
if ($LASTEXITCODE -ne 0) { exit 1 }

Say "Sound effects"
if (-not (Test-Path "public/audio/sfx/pop.wav")) { npm run --silent sfx }

Say "Keys"
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from the template. Add your own keys there (never paste them into a chat)."
} else { Write-Host ".env already exists; left as it is." }

Say "History"
if (-not (Test-Path ".git")) {
  if (Have git) {
    git init -q; git add -A; git -c user.name="motion-studio" -c user.email="studio@localhost" commit -qm "Start Motion Studio"
    Write-Host "Started a git history. Push it to a private repo for a backup (npm run doctor shows how)."
  } else { Write-Host "Git isn't installed (winget install Git.Git): the project has no history or backup yet." }
} else { Write-Host "Git history already there." }

Say "Check"
npm run --silent doctor
Write-Host "`nDone. Start the preview with: npm run dev"

# ScreenshotsMCP — one-line installer for Windows PowerShell
# Usage: irm https://screenshotsmcp.com/install.ps1 | iex
# With client: $env:SMCP_CLIENT="cursor"; irm https://screenshotsmcp.com/install.ps1 | iex
# AI agents: run `npx screenshotsmcp setup` or `npx screenshotsmcp setup --client windsurf`

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ScreenshotsMCP Installer" -ForegroundColor White
Write-Host ""

# --- Check Node.js ---
try {
  $nodeVersion = (node -v 2>$null)
  if (-not $nodeVersion) { throw "not found" }
  $major = [int]($nodeVersion -replace 'v','').Split('.')[0]
  if ($major -lt 18) {
    Write-Host "  Node.js v$major detected. ScreenshotsMCP requires v18+." -ForegroundColor Yellow
    Write-Host "  Upgrade at https://nodejs.org" -ForegroundColor DarkGray
    exit 1
  }
  Write-Host "  Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
  Write-Host "  Node.js not found." -ForegroundColor Red
  Write-Host "  Install Node.js 18+ from https://nodejs.org" -ForegroundColor DarkGray
  exit 1
}

# --- Install or update ---
$existing = Get-Command screenshotsmcp -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "  screenshotsmcp already installed. Updating..." -ForegroundColor DarkGray
  npm update -g screenshotsmcp
} else {
  Write-Host "  Installing screenshotsmcp..." -ForegroundColor DarkGray
  npm install -g screenshotsmcp
}

Write-Host "  screenshotsmcp installed" -ForegroundColor Green
Write-Host ""

# --- Run interactive setup ---
$client = $env:SMCP_CLIENT
if ($client) {
  screenshotsmcp setup --client $client
} else {
  screenshotsmcp setup
}

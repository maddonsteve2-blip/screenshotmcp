# DeepSyte — one-line installer for Windows PowerShell
# Usage: irm https://deepsyte.com/install.ps1 | iex
# With client: $env:SMCP_CLIENT="cursor"; irm https://deepsyte.com/install.ps1 | iex
# AI agents: run `npx deepsyte setup` or `npx deepsyte setup --client windsurf`

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  DeepSyte Installer" -ForegroundColor White
Write-Host ""

# --- Check Node.js ---
try {
  $nodeVersion = (node -v 2>$null)
  if (-not $nodeVersion) { throw "not found" }
  $major = [int]($nodeVersion -replace 'v','').Split('.')[0]
  if ($major -lt 18) {
    Write-Host "  Node.js v$major detected. DeepSyte requires v18+." -ForegroundColor Yellow
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
$existing = Get-Command deepsyte -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "  deepsyte already installed. Updating..." -ForegroundColor DarkGray
  npm update -g deepsyte
} else {
  Write-Host "  Installing deepsyte..." -ForegroundColor DarkGray
  npm install -g deepsyte
}

Write-Host "  deepsyte installed" -ForegroundColor Green
Write-Host ""

# --- Run interactive setup ---
$client = $env:SMCP_CLIENT
if ($client) {
  deepsyte setup --client $client
} else {
  deepsyte setup
}

# Changelog

## 0.1.0

- Added `📸 Screenshot` and `🔍 Audit` CodeLens actions above every URL in markdown, JS/TS, JSON, YAML, and HTML files (gated behind `screenshotsmcp.codeLens.urlActions`, defaults on)
- Added a rich skill preview WebView that renders the full `SKILL.md` with an **Install skill** button — clicking a catalog skill in the sidebar now previews before installing
- Switched the skill catalog to a hosted `index.json` at `/.skills/index.json` with 24h client-side cache and transparent fallback to the in-code catalog when offline
- Fixed the double source of truth for embedded skill content — the extension and the web docs now share the same `.md` sources in `@screenshotsmcp/types`
- Narrowed extension activation: removed `onStartupFinished`; extension now activates on command palette, sidebar open, URI handler, or when a workspace contains `.vscode/mcp.json` or `.cursor/mcp.json`
- Added `screenshotsmcp.takeScreenshotAtUrl` and `screenshotsmcp.auditUrl` commands
- Removed tracked `.vsix` build artifacts from the repo and added `.gitignore`
- Fixed cross-package relative import in `skills.ts` (now `@screenshotsmcp/types/skills`)

## 0.0.10

- Added automatic managed core skill sync alongside startup restoration, sign-in, and manual editor integration repair
- Added `ScreenshotsMCP: Sync Core Skill` for installing, updating, or repairing the managed skill in `~/.agents/skills/screenshotsmcp`
- Exposed the core skill sync action in the Activity Bar sidebar

## 0.0.9

- Automatically configured the current editor's MCP integration after successful sign-in
- Repaired editor MCP configuration automatically on startup when credentials are already stored
- Cleared extension-managed MCP config entries when signing out
- Renamed the manual install command to `Configure Editor Integration` to match the new behavior

## 0.0.8

- Normalized old `screenshotsmcp.com` dashboard and keys overrides to `www.screenshotmcp.com`
- Reopened the browser when sign-in is retried while an OAuth flow is already pending

## 0.0.7

- Improved browser-to-editor OAuth handoff with a fallback return path from the web authorize page
- Removed the lingering browser sign-in notification after OAuth completes in the editor
- Added runtime editor identity logging to help verify Windsurf versus VS Code callback behavior

## 0.0.6

- Added browser-based OAuth sign-in with automatic startup connect when no credentials are stored
- Kept API key paste and dashboard key retrieval as fallback sign-in options
- Updated the extension callback handling to complete OAuth inside VS Code

## 0.0.5

- Updated the extension dashboard and API key links to the confirmed `www.screenshotmcp.com` custom domain

## 0.0.4

- Switched default dashboard and API key URLs back to the working Vercel web app while the custom domain cutover is being finalized
- Recorded the domain fallback fix for the next Marketplace update

## 0.0.3

- Added a ScreenshotsMCP Activity Bar sidebar with quick actions and recent activity
- Kept the timeline panel available as a detailed secondary view
- Refreshed the VSIX package for the Marketplace follow-up update

## 0.0.2

- Updated Marketplace packaging metadata and publisher alignment
- Replaced the extension icon with the latest square MCP logo
- Refreshed the VSIX package for Marketplace upload

## 0.0.1

- Initial preview release scaffold for the ScreenshotsMCP VS Code extension
- Secure API key sign-in and sign-out flows
- Connection status checks and output channel logging
- Workspace MCP installation command
- Screenshot capture command with result actions
- Live activity timeline panel preview

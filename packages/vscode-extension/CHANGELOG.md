# Changelog

## 0.8.0

- **URL history** — every screenshot and audit is recorded per-URL in global state (max 20 entries × 200 URLs)
- **URL history WebView** — thumbnails for every past run, badges for `screenshot` vs `audit`, buttons to re-capture/re-audit the same URL, open image, or view the dashboard run
- New commands:
  - `ScreenshotsMCP: Show URL History` (palette + Quick Actions)
  - `ScreenshotsMCP: Show History for Selected URL` (right-click a URL in the editor)
- 4 new unit tests for `UrlHistoryStore` (36 total)

## 0.7.0

- **Chat participant** `@screenshotsmcp` — works in Copilot Chat, Continue, or any client that supports the VS Code Chat API
  - `/screenshot <url>` — capture a page with one click
  - `/audit <url>` — run a UX/SEO/accessibility review
  - `/workflow` — list packaged runbooks from installed skills
  - `/timeline` — recent activity with a button to open the full panel
  - Plain URLs also trigger screenshot + audit suggestions
- Extracted pure `chat/parse.ts` intent detector covered by 7 new tests (32 total)

## 0.6.0

- **Audit diagnostics** — UX review findings now surface as entries in the **Problems** tab, anchored to the audited URL's location when it appears in an open document (markdown, JS/TS, JSON, YAML, HTML). Fall back to a synthetic URI otherwise
- Accessibility & performance findings map to Warnings; SEO / content / navigation / mobile map to Information; purely positive bullets are filtered out
- New command: `ScreenshotsMCP: Clear Audit Diagnostics`
- Pure `auditParse.ts` module extracted for unit testing — 5 new tests covering parsing, severity, positive-bullet filtering

## 0.5.0

- **Workflows section** in the sidebar — auto-discovers every `~/.agents/skills/<skill>/workflows/<id>/WORKFLOW.md` from installed skills
- New **Workflow preview** WebView — renders the workflow markdown with **Copy as prompt** (wraps it in a "follow this runbook" prompt) and **Open file** actions
- New command: `ScreenshotsMCP: Open Workflow` (palette + Quick Actions)
- Extracted `discoverWorkflows` into a pure module covered by unit tests

## 0.4.0

- **Timeline panel redesign** — events now show inline **screenshot thumbnails**, a **filter bar** (All · 📸 Screenshots · 🔍 Audits · Runs · Info), and **per-row actions** (Rerun, Re-audit, Open URL, Open image, View run, Clear)
- `TimelineEvent` now carries `kind`, `thumbnailUrl`, `targetUrl`, `runUrl` — screenshot and audit commands populate these automatically
- Added `View run` deep-link to dashboard runs wherever a run id surfaces

## 0.3.0

- New **Get started with ScreenshotsMCP** walkthrough (auto-opens on first install) — sign in → first screenshot → first audit → CodeLens → skills, in 5 clicks
- Status bar item now opens a **Quick Actions** menu (take screenshot, audit URL, open timeline, create skill, open dashboard, sign out) when authenticated
- New command palette entry: `ScreenshotsMCP: Quick Actions` (`screenshotsmcp.showQuickActions`)

## 0.2.0

- Inline **Screenshot** WebView panel — captured images render alongside the editor with open, copy, rerun, and "View run" toolbar actions
- Inline **Audit** WebView panel — UX review results render as structured sections with a hero screenshot, re-audit, and dashboard deep-link
- Added dashboard run deep-link (`View run`) extracted from any tool response that mentions a run id or `/dashboard/runs/<id>` URL
- Added editor context menu entries: **ScreenshotsMCP: Screenshot Selected URL** and **ScreenshotsMCP: Audit Selected URL**
- Added `ScreenshotsMCP: Create Skill` skill-authoring scaffold that writes a ready-to-edit `SKILL.md` into `~/.agents/skills/<name>/`
- New unit tests for Phase 1 code — `extractRunUrl` branches and the `findUrlsForCodeLens` URL scanner
- Extracted `findUrlsForCodeLens` into a pure `urlScan.ts` module so it's testable without the `vscode` runtime

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

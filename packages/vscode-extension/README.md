# ScreenshotsMCP for VS Code

ScreenshotsMCP brings secure ScreenshotsMCP access into VS Code with an Activity Bar sidebar, automatic browser OAuth sign-in, API key fallback, command palette actions, automatic editor MCP setup, screenshot capture, output logs, and a live activity timeline panel.
It also keeps the managed core ScreenshotsMCP skill in `~/.agents/skills/screenshotsmcp` installed and repaired alongside the editor integration.

## Current preview features

- Activity Bar sidebar with quick actions and recent activity
- Automatic browser OAuth sign-in on startup when not yet connected
- Secure API key storage with VS Code SecretStorage
- `ScreenshotsMCP: Sign In` and `ScreenshotsMCP: Sign Out`
- `ScreenshotsMCP: Check Status`
- `ScreenshotsMCP: Take Screenshot`
- `ScreenshotsMCP: Open Timeline`
- `ScreenshotsMCP: Configure Editor Integration`
- `ScreenshotsMCP: Sync Core Skill`
- Native MCP server definition provider registration
- Output channel logging for troubleshooting

## Quick start

1. Open the ScreenshotsMCP icon in the Activity Bar.
2. If you are not already connected, ScreenshotsMCP opens the browser sign-in flow automatically.
3. Approve the connection in your browser and return to VS Code.
4. The extension automatically configures the matching MCP integration for your editor when needed and syncs the managed core skill.
5. Use the sidebar `Check Status` action.
6. Use `Take Screenshot` from the sidebar or command palette.

If you prefer, `ScreenshotsMCP: Sign In` still offers manual API key paste and the dashboard keys page as fallback options.

## Configure editor integration manually

Use `ScreenshotsMCP: Configure Editor Integration` to repair or reinstall the ScreenshotsMCP MCP connection for the current editor.

## Sync the managed core skill manually

Use `ScreenshotsMCP: Sync Core Skill` to install, update, or repair the managed ScreenshotsMCP skill stored at `~/.agents/skills/screenshotsmcp`.

## Timeline panel

Use `ScreenshotsMCP: Open Timeline` to view recent extension activity, including activation, sign-in, automatic editor setup, status checks, and screenshot events.

## Settings

The extension contributes the following settings:

- `screenshotsmcp.apiUrl`
- `screenshotsmcp.dashboardUrl`
- `screenshotsmcp.keysUrl`

## Service URLs

- Website: https://www.screenshotmcp.com
- Dashboard: https://www.screenshotmcp.com/dashboard
- API: https://screenshotsmcp-api-production.up.railway.app

## Notes

This extension is currently published as a preview build while the Marketplace release is being finalized.

# deepsyte for VS Code

deepsyte brings secure deepsyte access into VS Code with an Activity Bar sidebar, automatic browser OAuth sign-in, API key fallback, command palette actions, automatic editor MCP setup, screenshot capture, output logs, and a live activity timeline panel.
It also keeps the managed core deepsyte skill in `~/.agents/skills/deepsyte` installed and repaired alongside the editor integration.

## Current preview features

- Activity Bar sidebar with quick actions and recent activity
- Automatic browser OAuth sign-in on startup when not yet connected
- Secure API key storage with VS Code SecretStorage
- `deepsyte: Sign In` and `deepsyte: Sign Out`
- `deepsyte: Check Status`
- `deepsyte: Take Screenshot`
- `deepsyte: Open Timeline`
- `deepsyte: Configure Editor Integration`
- `deepsyte: Sync Core Skill`
- Native MCP server definition provider registration
- Output channel logging for troubleshooting

## Quick start

1. Open the deepsyte icon in the Activity Bar.
2. If you are not already connected, deepsyte opens the browser sign-in flow automatically.
3. Approve the connection in your browser and return to VS Code.
4. The extension automatically configures the matching MCP integration for your editor when needed and syncs the managed core skill.
5. Use the sidebar `Check Status` action.
6. Use `Take Screenshot` from the sidebar or command palette.

If you prefer, `deepsyte: Sign In` still offers manual API key paste and the dashboard keys page as fallback options.

## Configure editor integration manually

Use `deepsyte: Configure Editor Integration` to repair or reinstall the deepsyte MCP connection for the current editor.

## Sync the managed core skill manually

Use `deepsyte: Sync Core Skill` to install, update, or repair the managed deepsyte skill stored at `~/.agents/skills/deepsyte`.

## Timeline panel

Use `deepsyte: Open Timeline` to view recent extension activity, including activation, sign-in, automatic editor setup, status checks, and screenshot events.

## Settings

The extension contributes the following settings:

- `deepsyte.apiUrl`
- `deepsyte.dashboardUrl`
- `deepsyte.keysUrl`

## Service URLs

- Website: https://www.deepsyte.com
- Dashboard: https://www.deepsyte.com/dashboard
- API: https://deepsyte-api-production.up.railway.app

## Notes

This extension is currently published as a preview build while the Marketplace release is being finalized.

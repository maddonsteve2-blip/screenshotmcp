# ScreenshotsMCP VS Code Extension Smoke Tests

## Preconditions

- Run `npm install` at the repo root.
- Run `npm run build` in `packages/vscode-extension` or use the workspace task.
- Start the extension with the `ScreenshotsMCP Extension` launch configuration.
- Have a valid ScreenshotsMCP account available for browser OAuth sign-in.
- Keep a valid `sk_live_...` API key available to test the manual fallback.

## Core smoke checklist

### 1. Activation and UI

- Launch the Extension Development Host.
- Confirm a ScreenshotsMCP Activity Bar icon appears in the side menu.
- Open the ScreenshotsMCP sidebar and confirm the `Home` view loads.
- Confirm the `ScreenshotsMCP Sign In` status bar item appears when no key is stored.
- Confirm the extension automatically opens the browser OAuth sign-in flow when no credentials are stored.
- Run `ScreenshotsMCP: Show Output` and confirm activation logs appear.

### 2. Sign in flow

- Run `ScreenshotsMCP: Sign In`.
- Confirm `Sign in with browser (OAuth)` is offered as the primary sign-in option.
- Complete the browser sign-in flow and confirm VS Code connects successfully.
- Confirm the extension automatically configures the matching MCP integration for the current editor after sign-in.
- Confirm the extension also installs or repairs the managed core skill in `~/.agents/skills/screenshotsmcp` after sign-in.
- Run `ScreenshotsMCP: Sign Out`.
- Run `ScreenshotsMCP: Sign In` again.
- Choose `Paste API key`.
- Enter an invalid key and confirm the extension rejects it.
- Repeat with a valid key and confirm the success notification appears.
- Confirm the status bar updates to connected state.

### 3. Connection status

- Run `ScreenshotsMCP: Check Status`.
- Confirm the connection check succeeds and points at the configured API URL.

### 4. Screenshot command

- Run `ScreenshotsMCP: Take Screenshot`.
- Enter `https://example.com`.
- Confirm the command completes successfully.
- Verify `Open`, `Copy URL`, and `Show Output` behave as expected.

### 5. Sidebar and timeline panel

- Use the sidebar quick actions for `Check Status` and `Take Screenshot` and confirm they work.
- Confirm the sidebar recent activity list updates after commands run.
- Run `ScreenshotsMCP: Open Timeline`.
- Confirm recent events such as activation, sign-in, status checks, and screenshot activity appear in the panel.
- Confirm the timeline updates after running another command without reopening the panel.

### 6. Editor MCP integration

- Run `ScreenshotsMCP: Configure Editor Integration`.
- Confirm the correct MCP config is created or updated for the active editor.
- Verify the `screenshotsmcp` entry is present and preserves unrelated existing MCP servers.
- Re-run the command and confirm it reports the editor is already configured or repairs the config cleanly.
- Confirm the command also reports that the core ScreenshotsMCP skill was verified, updated, or repaired.

### 6.5. Core skill sync

- Run `ScreenshotsMCP: Sync Core Skill`.
- Confirm the command succeeds and reports the managed skill path under `~/.agents/skills/screenshotsmcp`.
- Temporarily modify or remove the local `SKILL.md`, rerun the command, and confirm the managed skill is repaired.

### 7. Sign out flow

- Run `ScreenshotsMCP: Sign Out`.
- Confirm credentials are cleared.
- Confirm any extension-managed MCP config entry is removed.
- Confirm the status bar returns to the sign-in state.

## Regression notes

Record results for:

- VS Code stable
- VS Code insiders
- Windsurf or Cursor compatibility check for non-provider commands

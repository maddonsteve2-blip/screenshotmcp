# deepsyte Chrome Extension Smoke Tests

## Automated E2E harness

Run from the repo root:

```bash
npm run test:chrome-extension:e2e
```

## Preconditions

- Run `npm install` at the repo root.
- Keep the web app running locally at `http://localhost:3456`, or set `CHROME_EXTENSION_E2E_BASE_URL`.
- Keep a valid `sk_live_...` deepsyte API key available in either:
  - `deepsyte_API_KEY`, or
  - `~/.config/deepsyte/config.json`
- Make sure Playwright browsers are installed locally.

## Optional environment variables

- `CHROME_EXTENSION_E2E_BASE_URL` — override the localhost page under test.
- `CHROME_EXTENSION_E2E_PUBLIC_URL` — override the public URL used for platform-backed checks.
- `CHROME_EXTENSION_E2E_SKIP_PUBLIC=1` — run only localhost fallback checks.
- `deepsyte_API_KEY` — explicitly provide the API key used by the extension during the test.

## What the harness validates

### 1. Extension boot

- Launches Chromium with the unpacked extension loaded.
- Waits for the Manifest V3 service worker to be ready.

### 2. Extension auth

- Opens the real popup UI.
- Saves the deepsyte API key through the popup settings flow.
- Confirms the popup reports a saved key state.

### 3. Localhost fallback flow

- Uses the popup navigation control to send the active tab to `google.com`.
- Returns the active tab to the local landing page.
- Opens the local landing page.
- Verifies `Read Text` resolves via `local-dom`.
- Verifies `Read DOM` resolves via `local-dom`.
- Verifies viewport capture succeeds.
- Verifies full-page capture succeeds.
- Verifies screenshots are written to extension storage.

### 4. Public-page platform flow

- Opens a public page.
- Verifies `Read Text` resolves via `platform-mcp`.
- Verifies viewport capture succeeds through the platform-backed path.
- Verifies the capture includes a cloud URL.

## Notes

- The harness sends the same runtime messages the popup uses, so it exercises the real background worker logic.
- It intentionally keeps `openViewer` disabled during automation to avoid extra tabs interfering with assertions.
- If Chromium cannot load extensions in your environment, run the script on a local desktop session rather than a headless CI worker.

# ScreenshotsMCP Chrome Extension

Capture and inspect the current tab directly from Chrome, with ScreenshotsMCP platform parity on public pages and local fallback for `localhost` and private URLs.

## Features

- **Playwright-backed public capture** — Uses the same MCP screenshot path as the CLI for public URLs when an API key is configured
- **Local fallback for localhost/private pages** — Keeps dev-server capture working without tunnels
- **Viewport Capture** — Screenshot exactly what's visible
- **Full Page Capture** — Scrolls and stitches the entire page automatically when local capture is needed
- **Navigate active tab** — Open the current tab to a new URL directly from the popup
- **Read Text / Read DOM** — Inspect visible page text and DOM HTML from the popup
- **Validated API keys** — Rejects invalid or revoked keys before saving them
- **Cloud-aware viewer actions** — Reuses existing cloud-backed captures and uploads local-only captures when needed
- **Download / Copy / Open** — Save PNG, copy to clipboard, or open in new tab

## Install (Developer Mode)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `packages/chrome-extension` folder
5. Pin the extension to your toolbar

> **Note:** You need PNG icons in the `icons/` folder. Open `generate-icons.html` in Chrome, right-click each canvas, and save as `icon16.png`, `icon48.png`, `icon128.png` into the `icons/` folder.

## Usage

1. Navigate to any page
2. Click the ScreenshotsMCP extension icon
3. Open **Settings** and paste your existing `sk_live_...` API key
4. On a public page, use **Screenshot** or **Full Page Screenshot** to capture through the ScreenshotsMCP platform
5. On `localhost` or private pages, the extension falls back to local browser capture automatically
6. Use the **Navigate** field to send the active tab to another URL such as `google.com`
7. Use **Read Text** or **Read DOM** to inspect the current page
8. Download, copy, or open the screenshot from the viewer

## Capture Modes

### Public pages

If the active tab is a public `http` or `https` URL and a valid API key is saved, the extension uses the ScreenshotsMCP MCP server for screenshot capture and page inspection. That gives you the same Playwright-backed behavior as the CLI for current-tab workflows.

### Localhost and private pages

If the active tab is `localhost`, `127.0.0.1`, `0.0.0.0`, `.local`, `.internal`, or another non-public context, the extension stays local-first. Screenshots and DOM/text inspection happen directly in the browser so dev servers still work.

## How Full Page Capture Works

1. Scrolls to the top of the page
2. Captures the visible viewport
3. Scrolls down by one viewport height, captures again
4. Repeats until the bottom of the page
5. Stitches all captures together using an offscreen canvas
6. Returns the final full-page PNG

## File Structure

```
packages/chrome-extension/
├── manifest.json        # Manifest V3 config
├── background.js        # Service worker (capture logic)
├── offscreen.html/js    # Canvas stitching for full-page
├── popup.html/css/js    # Extension popup UI
├── generate-icons.html  # Open in browser to create icons
├── icons/               # Extension icons (16, 48, 128px)
│   └── generate.mjs     # SVG icon generator
└── README.md
```

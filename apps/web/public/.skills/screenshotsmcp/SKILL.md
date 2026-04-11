---
name: screenshotsmcp
description: >
  Screenshot any URL, automate browsers, solve CAPTCHAs, create disposable email inboxes, audit performance and SEO, and log into websites — all via ScreenshotsMCP tools.
  Use this skill when the user asks you to take screenshots, test websites, check responsive layouts, audit SEO or performance, solve CAPTCHAs, create test email inboxes, automate sign-ups, or interact with web pages.
license: MIT
compatibility: Requires ScreenshotsMCP MCP server connected. Works with any MCP-compatible agent.
metadata:
  author: screenshotsmcp
  version: "2.0"
  website: https://screenshotsmcp.com
  api: https://screenshotsmcp-api-production.up.railway.app
---

# ScreenshotsMCP Agent Skill

Give your AI assistant eyes and hands for the web. This skill covers all 46+ tools in the ScreenshotsMCP MCP server.

## Setup

### Option A: CLI (fastest)

```bash
npx screenshotsmcp login
npx screenshotsmcp install cursor    # or: vscode, windsurf, claude, claude-code
```

The CLI handles authentication via OAuth (opens browser) and auto-configures your MCP client.

### Option B: Manual

Get an API key at https://screenshotsmcp.com/dashboard/keys and add to your MCP config:

```json
{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "https://screenshotsmcp-api-production.up.railway.app/mcp/YOUR_API_KEY"
    }
  }
}
```

## CLI

ScreenshotsMCP also has a CLI (`npm install -g screenshotsmcp`) that exposes all the same tools from the terminal:

```bash
screenshotsmcp screenshot https://example.com     # Take a screenshot
screenshotsmcp responsive https://example.com      # Desktop + tablet + mobile
screenshotsmcp mobile https://example.com          # iPhone 14 Pro viewport
screenshotsmcp dark https://example.com            # Dark mode
screenshotsmcp diff https://a.com https://b.com    # Pixel diff
screenshotsmcp review https://example.com          # AI UX review
screenshotsmcp perf https://example.com            # Core Web Vitals
screenshotsmcp seo https://example.com             # SEO audit
screenshotsmcp a11y https://example.com            # Accessibility tree
screenshotsmcp browse https://example.com          # Interactive browser session
screenshotsmcp inbox:create                         # Disposable test email
```

Run `screenshotsmcp --help` for all 38 commands.

## Tool Categories

### 1. Screenshot Tools (no session needed)

Quick one-shot captures that return a public CDN URL.

| Tool | Purpose | Key Params |
|------|---------|------------|
| `take_screenshot` | Capture any URL | url, width, height, fullPage, format, delay, maxHeight |
| `screenshot_mobile` | iPhone 14 Pro (393×852) | url, fullPage, format |
| `screenshot_tablet` | iPad (820×1180) | url, fullPage, format |
| `screenshot_fullpage` | Full scrollable page | url, width, format, maxHeight |
| `screenshot_responsive` | Desktop + tablet + mobile in ONE call | url, fullPage, format |
| `screenshot_dark` | Dark mode emulated | url, width, height, format |
| `screenshot_element` | Specific CSS element | url, selector, format, delay |
| `screenshot_pdf` | Export as PDF (A4) | url |
| `screenshot_batch` | Multiple URLs at once (max 10) | urls, width, height, format, fullPage |
| `screenshot_cross_browser` | Chromium + Firefox + WebKit | url, width, height, fullPage |
| `screenshot_diff` | Pixel-diff two URLs | urlA, urlB, threshold |
| `find_breakpoints` | Detect responsive breakpoints | url |
| `list_recent_screenshots` | View recent captures | limit |
| `get_screenshot_status` | Check job status | id |

**Tips:**
- For long pages (product grids, feeds), set `fullPage: false` or use `maxHeight` to cap height.
- `screenshot_responsive` is faster than 3 separate calls.
- All screenshots return public CDN URLs with image dimensions.

### 2. Browser Session Tools (interactive)

Multi-step workflows: log in, fill forms, navigate, inspect. Start with `browser_navigate` → get a `sessionId` → pass to all other tools → call `browser_close` when done.

**Interaction:**
| Tool | Purpose |
|------|---------|
| `browser_navigate` | Open URL, returns sessionId + screenshot. Supports width/height for mobile. |
| `browser_click` | Click by CSS selector or visible text (e.g. "Sign in") |
| `browser_click_at` | Click at x,y coordinates — for CAPTCHAs, canvas, iframes |
| `browser_fill` | Type into input field (clears first) |
| `browser_hover` | Hover to trigger tooltips/dropdowns |
| `browser_select_option` | Select from dropdown |
| `browser_scroll` | Scroll by pixel amount |
| `browser_press_key` | Keyboard: Enter, Tab, Escape, Control+a, etc. |
| `browser_wait_for` | Wait for element to appear |
| `browser_go_back` | Browser back |
| `browser_go_forward` | Browser forward |
| `browser_set_viewport` | Resize viewport mid-session (desktop ↔ mobile) |
| `browser_close` | Free resources. Always call when done. |

**Inspection:**
| Tool | Purpose |
|------|---------|
| `browser_screenshot` | Screenshot current state |
| `browser_get_text` | All visible text (or specific element) |
| `browser_get_html` | DOM source (outer or inner) |
| `browser_get_accessibility_tree` | Full a11y tree — best for understanding page structure |
| `browser_evaluate` | Run JavaScript, return result |
| `accessibility_snapshot` | A11y tree for any URL without a session |

**Debugging:**
| Tool | Purpose |
|------|---------|
| `browser_console_logs` | Console errors, warnings, logs, exceptions |
| `browser_network_errors` | Failed requests (4xx, 5xx) |
| `browser_network_requests` | Full network waterfall with timing |
| `browser_cookies` | Get/set/clear cookies |
| `browser_storage` | Read/write localStorage and sessionStorage |

**Performance & SEO:**
| Tool | Purpose |
|------|---------|
| `browser_perf_metrics` | Core Web Vitals: LCP, FCP, CLS, TTFB, DOM size |
| `browser_seo_audit` | Meta, OG, Twitter cards, headings, JSON-LD, alt text |

### 3. Smart Login Flow

When the user needs to test authenticated pages:

1. `find_login_page` — discovers login pages via sitemap.xml + common paths
2. **Ask the user for credentials** — NEVER guess passwords
3. `smart_login` — auto-detects form fields, fills, submits, returns SUCCESS/FAILED/UNCERTAIN + screenshot + sessionId
4. Continue testing with the returned sessionId

### 4. CAPTCHA Solving

`solve_captcha` auto-detects and solves:
- **Cloudflare Turnstile**
- **reCAPTCHA v2/v3**
- **hCaptcha**

For Clerk-powered sites, it automatically:
- Detects the Clerk frontend API
- Fetches the sitekey from Clerk's environment endpoint
- Calls the Clerk sign-up/sign-in API directly with the solved token
- Prepares email verification

Parameters: sessionId (required), type (auto-detected), sitekey (auto-detected), pageUrl (auto-detected), autoSubmit (default: true)

### 5. Disposable Email (AgentMail)

Create real email inboxes for testing sign-ups and reading verification codes.

| Tool | Purpose |
|------|---------|
| `create_test_inbox` | Create disposable inbox → returns email@agentmail.to |
| `check_inbox` | Read messages, auto-extracts OTP codes and verification links |
| `send_test_email` | Send email from an inbox |

**Setup:** Each user needs their own AgentMail API key (free at https://console.agentmail.to). Add it in Dashboard → Settings.

**Typical sign-up testing flow:**
1. `create_test_inbox` → get email address
2. `browser_navigate` to sign-up page
3. `browser_fill` the email + password
4. `solve_captcha` if CAPTCHA present
5. Submit the form
6. `check_inbox` → get verification code
7. Enter the code or click the verification link

### 6. Gmail Verification (OAuth)

For reading OTPs from the user's own Gmail:

| Tool | Purpose |
|------|---------|
| `authorize_email_access` | One-time OAuth setup for Gmail |
| `read_verification_email` | Read OTP codes from Gmail inbox |

### 7. UX Review

`ux_review` — AI-powered UX analysis using vision. Captures screenshot + a11y tree + SEO + performance and returns actionable feedback across: Accessibility, SEO, Performance, Navigation, Content, Mobile-friendliness.

## Common Workflows

### Take a responsive screenshot
```
User: "Check how example.com looks on all devices"
→ Use screenshot_responsive for desktop + tablet + mobile in one call
```

### Full site audit
```
User: "Audit this site"
→ browser_navigate → browser_get_accessibility_tree → browser_perf_metrics → browser_seo_audit → browser_console_logs → browser_network_errors
```

### Test a sign-up flow with disposable email
```
1. create_test_inbox → test-user@agentmail.to
2. browser_navigate to sign-up page
3. browser_fill email + password fields
4. solve_captcha (if needed)
5. browser_click submit
6. check_inbox → extract OTP
7. browser_fill OTP field
8. browser_click verify → done
```

### Compare before/after redesign
```
→ screenshot_diff with urlA (old) and urlB (new)
→ Returns diff image + percentage of pixels changed + match score
```

### Cross-browser testing
```
→ screenshot_cross_browser captures in Chromium, Firefox, and WebKit simultaneously
```

## Best Practices

- **Always close sessions:** Call `browser_close` when done to free resources.
- **Long pages:** Use `fullPage: false` or `maxHeight` to prevent unreadable strips.
- **Responsive:** Prefer `screenshot_responsive` over 3 separate tool calls.
- **Accessibility:** `browser_get_accessibility_tree` is the best tool for understanding page structure — better than screenshots for form analysis.
- **Credentials:** NEVER guess passwords. Always ask the user.
- **CAPTCHA:** `solve_captcha` handles everything automatically — just pass the sessionId.
- **Email testing:** Use `create_test_inbox` for disposable emails. Each user manages their own inboxes via their AgentMail API key.

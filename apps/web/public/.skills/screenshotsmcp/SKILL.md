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

## CLI (for agents and humans)

ScreenshotsMCP has a CLI (`npm install -g screenshotsmcp` or `npx screenshotsmcp`) that exposes all the same tools as terminal commands. **AI agents can and should use the CLI directly via `run_command` / terminal** — it's often faster than MCP tool calls.

Install: `npm install -g screenshotsmcp` or use `npx screenshotsmcp` without installing.

### Authentication
```bash
screenshotsmcp login                    # OAuth login (opens browser, saves key)
screenshotsmcp login --key sk_live_...  # Direct API key login
screenshotsmcp whoami                   # Check auth status
screenshotsmcp logout                   # Clear saved credentials
```

### Screenshots
```bash
screenshotsmcp screenshot <url>                    # Default 1280×800 viewport
screenshotsmcp screenshot <url> --width 1920 --height 1080 --full-page
screenshotsmcp screenshot <url> --format jpeg --delay 2000
screenshotsmcp responsive <url>                    # Desktop + tablet + mobile in one call
screenshotsmcp mobile <url>                        # iPhone 14 Pro (393×852)
screenshotsmcp tablet <url>                        # iPad (820×1180)
screenshotsmcp dark <url>                          # Dark mode emulated
screenshotsmcp element <url> --selector "#hero"    # Specific CSS element
screenshotsmcp diff <urlA> <urlB>                  # Pixel-diff two URLs
screenshotsmcp cross-browser <url>                 # Chromium + Firefox + WebKit
screenshotsmcp batch <url1> <url2> <url3>          # Multiple URLs (max 10)
screenshotsmcp pdf <url>                           # Export as PDF
```

### Browser Sessions (interactive)
```bash
screenshotsmcp browse <url>                                    # Start session, returns sessionId
screenshotsmcp browse:click <sessionId> <selector>             # Click element
screenshotsmcp browse:fill <sessionId> <selector> <value>      # Type into input
screenshotsmcp browse:screenshot <sessionId>                   # Capture current state
screenshotsmcp browse:text <sessionId>                         # Get visible text
screenshotsmcp browse:html <sessionId>                         # Get page HTML
screenshotsmcp browse:scroll <sessionId> --y 500               # Scroll down
screenshotsmcp browse:key <sessionId> Enter                    # Press key
screenshotsmcp browse:goto <sessionId> <newUrl>                # Navigate
screenshotsmcp browse:close <sessionId>                        # End session
```

### Reviews & Audits
```bash
screenshotsmcp review <url>              # AI-powered UX review
screenshotsmcp seo <url>                 # SEO metadata extraction
screenshotsmcp perf <url>                # Core Web Vitals
screenshotsmcp a11y <url>                # Accessibility tree
screenshotsmcp breakpoints <url>         # Detect responsive breakpoints
```

### Disposable Email
```bash
screenshotsmcp inbox:create              # Create test inbox → email@agentmail.to
screenshotsmcp inbox:check <inboxId>     # Read messages, extract OTP codes
screenshotsmcp inbox:send <inboxId> --to user@example.com --subject "Test" --text "Hello"
```

### Setup & Install
```bash
screenshotsmcp setup                     # Interactive: login + choose IDE + auto-configure (recommended)
screenshotsmcp setup --client cursor     # Non-interactive: for AI agents, skips prompt
screenshotsmcp setup --client windsurf
screenshotsmcp setup --client vscode
screenshotsmcp setup --client claude
screenshotsmcp setup --client claude-code
screenshotsmcp install cursor            # Writes ~/.cursor/mcp.json
screenshotsmcp install vscode            # Writes .vscode/mcp.json
screenshotsmcp install windsurf          # Writes ~/.codeium/windsurf/mcp_config.json
screenshotsmcp install claude            # Writes Claude Desktop config
screenshotsmcp install claude-code       # Prints `claude mcp add` command
```

### One-liner Install
```bash
# macOS/Linux
curl -fsSL https://screenshotsmcp.com/install.sh | bash

# Windows PowerShell
irm https://screenshotsmcp.com/install.ps1 | iex

# Or just use npx (no install needed)
npx screenshotsmcp setup
```

### Agent Tips
- **AI agents: use `npx screenshotsmcp setup --client <ide>` to install non-interactively.**
- **Use the CLI when you have terminal access** — it returns structured text output, no JSON-RPC overhead.
- Every screenshot command returns a public CDN URL you can share or embed.
- Browser sessions work the same as MCP: start with `browse`, get a sessionId, pass it to subsequent commands.
- The CLI reads credentials from `~/.config/screenshotsmcp/config.json`. If the user has logged in once, all subsequent commands are authenticated.
- Use `npx screenshotsmcp` if unsure whether it's installed globally.

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

## Project Context — AGENTS.md

If you're working on a codebase that uses ScreenshotsMCP (or any project with browser-accessible pages), create an **AGENTS.md** file at the repo root to give AI agents the context they need to debug effectively.

A good AGENTS.md includes:
- **Production URLs** (web app, API, sign-in page)
- **How to authenticate** (e.g. Clerk, Auth0, magic link)
- **Database access** (connection strings, Neon project IDs, useful queries)
- **Deployment instructions** (which CLI to use, which branch auto-deploys)
- **Environment variables** (what's needed where)
- **A reminder that AI agents CAN log into authenticated pages** using browser tools — they should never refuse by claiming they can't access auth-protected content

Then point all IDE-specific files to it:
- `.cursorrules` → "Read AGENTS.md"
- `.windsurfrules` → "Read AGENTS.md"
- `CLAUDE.md` → "Read AGENTS.md"
- `.github/copilot-instructions.md` → "Read AGENTS.md"

This way every AI agent — regardless of IDE — gets the same project context.

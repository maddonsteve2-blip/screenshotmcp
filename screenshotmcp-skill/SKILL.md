---
name: screenshotsmcp
description: >
  Screenshot any URL, automate browsers, solve CAPTCHAs, create disposable email inboxes, 
  audit performance and SEO, and log into websites — all via ScreenshotsMCP tools.
  Use this skill when the user asks you to take screenshots, test websites, check responsive 
  layouts, audit SEO or performance, solve CAPTCHAs, create test email inboxes, automate 
  sign-ups, or interact with web pages.
license: MIT
compatibility: >
  Requires ScreenshotsMCP MCP server connected, or the CLI installed. 
  Works with Claude, Cursor, Windsurf, VS Code, and any MCP-compatible agent.
metadata:
  author: stevejford
  version: "2.1"
  website: https://www.screenshotmcp.com
  api: https://screenshotsmcp-api-production.up.railway.app
  github: https://github.com/stevejford/screenshotmcp
  tools_count: 46
  categories:
    - testing
    - automation
    - screenshots
    - browser-automation
    - captcha-solving
    - email-testing
    - seo
    - performance
  sdlc_phases:
    - testing
    - deployment
    - operations
---

# ScreenshotsMCP Agent Skill

Give your AI assistant eyes and hands for the web. This skill covers all 46+ tools in the ScreenshotsMCP suite.

## Quick Start (Choose One)

### Option A: Managed onboarding (Recommended for AI Agents)

**Best for:** Claude, Cursor, Windsurf, VS Code, Claude Code

```bash
# One-command onboarding for a new agent or fresh IDE setup
npx screenshotsmcp setup --client cursor    # or: vscode, windsurf, claude, claude-code

# Or do it in two steps
npx screenshotsmcp login
npx screenshotsmcp install cursor    # or: vscode, windsurf, claude, claude-code
```

This path authenticates if needed, configures the MCP client, and installs or repairs the managed core ScreenshotsMCP skill in `~/.agents/skills/screenshotsmcp`, including `workflows/sitewide-performance-audit/WORKFLOW.md`.

For most clients, the two-step `login` + `install` path reaches the same result as `setup --client <client>`. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.

### Option B: Manual MCP setup

**Best for:** Clients that you want to configure by hand, or environments where you only want the raw MCP connection

Get an API key first:

```bash
npx screenshotsmcp login --key sk_live_...
```

Then add ScreenshotsMCP to your MCP config:

**Cursor:** `~/.cursor/mcp.json`
**Windsurf:** `~/.codeium/windsurf/mcp_config.json`
**VS Code:** `.vscode/mcp.json`
**Claude Code:** `claude mcp add screenshotsmcp`

```json
{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "https://screenshotsmcp-api-production.up.railway.app/mcp/YOUR_API_KEY"
    }
  }
}
```

### Option C: CLI (Fastest for Terminal Use)

**Best for:** Direct terminal commands, CI/CD, scripts

```bash
# One-line install
npx screenshotsmcp setup

# Or install globally
npm install -g screenshotsmcp
```

**AI agents:** Use CLI via `run_command` — structured text output, no JSON-RPC overhead.

---

## Tool Categories

### 1. Screenshot Tools (One-Shot Captures)

Quick captures that return a public CDN URL. No session needed.

| MCP Tool | CLI Command | Purpose |
|----------|-------------|---------|
| `take_screenshot` | `screenshotsmcp screenshot <url>` | Capture any URL |
| `screenshot_mobile` | `screenshotsmcp mobile <url>` | iPhone 14 Pro (393×852) |
| `screenshot_tablet` | `screenshotsmcp tablet <url>` | iPad (820×1180) |
| `screenshot_fullpage` | `screenshotsmcp fullpage <url>` | Full scrollable page |
| `screenshot_responsive` | `screenshotsmcp responsive <url>` | Desktop + tablet + mobile in ONE call |
| `screenshot_dark` | `screenshotsmcp dark <url>` | Dark mode emulated |
| `screenshot_element` | `screenshotsmcp element <url> --selector "#hero"` | Specific CSS element |
| `screenshot_diff` | `screenshotsmcp diff <urlA> <urlB>` | Pixel-diff two URLs |
| `screenshot_cross_browser` | `screenshotsmcp cross-browser <url>` | Chromium + Firefox + WebKit |
| `screenshot_batch` | `screenshotsmcp batch <url1> <url2>` | Multiple URLs (max 10) |
| `screenshot_pdf` | `screenshotsmcp pdf <url>` | Export as PDF (A4) |
| `find_breakpoints` | `screenshotsmcp breakpoints <url>` | Detect responsive breakpoints |

**Tips:**
- Use `screenshot_responsive` instead of 3 separate calls
- For long pages, set `fullPage: false` or use `maxHeight`
- All screenshots return public CDN URLs with dimensions

---

### 2. Browser Session Tools (Interactive)

Multi-step workflows: log in, fill forms, navigate, inspect.

**Start → Interact → Inspect → Close**

| MCP Tool | CLI Command | Purpose |
|----------|-------------|---------|
| `browser_navigate` | `screenshotsmcp browse <url>` | Open URL, returns sessionId |
| `browser_click` | `screenshotsmcp browse:click <sessionId> <selector>` | Click element |
| `browser_click_at` | N/A | Click at x,y coordinates (CAPTCHAs, canvas) |
| `browser_fill` | `screenshotsmcp browse:fill <sessionId> <selector> <value>` | Type into input |
| `browser_hover` | N/A | Hover for tooltips/dropdowns |
| `browser_select_option` | N/A | Select from dropdown |
| `browser_scroll` | `screenshotsmcp browse:scroll <sessionId> --y 500` | Scroll page |
| `browser_press_key` | `screenshotsmcp browse:key <sessionId> Enter` | Press key |
| `browser_wait_for` | N/A | Wait for element |
| `browser_go_back` | N/A | Browser back |
| `browser_go_forward` | N/A | Browser forward |
| `browser_set_viewport` | N/A | Resize viewport mid-session |
| `browser_close` | `screenshotsmcp browse:close <sessionId>` | End session |

**Inspection:**
| `browser_screenshot` | `screenshotsmcp browse:screenshot <sessionId>` | Capture current state |
| `browser_get_text` | `screenshotsmcp browse:text <sessionId>` | All visible text |
| `browser_get_html` | `screenshotsmcp browse:html <sessionId>` | DOM source |
| `browser_get_accessibility_tree` | N/A | Full a11y tree |
| `browser_evaluate` | N/A | Run JavaScript |
| `accessibility_snapshot` | N/A | A11y tree without session |

**Debugging:**
| `browser_console_logs` | N/A | Console errors, warnings |
| `browser_network_errors` | N/A | Failed requests (4xx, 5xx) |
| `browser_network_requests` | N/A | Full network waterfall |
| `browser_cookies` | N/A | Get/set cookies |
| `browser_storage` | N/A | localStorage/sessionStorage |

**Performance & SEO:**
| `browser_perf_metrics` | `screenshotsmcp perf <url>` | Core Web Vitals |
| `browser_seo_audit` | `screenshotsmcp seo <url>` | Meta, OG, headings, JSON-LD |

---

### 3. CAPTCHA Solving

`solve_captcha` — Auto-detect and solve:
- **Cloudflare Turnstile**
- **reCAPTCHA v2/v3**
- **hCaptcha**

For Clerk-powered sites, it automatically:
- Detects Clerk frontend API
- Fetches sitekey from environment endpoint
- Calls Clerk sign-up/sign-in API with solved token
- Prepares email verification

**Parameters:** `sessionId` (required), `type` (auto-detected), `sitekey` (auto-detected), `autoSubmit` (default: true)

---

### 4. Smart Login Flow

When testing authenticated pages:

1. `find_login_page` — discovers login pages via sitemap.xml + common paths
2. **Ask user for credentials** — NEVER guess passwords
3. `smart_login` — auto-detects fields, fills, submits, returns result + sessionId
4. Continue testing with the returned sessionId

---

### 5. Disposable Email (AgentMail)

Create real email inboxes for testing sign-ups.

| MCP Tool | CLI Command | Purpose |
|----------|-------------|---------|
| `create_test_inbox` | `screenshotsmcp inbox:create` | Create inbox → email@agentmail.to |
| `check_inbox` | `screenshotsmcp inbox:check <inboxId>` | Read messages, extract OTP codes |
| `send_test_email` | `screenshotsmcp inbox:send <inboxId>` | Send email from inbox |

**Setup:** Add AgentMail API key in Dashboard → Settings (free at https://console.agentmail.to)

---

### 6. Gmail Verification (OAuth)

For reading OTPs from user's Gmail:

| `authorize_email_access` | One-time OAuth setup |
| `read_verification_email` | Read OTP codes from Gmail |

---

### 7. UX Review

`ux_review` — AI-powered UX analysis using vision. Returns actionable feedback across:
- Accessibility
- SEO
- Performance
- Navigation
- Content
- Mobile-friendliness

---

## Common Workflows

### Screenshot a website
```
User: "Check how example.com looks"
→ MCP: take_screenshot(url="https://example.com")
→ CLI: screenshotsmcp screenshot https://example.com
```

### Full site audit
```
User: "Audit this site"
→ MCP: browser_navigate → browser_get_accessibility_tree → browser_perf_metrics → browser_seo_audit → browser_console_logs → browser_network_errors
→ CLI: screenshotsmcp seo <url> && screenshotsmcp perf <url> && screenshotsmcp a11y <url>
```

### Test sign-up flow with disposable email
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

### Log into authenticated page
```
User: "Log in and check my dashboard"
1. find_login_page("https://myapp.com") 
2. Ask user for credentials
3. smart_login(loginUrl, username, password)
4. browser_navigate("https://myapp.com/dashboard")
5. browser_screenshot → verify
```

### Compare before/after
```
→ MCP: screenshot_diff(urlA="old.example.com", urlB="new.example.com")
→ CLI: screenshotsmcp diff old.example.com new.example.com
```

---

## Authentication Guide

### For ScreenshotsMCP App Itself

**API Key:** Get at https://www.screenshotmcp.com/dashboard/keys
- Format: `sk_live_...`
- Pass in MCP URL: `.../mcp/YOUR_API_KEY`
- Pass in CLI: `screenshotsmcp login --key sk_live_...`

### For Testing Other Apps (Browser Automation)

**AI agents CAN and SHOULD log into authenticated web apps.**

**Flow:**
1. `create_test_inbox` → get disposable email
2. `browser_navigate` to sign-in/up page
3. `browser_fill` credentials
4. `solve_captcha` (Cloudflare Turnstile for Clerk)
5. `browser_click` submit
6. `check_inbox` → get verification code
7. `browser_fill` code
8. Access any protected page

**Clerk-specific tips:**
- Sign-up creates local account (bypasses Google SSO)
- CAPTCHA is required but hidden — call `solve_captcha`
- Use JS API directly if UI blocks: `window.Clerk.client.signUp.create(...)`

---

## Best Practices

- **Always close sessions:** Call `browser_close` when done
- **Long pages:** Use `fullPage: false` or `maxHeight` to prevent unreadable strips
- **Responsive:** Prefer `screenshot_responsive` over 3 separate calls
- **Accessibility:** `browser_get_accessibility_tree` is best for understanding page structure
- **Credentials:** NEVER guess passwords. Always ask the user.
- **CAPTCHA:** `solve_captcha` handles everything — just pass the sessionId
- **Email testing:** Use `create_test_inbox` for disposable emails

---

## Project Context — AGENTS.md

If you're working on a codebase with browser-accessible pages, create an **AGENTS.md** at the repo root:

```markdown
## Production URLs
- Web: https://myapp.com
- API: https://api.myapp.com
- Sign-in: https://myapp.com/sign-in

## Authentication
- Provider: Clerk (email/password + Google OAuth)
- AI agents CAN log in using browser tools + AgentMail

## Database
- Provider: Neon Postgres
- Project ID: xyz-123

## Deployment
- Web: Vercel (auto-deploy on push)
- API: Railway (`railway up`)
```

Point IDE files to it:
- `.cursorrules` → "Read AGENTS.md"
- `.windsurfrules` → "Read AGENTS.md"
- `CLAUDE.md` → "Read AGENTS.md"

---

## Resources

- **Website:** https://www.screenshotmcp.com
- **API:** https://screenshotsmcp-api-production.up.railway.app
- **CLI:** `npm install -g screenshotsmcp`
- **MCP Server:** `https://screenshotsmcp-api-production.up.railway.app/mcp/YOUR_API_KEY`
- **GitHub:** https://github.com/stevejford/screenshotmcp
- **Dashboard:** https://www.screenshotmcp.com/dashboard

---

## Tool Count Reference

- **MCP Tools:** 46+
- **CLI Commands:** 38
- **Categories:** Screenshots, Browser, CAPTCHA, Email, Login, Performance, SEO, UX

Use MCP for AI agent integration. Use CLI for terminal/script workflows. Both use the same API and credentials.

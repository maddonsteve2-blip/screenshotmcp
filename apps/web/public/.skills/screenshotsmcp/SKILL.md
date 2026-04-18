---
name: screenshotsmcp
description: >
  Use this skill whenever the user needs to see, interact with, or verify a website from an AI workflow. Trigger it for screenshots, responsive checks, browser automation, login and sign-up testing, CAPTCHA solving, OTP or email verification, SEO or performance audits, accessibility inspection, or website debugging even if the user does not explicitly mention ScreenshotsMCP.
license: MIT
compatibility: Requires the ScreenshotsMCP MCP server connected and authenticated, or the ScreenshotsMCP CLI when terminal access is available.
metadata:
  author: screenshotsmcp
  version: "2.3.1"
  website: https://www.screenshotmcp.com
  api: https://screenshotsmcp-api-production.up.railway.app
---

# ScreenshotsMCP Agent Skill

Give your AI assistant browser truth. This skill covers all 46+ tools in the ScreenshotsMCP MCP server.

## Discovery Model

- Treat ScreenshotsMCP tools as atomic actions.
- Treat this skill as broad guidance for choosing the right path.
- Treat packaged workflows as targeted procedures for repeatable multi-step jobs.
- When the task is an audit, verification flow, or another repeatable multi-step procedure, check the available workflows before improvising.
- For any site audit, performance audit, SEO audit, UX audit, full audit, or another repeatable multi-page website review, read `workflows/sitewide-performance-audit/WORKFLOW.md` before opening browser sessions, running audit tools, or drafting findings.
- If the user gives you a site URL but no page list, infer a representative public page set and start instead of blocking on permission.
- Default authenticated pages to out of scope unless the user explicitly asks for login, dashboard, or another protected flow.
- Do not read every workflow up front. Read only the workflow that matches the task.
- If terminal access exists and repeated tool calls are likely, prefer the CLI when it is clearly faster than repeated MCP round-trips. If terminal access is not available, stay in MCP.
- For multi-page performance audits in MCP, avoid opening many new browser sessions in parallel. Measure sequentially unless there is a proven reason to increase concurrency.

## Available Workflows

- `workflows/sitewide-performance-audit/WORKFLOW.md` — use when the user asks why a site is slow, wants the slowest pages identified, or wants a repeatable multi-page performance review.

## Setup

### Option A: CLI (fastest)

```bash
npx screenshotsmcp setup --client cursor    # or: vscode, windsurf, claude, claude-code
```

 The CLI handles authentication via OAuth when needed, configures your MCP client, and installs or repairs the managed core ScreenshotsMCP skill in `~/.agents/skills/screenshotsmcp`, including `workflows/sitewide-performance-audit/WORKFLOW.md`.

 If you prefer to do onboarding in two steps, run `npx screenshotsmcp login` followed by `npx screenshotsmcp install <client>`. For most clients, that reaches the same result as `setup --client <client>`. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.

 Prefer remote workflows first for public pages. Escalate to the managed local browser when you need localhost access, private or VPN-only environments, authenticated realism, or explicit local approval.

 Agents: do not treat `screenshotsmcp skills ...` as general skill discovery. It only manages the local ScreenshotsMCP core skill. To discover or install community skills from the broader ecosystem, use the `find-skills` workflow or `npx skills find ...` / `npx skills add ...`.

### VS Code Extension Preview

 A native ScreenshotsMCP VS Code extension is now being developed in the monorepo for a dedicated Activity Bar sidebar, automatic browser OAuth sign-in, automatic editor MCP setup, automatic managed core skill sync, API key fallback, native MCP registration, command palette actions, a live activity timeline panel, and browser workflow UX inside the editor.

 Current preview commands include `ScreenshotsMCP: Sign In`, `ScreenshotsMCP: Check Status`, `ScreenshotsMCP: Take Screenshot`, `ScreenshotsMCP: Open Timeline`, `ScreenshotsMCP: Configure Editor Integration`, and `ScreenshotsMCP: Sync Core Skill`. The sidebar also exposes quick actions and recent activity directly in VS Code, and the extension opens browser OAuth, configures the editor automatically, and repairs the managed core skill when no credentials are stored.

 Until the Marketplace release is ready, the recommended setup for VS Code is to install the preview VSIX, sign in once, and use `ScreenshotsMCP: Configure Editor Integration` only if you need to repair the automatic setup or `ScreenshotsMCP: Sync Core Skill` when you need to repair the managed local skill.

### Chrome Extension Preview

The monorepo also includes an unpacked Chrome extension preview in `packages/chrome-extension`.

- **Public pages** use the same ScreenshotsMCP Playwright-backed MCP path as the CLI for screenshot capture and page inspection when an API key is configured.
- **Localhost and private pages** stay local-first so dev servers and private environments still work.
- **Popup page tools** can read visible text and DOM HTML for the active tab.
- **API keys are validated before save**, so revoked keys are rejected instead of silently stored.

### Option B: Manual

Get an API key at https://www.screenshotmcp.com/dashboard/keys and add to your MCP config:

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

For repeatable public-page performance audits, use the CLI only when the command path is already available or can be approved up front. If command approval would stall the run and MCP is already available, begin with MCP and collect metrics sequentially.

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
screenshotsmcp fullpage <url>                      # Dedicated full-page capture command
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
screenshotsmcp browse:click-at <sessionId> 320 480             # Coordinate click for CAPTCHA/canvas
screenshotsmcp browse:fill <sessionId> <selector> <value>      # Type into input
screenshotsmcp browse:hover <sessionId> ".menu-trigger"       # Trigger hover states
screenshotsmcp browse:select <sessionId> "select[name=country]" "Australia"
screenshotsmcp browse:wait-for <sessionId> ".results-loaded"  # Wait for selector
screenshotsmcp browse:back <sessionId>                         # Back in history
screenshotsmcp browse:forward <sessionId>                      # Forward in history
screenshotsmcp browse:viewport <sessionId> 393 852             # Resize existing session
screenshotsmcp browse:screenshot <sessionId>                   # Capture current state
screenshotsmcp browse:text <sessionId>                         # Get visible text
screenshotsmcp browse:html <sessionId>                         # Get page HTML
screenshotsmcp browse:a11y <sessionId>                         # Accessibility tree
screenshotsmcp browse:console <sessionId> --level error        # Console logs
screenshotsmcp browse:network-errors <sessionId>               # Failed requests
screenshotsmcp browse:network-requests <sessionId>             # Request waterfall
screenshotsmcp browse:cookies <sessionId> get                  # Inspect cookies
screenshotsmcp browse:storage <sessionId> getAll               # Inspect storage
screenshotsmcp browse:perf <sessionId>                         # Session performance metrics
screenshotsmcp browse:seo <sessionId>                          # Session SEO audit
screenshotsmcp browse:captcha <sessionId>                      # Solve CAPTCHA in-session
screenshotsmcp browse:scroll <sessionId> --y 500               # Scroll down
screenshotsmcp browse:key <sessionId> Enter                    # Press key
screenshotsmcp browse:goto <sessionId> <newUrl>                # Navigate
screenshotsmcp browse:close <sessionId>                        # End session
```

### Workflow-Aware Browser Navigation

When starting a new browser session with `screenshotsmcp browse <url>`, you can add workflow-aware parameters to persist an explicit contract and outcome summary. This is useful for multi-step procedures, audits, or verification flows.

- `--task-type`: The type of task being performed (e.g., site_audit, performance_audit, seo_audit)
- `--user-goal`: A brief description of the user's goal (e.g., "Audit public marketing pages for UX regressions")
- `--workflow-name`: The name of the workflow being executed (e.g., sitewide-performance-audit)
- `--workflow-required`: A boolean indicating whether the workflow is required for the task
- `--auth-scope`: The scope of authentication required for the task (e.g., out, in, private)
- `--page-set`: A comma-separated list of pages to be audited or verified (e.g., homepage, pricing, docs)
- `--required-evidence`: A comma-separated list of evidence required for the task (e.g., screenshots, console, network)

Example:
```bash
screenshotsmcp browse https://example.com --task-type site_audit --user-goal "Audit public marketing pages for UX regressions" --workflow-name sitewide-performance-audit --auth-scope out --page-set homepage,pricing,docs --required-evidence screenshots,console,network
```

### Reviews & Audits
```bash
screenshotsmcp review <url>              # AI-powered UX review (standalone — does not create a Run)
screenshotsmcp seo <url>                 # SEO metadata extraction (run-backed: shows up in dashboard Runs with verdict, summary, and next actions)
screenshotsmcp perf <url>                # Core Web Vitals (run-backed against the sitewide-performance-audit workflow)
screenshotsmcp a11y <url>                # Accessibility tree (standalone)
screenshotsmcp breakpoints <url>         # Detect responsive breakpoints (standalone)
```

`perf` and `seo` open a workflow-aware browser session under the hood — their runs land in `/dashboard/runs` with a structured outcome (verdict, summary, findings, proof coverage, next actions). `review`, `a11y`, and `breakpoints` stay standalone analyses and do not create a Run.

### Disposable Email
```bash
screenshotsmcp auth:test https://example.com  # Reuse auth memory + primary inbox
screenshotsmcp auth:find-login https://example.com
screenshotsmcp auth:smart-login https://example.com/sign-in --username user@example.com --password secret
screenshotsmcp auth:authorize-email           # Connect Gmail once for OTP reads
screenshotsmcp auth:read-email                # Read latest Gmail OTP
screenshotsmcp inbox:create              # Create or reuse the primary test inbox
screenshotsmcp inbox:check <inboxId>     # Read messages, extract OTP codes
screenshotsmcp inbox:send <inboxId> --to user@example.com --subject "Test" --text "Hello"
```

### Reusable website auth workflow
- Start with `auth_test_assist` or `screenshotsmcp auth:test <url>` for login, sign-up, or verification flows.
- Read the helper's recommended auth path, account-exists confidence, likely auth method, and expected follow-up before choosing sign-in or sign-up.
- Treat the helper's reusable strategy as the default cross-site guidance, and treat per-site hints as evidence rather than universal rules.
- Reuse the saved primary inbox and password unless you explicitly need a fresh registration.
- If sign-in fails because the account does not exist, switch to sign-up with the same saved credentials.
- If `smart_login` is uncertain on Clerk or other multi-step auth UIs, fall back to browser tools and inspect network or console evidence before concluding the login failed.
- Use `check_inbox` for verification codes and email links.
- After the attempt, record the outcome with `auth_test_assist` so future runs remember what worked.

### Setup & Install
```bash
screenshotsmcp setup                     # Interactive: login + choose IDE + auto-configure (recommended)
screenshotsmcp setup --client cursor     # Non-interactive: for AI agents, skips prompt
screenshotsmcp setup --client windsurf
screenshotsmcp setup --client vscode
screenshotsmcp setup --client claude
screenshotsmcp setup --client claude-code
screenshotsmcp browser open https://example.com  # Launch extension-free local browser with explicit approval
screenshotsmcp browser open https://example.com --record-video  # Record the full managed local browser session to a local .webm file
screenshotsmcp browser back                     # Navigate browser history backward
screenshotsmcp browser forward                  # Navigate browser history forward
screenshotsmcp browser status                   # Inspect the tracked managed local browser
screenshotsmcp browser goto https://example.org # Navigate the managed local browser
screenshotsmcp browser click-at 320 480         # Click viewport coordinates in the managed local browser
screenshotsmcp browser hover ".menu-trigger"    # Trigger hover states in the managed local browser
screenshotsmcp browser wait-for ".results-loaded" --timeout 8000
screenshotsmcp browser select "select[name=country]" "Australia"
screenshotsmcp browser viewport 393 852         # Resize the managed local browser viewport
screenshotsmcp browser screenshot               # Save a local screenshot from the managed browser
screenshotsmcp browser text                     # Read visible text from the managed browser
screenshotsmcp browser console --level error    # Read captured console logs from the managed browser
screenshotsmcp browser network-errors           # Read failed network requests from the managed browser
screenshotsmcp browser network-requests --resource-type fetch --min-duration 200
screenshotsmcp browser cookies get              # Inspect cookies in the managed browser
screenshotsmcp browser storage getAll --type localStorage
screenshotsmcp browser eval "document.title"   # Evaluate JavaScript in the managed browser
screenshotsmcp browser a11y --max-depth 6       # Inspect the accessibility tree from the managed browser
screenshotsmcp browser perf                     # Read performance metrics from the managed browser
screenshotsmcp browser seo                      # Audit SEO metadata from the managed browser
screenshotsmcp browser close                    # Close the tracked managed local browser
screenshotsmcp skills list               # List installed skills under ~/.agents/skills
screenshotsmcp skills sync               # Install, update, or repair the managed core skill
screenshotsmcp skills update             # Alias for core skill sync
screenshotsmcp install cursor            # Writes ~/.cursor/mcp.json
screenshotsmcp install vscode            # Writes .vscode/mcp.json
screenshotsmcp install windsurf          # Writes ~/.codeium/windsurf/mcp_config.json
screenshotsmcp install claude            # Writes Claude Desktop config
screenshotsmcp install claude-code       # Prints `claude mcp add` command
```

For community skills such as Anthropic's `frontend-design`, use `find-skills` or run `npx skills find frontend design` followed by `npx skills add anthropics/skills@frontend-design -g -y`.

### One-liner Install
```bash
# macOS/Linux
curl -fsSL https://www.screenshotmcp.com/install.sh | bash

# Windows PowerShell
irm https://www.screenshotmcp.com/install.ps1 | iex

# Or just use npx (no install needed)
npx screenshotsmcp setup
```

### Agent Tips
- **AI agents: use `npx screenshotsmcp setup --client <ide>` to install non-interactively.**
- **Use the CLI when you have terminal access** — it returns structured text output, no JSON-RPC overhead.
- **For auth testing, start with `npx screenshotsmcp auth:test https://example.com`** so you reuse inbox credentials, remembered auth history, and the helper's site-specific confidence signals.
- **When reporting auth results, summarize reusable auth-system heuristics first** and present the site-specific path as supporting evidence.
- Browser sessions work the same as MCP: start with `browse`, get a sessionId, pass it to subsequent commands, and use `browse:console`, `browse:network-errors`, `browse:a11y`, `browse:perf`, or `browse:seo` without reopening the page.
- Managed local browser commands under `screenshotsmcp browser ...` now support continuous console/network capture while the browser stays open, plus history navigation, coordinate clicks, hover states, wait conditions, dropdown selection, viewport resizing, screenshots, text, HTML, cookies/storage inspection, script evaluation, accessibility trees, performance metrics, SEO audits, timestamped evidence bundle export via `browser evidence`, finalized video-inclusive export via `browser close --evidence`, and optional local `.webm` session recording against the tracked local browser.
- Prefer evidence-rich workflows when debugging or verifying changes: screenshots alone are helpful, but screenshots plus logs, recordings, and bundle exports are much more trustworthy.
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
- For long pages (product grids, feeds), set `fullPage: false` or `maxHeight` to cap height.
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
| `og_preview` | Standalone OG/Twitter tag validator + social card mockup screenshot |

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
→ First read workflows/sitewide-performance-audit/WORKFLOW.md before any browser or audit tool use
→ State that you read it, the page set, whether authenticated pages are in scope, and whether you will use MCP or CLI first
→ If the user gave the site URL but not the page list, infer the representative public pages and begin
→ browser_navigate → browser_get_accessibility_tree → browser_perf_metrics → browser_seo_audit → og_preview → browser_console_logs → browser_network_errors
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

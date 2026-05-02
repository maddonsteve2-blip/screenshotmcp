# deepsyte

CLI for [deepsyte](https://www.deepsyte.com) — inspect, test, and verify websites from the terminal with real browser execution and proof.

Use it when you want:

- **Remote browser workflows** for public pages and fast agent execution
- **Managed local browser workflows** for `localhost`, private apps, VPN-only environments, and stronger realism
- **Evidence-rich results** with screenshots, recordings, console logs, network data, and exportable bundles

## Install

```bash
npm install -g deepsyte
```

Or use without installing:

```bash
npx deepsyte screenshot https://example.com
```

## Quick Start

```bash
# One-command onboarding for a new agent or fresh IDE setup
deepsyte setup --client cursor    # or: vscode, windsurf, claude, claude-code

# Or do it in two steps
deepsyte login
deepsyte install cursor    # or: vscode, windsurf, claude, claude-code

# Or use an API key directly
deepsyte login --key sk_live_your_key_here

# Take a screenshot
deepsyte screenshot https://example.com

# Run an audit with findings
deepsyte review https://example.com

# Launch a managed local browser and keep the proof
deepsyte browser open https://example.com --record-video
deepsyte browser close --evidence --label homepage-check

# Mobile screenshot
deepsyte mobile https://example.com

# Dark mode
deepsyte dark https://example.com

# Responsive (desktop + tablet + mobile)
deepsyte responsive https://example.com

# Screenshot a specific element
deepsyte element https://example.com -s "#hero"

# Compare two URLs
deepsyte diff https://staging.example.com https://example.com

# Export as PDF
deepsyte pdf https://example.com
```

## Project setup & CI gating

The CLI ships an opinionated, zero-config workflow for adding deepsyte to a repo:

```bash
# Scaffold .deepsyte/{urls,budget}.json, agents.json, and a GH Action
deepsyte init

# Run the audit gate locally — exits non-zero when findings exceed the budget
deepsyte check

# Emit a sticky-PR-comment-friendly markdown report
deepsyte check --report github-comment --report-out report.md
```

The default `init` produces:

- **`.deepsyte/urls.json`** — the list of URLs to capture/audit (string or `{ url, label, tags }` entries)
- **`.deepsyte/budget.json`** — shared finding/perf thresholds consumed by both `check` and the VS Code extension's status-bar badge
- **`agents.json`** — manifest any AI framework (Claude Code, Cursor, Aider, Continue, OpenAI Agents) can ingest to expose `screenshot`, `review`, `diff`, `check`, etc. as tools
- **`.github/workflows/deepsyte.yml`** — opt-in PR audit workflow that posts a sticky comment

Pass `--no-agents` or `--no-github-action` to skip individual outputs; `--force` overwrites existing files.

### Visual baselines

Per-URL visual regression with local manifests stored under `.deepsyte/baselines/`:

```bash
deepsyte baseline create https://example.com   # capture & store
deepsyte baseline list                         # see all stored baselines
deepsyte baseline diff https://example.com    # compare current page vs reference
deepsyte baseline rm https://example.com       # remove a baseline
```

Each baseline is a tiny JSON file (no binaries committed); `screenshot_diff` re-fetches both sides at diff time so the comparison always uses live pages.

```bash
# Drift check across every stored baseline (CI-friendly)
deepsyte baseline verify --threshold 0.1 --max-changed 5
```

## Day-to-day commands

| Command | What it does |
| --- | --- |
| `deepsyte share <url>` | Capture and copy the CDN image URL to your clipboard (Win/macOS/Linux). `--open` to launch in the default browser. |
| `deepsyte logs` (alias `recent`) | Tail your last N screenshots/audits. `--json` for raw output. |
| `deepsyte doctor` | Diagnoses API key validity, network reachability, project-file health, GH workflow presence. Color-coded with hints. |
| `deepsyte upgrade` | Self-update to the latest npm version. `--check` for CI-friendly version-only check. |
| `deepsyte config list` | Inspect/manage stored API key + URL without editing JSON. `config set apiUrl https://...`, `config path`, etc. |
| `deepsyte budget show` / `budget set <key> <value>` | Edit `.deepsyte/budget.json` (`maxFindingsPerUrl`, `maxTotalFindings`, `warnThreshold`, `categories`) without touching JSON by hand. |
| `deepsyte watch` | Re-run `check` every time `urls.json` or `budget.json` changes — keep this running while editing. Forwards `--report` and `--report-out`. |

### Reports for CI

`check` supports four `--report` formats so you can plug it into any pipeline:

```bash
deepsyte check --report github-comment --report-out report.md  # sticky PR comment
deepsyte check --report html --report-out report.html          # self-contained, emailable
deepsyte check --report short                                   # one-liner status check
deepsyte check --report json                                    # structured machine output
```

Every successful `login`, `install`, and `setup` flow now also installs or repairs the managed core deepsyte skill under `~/.agents/skills/deepsyte`, including `workflows/sitewide-performance-audit/WORKFLOW.md`, so your MCP connection and local skill stay aligned.

For most clients, `login` + `install` reaches the same result as `setup --client <client>`. The main nuances are that `install vscode` writes a workspace-local `.vscode/mcp.json`, while `install claude-code` prints the `claude mcp add ...` command for you to run manually.

Start with remote execution for public sites. Escalate to the managed local browser when the work requires local reachability, private auth flows, or a more realistic browser environment.

If you want a browser-native current-tab client instead of the terminal, the monorepo also includes an unpacked Chrome extension preview in `packages/chrome-extension` with Playwright-backed public-page capture and local fallback for `localhost` and private pages.

`deepsyte skills ...` only manages that local core deepsyte skill. To discover or install community skills such as Anthropic's `frontend-design`, use the `find-skills` workflow or `npx skills find ...` / `npx skills add ...`.

## Local Managed Browser

```bash
# Launch an extension-free local browser with explicit approval
deepsyte browser open https://example.com

# Record the full managed local browser session to a local .webm file
deepsyte browser open https://example.com --record-video

# Pick a specific installed browser
deepsyte browser open https://example.com --browser edge

# Control the tracked managed browser
deepsyte browser status
deepsyte browser goto https://example.org
deepsyte browser back
deepsyte browser forward
deepsyte browser click "Learn more"
deepsyte browser click-at 320 480
deepsyte browser fill "input[type=email]" "user@example.com"
deepsyte browser hover ".menu-trigger"
deepsyte browser wait-for ".results-loaded" --timeout 8000
deepsyte browser select "select[name=country]" "Australia"
deepsyte browser key Enter
deepsyte browser scroll -y 500
deepsyte browser viewport 393 852
deepsyte browser screenshot
deepsyte browser text
deepsyte browser html
deepsyte browser console --level error
deepsyte browser network-errors
deepsyte browser network-requests --resource-type fetch --min-duration 200
deepsyte browser evidence --label checkout-bug
deepsyte browser close --evidence --label checkout-bug
deepsyte browser cookies get
deepsyte browser storage getAll --type localStorage
deepsyte browser eval "document.title"
deepsyte browser a11y --max-depth 6
deepsyte browser perf
deepsyte browser seo
deepsyte browser close
```

This command:

- asks the user for explicit approval before opening a local browser
- uses a fresh isolated deepsyte browser profile per launch
- does not require manual extension installation
- currently depends on an installed Chrome, Edge, or Chromium browser
- captures console logs and network activity continuously while the managed browser stays open
- reconnects to the tracked managed browser over CDP for follow-up actions
- can export a timestamped local evidence bundle with screenshot, HTML, text, accessibility, performance, SEO, cookies, storage, console logs, network logs, and session metadata
- supports `deepsyte browser close --evidence` to finalize recording and include the local `.webm` in the same bundle when video capture is enabled
- can optionally record the entire managed local browser session and return a local `.webm` path on `deepsyte browser close`

## Browser Sessions

```bash
# Open a browser session
deepsyte browse https://example.com

# With video recording
deepsyte browse https://example.com --record

# Interact with the page
deepsyte browse:click <sessionId> "Sign in"
deepsyte browse:fill <sessionId> "#email" "user@example.com"
deepsyte browse:key <sessionId> Enter
deepsyte browse:scroll <sessionId> -y 500
deepsyte browse:screenshot <sessionId>

# Close session (returns video URL if recording)
deepsyte browse:close <sessionId>
```

## Site Auditing

```bash
# AI-powered UX review
deepsyte review https://example.com

# SEO audit
deepsyte seo https://example.com

# Performance metrics (Core Web Vitals)
deepsyte perf https://example.com

# Accessibility tree
deepsyte a11y https://example.com

# Detect responsive breakpoints
deepsyte breakpoints https://example.com
```

## Test Email Inboxes

```bash
# Plan auth with the saved primary inbox and site memory
deepsyte auth:test https://example.com

# Discover likely login URLs
deepsyte auth:find-login https://example.com

# Try the smart login flow when you already know the credentials
deepsyte auth:smart-login https://example.com/sign-in --username user@example.com --password secret

# Connect Gmail once for OTP reads, then read the latest code
deepsyte auth:authorize-email
deepsyte auth:read-email

# Create or reuse the primary test inbox
deepsyte inbox:create

# Check for messages
deepsyte inbox:check <inboxId>

# Send a test email
deepsyte inbox:send <inboxId> -t recipient@example.com -s "Test" -b "Hello!"
```

For website login, sign-up, and verification flows:

- Start with `deepsyte auth:test <url>` to reuse the saved primary inbox and remembered auth history for that origin.
- Read the helper's recommended auth path, account-exists confidence, likely auth method, and expected follow-up before deciding whether to sign in or sign up first.
- Treat the helper's reusable strategy as the default cross-site guidance, and treat per-site hints as supporting evidence rather than universal rules.
- If sign-in fails because the account does not exist, switch to sign-up with the same saved credentials.
- If `smart_login` is uncertain on Clerk or multi-step auth UIs, fall back to browser tools and inspect network or console evidence before concluding the login failed.
- Use `deepsyte inbox:check <inboxId>` for OTP codes and verification links.
- When reporting auth results, summarize reusable auth-system heuristics first and site-specific evidence second.
- After the auth attempt, record the result with `deepsyte auth:test <url> --record --outcome <...>` so future runs remember what worked.

## Auto-Install MCP Server

For first-time onboarding, prefer `deepsyte setup --client <client>`. Use `install <client>` when you are already authenticated or only need to configure one client.

```bash
# Configure your IDE automatically
deepsyte install cursor
deepsyte install vscode
deepsyte install windsurf
deepsyte install claude
deepsyte install claude-code
```

## Managed Skills

```bash
# List installed skills under ~/.agents/skills
deepsyte skills list

# Install, update, or repair the managed core skill
deepsyte skills sync

# Alias for the current core-skill update path
deepsyte skills update
```

For community skills, use commands such as:

```bash
npx skills find "frontend design"
npx skills add anthropics/skills@frontend-design -g -y
```

## All Commands

| Command | Description |
|---------|-------------|
| `login` | Authenticate via OAuth or API key |
| `logout` | Clear stored credentials |
| `whoami` | Show auth status |
| `screenshot <url>` | Take a screenshot |
| `fullpage <url>` | Dedicated full-page screenshot command |
| `responsive <url>` | Desktop + tablet + mobile |
| `mobile <url>` | Mobile viewport (393×852) |
| `tablet <url>` | Tablet viewport (820×1180) |
| `dark <url>` | Dark mode screenshot |
| `element <url>` | Screenshot specific element |
| `diff <urlA> <urlB>` | Pixel diff two URLs |
| `pdf <url>` | Export as PDF |
| `cross-browser <url>` | Chromium + Firefox + WebKit |
| `batch <urls...>` | Screenshot up to 10 URLs |
| `screenshots` | List recent screenshot jobs |
| `screenshot:status <id>` | Check screenshot job status |
| `browser open [url]` | Launch a managed local browser (supports `--record-video`) |
| `browser back` | Navigate backward in managed local browser history |
| `browser forward` | Navigate forward in managed local browser history |
| `browser click-at <x> <y>` | Click viewport coordinates in the managed local browser |
| `browser status` | Show tracked local browser session |
| `browser goto <url>` | Navigate the managed local browser |
| `browser click <selector>` | Click in the managed local browser |
| `browser fill <selector> <value>` | Fill an input in the managed local browser |
| `browser hover <selector>` | Hover in the managed local browser |
| `browser wait-for <selector>` | Wait for an element in the managed local browser |
| `browser select <selector> <value>` | Select a dropdown option in the managed local browser |
| `browser key <key>` | Press a key in the managed local browser |
| `browser scroll` | Scroll the managed local browser |
| `browser viewport <width> <height>` | Resize the managed local browser viewport |
| `browser screenshot` | Save a local screenshot from the managed browser |
| `browser text` | Read visible text from the managed local browser |
| `browser html` | Read HTML from the managed local browser |
| `browser console` | Read captured console logs from the managed local browser |
| `browser network-errors` | Read failed network requests from the managed local browser |
| `browser network-requests` | Read captured network waterfall data from the managed local browser |
| `browser cookies <action>` | Get, set, or clear cookies in the managed local browser |
| `browser storage <action>` | Read or write localStorage/sessionStorage in the managed local browser |
| `browser eval <script>` | Evaluate JavaScript in the managed local browser |
| `browser a11y` | Inspect the accessibility tree from the managed local browser |
| `browser perf` | Read performance metrics from the managed local browser |
| `browser seo` | Audit SEO metadata from the managed local browser |
| `browser close` | Close the tracked managed local browser |
| `browse <url>` | Start browser session |
| `browse:click` | Click element |
| `browse:click-at` | Click session coordinates |
| `browse:fill` | Type into input |
| `browse:hover` | Hover element in session |
| `browse:select` | Select dropdown option in session |
| `browse:wait-for` | Wait for selector in session |
| `browse:screenshot` | Capture current page |
| `browse:close` | Close session |
| `browse:goto` | Navigate to URL |
| `browse:back` | Navigate backward in session history |
| `browse:forward` | Navigate forward in session history |
| `browse:viewport` | Resize an existing remote session |
| `browse:scroll` | Scroll page |
| `browse:key` | Press keyboard key |
| `browse:text` | Get visible text |
| `browse:html` | Get HTML |
| `browse:a11y` | Inspect session accessibility tree |
| `browse:eval` | Evaluate JavaScript in session |
| `browse:console` | Read session console logs |
| `browse:network-errors` | Read failed session network requests |
| `browse:network-requests` | Read session network waterfall |
| `browse:cookies` | Get, set, or clear session cookies |
| `browse:storage` | Read or write session storage |
| `browse:seo` | Run SEO audit against active session |
| `browse:perf` | Read performance metrics from active session |
| `browse:captcha` | Solve CAPTCHA in active session |
| `auth:test <url>` | Start-here helper to plan or record reusable website auth workflow with broad strategy plus per-site evidence |
| `auth:find-login <url>` | Discover likely login URLs |
| `auth:smart-login <loginUrl>` | Attempt smart login with known credentials |
| `auth:authorize-email` | Connect Gmail for verification code reads |
| `auth:read-email` | Read latest Gmail verification code |
| `inbox:create` | Create or reuse primary test inbox |
| `inbox:check` | Check inbox |
| `inbox:send` | Send email |
| `review <url>` | AI UX review |
| `seo <url>` | SEO audit |
| `perf <url>` | Performance metrics |
| `a11y <url>` | Accessibility tree |
| `breakpoints <url>` | Detect breakpoints |
| `install <client>` | Auto-configure MCP |
| `skills list` | List installed skills |
| `skills sync` | Install/update/repair the managed core skill |
| `skills update` | Alias for core skill sync |

## License

MIT

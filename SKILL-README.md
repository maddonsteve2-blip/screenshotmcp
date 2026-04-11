# ScreenshotsMCP Agent Skill

> Give your AI assistant eyes and hands for the web.

**46+ tools** for screenshots, browser automation, CAPTCHA solving, disposable email, and web testing.

[![Tools](https://img.shields.io/badge/tools-46+-blue)](SKILL.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-orange)]()

## Quick Install

### For AI Agents (MCP)

**Claude, Cursor, Windsurf, VS Code, Claude Code:**

1. Get API key: https://screenshotsmcp.com/dashboard/keys
2. Add to MCP config:

```json
{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "https://screenshotsmcp-api-production.up.railway.app/mcp/YOUR_API_KEY"
    }
  }
}
```

**Config locations:**
- Cursor: `~/.cursor/mcp.json`
- Windsurf: `~/.codeium/windsurf/mcp_config.json`
- VS Code: `.vscode/mcp.json`
- Claude Code: `claude mcp add screenshotsmcp`

### For Terminal (CLI)

```bash
# One-line setup
npx screenshotsmcp setup

# Or install globally
npm install -g screenshotsmcp
screenshotsmcp login
```

## What You Can Do

### Screenshots
```bash
screenshotsmcp screenshot https://example.com
screenshotsmcp responsive https://example.com    # Desktop + tablet + mobile
screenshotsmcp mobile https://example.com        # iPhone viewport
screenshotsmcp dark https://example.com          # Dark mode
screenshotsmcp diff https://v1.com https://v2.com # Before/after
```

### Browser Automation
```bash
# Start session
screenshotsmcp browse https://example.com
# → Returns sessionId: sess_abc123

# Interact
screenshotsmcp browse:fill sess_abc123 "input[name=email]" "user@test.com"
screenshotsmcp browse:click sess_abc123 "button[type=submit]"
screenshotsmcp browse:screenshot sess_abc123
screenshotsmcp browse:close sess_abc123
```

### Testing & Audits
```bash
screenshotsmcp seo https://example.com      # SEO metadata
screenshotsmcp perf https://example.com     # Core Web Vitals
screenshotsmcp a11y https://example.com     # Accessibility tree
screenshotsmcp review https://example.com   # AI UX review
```

### Disposable Email
```bash
screenshotsmcp inbox:create                 # Create test inbox
screenshotsmcp inbox:check <inboxId>       # Read messages + OTP codes
```

## Tool Categories

| Category | Tools | Purpose |
|----------|-------|---------|
| **Screenshots** | 13 | Any URL, mobile, tablet, responsive, dark mode, PDF, diff |
| **Browser** | 20+ | Navigate, click, fill, scroll, inspect, debug |
| **CAPTCHA** | 1 | Auto-solve Turnstile, reCAPTCHA, hCaptcha |
| **Email** | 3 | Create inboxes, check messages, send test emails |
| **Login** | 2 | Find login pages, automated login |
| **Performance** | 2 | Core Web Vitals, network waterfall |
| **SEO** | 1 | Meta tags, headings, JSON-LD |
| **UX** | 1 | AI-powered UX review |

**Total: 46+ tools**

## Common Workflows

### Screenshot a website
```
User: "Check how my site looks on mobile"
Agent: screenshotsmcp mobile https://mysite.com
```

### Test a login flow
```
User: "Test my sign-up flow"
Agent: 
  1. screenshotsmcp inbox:create
  2. screenshotsmcp browse https://mysite.com/sign-up
  3. screenshotsmcp browse:fill ... email fields
  4. screenshotsmcp solve-captcha sess_xxx
  5. screenshotsmcp browse:click ... submit
  6. screenshotsmcp inbox:check ... get OTP
  7. screenshotsmcp browse:fill ... OTP field
```

### Audit performance
```
User: "Why is my site slow?"
Agent: screenshotsmcp perf https://mysite.com
```

## Authentication

**API Key:** Get at https://screenshotsmcp.com/dashboard/keys
- Format: `sk_live_...`
- MCP: Embedded in server URL
- CLI: `screenshotsmcp login --key sk_live_...`

## Resources

- **Full Skill Docs:** [SKILL.md](SKILL.md)
- **Website:** https://screenshotsmcp.com
- **API:** https://screenshotsmcp-api-production.up.railway.app
- **CLI Package:** `npm install -g screenshotsmcp`
- **GitHub:** https://github.com/stevejford/screenshotmcp

## Why Use ScreenshotsMCP?

- ✅ **46+ tools** — Most comprehensive screenshot/automation suite
- ✅ **MCP + CLI** — Works with AI agents and terminal
- ✅ **CAPTCHA solving** — Auto-solve Cloudflare, reCAPTCHA, hCaptcha
- ✅ **Disposable email** — Test sign-ups with real inboxes
- ✅ **Public CDN** — All screenshots get permanent public URLs
- ✅ **Fast** — Playwright workers, edge-deployed
- ✅ **Affordable** — Free tier: 100/month, Pro: $29 for 10,000

## License

MIT

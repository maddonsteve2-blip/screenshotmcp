# screenshotsmcp

CLI for [ScreenshotsMCP](https://screenshotsmcp.com) — take screenshots, record browser sessions, audit sites, and more from the terminal.

## Install

```bash
npm install -g screenshotsmcp
```

Or use without installing:

```bash
npx screenshotsmcp screenshot https://example.com
```

## Quick Start

```bash
# Login (opens browser for OAuth)
screenshotsmcp login

# Or use an API key directly
screenshotsmcp login --key sk_live_your_key_here

# Take a screenshot
screenshotsmcp screenshot https://example.com

# Mobile screenshot
screenshotsmcp mobile https://example.com

# Dark mode
screenshotsmcp dark https://example.com

# Responsive (desktop + tablet + mobile)
screenshotsmcp responsive https://example.com

# Screenshot a specific element
screenshotsmcp element https://example.com -s "#hero"

# Compare two URLs
screenshotsmcp diff https://staging.example.com https://example.com

# Export as PDF
screenshotsmcp pdf https://example.com
```

## Browser Sessions

```bash
# Open a browser session
screenshotsmcp browse https://example.com

# With video recording
screenshotsmcp browse https://example.com --record

# Interact with the page
screenshotsmcp browse:click <sessionId> "Sign in"
screenshotsmcp browse:fill <sessionId> "#email" "user@example.com"
screenshotsmcp browse:key <sessionId> Enter
screenshotsmcp browse:scroll <sessionId> -y 500
screenshotsmcp browse:screenshot <sessionId>

# Close session (returns video URL if recording)
screenshotsmcp browse:close <sessionId>
```

## Site Auditing

```bash
# AI-powered UX review
screenshotsmcp review https://example.com

# SEO audit
screenshotsmcp seo https://example.com

# Performance metrics (Core Web Vitals)
screenshotsmcp perf https://example.com

# Accessibility tree
screenshotsmcp a11y https://example.com

# Detect responsive breakpoints
screenshotsmcp breakpoints https://example.com
```

## Test Email Inboxes

```bash
# Create a disposable inbox
screenshotsmcp inbox:create

# Check for messages
screenshotsmcp inbox:check <inboxId>

# Send a test email
screenshotsmcp inbox:send <inboxId> -t recipient@example.com -s "Test" -b "Hello!"
```

## Auto-Install MCP Server

```bash
# Configure your IDE automatically
screenshotsmcp install cursor
screenshotsmcp install vscode
screenshotsmcp install windsurf
screenshotsmcp install claude
screenshotsmcp install claude-code
```

## All Commands

| Command | Description |
|---------|-------------|
| `login` | Authenticate via OAuth or API key |
| `logout` | Clear stored credentials |
| `whoami` | Show auth status |
| `screenshot <url>` | Take a screenshot |
| `responsive <url>` | Desktop + tablet + mobile |
| `mobile <url>` | Mobile viewport (393×852) |
| `tablet <url>` | Tablet viewport (820×1180) |
| `dark <url>` | Dark mode screenshot |
| `element <url>` | Screenshot specific element |
| `diff <urlA> <urlB>` | Pixel diff two URLs |
| `pdf <url>` | Export as PDF |
| `cross-browser <url>` | Chromium + Firefox + WebKit |
| `batch <urls...>` | Screenshot up to 10 URLs |
| `browse <url>` | Start browser session |
| `browse:click` | Click element |
| `browse:fill` | Type into input |
| `browse:screenshot` | Capture current page |
| `browse:close` | Close session |
| `browse:goto` | Navigate to URL |
| `browse:scroll` | Scroll page |
| `browse:key` | Press keyboard key |
| `browse:text` | Get visible text |
| `browse:html` | Get HTML |
| `inbox:create` | Create test inbox |
| `inbox:check` | Check inbox |
| `inbox:send` | Send email |
| `review <url>` | AI UX review |
| `seo <url>` | SEO audit |
| `perf <url>` | Performance metrics |
| `a11y <url>` | Accessibility tree |
| `breakpoints <url>` | Detect breakpoints |
| `install <client>` | Auto-configure MCP |

## License

MIT

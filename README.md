# ScreenshotsMCP

Give your AI a real browser — and proof.

ScreenshotsMCP is a browser truth platform for AI agents and developers. It helps AI inspect, test, and verify websites with screenshots, browser actions, recordings, audits, and evidence bundles across remote and local execution modes.

## What it does

- **Inspect websites visually** with screenshots, responsive captures, PDFs, and diffs
- **Run real browser workflows** with navigation, clicks, fills, keypresses, scrolling, and session recording
- **Handle local and private apps** with a managed local browser for `localhost`, intranet, VPN, and authenticated flows
- **Collect proof** with screenshots, recordings, console logs, network requests, storage, cookies, SEO, performance, and accessibility artifacts
- **Work inside existing AI tooling** via MCP, CLI, dashboard, and extension surfaces

## Execution modes

ScreenshotsMCP is designed around least-invasive execution first:

- **Remote browser sessions** for public websites and cloud-friendly workflows
- **Managed local browser** for private, local, or more realistic human-in-the-loop testing
- **Current-tab / browser-native paths** as a higher-trust escalation path where needed

That lets the same product cover public QA, authenticated flows, local development servers, and evidence-heavy debugging without forcing a cloud-only model.

## Quick start

### Install the CLI

```bash
npm install -g screenshotsmcp
```

Or use it without installing:

```bash
npx screenshotsmcp setup
```

### Basic examples

```bash
# Take a screenshot
screenshotsmcp screenshot https://example.com

# Review a site with AI
screenshotsmcp review https://example.com

# Open a managed local browser with explicit approval
screenshotsmcp browser open https://example.com --record-video

# Export an evidence bundle when closing
screenshotsmcp browser close --evidence --label checkout-bug
```

### MCP setup

Add ScreenshotsMCP to your MCP client:

```json
{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "https://screenshotsmcp-api-production.up.railway.app/mcp/YOUR_API_KEY"
    }
  }
}
```

Supported clients include Cursor, Windsurf, Claude Desktop, Claude Code, and VS Code.

## Why ScreenshotsMCP

- **Browser truth for AI** instead of code-only guesses
- **Proof by default** with screenshots, recordings, logs, and shareable artifacts
- **Local-first capability when needed** for `localhost`, private apps, and real authenticated workflows
- **Broad observability** across visual state, console, network, SEO, accessibility, and performance
- **Human + agent workflow fit** for debugging, verification, audits, and internal tooling

## Monorepo structure

| Service | Purpose |
|---|---|
| **Railway** | `apps/api` — Express + Playwright + MCP server |
| **Vercel** | `apps/web` — Next.js 14 dashboard + landing page |
| **Neon** | PostgreSQL database (Drizzle ORM) |
| **Cloudflare R2** | Screenshot image storage + CDN |
| **Clerk** | Authentication |
| **Stripe** | Billing (Free / Starter $9 / Pro $29) |

## Project Structure

```
screenshotsmcp/
├── apps/
│   ├── api/                # Express + Playwright + MCP server → Railway
│   └── web/                # Next.js dashboard, docs, landing page → Vercel
├── packages/
│   ├── cli/                # npm CLI: screenshots, audits, local browser control
│   ├── db/                 # Drizzle schema + Neon client
│   ├── types/              # Shared TypeScript types and execution model
│   ├── vscode-extension/   # VS Code extension preview
│   └── chrome-extension/   # Chrome extension preview
```

## Repository entry points

- **GitHub repo README** — this file, for product and repo overview
- **CLI README** — `packages/cli/README.md`
- **Docs site** — `apps/web/content/docs/`
- **Agent skill docs** — `apps/web/public/.skills/screenshotsmcp/SKILL.md`
- **LLM-facing docs** — `apps/web/public/llms.txt`

## Local development

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```
Fill in Clerk, Neon, R2, Stripe, and related credentials.

### 3. Run database migrations
```bash
npm run db:migrate
```

### 4. Dev mode
```bash
npm run dev
```

## Product surfaces

### REST API

Use the API for screenshot capture and browser-backed workflows from your own applications.

### MCP server

Use the MCP server when you want AI agents to call ScreenshotsMCP tools directly from Cursor, Windsurf, Claude Desktop, Claude Code, VS Code, and similar clients.

### CLI

Use the CLI for direct terminal workflows, local browser control, and setup flows.

### Dashboard and docs

Use the web app for keys, billing, installation, analytics, screenshots, recordings, and documentation.

## API usage

### REST
```bash
# Take a screenshot
curl -X POST https://screenshotsmcp-api-production.up.railway.app/v1/screenshot \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": false}'

# Poll for result
curl https://screenshotsmcp-api-production.up.railway.app/v1/screenshot/<id> \
  -H "Authorization: Bearer sk_live_..."
```

### MCP (Claude Desktop / Cursor / Windsurf)
Add to your MCP config:
```json
{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "https://screenshotsmcp-api-production.up.railway.app/mcp/YOUR_API_KEY"
    }
  }
}
```

## Deploy

### API → Railway
Deploy from the repo root with Railway CLI:

```bash
railway up
```

Add environment variables from `apps/api/.env.example`.

### Web → Vercel
The web app auto-deploys via Vercel on `git push`, or can be deployed manually with Vercel CLI.

Add environment variables from `apps/web/.env.example`.

### Database → Neon
1. Create project at neon.tech
2. Copy connection string to `DATABASE_URL`
3. Run `npm run db:migrate`

### Storage → Cloudflare R2
1. Create R2 bucket named `screenshotsmcp`
2. Create API token with R2 read/write
3. Set a custom domain for public access

## Links

- **Website:** https://www.screenshotmcp.com
- **Dashboard:** https://web-phi-eight-56.vercel.app/dashboard
- **API:** https://screenshotsmcp-api-production.up.railway.app
- **CLI docs:** `packages/cli/README.md`

# ScreenshotsMCP — New Session Briefing

> **Read this first.** Then read `AGENTS.md` at the repo root for architecture, debugging, and deployment details.

---

## What Is This Project?

**ScreenshotsMCP** is a screenshot-as-a-service platform for AI agents. It lets AI assistants (Claude, GPT, Cursor, Windsurf, etc.) capture screenshots of websites, run browser automation, audit UX/SEO/performance, test login flows, and verify visual output — all through standard protocols.

### Core surfaces

| Surface | Tech | Location | Purpose |
|---------|------|----------|---------|
| **MCP Server** | Express + Playwright | `apps/api/src/mcp/` | Model Context Protocol server — AI agents connect here |
| **REST API** | Express | `apps/api/` | HTTP API for screenshots, browser sessions, audits |
| **Web Dashboard** | Next.js 15 | `apps/web/` | User dashboard, docs site, billing, shared pages |
| **CLI** | Node.js | `packages/cli/` | npm CLI (`npx screenshotsmcp`) |
| **VS Code Extension** | TypeScript | `packages/vscode-extension/` | IDE integration |
| **GitHub Action** | TypeScript | `packages/github-action/` | CI/CD screenshot capture |

### Key capabilities (46+ MCP tools)

- Screenshot any URL (viewport, full-page, element, responsive, dark mode, cross-browser, diff)
- Full browser automation (navigate, click, fill, scroll, wait, evaluate JS)
- UX / SEO / performance audits
- Auth testing (login, signup, CAPTCHA solving, email verification)
- Webhook delivery for async results
- Shared screenshot pages (public read-only links with annotations)

---

## Tech Stack

- **Monorepo**: Turborepo
- **API**: Express + TypeScript, deployed on **Railway**
- **Web**: Next.js 15 (App Router), deployed on **Vercel**
- **Database**: **Neon Postgres** (project ID: `royal-brook-92982254`), ORM: **Drizzle**
- **Auth (web)**: **Clerk**
- **Auth (API)**: Bearer API keys (`sk_live_...`)
- **Billing**: **Stripe**
- **Storage**: **Cloudflare R2** (screenshot images)
- **Browser engine**: **Playwright** (with stealth scripts)
- **Styling**: Tailwind CSS + shadcn/ui

---

## Production URLs

| What | URL |
|------|-----|
| Website / Dashboard | https://www.screenshotmcp.com |
| API | https://screenshotsmcp-api-production.up.railway.app |
| Sign-in | https://www.screenshotmcp.com/sign-in |
| Dashboard | https://www.screenshotmcp.com/dashboard |
| Docs | https://www.screenshotmcp.com/docs |
| Shared screenshots | https://www.screenshotmcp.com/shared/screenshots/[token] |

---

## Deploying

- **API (Railway)**: `railway up` from repo root (NOT git push)
- **Web (Vercel)**: `npx vercel --prod --yes` from repo root, OR `git push origin main` for auto-deploy
- **CLI**: `cd packages/cli && npm version patch && npm publish --access public`

**Do NOT run `npx tsc --noEmit` in `apps/api`** — it will fail on purpose.

---

## Key Files to Know

| File | What it does |
|------|-------------|
| `AGENTS.md` | Full architecture, env vars, debugging, deployment instructions |
| `packages/db/src/schema.ts` | Database schema (Drizzle) — all tables |
| `apps/api/src/mcp/server.ts` | MCP server tool definitions |
| `apps/web/src/middleware.ts` | Clerk auth middleware — controls public vs protected routes |
| `apps/web/src/app/api/` | Next.js API routes |
| `apps/web/src/app/dashboard/` | Dashboard pages |
| `apps/web/src/app/shared/` | Public shared screenshot pages |
| `apps/web/public/.skills/screenshotsmcp/SKILL.md` | Skill file (must be updated when tools change) |
| `apps/web/public/llms.txt` | LLM-readable docs (must be updated when tools change) |

---

## Recent Work Completed

### Shared Screenshot 404 Fix
- **Problem**: Shared screenshot URLs returned 404
- **Root cause**: Clerk middleware was blocking `/api/shared/screenshots/[token]`
- **Fix**: Added `"/api/shared/(.*)"` to public routes in `middleware.ts`
- **Also fixed**: Server-side fetch in shared page now uses request headers for base URL instead of stale env vars

### Download Button Fix
- **Problem**: "Download image" on shared pages opened image in new tab instead of downloading
- **Root cause**: Browser ignores `<a download>` for cross-origin URLs (R2 CDN)
- **Fix**: Created same-origin download proxy at `/api/shared/screenshots/[token]/download` that streams the image with `Content-Disposition: attachment`

### Screenshot Annotations
- Added undo/redo to the annotation editor
- Added `ScreenshotAnnotatedPreview` component for showing annotations in card previews
- Wired annotation display into captures tab and artifacts page

### Share Link Domain
- Share URLs now use the canonical domain (`screenshotmcp.com`) derived from request headers, not potentially stale env vars

---

## What Needs To Happen Next

### Product Hunt Launch Preparation
The owner wants to launch on Product Hunt. This requires:

1. **Homepage polish** — hero section, value prop, social proof, CTA
2. **Onboarding flow** — sign-up → first screenshot should be dead simple
3. **Pricing page** — clear free vs paid tiers
4. **Demo video / GIF** — 30-60 second product walkthrough
5. **Product Hunt listing copy** — tagline, description, maker comment, gallery images
6. **Docs quality pass** — getting-started guide, tool reference, examples

### Stability & Polish
- Ensure sign-up, billing, screenshot generation, and share flows are rock-solid
- Fix any remaining rough edges in dashboard UX
- Test all public-facing pages

### Growth & Marketing
- SEO optimization for docs and landing pages
- Use-case pages
- Integration guides

---

## Important Patterns

- **Screenshots are async**: POST to enqueue → poll GET for status → get public URL when done
- **Playground**: Proxies requests through `/api/playground/screenshot` to avoid exposing API keys client-side
- **Internal auth**: Web↔API calls use `Authorization: Internal <secret>:<userId>`
- **Share tokens**: Stored in `screenshots.shareToken` column, public pages fetch via `/api/shared/screenshots/[token]`
- **Annotations**: Stored as JSONB in `screenshots.annotations` column

---

## When Making Changes

After any feature/tool change, update ALL of these:
1. MCP Server — `apps/api/src/mcp/server.ts`
2. CLI — `packages/cli/src/commands/`
3. SKILL.md — `apps/web/public/.skills/screenshotsmcp/SKILL.md`
4. llms.txt — `apps/web/public/llms.txt`
5. Docs — `apps/web/content/docs/`
6. Install page — `apps/web/src/app/dashboard/install/page.tsx`

---

## Environment Variables

### Railway (API)
- `DATABASE_URL` — Neon connection string
- `R2_*` — Cloudflare R2 storage credentials
- `INTERNAL_API_SECRET` — Shared secret for web↔API internal auth
- `CAPSOLVER_API_KEY` — CapSolver for CAPTCHA solving
- `AGENTMAIL_API_KEY` — Default AgentMail key

### Vercel (Web)
- `DATABASE_URL` — Same Neon connection string
- `NEXT_PUBLIC_API_URL` — Railway API URL
- `INTERNAL_API_SECRET` — Must match Railway's value
- `CLERK_*` — Clerk auth keys
- `STRIPE_*` — Stripe billing keys

---

## Rules

- Read `AGENTS.md` before making changes
- Do NOT run `npx tsc --noEmit` in `apps/api`
- Do NOT batch `git push` + `npx vercel --prod` after every small edit — batch changes
- Prefer minimal surgical edits over large rewrites
- Match existing code style
- Test changes before deploying

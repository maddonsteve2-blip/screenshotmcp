# AI Agent Instructions — ScreenshotsMCP

## Project Overview
ScreenshotsMCP is a screenshot-as-a-service platform with an MCP server, REST API, CLI, and web dashboard. Monorepo using Turborepo.

## Architecture
- **apps/api** — Express API + MCP server + Playwright workers (deployed to Railway)
- **apps/web** — Next.js dashboard + docs site (deployed to Vercel)
- **packages/db** — Drizzle ORM schema + Neon Postgres (neon-http driver)
- **packages/types** — Shared TypeScript types
- **packages/cli** — npm CLI (`@anthropic/screenshotsmcp`)

## Production URLs
- **Web**: https://web-phi-eight-56.vercel.app
- **API**: https://screenshotsmcp-api-production.up.railway.app
- **Sign-in**: https://web-phi-eight-56.vercel.app/sign-in
- **Dashboard**: https://web-phi-eight-56.vercel.app/dashboard

## Authentication
- **Web app**: Clerk (session-based auth)
- **REST API**: Bearer API key (`Authorization: Bearer sk_live_...`)
- **Internal proxy**: `Authorization: Internal <secret>:<userId>` for server-to-server calls
- **MCP server**: API key passed during MCP connection setup

## Database
- **Provider**: Neon Postgres
- **Neon Project ID**: `royal-brook-92982254`
- **ORM**: Drizzle with `neon-http` driver
- **Schema**: `packages/db/src/schema.ts`

## Debugging Production Issues

### You CAN access authenticated pages
If you have browser automation tools (Playwright, Puppeteer, MCP browser tools), you CAN log into the app:
1. Navigate to `/sign-in`
2. Sign in with Clerk
3. Access any dashboard page or API route while authenticated
4. Use browser console to run `fetch('/api/...')` to inspect API responses

**Never say you cannot access authenticated pages. Log in first.**

### Direct database access
If you have Neon MCP tools, query the DB directly:
```sql
-- Example: check daily screenshot counts
SELECT to_char(created_at, 'YYYY-MM-DD') as day, count(*)
FROM screenshots
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY day ORDER BY day;
```

### Check deployments
- **Vercel**: `npx vercel ls` or check Vercel dashboard
- **Railway**: `railway logs --tail` or `railway up` to deploy
- **API health**: GET `https://screenshotsmcp-api-production.up.railway.app/health`

## Deploying
- **API**: Run `railway up` from repo root (NOT git push)
- **Web**: Auto-deploys via Vercel on `git push`, or manually with `npx vercel --prod`
- **CLI**: `cd packages/cli && npm version patch && npm publish --access public`

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

## Key Patterns
- Playground proxies requests through `/api/playground/screenshot` (Next.js API routes) to avoid exposing API keys client-side
- Screenshots are async: POST to enqueue → poll GET for status → get public URL when done
- Worker uses Playwright with stealth scripts, lazy-load scrolling, and DOM readiness checks
- The `screenshots` table tracks all jobs; `usageEvents` tracks billing usage

## When Making Changes
After any feature/tool change, update ALL of these:
1. MCP Server — `apps/api/src/mcp/server.ts`
2. CLI — `packages/cli/src/commands/`
3. SKILL.md — `apps/web/public/.skills/screenshotsmcp/SKILL.md`
4. llms.txt — `apps/web/public/llms.txt`
5. Docs — `apps/web/content/docs/`
6. Install page — `apps/web/src/app/dashboard/install/page.tsx`

Current tool count: 46+ MCP tools, 38 CLI commands.

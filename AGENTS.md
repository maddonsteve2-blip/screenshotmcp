# AI Agent Instructions — DeepSyte

## Project Overview
DeepSyte is a screenshot-as-a-service platform with an MCP server, REST API, CLI, and web dashboard. Monorepo using Turborepo.

## Architecture
- **apps/api** — Express API + MCP server + Playwright workers (deployed to Railway)
- **apps/web** — Next.js dashboard + docs site (deployed to Vercel)
- **apps/agent** — CopilotKit agent UI (separate Vercel project, `agent.deepsyte.com`)
- **packages/db** — Drizzle ORM schema + Neon Postgres (neon-http driver)
- **packages/types** — Shared TypeScript types
- **packages/cli** — npm CLI (`@anthropic/deepsyte`)

## Production URLs
- **Web**: https://web-phi-eight-56.vercel.app
- **API**: https://api.deepsyte.com (Railway: https://screenshotsmcp-api-production.up.railway.app)
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
- **API health**: GET `https://api.deepsyte.com/health`

## Deploying
- **API**: Run `railway up` from repo root (NOT git push)
  - Railway account: `maddonsteve2@gmail.com` (GitHub: `maddonsteeve2-blip`)
  - Railway project: `deepsyte-api`
  - Railway service: `screenshotsmcp-api`
  - Railway environment: `production`
  - If `railway up` says "Unauthorized", run `railway login --browserless` with the **maddonsteve2** account, then `railway link` and select `deepsyte-api`.
- **Web**: Auto-deploys via Vercel on `git push`, or manually with `npx vercel --prod`
- **Agent**: Separate Vercel project — `git push` triggers build if `apps/agent` changed.
  - First-time setup: create a new Vercel project, set root directory to `apps/agent`.
  - Add env vars: `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `DEEPSYTE_API_URL`, `DEEPSYTE_AGENT_API_KEY`.
  - Point custom domain `agent.deepsyte.com` at the Vercel project.
  - Local dev: `npm run dev --workspace @deepsyte/agent` (runs on port 3002).
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

### Vercel (Agent — apps/agent)
- `MINIMAX_API_KEY` — MiniMax Token Plan key (regenerate if ever exposed)
- `MINIMAX_BASE_URL` — `https://api.minimax.io/v1`
- `DEEPSYTE_API_URL` — Railway API URL
- `DEEPSYTE_AGENT_API_KEY` — A valid DeepSyte API key for tool execution

## Key Patterns
- Playground proxies requests through `/api/playground/screenshot` (Next.js API routes) to avoid exposing API keys client-side
- Screenshots are async: POST to enqueue → poll GET for status → get public URL when done
- Worker uses Playwright with stealth scripts, lazy-load scrolling, and DOM readiness checks
- The `screenshots` table tracks all jobs; `usageEvents` tracks billing usage

## When Making Changes
After any feature/tool change, update ALL of these:
1. MCP Server — `apps/api/src/mcp/server.ts`
2. CLI — `packages/cli/src/commands/`
3. SKILL.md — `apps/web/public/.skills/deepsyte/SKILL.md`
4. llms.txt — `apps/web/public/llms.txt`
5. Docs — `apps/web/content/docs/`
6. Install page — `apps/web/src/app/dashboard/install/page.tsx`

Current tool count: 47+ MCP tools, 39 CLI commands.

## Audit Workflow Gate
- For any request involving a site audit, performance audit, SEO audit, UX audit, full audit, or another repeatable multi-page website review, read `workflows/sitewide-performance-audit/WORKFLOW.md` before opening browser sessions, running audit tools, or drafting findings.
- If the user provides the site or base URL but does not specify a page set, infer a representative public page set and start the audit without blocking on clarification.
- Default authenticated pages to out of scope unless the user explicitly asks for login, dashboard, or another protected flow.
- Before tool use, explicitly state that you read the workflow, the page set you will audit, whether authenticated pages are in scope, and whether you will use MCP or CLI first.
- Ask a blocking clarification question only when the base URL is missing or when authenticated scope is essential and still ambiguous.
- If you start a generic live audit before reading the workflow, the audit is invalid and must be restarted from the workflow.

## Progressive Visibility — never wait blindly for browser state

Applies to every browser-automation task in this repo (MCP tools, CLI
commands, new code you write).

**The rule:** Do not call a tool that might silently hang with a long
timeout. Poll on an escalating schedule, emit a visual snapshot on every
tick, and decide whether to keep waiting based on what you actually see.

Standard schedule: `[2s, 5s, 10s, 20s, 40s, 40s]` — ≈2 minutes max,
six visible checkpoints.

After each tick, compare against the previous snapshot:

| Observation | Decision |
|---|---|
| URL changed | Likely done — verify expected state |
| Visible text changed | Progress — keep waiting |
| Same state 2+ ticks | Stuck — abort or change strategy |
| Error modal / toast visible | Abort immediately, report to user |

Concrete patterns:

- `browser_wait_for` → short timeout (5s), pair with `browser_screenshot`.
- `browser_navigate` on SPAs → wait 2s, screenshot, check skeleton vs real.
- `smart_login` / `solve_captcha` → screenshot the result, don't trust the
  text response alone.
- CLI commands that poll → emit snapshot (URL + H1 + visible text) every
  tick, let the calling agent decide.

Reference implementation:
`packages/cli/src/commands/smithery-signup.ts` uses this schedule and logs
each snapshot to stdout.

The full rule with rationale lives in `SKILL.md` under **Progressive
Visibility**.

## General Working Principles
- **Think Before Coding**
  - State assumptions explicitly. If ambiguity matters, ask rather than guess.
  - Surface tradeoffs and simpler alternatives when relevant.
  - Stop and clarify when the request or codebase behavior is unclear.
- **Simplicity First**
  - Prefer the minimum code that solves the requested problem.
  - Avoid speculative abstractions, configurability, or features that were not requested.
  - If a simpler design satisfies the goal, choose it.
- **Surgical Changes**
  - Touch only the code required for the task.
  - Match existing style and patterns unless refactoring is explicitly requested.
  - Do not remove or rewrite unrelated comments, formatting, or pre-existing dead code.
  - Clean up only imports, variables, and helpers made unused by your own changes.
- **Goal-Driven Execution**
  - Define clear success criteria before implementing non-trivial work.
  - Prefer verifiable checks such as tests, reproduction steps, or explicit validation.
  - For multi-step tasks, state a short plan and verify each step before moving on.

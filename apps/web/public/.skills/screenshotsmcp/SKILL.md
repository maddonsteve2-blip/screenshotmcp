---
name: screenshotsmcp
description: >
  This skill should be used when the user asks to inspect, test, or verify a website, take screenshots, debug browser behavior, audit SEO or performance, test sign-in or sign-up flows, solve CAPTCHAs, create test inboxes, or otherwise needs browser truth from ScreenshotsMCP.
license: MIT
compatibility: Requires the ScreenshotsMCP MCP server connected and authenticated, or the ScreenshotsMCP CLI when terminal access is available.
metadata:
  author: screenshotsmcp
  version: "2.5.0"
  website: https://www.screenshotmcp.com
  api: https://screenshotsmcp-api-production.up.railway.app
---

# ScreenshotsMCP

Use this skill to give the assistant eyes and hands for the web. Use it to choose the right tool path, then read only the relevant workflow or reference for the task.

## Discovery model

- Treat ScreenshotsMCP tools as atomic actions.
- Treat this skill as broad guidance for choosing the right path.
- Treat packaged workflows as targeted procedures for repeatable multi-step jobs.
- When the task is an audit, verification flow, or another repeatable multi-step procedure, check the available workflows before improvising.
- For any repeatable multi-page audit, read the matching workflow before opening browser sessions or running audit tools:
  - Performance / speed / Core Web Vitals → `workflows/sitewide-performance-audit/WORKFLOW.md`
  - SEO / meta tags / structured data / ranking → `workflows/seo-audit/WORKFLOW.md`
  - UX / accessibility / WCAG / a11y → `workflows/ux-accessibility-audit/WORKFLOW.md`
  - Responsive / mobile / breakpoints / layout → `workflows/responsive-audit/WORKFLOW.md`
  - General "full audit" → start with performance, then SEO, then UX, then responsive.
- Do not read every workflow up front. Read only the workflow that matches the task.
- If terminal access exists and repeated tool calls are likely, prefer the CLI when it is clearly faster than repeated MCP round-trips. If terminal access is not available, stay in MCP.
- For multi-page performance audits in MCP, avoid opening many new browser sessions in parallel. Measure sequentially unless there is a proven reason to increase concurrency.

## Available workflows

- `workflows/sitewide-performance-audit/WORKFLOW.md` — use when the user asks why a site is slow, wants the slowest pages identified, or wants a repeatable multi-page performance review.
- `workflows/seo-audit/WORKFLOW.md` — use when the user asks for an SEO audit, wants to check meta tags, structured data, OG tags, or ranking issues across pages.
- `workflows/ux-accessibility-audit/WORKFLOW.md` — use when the user asks for a UX audit, accessibility review, WCAG compliance check, or a11y assessment.
- `workflows/responsive-audit/WORKFLOW.md` — use when the user asks to check responsive design, test breakpoints, verify mobile/tablet layouts, or find layout issues at different screen sizes.

## Escalation ladder (when MCP silently stalls)

Some sites reject traffic from the Railway-hosted cloud browser at the fingerprint level: Cloudflare Turnstile, WorkOS AuthKit (`authk.*.ai`, e.g. Smithery), Clerk bot-detection, and Akamai/PerimeterX-protected signups. `solve_captcha` returns a valid token but Siteverify rejects it. Retrying is futile.

When a valid-looking submit silently does nothing (URL does not change, no error, form resets), escalate instead of retrying:

1. Start with MCP tools: `browser_navigate`, `smart_login`, `solve_captcha`.
2. If MCP stalls, switch to the CLI local browser: `npx screenshotsmcp browser:start <url>`, then drive real Chrome one atomic command at a time with `browser:click`, `browser:fill`, `browser:paste` (React-compatible), `browser:wait-for`, `browser:inspect`, and `browser:eval`. Real Chrome on the user's residential IP passes trust checks the cloud browser cannot, often without even showing a CAPTCHA checkbox.
3. Always call `screenshotsmcp auth:plan <url>` before a fresh auth attempt and `screenshotsmcp auth:record <url> <outcome>` after. Inbox, password, and per-site auth state persist so the next run resumes correctly.
4. Use `+alias` emails (e.g. `you+smithery@agentmail.to`) to reuse a single inbox for multiple signups.

The interactive rule: after every `browser:*` command, read the returned PNG, confirm the state, then issue the next command. No preset scripts.

## Choose the right tool path

### 1. One-shot capture
Use screenshot tools when the user only needs an image, diff, PDF, or responsive set.

- Prefer `screenshot_responsive` over separate desktop, tablet, and mobile captures.
- Use `screenshot_element` when the user only cares about a selector.
- For very long pages, avoid unreadable strips by using `fullPage: false` or `maxHeight`.

### 2. Interactive browser task
Use browser session tools when the user needs clicks, typing, hover states, navigation, or data extraction from a live page.

- Start with `browser_navigate` and carry the returned `sessionId` through the workflow.
- Prefer `browser_get_accessibility_tree` when you need structure, forms, buttons, and labels.
- Always call `browser_close` when the workflow is finished.
- **Always surface the `Run URL` returned by `browser_navigate` and `browser_close` to the user at the end of the task** (e.g. "View this run: https://www.screenshotmcp.com/dashboard/runs/..."). The dashboard shows the live timeline, captures, replay, console, and network evidence — it is the primary way users review what the agent did. If a `Share URL` is also returned, include it so teammates without an account can review the run.

### 3. Auth, sign-up, and verification
Use the auth workflow when the user needs to test protected or multi-step flows.

- Start with `auth_test_assist` for website auth work. It is the primary auth entrypoint: it reuses the saved inbox/password, checks remembered auth history for the site's origin, and returns recommended auth path, account-exists confidence, likely auth method, and expected follow-up.
- Treat the helper's reusable strategy as the default cross-site guidance, and treat per-site hints as evidence rather than universal rules.
- Find the login page with `find_login_page` when the URL is not known.
- Ask the user for credentials before using `smart_login`. Never guess passwords.
- If `smart_login` is uncertain on Clerk or multi-step auth UIs, fall back to `browser_fill`, `browser_press_key`, `browser_evaluate`, and inspect `browser_network_requests` or `browser_console_logs` before concluding the login failed.
- Use `create_test_inbox` only when you explicitly need a fresh inbox or a standalone inbox workflow.
- Use `check_inbox` for OTP and verification flows.
- Use `read_verification_email` only after the user has authorized Gmail access.
- Use `solve_captcha` when a CAPTCHA blocks progress.
- After a successful or failed auth attempt, call `auth_test_assist` with `action: "record"` to save what happened for future runs.

### 4. Audit and debugging
Use audit and debug tools when the user wants findings, not just screenshots.

- If the task is a repeatable multi-page audit, read the matching workflow first (see Available workflows above).
- If the user provides the site or base URL but not a page list, infer a representative public page set and start without blocking on clarification.
- Default authenticated pages to out of scope unless the user explicitly asks for login, dashboard, account, or another protected flow.
- Ask a blocking clarification question only when the base URL is missing or when protected-page scope is essential and still ambiguous.
- Before tool use, explicitly state that you read the workflow, the page set you will audit, whether authenticated pages are in scope, and whether you will use MCP or CLI first.
- If you start a generic live audit before reading the workflow, the audit is invalid and must be restarted from the workflow.
- Use `browser_perf_metrics` for Core Web Vitals and network weight.
- For repeatable public-page performance audits in MCP, run `browser_navigate` and `browser_perf_metrics` sequentially page by page instead of fanning out multiple new sessions at once.
- If the CLI path would need approval and MCP is already available, begin with MCP instead of stalling mid-audit.
- Use `browser_seo_audit` for metadata, heading structure, and structured data.
- Use `browser_console_logs` and `browser_network_errors` to investigate failures.
- Use `ux_review` when the user wants a broader product or UX assessment.

## Default operating style

- Say briefly what you are about to capture or inspect before starting.
- Prefer the fewest tools that answer the question.
- If a session already exists, reuse it instead of opening a new one.
- When the user wants a report, summarize the most important findings first, then cite the supporting outputs.

## Common patterns

### Responsive check
- Use `screenshot_responsive`.
- Compare layout shifts across desktop, tablet, and mobile.
- Call out breakpoints, clipping, and hierarchy issues.

### Site audit
- Read the matching workflow first for repeatable multi-page audits (performance, SEO, UX/accessibility, or responsive — see Available workflows above).
- If the user gives you a site URL but no page list, infer the public page set and proceed instead of asking permission to start.
- Use `browser_navigate`.
- Gather `browser_get_accessibility_tree`, `browser_perf_metrics`, `browser_seo_audit`, `browser_console_logs`, and `browser_network_errors`.
- Summarize the highest-impact issues first.

### Login or sign-up test
- Start with `auth_test_assist` for the site URL.
- Reuse the saved primary inbox and password unless you have a reason to force a fresh inbox.
- Read the helper's account-exists confidence, likely auth method, and expected follow-up before deciding whether to sign in or sign up first.
- Discover the login page if needed.
- Solve CAPTCHA only if it appears.
- Use `check_inbox` for verification steps.
- When reporting results, summarize reusable auth-system heuristics first, then cite the site-specific evidence that supported them.
- Record the outcome with `auth_test_assist` before finishing.

## Guardrails

- Never guess credentials.
- Close sessions when finished.
- Prefer accessibility and DOM inspection over visual guessing when structure matters.
- Use the CLI workflow if terminal access is clearly faster than repeated MCP round-trips.

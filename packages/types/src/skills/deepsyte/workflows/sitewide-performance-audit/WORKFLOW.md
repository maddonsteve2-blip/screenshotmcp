---
name: sitewide-performance-audit
description: >
  This workflow must be used when the user asks to "run a sitewide performance audit", "check why a site is slow", "find the slowest pages", "measure Core Web Vitals across key pages", asks for a site audit, or otherwise wants a repeatable multi-page public-site review.
---
# Sitewide Performance Audit
Read this workflow before opening browser sessions, running audit tools, or drafting findings for any repeatable multi-page public-site audit. If you start a generic live audit before reading this workflow, the audit is invalid and must be restarted from here.
Use this workflow for repeatable performance investigations across multiple pages. Infer a practical default scope when the user gives you enough to start, gather comparable evidence page by page, and summarize the highest-impact patterns before listing isolated issues.
Before tool use, explicitly state:
- that you read `workflows/sitewide-performance-audit/WORKFLOW.md`
- the page set you will audit
- whether authenticated pages are in scope
- whether you will use MCP or CLI first
## Inputs to confirm
- Confirm the base URL. If it is missing, ask for it before starting.
- If the user does not provide a page set, infer a representative public set such as homepage, pricing, docs, install, sign-in, and one heavier content page or public product surface.
- Default authenticated pages to out of scope unless the user explicitly asks for login, dashboard, account, or another protected flow.
- If authenticated scope is essential to the user's request and still ambiguous, ask one blocking clarification question before starting protected-page checks.
- Confirm whether terminal access exists. If it does and repeated page checks are likely, the CLI may be faster than repeated MCP round-trips.
- Confirm whether command approval is likely to interrupt progress. If approval would stall the run, prefer MCP first.
## Tool path selection
- Use MCP directly when terminal access is unavailable.
- Use the CLI when repeated page checks make it clearly faster and the command path is already available or can be approved up front.
- If the CLI path would block on approval and MCP is already available, begin with MCP instead of stalling.
- Use remote `browse:*` / browser session tools for public pages.
- Use the managed local browser only for localhost, VPN-only, or explicitly approval-gated environments.
## Evidence to capture for each page
- URL tested
- LCP
- FCP
- CLS
- TTFB
- DOM size and resource count when available
- The slowest requests or heaviest assets when they materially affect the page
- Console or network failures if they appear related
## Execution sequence
1. Define the page list before starting measurements.
2. If the user did not specify pages, infer the page list and proceed without waiting for permission.
3. Start with the most business-critical page so early findings are useful even if scope changes.
4. For each page, capture performance metrics first.
5. In MCP, open and measure pages sequentially. Do not fan out multiple new `browser_navigate` sessions at once for a public performance audit.
6. If a page looks slow, inspect the network waterfall or failed requests before moving on.
7. If an MCP transport call fails mid-run, reuse the sessions that succeeded and continue sequentially instead of restarting the audit.
8. Keep the evidence format consistent across pages so rankings are comparable.
9. Reuse an active session when that reduces overhead without changing the measurement goal.
10. Close active sessions when the audit is complete.
## Preferred tools
- MCP path: for each page, run `browser_navigate` → `browser_perf_metrics` → `browser_network_requests` / `browser_network_errors` as needed. Keep the MCP path sequential unless there is a proven reason to increase concurrency.
- CLI path for repeated checks: `deepsyte perf <url>` for quick page-level metrics, or `deepsyte browse <url>` followed by `browse:perf`, `browse:network-requests`, and `browse:network-errors` when deeper evidence is needed. If this path needs approval, ask once up front instead of switching mid-audit.
## Output shape
Always structure the result like this:
# Sitewide Performance Audit
## Executive summary
## Slowest pages
## Cross-site patterns
## Page-by-page evidence
## Recommended fixes
## Reporting rules
- Rank the worst pages first.
- Highlight cross-site patterns before one-off issues.
- Separate measured evidence from hypotheses.
- Keep recommendations concrete and tied to the captured evidence.
- If the audit was partial, say which pages were included and which were not.

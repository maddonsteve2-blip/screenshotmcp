---
name: sitewide-performance-audit
description: >
  This workflow must be used when the user asks to "run a sitewide performance audit", "check why a site is slow", "find the slowest pages", "measure Core Web Vitals across key pages", asks for a site audit, or otherwise wants a repeatable multi-page public-site review.
---

# Sitewide Performance Audit

Read this workflow before opening browser sessions, running audit tools, or drafting findings for any repeatable multi-page public-site audit. If you start a generic live audit before reading this workflow, the audit is invalid and must be restarted from here.

Use this workflow for repeatable performance investigations across multiple pages. Confirm scope first, gather comparable evidence page by page, and summarize the highest-impact patterns before listing isolated issues.

Before tool use, explicitly state:
- that you read `workflows/sitewide-performance-audit/WORKFLOW.md`
- the page set you will audit
- whether authenticated pages are in scope
- whether you will use MCP or CLI first

## Inputs to confirm

- Confirm the base URL.
- Confirm the page set. If the user does not provide one, ask permission to infer a representative set such as homepage, pricing, docs, dashboard entry, and a heavy content page.
- Confirm whether authenticated pages are in scope.
- Confirm whether terminal access exists. If it does and repeated page checks are likely, the CLI may be faster than repeated MCP round-trips.
- Confirm whether command approval is likely to interrupt progress. If approval would stall the run, prefer MCP first.

## Tool path selection

- Use MCP directly when terminal access is unavailable.
- Use the CLI when repeated page checks make it clearly faster and the command path is already available or can be approved up front.
- If the CLI path would block on approval and MCP is already available, begin with MCP instead of stalling.
- Use remote `browse:*` or browser session tools for public pages.
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
2. Start with the most business-critical page so early findings are useful even if scope changes.
3. For each page, capture performance metrics first.
4. In MCP, open and measure pages sequentially. Do not fan out multiple new `browser_navigate` sessions at once for a public performance audit.
5. If a page looks slow, inspect the network waterfall or failed requests before moving on.
6. If an MCP transport call fails mid-run, reuse the sessions that succeeded and continue sequentially instead of restarting the audit.
7. Keep the evidence format consistent across pages so rankings are comparable.
8. Reuse an active session when that reduces overhead without changing the measurement goal.
9. Close active sessions when the audit is complete.

## Preferred tools

- MCP path: for each page, run `browser_navigate` -> `browser_perf_metrics` -> `browser_network_requests` or `browser_network_errors` as needed. Keep the MCP path sequential unless there is a proven reason to increase concurrency.
- CLI path for repeated checks: `screenshotsmcp perf <url>` for quick page-level metrics, or `screenshotsmcp browse <url>` followed by `browse:perf`, `browse:network-requests`, and `browse:network-errors` when deeper evidence is needed. If this path needs approval, ask once up front instead of switching mid-audit.

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

---
name: seo-audit
description: >
  Use this workflow when the user asks to "run an SEO audit", "check my meta tags", "is my site SEO-friendly", "check structured data", "why am I not ranking", "check OG tags across pages", or otherwise wants a repeatable multi-page SEO review.
---
# SEO Audit
Read this workflow before opening browser sessions, running SEO tools, or drafting findings. If you start a generic SEO check before reading this workflow, the audit is invalid and must be restarted from here.
Use this workflow for repeatable SEO investigations across multiple pages. Infer a practical default scope when the user gives you enough to start, gather comparable evidence page by page, and summarize the highest-impact patterns before listing isolated issues.
Before tool use, explicitly state:
- that you read `workflows/seo-audit/WORKFLOW.md`
- the page set you will audit
- whether authenticated pages are in scope
- whether you will use MCP or CLI first
## Inputs to confirm
- Confirm the base URL. If it is missing, ask for it before starting.
- If the user does not provide a page set, infer a representative public set such as homepage, pricing, docs, blog, sign-in, and one product or feature page.
- Default authenticated pages to out of scope unless the user explicitly asks for dashboard, account, or another protected flow.
- If authenticated scope is essential to the user's request and still ambiguous, ask one blocking clarification question before starting protected-page checks.
- Confirm whether terminal access exists. If it does and repeated page checks are likely, the CLI may be faster than repeated MCP round-trips.
## Tool path selection
- Use MCP directly when terminal access is unavailable.
- Use the CLI when repeated page checks make it clearly faster and the command path is already available or can be approved up front.
- If the CLI path would block on approval and MCP is already available, begin with MCP instead of stalling.
## Evidence to capture for each page
- `browser_seo_audit` — title, meta description, OG tags, Twitter cards, heading hierarchy (H1–H6), robots directives, canonical URL, image alt text coverage
- `browser_get_html` (targeted selector) — JSON-LD structured data blocks, hreflang tags, canonical link element
- `browser_get_accessibility_tree` — heading order validation, image alt coverage, landmark regions
- `browser_perf_metrics` — Core Web Vitals (LCP, FCP, CLS, TTFB) since Google uses these as ranking signals
- `browser_network_errors` — broken resources (4xx/5xx) that hurt crawl budget
- `og_preview` — social card validation and mockup (run once for the homepage or primary landing page)
- `screenshot_responsive` — mobile-friendliness check (Google mobile-first indexing)
## Execution sequence
1. Define the page list before starting measurements.
2. If the user did not specify pages, infer the page list and proceed without waiting for permission.
3. Start with the homepage — it carries the most SEO weight and sets the baseline.
4. For each page, capture `browser_seo_audit` first, then supplement with `browser_get_html` for structured data and `browser_perf_metrics` for Core Web Vitals.
5. In MCP, open and measure pages sequentially. Do not fan out multiple new sessions at once.
6. Run `og_preview` once on the homepage or primary landing page to validate social sharing.
7. Run `screenshot_responsive` on 1–2 key pages to verify mobile-friendliness.
8. If a page has critical SEO issues (missing title, no H1, broken canonical), flag it immediately before moving on.
9. Keep the evidence format consistent across pages so comparison is easy.
10. Close active sessions when the audit is complete.
## Cross-page checks
After individual page evidence is gathered, check for:
- Duplicate titles or meta descriptions across pages
- Missing or inconsistent canonical URLs
- Orphan pages (no internal links pointing to them, if detectable from the page set)
- Inconsistent structured data schemas
- Pages missing OG images that other pages have
## Output shape
Always structure the result like this:
# SEO Audit
## Executive summary
## Critical issues (blocking indexing or ranking)
## Page-by-page evidence
## Structured data findings
## Social sharing (OG / Twitter cards)
## Core Web Vitals impact on ranking
## Recommended fixes (prioritized by SEO impact)
## Reporting rules
- Rank issues by SEO impact: indexing blockers first, then ranking signals, then best practices.
- Highlight cross-page patterns before one-off issues.
- Separate measured evidence from hypotheses.
- Keep recommendations concrete and tied to the captured evidence.
- If the audit was partial, say which pages were included and which were not.

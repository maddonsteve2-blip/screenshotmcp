---
name: responsive-audit
description: >
  Use this workflow when the user asks to "check responsive design", "does it work on mobile", "check breakpoints", "layout issues on tablet", "responsive audit", "test at different screen sizes", or otherwise wants a repeatable multi-page responsive design review.
---
# Responsive Audit
Read this workflow before opening browser sessions, capturing responsive screenshots, or drafting findings. If you start a generic responsive check before reading this workflow, the audit is invalid and must be restarted from here.
Use this workflow for repeatable responsive design investigations across multiple pages. Infer a practical default scope when the user gives you enough to start, gather comparable evidence page by page, and summarize the highest-impact patterns before listing isolated issues.
Before tool use, explicitly state:
- that you read `workflows/responsive-audit/WORKFLOW.md`
- the page set you will audit
- whether authenticated pages are in scope
- whether you will use MCP or CLI first
## Inputs to confirm
- Confirm the base URL. If it is missing, ask for it before starting.
- If the user does not provide a page set, infer a representative public set such as homepage, pricing, a content-heavy page, and a form or interactive page.
- Default authenticated pages to out of scope unless the user explicitly asks for dashboard, settings, or another protected flow.
- If authenticated scope is essential and still ambiguous, ask one blocking clarification question.
- Confirm whether terminal access exists.
## Tool path selection
- Use MCP directly when terminal access is unavailable.
- Use the CLI when repeated page checks make it clearly faster.
- If the CLI path would block on approval and MCP is already available, begin with MCP.
## Evidence to capture for each page
- `find_breakpoints` — scan viewport widths from 320px to 1920px and detect where significant layout changes occur (height jumps, content reflows)
- `screenshot_responsive` — capture desktop (1280×800), tablet (820×1180), and mobile (393×852) in one call for side-by-side comparison
- `screenshot_diff` — pixel-by-pixel diff between two viewport sizes to highlight exact layout changes (use selectively on pages with suspected issues)
- `browser_set_viewport` — resize mid-session to test specific breakpoints detected by `find_breakpoints`
- `browser_get_accessibility_tree` — check for content that disappears at smaller viewports, tap target sizes, text truncation
- `browser_screenshot` — capture specific breakpoint states for evidence
- `browser_evaluate` — check for horizontal overflow (`document.documentElement.scrollWidth > document.documentElement.clientWidth`), hidden content, and viewport meta tag
## Execution sequence
1. Define the page list before starting measurements.
2. If the user did not specify pages, infer the page list and proceed without waiting for permission.
3. Start with `find_breakpoints` on the homepage to understand the site's breakpoint architecture.
4. Run `screenshot_responsive` on every page in the set for baseline desktop/tablet/mobile captures.
5. In MCP, capture pages sequentially. Do not fan out multiple sessions at once.
6. For pages with suspected issues, open a browser session and use `browser_set_viewport` to test widths around detected breakpoints (±50px).
7. Use `screenshot_diff` selectively to compare desktop vs mobile on pages where layout problems are visible.
8. On each page, use `browser_evaluate` to check for horizontal overflow — this is the most common responsive bug.
9. If a page has critical layout issues (content clipped, horizontal scroll, unreadable text), flag it immediately.
10. Keep evidence format consistent across pages.
11. Close active sessions when the audit is complete.
## Common responsive issues to check
- Horizontal scrollbar at mobile widths (overflow)
- Text too small to read without zooming (below 16px on mobile)
- Tap targets too close together or smaller than 44×44px
- Images not scaling (fixed width causing overflow)
- Navigation menu not collapsing to mobile pattern
- Content hidden on mobile that should be accessible
- Tables overflowing their container
- Fixed-position elements covering content on small screens
## Output shape
Always structure the result like this:
# Responsive Audit
## Executive summary
## Detected breakpoints
## Critical layout issues
## Visual comparison (desktop → tablet → mobile)
## Page-by-page evidence
## Recommended fixes (prioritized by user impact)
## Reporting rules
- Rank issues by severity: broken layouts first (overflow, clipping), then usability (small targets, unreadable text), then polish (alignment, spacing).
- Include the viewport width where each issue appears.
- Highlight cross-page patterns before one-off issues.
- Separate measured evidence from hypotheses.
- Keep recommendations concrete and tied to the captured evidence.
- If the audit was partial, say which pages were included and which were not.

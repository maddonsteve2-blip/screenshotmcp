---
name: ux-accessibility-audit
description: >
  Use this workflow when the user asks to "run a UX audit", "check accessibility", "a11y review", "is my site accessible", "WCAG compliance check", "review my UX", or otherwise wants a repeatable multi-page UX and accessibility review.
---
# UX & Accessibility Audit
Read this workflow before opening browser sessions, running UX or accessibility tools, or drafting findings. If you start a generic UX check before reading this workflow, the audit is invalid and must be restarted from here.
Use this workflow for repeatable UX and accessibility investigations across multiple pages. Infer a practical default scope when the user gives you enough to start, gather comparable evidence page by page, and summarize the highest-impact patterns before listing isolated issues.
Before tool use, explicitly state:
- that you read `workflows/ux-accessibility-audit/WORKFLOW.md`
- the page set you will audit
- whether authenticated pages are in scope
- whether you will use MCP or CLI first
## Inputs to confirm
- Confirm the base URL. If it is missing, ask for it before starting.
- If the user does not provide a page set, infer a representative public set such as homepage, sign-up, pricing, a form-heavy page, and one content page.
- Default authenticated pages to out of scope unless the user explicitly asks for dashboard, settings, or another protected flow.
- If authenticated scope is essential and still ambiguous, ask one blocking clarification question.
- Confirm whether terminal access exists.
## Tool path selection
- Use MCP directly when terminal access is unavailable.
- Use the CLI when repeated page checks make it clearly faster.
- If the CLI path would block on approval and MCP is already available, begin with MCP.
## Evidence to capture for each page
- `ux_review` — AI-powered UX analysis covering accessibility, SEO, performance, navigation, content, and mobile-friendliness
- `browser_get_accessibility_tree` — full a11y tree: ARIA roles, form labels, heading structure, alt text, landmark regions, interactive element states
- `accessibility_snapshot` — quick standalone a11y snapshot (use for additional pages when a full session is not needed)
- `browser_evaluate` — targeted checks:
  - Color contrast: `getComputedStyle()` on text elements against backgrounds
  - Focus indicators: tab through interactive elements and check `:focus` styles
  - Keyboard traps: verify focus can leave modals and dropdowns
  - Touch targets: measure button/link dimensions for mobile (minimum 44×44px)
- `browser_console_logs` — accessibility-related warnings and errors from the browser
- `screenshot_responsive` — mobile usability check (layout, text size, tap targets)
- `browser_press_key` — Tab key navigation to verify focus order and visibility
## Execution sequence
1. Define the page list before starting measurements.
2. If the user did not specify pages, infer the page list and proceed without waiting for permission.
3. Start with the page most likely to have interactive elements (sign-up, pricing, or a form page) since accessibility issues are most visible there.
4. For each page, run `ux_review` first for the broad assessment, then `browser_get_accessibility_tree` for the detailed structure.
5. On form-heavy pages, use `browser_evaluate` and `browser_press_key` (Tab) to test keyboard navigation and focus management.
6. In MCP, audit pages sequentially. Do not fan out multiple sessions at once.
7. Run `screenshot_responsive` on 1–2 key pages to check mobile usability.
8. If a page has critical accessibility issues (missing form labels, keyboard traps, no heading structure), flag it immediately.
9. Keep evidence format consistent across pages.
10. Close active sessions when the audit is complete.
## Cross-page checks
After individual page evidence is gathered, check for:
- Consistent navigation and landmark structure across pages
- Heading hierarchy patterns (every page should have exactly one H1)
- Inconsistent focus management (some pages trap focus, others don't)
- Missing skip-to-content links
- Color contrast patterns that recur across the site
- Form labeling consistency
## Output shape
Always structure the result like this:
# UX & Accessibility Audit
## Executive summary
## WCAG compliance snapshot (estimated level: A, AA, or AAA)
## Critical accessibility issues (blocking for users with disabilities)
## Navigation & information architecture
## Form & interaction usability
## Keyboard navigation findings
## Mobile experience
## Page-by-page evidence
## Recommended fixes (prioritized by user impact)
## Reporting rules
- Rank issues by user impact: complete blockers first (keyboard traps, missing labels), then degraded experience (poor contrast, small targets), then best practices.
- Reference WCAG 2.1 success criteria where applicable (e.g. "Fails WCAG 2.1 SC 1.4.3 Contrast Minimum").
- Highlight cross-page patterns before one-off issues.
- Separate measured evidence from subjective UX opinions.
- Keep recommendations concrete and tied to the captured evidence.
- If the audit was partial, say which pages were included and which were not.

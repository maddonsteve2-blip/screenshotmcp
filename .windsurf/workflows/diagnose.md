---
description: Disciplined diagnosis loop for hard bugs and performance regressions. Reproduce → minimise → hypothesise → instrument → fix → regression-test. Use when user says "diagnose this" / "debug this", reports a bug, says something is broken/throwing/failing, or describes a performance regression.
---

A discipline for hard bugs. Skip phases only when explicitly justified.

For the full skill, read `~/.agents/skills/diagnose/SKILL.md`.

## Phase 1 — Build a feedback loop

**This is the skill.** If you have a fast, deterministic, agent-runnable pass/fail signal for the bug, you will find the cause. Spend disproportionate effort here.

Ways to construct one (try in order):
1. Failing test at whatever seam reaches the bug
2. Curl / HTTP script against a running dev server
3. CLI invocation with a fixture input
4. Headless browser script (Playwright/Puppeteer)
5. Replay a captured trace
6. Throwaway harness
7. Property / fuzz loop
8. Bisection harness
9. Differential loop
10. HITL bash script (last resort)

Do not proceed to Phase 2 until you have a loop you believe in.

## Phase 2 — Reproduce

Run the loop. Watch the bug appear. Confirm it matches the user's described failure mode.

## Phase 3 — Hypothesise

Generate **3-5 ranked hypotheses** before testing any. Each must be falsifiable:
> "If <X> is the cause, then <changing Y> will make the bug disappear."

Show the ranked list to the user before testing.

## Phase 4 — Instrument

Each probe maps to a specific prediction. Change one variable at a time. Tag every debug log with `[DEBUG-xxxx]` for easy cleanup.

## Phase 5 — Fix + regression test

1. Turn minimised repro into a failing test
2. Watch it fail
3. Apply the fix
4. Watch it pass
5. Re-run Phase 1 loop

## Phase 6 — Cleanup + post-mortem

- [ ] Original repro no longer reproduces
- [ ] Regression test passes
- [ ] All `[DEBUG-...]` instrumentation removed
- [ ] Throwaway prototypes deleted
- [ ] Correct hypothesis stated in commit message

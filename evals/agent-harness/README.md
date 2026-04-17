# Agent Harness Eval Kit

This eval kit captures and scores real ScreenshotsMCP agent tasks by saving run artifacts, applying deterministic rubric checks, and producing a JSON score summary for harness regressions.

## Layout

- `fixtures/rule-sets.json` contains reusable response checks.
- `tasks/*.json` defines task prompts, required artifacts, response checks, and tool expectations.
- `runs/` holds initialized and scored run artifacts.

## Typical flow

1. Initialize a run:
   - `node scripts/agent-eval.mjs init audit-public-start`
2. Paste the evaluated agent output into:
   - `first-response.md`
   - `tool-calls.json`
3. Score the run:
   - `node scripts/agent-eval.mjs score <run-dir>`
4. Review:
   - `score.json`
   - `manifest.json`

## Tool call format

`tool-calls.json` can be either:

```json
[]
```

or:

```json
{
  "calls": [
    { "toolName": "browser_navigate" },
    { "toolName": "browser_perf_metrics" }
  ]
}
```

Each entry may use `tool`, `toolName`, or `name`.

## Current task set

- `audit-public-start`
- `audit-auth-explicit`
- `auth-plan-signin`
- `responsive-capture`
- `seo-review`
- `debug-browser-session`

## Design goals

- Prefer deterministic checks over subjective grading.
- Keep measured evidence separate from evaluator notes.
- Standardize run artifacts before expanding automation.
- Catch harness regressions such as unnecessary audit blocking.

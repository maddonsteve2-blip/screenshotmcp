---
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

For the full skill, read `~/.agents/skills/to-issues/SKILL.md`.

## Process

### 1. Gather context
Work from conversation context. If user passes an issue reference, fetch it from the tracker.

### 2. Explore the codebase
Use domain glossary vocabulary. Respect ADRs.

### 3. Draft vertical slices
Each issue is a thin vertical slice cutting through ALL integration layers end-to-end (schema, API, UI, tests). NOT horizontal slices of one layer. Each slice is demoable or verifiable on its own.

Slices are either **HITL** (needs human interaction) or **AFK** (can be implemented and merged without human). Prefer AFK.

### 4. Quiz the user
Present breakdown showing: Title, Type (HITL/AFK), Blocked by, User stories covered. Iterate until approved.

### 5. Publish issues
For each approved slice, publish to the issue tracker with:
- Parent reference (if applicable)
- What to build (end-to-end behavior description)
- Acceptance criteria (checkboxes)
- Blocked by (references or "None")

Apply `needs-triage` label. Publish in dependency order.

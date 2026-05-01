---
description: Sets up an `## Agent skills` block in AGENTS.md/CLAUDE.md and `docs/agents/` so the engineering skills know this repo's issue tracker (GitHub or local markdown), triage label vocabulary, and domain doc layout. Run before first use of `to-issues`, `to-prd`, `triage`, `diagnose`, `tdd`, `improve-codebase-architecture`, or `zoom-out` — or if those skills appear to be missing context about the issue tracker, triage labels, or domain docs.
---

Scaffold the per-repo configuration that the engineering skills assume.

For the full skill with templates, read `~/.agents/skills/setup-matt-pocock-skills/SKILL.md` and supporting files in that directory.

## Process

### 1. Explore
- `git remote -v` — is this GitHub/GitLab?
- Check for existing `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/adr/`, `docs/agents/`, `.scratch/`

### 2. Present findings and ask (one section at a time)

**Section A — Issue tracker:** GitHub, GitLab, local markdown, or other?
**Section B — Triage label vocabulary:** Map the five canonical roles (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix)
**Section C — Domain docs:** Single-context or multi-context?

### 3. Confirm and edit
Show draft of `## Agent skills` block and `docs/agents/` files. Let user edit before writing.

### 4. Write
Edit whichever of `CLAUDE.md` / `AGENTS.md` already exists. Create `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md`.

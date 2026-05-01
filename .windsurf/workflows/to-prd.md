---
description: Turn the current conversation context into a PRD and publish it to the project issue tracker. Use when user wants to create a PRD from the current context.
---

Synthesize current conversation context and codebase understanding into a PRD. Do NOT interview the user — just synthesize what you already know.

For the full skill, read `~/.agents/skills/to-prd/SKILL.md`.

## Process

1. Explore the repo. Use domain glossary vocabulary. Respect ADRs.
2. Sketch major modules to build/modify. Look for deep modules (lots of functionality behind simple, testable interfaces). Confirm with user.
3. Write and publish the PRD with `needs-triage` label.

## PRD Template

- **Problem Statement** — From the user's perspective
- **Solution** — From the user's perspective
- **User Stories** — Extensive numbered list: "As an <actor>, I want <feature>, so that <benefit>"
- **Implementation Decisions** — Modules, interfaces, technical clarifications, schema changes, API contracts (no file paths or code snippets)
- **Testing Decisions** — What makes a good test, which modules to test, prior art
- **Out of Scope** — What's excluded
- **Further Notes** — Anything else

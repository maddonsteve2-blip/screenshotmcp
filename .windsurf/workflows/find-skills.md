---
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
---

Help discover and install skills from the open agent skills ecosystem.

Key commands:
- `npx skills find [query]` — Search for skills interactively or by keyword
- `npx skills add <package>` — Install a skill from GitHub or other sources
- `npx skills check` — Check for skill updates
- `npx skills update` — Update all installed skills

Browse skills at: https://skills.sh/

## Process

1. Understand the domain and specific task
2. Check the skills.sh leaderboard first
3. Search: `npx skills find [query]`
4. Verify quality (install count 1K+, source reputation, GitHub stars)
5. Present options with name, description, install count, install command
6. Install if approved: `npx skills add <owner/repo@skill> -g -y`

export function buildSkillTemplate(params: {
  name: string;
  displayName: string;
  description: string;
  author?: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const author = params.author?.trim() || "anonymous";
  return `---
name: ${params.name}
displayName: ${params.displayName}
description: >
  ${params.description}
version: 0.1.0
metadataVersion: "1"
license: MIT
author: ${author}
createdAt: ${today}
---

# ${params.displayName}

${params.description}

## When to use

Describe the task patterns this skill is meant for. Be specific — trigger
phrases, file types, user intents. Agents route based on this section.

- Trigger 1
- Trigger 2
- Trigger 3

## Instructions

Step-by-step guidance for the agent. Use concrete verbs and name the exact
tools to invoke. Progressive disclosure wins: state the happy path first,
then note common branches.

1. First step.
2. Second step.
3. Third step.

## Examples

Include 1–3 realistic examples that pair an input with the expected behavior.

### Example 1 — ...

\`\`\`
<input>
\`\`\`

Expected behavior: ...

## Don't

Bright lines the skill must not cross. Keep these short and testable.

- Don't do X.
- Don't do Y.
`;
}

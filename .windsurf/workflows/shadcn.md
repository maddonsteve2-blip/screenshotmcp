---
description: Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. Also triggers for "shadcn init", "create an app with --preset", or "switch to --preset".
---

A framework for building UI with shadcn/ui. Components are added as source code via the CLI.

For the full skill with critical rules and detailed references, read `~/.agents/skills/shadcn/SKILL.md` and the rules/references in that directory.

## Principles

1. Use existing components first — `npx shadcn@latest search` before custom UI
2. Compose, don't reinvent — Settings page = Tabs + Card + form controls
3. Use built-in variants before custom styles
4. Use semantic colors — `bg-primary`, never `bg-blue-500`

## Critical Rules (Summary)

- **Spacing**: `gap-*` not `space-y-*`
- **Equal dimensions**: `size-10` not `w-10 h-10`
- **Forms**: `FieldGroup` + `Field`, not raw `div`
- **Icons in Button**: use `data-icon`, no sizing classes
- **Overlays**: Always include Title (DialogTitle, SheetTitle, etc.)
- **Semantic colors**: No manual `dark:` overrides
- **Items in Groups**: SelectItem → SelectGroup, etc.

## Quick Reference

```bash
npx shadcn@latest init --preset base-nova        # Initialize
npx shadcn@latest add button card dialog          # Add components
npx shadcn@latest search @shadcn -q "sidebar"     # Search
npx shadcn@latest docs button dialog select       # Get docs URLs
npx shadcn@latest add button --dry-run             # Preview changes
npx shadcn@latest apply --preset a2r6bw            # Apply preset
```

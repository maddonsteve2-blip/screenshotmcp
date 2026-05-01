---
description: Find deepening opportunities in a codebase, informed by the domain language in CONTEXT.md and the decisions in docs/adr/. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more testable and AI-navigable.
---

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones.

For the full skill with language definitions and interface design guidance, read `~/.agents/skills/improve-codebase-architecture/SKILL.md` and supporting files in that directory.

## Key Vocabulary

- **Module** — anything with an interface and an implementation
- **Depth** — a lot of behaviour behind a small interface. Deep = high leverage. Shallow = interface nearly as complex as implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place
- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If it reappears across N callers, it was earning its keep.

## Process

### 1. Explore
Read CONTEXT.md and ADRs first. Then walk the codebase noting friction:
- Where does understanding one concept require bouncing between many small modules?
- Where are modules shallow?
- Where have pure functions been extracted just for testability, but real bugs hide in how they're called?
- Which parts are untested or hard to test?

### 2. Present candidates
Numbered list. For each: Files, Problem, Solution, Benefits (in terms of locality and leverage).
Do NOT propose interfaces yet. Ask: "Which of these would you like to explore?"

### 3. Grilling loop
Once the user picks a candidate, drop into a grilling conversation. Walk the design tree — constraints, dependencies, shape of the deepened module, what tests survive. Update CONTEXT.md and offer ADRs as decisions crystallize.

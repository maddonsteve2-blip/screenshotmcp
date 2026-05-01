---
description: Test-driven development with red-green-refactor loop. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, or asks for test-first development.
---

Test-driven development with vertical slices.

For the full skill with examples and reference materials, read `~/.agents/skills/tdd/SKILL.md` and supporting files in that directory.

## Philosophy

Tests verify behavior through public interfaces, not implementation details. Good tests are integration-style: they exercise real code paths through public APIs and survive refactors.

## Anti-Pattern: Horizontal Slices

DO NOT write all tests first, then all implementation. That produces crap tests.

```
WRONG:  RED: test1,test2,test3 → GREEN: impl1,impl2,impl3
RIGHT:  RED→GREEN: test1→impl1 → RED→GREEN: test2→impl2 → ...
```

## Workflow

### 1. Planning
- Confirm interface changes needed
- Confirm which behaviors to test (prioritize)
- Design interfaces for testability
- Get user approval

### 2. Tracer Bullet
Write ONE test → ONE implementation. Proves the path works end-to-end.

### 3. Incremental Loop
For each remaining behavior: RED (write test, fails) → GREEN (minimal code, passes)

### 4. Refactor
After all tests pass. Never refactor while RED.

## Checklist Per Cycle

- [ ] Test describes behavior, not implementation
- [ ] Test uses public interface only
- [ ] Test would survive internal refactor
- [ ] Code is minimal for this test
- [ ] No speculative features added

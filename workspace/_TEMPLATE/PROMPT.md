---
title: "[Goal Title]"
slug: "goal-slug"
priority: P3
status: pending
complexity: medium
created: "2026-01-01"
tags: [tag1, tag2]
max_turns:                   # Optional: override default (200). Set 500 for Playwright/complex tasks
output_path:
branch:
---

## Problem

[Describe what you want to build or change, and why it matters.]

**What success looks like:**
- [Criterion 1]
- [Criterion 2]
- [Criterion 3]

## Project Context

### Language/Stack

- **Language**: [TypeScript, Python, Rust, Go, etc.]
- **Framework**: [React, Next.js, Express, etc.]
- **Build system**: [npm, pip, cargo, etc.]

### Existing Project?

- [ ] **New project** - Building from scratch
- [ ] **Existing project** - Enhancing/modifying

If existing, describe the current state:
```
[Current structure and functionality]
```

## References & Inputs

### Requirements (Optional)

- **Technical specs**: `./requirements/requirements.md`

### Reference Code (Optional)

- **Examples**: `./references/`

## Definition of Done

**Build**:
- [ ] Project builds without errors
- [ ] No compiler/linter warnings

**Tests**:
- [ ] All tests pass
- [ ] New functionality has tests

**Functionality**:
- [ ] All requirements implemented
- [ ] Edge cases handled

**Code Quality**:
- [ ] Code is readable and follows conventions
- [ ] Git committed with clean status

## Approach

[Describe the technical approach, component structure, key libraries, etc.]

## Constraints

### What the Agent CAN Do

- Write/modify source code files
- Run build and test commands
- Create new files and directories
- Install dependencies
- Read reference documentation

### What the Agent CANNOT Do

- Push to remote repository
- Deploy to production
- Access external services without credentials
- Delete important files without confirmation

## Open Questions

- [Question 1 that needs clarification?]
- [Question 2?]

## Steps

<!-- Optional: Pre-define execution steps for complex goals -->
<!-- The agent auto-generates steps for tasks exceeding the complexity threshold -->

## Agent Notes

<!-- Accumulated by agent during execution -->

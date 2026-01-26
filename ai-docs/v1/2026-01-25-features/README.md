# 2026-01-25 Features & Fixes

Documentation for work done on January 25, 2026.

---

## Contents

### Parser Fixes (Completed ✅)
**File**: `parser-fixes.md`

Critical bugs fixed in work-selector.ts that prevented agent from finding work:
- Parser lost tasks at priority section boundaries (only 1 of 4 tasks parsed)
- Status "Not Started" incorrectly parsed as "in_progress"
- goals.md updated with correct status values
- Loop sleep interval increased to 10 minutes

**Status**: All fixes applied, tested, and agent restarted successfully.

---

### Incremental Execution Feature (Design Phase)
**File**: `incremental-execution-feature.md`

Complete feature specification for step-by-step task execution:
- **Quick Reference**: Configuration values and key decisions
- **Requirements**: 7 functional requirements with acceptance criteria
- **Design**: Architecture, types, and implementation details
- **Timeline**: Example 50-hour task execution across ~40 iterations
- **Implementation Plan**: 4-phase rollout (Foundation → Auto-Breakdown → Exit Code 1 → Progress)

**Key Parameters** (User Approved):
- MAX_TURNS = 250 (single-step tasks)
- MAX_TURNS_PER_STEP = 100 (multi-step tasks, minimum)
- Priority switching: ALWAYS (no threshold)
- Exit code 1: Auto re-breakdown (research + split)

**Status**: Design complete, ready for Phase 1 implementation.

---

### Other Documentation

- `human-interaction-via-needs-you.md` - needs-you.md interaction patterns
- `needs-you-interaction-diagram.md` - Visual workflow diagrams
- `prompt-log.md` - Session conversation log

---

## Quick Start

**For parser fixes**: Read `parser-fixes.md` for full triage analysis and resolution steps.

**For incremental execution**: Start with Quick Reference section in `incremental-execution-feature.md`, then read full spec.

---

## Related PRD Updates

- **PRD Section 1.4**: Incremental Execution Model added to `/ai-docs/v1/init/continuous-executive-agent-v1-prd.md`

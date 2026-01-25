# Multi-Task Support Implementation Plan

**Date**: 2026-01-25
**Priority**: P1 (User Requested)
**Status**: Design Phase

---

## Requirement

"Agent should be able to work on multiple tasks. For example, if one iteration completed 15% of a high priority task, and a critical priority task gets answered or unblocked, we should be able to pick up the critical one."

---

## Current Behavior

**Executive Loop Flow**:
1. Select Work (highest priority unblocked task)
2. Execute Work (spawn worker, BLOCK until completion)
3. Validate (run verifiers)
4. Update State (update goals.md, ledgers)
5. Sleep (10 minutes)
6. Repeat

**Limitations**:
- One task per iteration
- Worker execution is **synchronous** (blocks entire loop)
- If task A takes 1 hour, no priority re-evaluation happens during that hour
- Cannot switch to higher priority task B until task A completes

---

## Interpretation Scenarios

### Scenario 1: Time-Boxed Iterations
- Each iteration = fixed time limit (e.g., 15 minutes)
- Worker sessions limited to X turns per iteration
- Save worker state between iterations
- Resume from saved state in next iteration if same task selected

**Pros**: Natural priority switching every N minutes
**Cons**: Complex state persistence, worker session management

### Scenario 2: Background Workers
- Workers run asynchronously in background
- Executive loop checks for higher priority work every N minutes
- Pause/terminate lower priority worker if higher priority task appears
- Resume paused worker later

**Pros**: True concurrent work, immediate priority switching
**Cons**: Complex worker lifecycle, pause/resume logic, state management

### Scenario 3: Multi-Phase Tasks (Current Behavior Enhanced)
- Large tasks broken into phases (Phase 1, Phase 2, etc.)
- Each phase = separate work item in goals.md
- After Phase 1 completes (15% of overall work), re-evaluate priorities
- If P1 task unblocks, agent switches to it instead of starting Phase 2

**Pros**: Simple, works with current architecture
**Cons**: Requires manual task breakdown

---

## Recommended Approach

**Start with Scenario 3** (enhanced current behavior):

1. **Task Breakdown Skill**: Use existing `.claude/skills/task-breakdown/` to split large tasks into phases
2. **Phase Tracking**: Each phase is a separate entry in goals.md with dependencies
3. **Natural Priority Switching**: After each phase completes, work-selector picks highest priority available task

**Example**:
```markdown
## P2 - High Priority

### Self-Enhance Human Interface - Phase 1: Research
- **Status:** Complete
- **Description:** Research existing patterns, analyze gaps
- **Dependencies:** None

### Self-Enhance Human Interface - Phase 2: Design
- **Status:** Pending
- **Description:** Create architectural design document
- **Dependencies:** Phase 1

## P1 - Critical Priority

### Notion Integration POC
- **Status:** Pending  ← Will be selected BEFORE Phase 2
- **Description:** Proof of concept for Notion integration
```

**If more complex multi-tasking needed later**, implement Scenario 1 (time-boxed iterations) with:
- `MAX_TURNS_PER_ITERATION` config (e.g., 50 turns = ~15 minutes)
- Worker state persistence using Agent SDK session management
- Resume logic in worker-spawner.ts

---

## Implementation Steps (Scenario 3)

### Immediate (P0) - Already Done ✓
1. Fix parser bugs ✓
2. Update goals.md status values ✓
3. Update sleep interval to 10 minutes ✓

### Phase 1 (P1) - Task Breakdown Integration
1. Complete `.claude/skills/task-breakdown/` skill
2. Add task breakdown phase BEFORE executing large tasks
3. Update task-contractor.ts to detect multi-phase work
4. Automatically break down tasks estimated >100 turns into phases

### Phase 2 (P1) - Dependency Tracking
1. Add "Dependencies" field parsing in work-selector.ts
2. Skip tasks with unmet dependencies
3. Update goals.md format to support dependency chains

### Phase 3 (Optional) - Time-Boxed Iterations
Only if Scenario 3 insufficient:
1. Add MAX_TURNS_PER_ITERATION to .env
2. Modify worker-spawner.ts to support session pause/resume
3. Add worker state persistence to ledgers
4. Update executive loop to resume paused tasks

---

## Questions for User

1. **Clarification**: Does "one iteration completed 15%" mean:
   - A) One full task completion that was only 15% of a larger multi-phase project?
   - B) One worker session ran for 15% of estimated time before being interrupted?

2. **Urgency**: Is Scenario 3 (manual phase breakdown) acceptable initially, or is automatic time-boxing required immediately?

3. **Use Case**: What's a concrete example where mid-task switching is critical?

---

## Current State (After Fixes)

**Fixed Issues** ✓:
- Parser now finds all 4 tasks
- Status "Pending" parsed correctly (not "in_progress")
- Sleep interval set to 10 minutes
- goals.md updated with correct statuses

**Agent Ready to Work**:
- Next iteration will select "Notion Integration POC" (P1, pending)
- Will execute until completion or max retries
- Will re-evaluate priorities after completion

**Remaining Work**:
- Multi-task support implementation (pending user clarification)

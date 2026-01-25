# Feature: Incremental Execution with Priority Re-evaluation

**Created**: 2026-01-25
**Status**: Design Phase
**Priority**: P1 (User Critical)
**Related PRD**: Section 1.4 (Incremental Execution Model)

---

## Executive Summary

Transform the executive loop from "one task per iteration" to "one step per iteration" with automatic priority re-evaluation between steps. This enables the agent to:
- Work on large tasks spanning 50+ agent hours (100+ iterations)
- Switch to higher priority work when it becomes available
- Respond to human input within one iteration (10 minutes)
- Show incremental progress instead of "In Progress" for days

---

## Problem Statement

### Current Behavior

**One-shot execution**:
```
Iteration 1:
  Select Work → "Build SaaS Platform" (P2)
  Execute → Spawn worker with 250 turns
  Worker runs for 2 hours straight
  Validate → Mark complete or retry
  Sleep 10 minutes

Problem: During those 2 hours:
  - If P1 task unblocks, agent cannot switch to it
  - If human answers question in needs-you.md, agent doesn't see it
  - No progress updates (status stuck at "In Progress")
  - If worker fails at 90% complete, entire 2 hours wasted
```

**Impact on Multi-Day Tasks**:
- A 50-hour task would need to complete in ONE worker session
- No checkpoints, no priority switches, no human interaction
- High risk of failure without incremental validation

### Desired Behavior

**Step-by-step execution**:
```
Iteration 1:
  Select Work → "Build SaaS Platform - Step 1: Research"
  Execute → Worker runs for ~30 minutes (50 turns)
  Validate → Step 1 complete ✓
  Update → Mark Step 1 complete, Step 2 now available
  Sleep 10 minutes

Iteration 2:
  Check needs-you.md → Human answered auth question ✓
  Select Work → "Setup Notion API" (P1, just unblocked) ← SWITCH!
  Execute → Work on P1 task instead
  ...

Iteration 3:
  Select Work → Back to "Build SaaS Platform - Step 2: Schema Design"
  Continue where we left off
```

---

## User Requirement (Direct Quote)

> "Ideally we should have capability to have our execution agent to break down tasks, and build 1 step at a time. And each execution, when completed, we would 'look up' and see if my questions are answered, and if there are higher priority task to work on. The goal of the loop isn't to finish one task in one goal, some tasks might take 50 agent hours to finish."

---

## Functional Requirements

### FR1: Automatic Task Breakdown

**Requirement**: Large tasks (est. >2 hours) MUST be automatically broken into steps.

**Acceptance Criteria**:
- Task exceeding estimated complexity triggers breakdown phase
- Breakdown creates N steps with clear Definition of Done per step
- Steps written to goals.md or progress.md with dependencies
- Original task becomes parent with child steps

**Implementation Options**:
1. **Pre-execution breakdown**: Use task-breakdown skill before spawning worker
2. **Worker-generated breakdown**: Worker's first action is to create step plan
3. **Hybrid**: Research phase generates breakdown, executive stores it

### FR2: Step Tracking in goals.md

**Requirement**: Track step-level progress without cluttering goals.md.

**Acceptance Criteria**:
- Clear visual representation of parent task and child steps
- Work selector can identify next available step
- Status updates per step (pending, in_progress, complete)
- Dependencies between steps enforced

**Proposed Format**:
```markdown
## P1 - Critical Priority

### Build Multi-Tenant SaaS Platform
- **Status:** In Progress (Step 3 of 8)
- **Description:** Full-stack SaaS platform with tenant isolation
- **Progress:** 37% complete

#### Step 1: Research existing patterns
- **Status:** Complete
- **Duration:** 1 iteration (35 turns)
- **Output:** ai-docs/research/saas-patterns.md

#### Step 2: Design database schema
- **Status:** Complete
- **Duration:** 1 iteration (42 turns)
- **Output:** schema.sql, migration scripts

#### Step 3: Implement auth system
- **Status:** In Progress
- **Dependencies:** Step 2
- **Est. Duration:** 2-3 iterations

#### Step 4: Build tenant isolation
- **Status:** Pending
- **Dependencies:** Step 3
```

### FR3: Priority Re-evaluation Every Iteration

**Requirement**: Phase 3 (Select Work) MUST re-evaluate priorities EVERY iteration, not just when task completes.

**Acceptance Criteria**:
- Work selection runs at start of every iteration
- Checks for newly unblocked tasks (via needs-you.md responses)
- Checks for new high-priority tasks added to goals.md
- Selects highest priority available work (may differ from previous iteration)
- Can switch away from in-progress multi-step task if higher priority appears

**Algorithm**:
```typescript
function selectWork(): WorkItem | WorkStep | null {
  // 1. Parse goals.md (including step-level items)
  const allWork = parseGoalsWithSteps();

  // 2. Filter to available work
  const available = allWork.filter(item =>
    item.status === 'pending' &&       // Not complete or blocked
    item.dependencies.every(d => d.status === 'complete') // Dependencies met
  );

  // 3. Sort by priority (P1 > P2 > P3)
  const sorted = available.sort(byPriority);

  // 4. Return highest priority (may be different from last iteration)
  return sorted[0] || null;
}
```

### FR4: Iteration Duration Control

**Requirement**: Each iteration should complete in reasonable time (~10-60 minutes) to enable frequent priority checks.

**Acceptance Criteria**:
- Configurable MAX_TURNS_PER_ITERATION (default: 50-100 turns)
- Worker sessions limited to iteration budget
- If step incomplete after max turns, mark as "partial progress" and resume next time
- Sleep interval configurable (default: 10 minutes)

**Configuration**:
```bash
# .env
LOOP_SLEEP_SECONDS=600              # 10 minutes between iterations
MAX_TURNS_PER_ITERATION=100         # Limit per step execution
MAX_TURNS_TOTAL=250                 # Limit per worker session (for non-step tasks)
```

### FR5: Step Resumption

**Requirement**: If a step is partially complete, next iteration should resume from same point.

**Acceptance Criteria**:
- Worker state persisted between iterations for same step
- Retry context includes: partial work done, files modified, progress notes
- Worker receives "resume" context in prompt
- Step marked complete only when DoD fully met

### FR6: Progress Visibility

**Requirement**: Dashboard and progress.md show step-level progress, not just task-level.

**Acceptance Criteria**:
- progress.md shows current step, completed steps, pending steps
- Percentage complete calculated from steps (e.g., "3 of 8 steps = 37%")
- Last update timestamp per step
- Estimated time remaining (based on avg iteration duration)

---

## Non-Functional Requirements

### NFR1: Performance
- Step breakdown should complete in <1 minute
- Work selection with steps should complete in <1 second
- No significant overhead from step tracking

### NFR2: Backward Compatibility
- Simple tasks (no breakdown) still work as before
- Existing goals.md format remains valid
- Gradual migration: add step tracking without breaking existing tasks

### NFR3: Auditability
- All step transitions logged to work-ledger.jsonl
- Clear audit trail: when each step started, completed, by which worker
- Step-level validation reports

---

## Design

### Architecture Changes

#### 1. Enhanced Work Item Type

```typescript
// types.ts
export interface WorkItem {
  id: string;
  priority: 'P1' | 'P2' | 'P3';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  dependencies?: string[]; // Task IDs this depends on

  // NEW: Step tracking
  steps?: WorkStep[];
  current_step?: number;    // Index of current step (0-based)
  progress_pct?: number;    // Calculated from completed steps
}

export interface WorkStep {
  step_number: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  dependencies?: number[];  // Step numbers this depends on
  estimated_turns?: number;
  actual_turns?: number;
  output_path?: string;
  completed_at?: string;
}
```

#### 2. Enhanced Work Selector

```typescript
// work-selector.ts

export async function selectWork(): Promise<WorkItem | null> {
  const allWork = await parseGoalsWithSteps(); // NEW: Parse steps too

  // Flatten: each step is selectable work
  const allSelectableWork: SelectableWork[] = [];

  for (const task of allWork) {
    if (task.steps && task.steps.length > 0) {
      // Multi-step task: add available steps
      for (const step of task.steps) {
        if (step.status !== 'complete' && step.status !== 'blocked') {
          // Check dependencies
          const depsmet = step.dependencies?.every(depNum =>
            task.steps![depNum].status === 'complete'
          ) ?? true;

          if (depsmet) {
            allSelectableWork.push({
              type: 'step',
              task: task,
              step: step,
              priority: task.priority,
            });
          }
        }
      }
    } else {
      // Single-step task: add if available
      if (task.status !== 'complete' && task.status !== 'blocked') {
        allSelectableWork.push({
          type: 'task',
          task: task,
          priority: task.priority,
        });
      }
    }
  }

  // Sort by priority (P1 > P2 > P3)
  allSelectableWork.sort((a, b) => priorityValue(a.priority) - priorityValue(b.priority));

  // Return highest priority
  return allSelectableWork[0]?.task || null;
}
```

#### 3. Task Breakdown Integration

**Option A: Pre-execution breakdown** (simpler, recommended for MVP)
```typescript
// executive-loop.ts - Phase 4.5

async function maybeBreakdownTask(item: WorkItem): Promise<WorkItem> {
  // Check if task needs breakdown
  const estimatedTurns = estimateComplexity(item);
  const BREAKDOWN_THRESHOLD = 150; // ~1.5 hours at 1 turn/minute

  if (estimatedTurns > BREAKDOWN_THRESHOLD && !item.steps) {
    log('Task complexity exceeds threshold, triggering breakdown...');

    // Spawn research worker to create breakdown
    const breakdown = await spawnBreakdownWorker(item);

    // Update goals.md with steps
    await writeStepsToGoals(item, breakdown.steps);

    // Return updated item with steps
    item.steps = breakdown.steps;
    item.current_step = 0;
  }

  return item;
}
```

**Option B: Worker-generated breakdown** (more flexible)
- Worker's first action: analyze task, create step plan
- Return step plan to executive
- Executive updates goals.md with steps
- Next iteration: select Step 1 and execute

#### 4. Step Execution Logic

```typescript
// executive-loop.ts - Phase 5

async function executeWork(item: WorkItem): Promise<WorkerResult> {
  let goalToExecute: string;
  let maxTurns: number;

  if (item.steps && item.current_step !== undefined) {
    // Multi-step task: execute current step only
    const step = item.steps[item.current_step];
    goalToExecute = `${item.title} - ${step.title}\n\n${step.description}`;
    maxTurns = step.estimated_turns || MAX_TURNS_PER_ITERATION;

    log(`Executing step ${step.step_number + 1}/${item.steps.length}: ${step.title}`);
  } else {
    // Single-step task: execute as before
    goalToExecute = `${item.title}\n\n${item.description}`;
    maxTurns = contract.max_turns;
  }

  const result = await spawnWorker(goalToExecute, maxTurns, retryContext);
  return result;
}
```

#### 5. Step Completion Handling

```typescript
// executive-loop.ts - Phase 7

async function updateStateAfterStep(item: WorkItem, result: WorkerResult): Promise<void> {
  if (item.steps && item.current_step !== undefined) {
    const currentStep = item.steps[item.current_step];

    if (result.success) {
      // Mark step complete
      currentStep.status = 'complete';
      currentStep.completed_at = new Date().toISOString();
      currentStep.actual_turns = result.turns_used;
      currentStep.output_path = result.output_path;

      // Move to next step
      const nextStepIndex = item.current_step + 1;
      if (nextStepIndex < item.steps.length) {
        item.current_step = nextStepIndex;
        item.status = 'in_progress';
      } else {
        // All steps complete!
        item.status = 'complete';
        item.current_step = undefined;
      }

      // Update progress percentage
      const completedSteps = item.steps.filter(s => s.status === 'complete').length;
      item.progress_pct = Math.round((completedSteps / item.steps.length) * 100);

      // Write back to goals.md
      await updateGoalsWithStepProgress(item);

      log(`Step ${currentStep.step_number + 1} complete. Progress: ${item.progress_pct}%`);
    } else {
      // Step failed - handle retry
      currentStep.status = 'in_progress'; // Keep trying this step
      // Retry logic as before
    }
  } else {
    // Single-step task - handle as before
    if (result.success) {
      item.status = 'complete';
      await updateGoalsStatus(item);
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Foundation (P1) - Week 1

**Goal**: Enable step tracking in goals.md and work-selector.

**Tasks**:
1. Update WorkItem type with steps field
2. Enhance parseGoalsFile() to parse step subsections
3. Update work-selector to flatten steps into selectable work
4. Update goals.md format to support steps
5. Test with manually-created multi-step task

**Deliverables**:
- `src/types.ts` - Enhanced WorkItem interface
- `src/work-selector.ts` - Step-aware parsing and selection
- `workspace/goals.md` - Example multi-step task
- `tests/adhoc/step-tracking/` - Validation tests

**Success Criteria**:
- Parser correctly extracts steps from goals.md
- Work selector returns next available step
- Status updates work at step level

### Phase 2: Automatic Breakdown (P1) - Week 2

**Goal**: Automatically break down complex tasks into steps.

**Tasks**:
1. Add complexity estimation to task-contractor
2. Implement breakdown trigger (est. >150 turns)
3. Create breakdown worker (uses GPT to analyze task, create step plan)
4. Update goals.md with generated steps
5. Test with real complex task

**Deliverables**:
- `src/task-breakdown.ts` - Breakdown logic
- `src/task-contractor.ts` - Complexity threshold check
- Enhanced prompts for breakdown worker
- Integration in executive-loop Phase 4

**Success Criteria**:
- Complex task triggers breakdown automatically
- Generated steps are coherent and complete
- Steps written to goals.md correctly

### Phase 3: Progress Tracking (P2) - Week 3

**Goal**: Show step-level progress in progress.md and dashboard.

**Tasks**:
1. Update progress.md with step details
2. Calculate and display progress percentage
3. Update dashboard.html to show step progress
4. Add step-level logging to work-ledger.jsonl

**Deliverables**:
- Enhanced progress.md format
- Step progress visualization in dashboard
- Audit trail for step transitions

**Success Criteria**:
- progress.md shows current step and completion %
- Dashboard displays step-by-step progress
- Work ledger has step-level events

### Phase 4: Step Resumption (P2) - Week 4

**Goal**: Resume partial steps if interrupted or failed.

**Tasks**:
1. Persist step state between iterations
2. Build "resume" context for workers
3. Test interruption and resumption
4. Handle partial completion gracefully

**Deliverables**:
- Step state persistence mechanism
- Resume logic in worker-spawner
- Tests for interruption scenarios

**Success Criteria**:
- Step interrupted at 50% can resume
- No duplicate work when resuming
- Clear audit trail of resume events

---

## Configuration

### New Environment Variables

```bash
# .env

# Iteration control
LOOP_SLEEP_SECONDS=600              # 10 minutes between iterations
MAX_TURNS_PER_ITERATION=100         # Worker turns per step (default)
MAX_TURNS_TOTAL=250                 # Max for non-step tasks or large steps

# Breakdown control
BREAKDOWN_THRESHOLD_TURNS=150       # Trigger breakdown if est. > this
AUTO_BREAKDOWN_ENABLED=true         # Enable automatic task breakdown
```

### goals.md Format Enhancement

**Before** (current):
```markdown
### Build Next.js Transactional App
- **Status:** Pending
- **Description:** Develop a Next.js-based transactional application
```

**After** (with steps):
```markdown
### Build Next.js Transactional App
- **Status:** In Progress (Step 2 of 5, 40% complete)
- **Description:** Develop a Next.js-based transactional application
- **Breakdown:** Auto-generated on 2026-01-25 16:30

#### Step 1: Initialize Next.js project with TypeScript
- **Status:** Complete
- **Duration:** 1 iteration, 28 turns
- **Output:** /agent-outputs/.../nextjs-app
- **Completed:** 2026-01-25 16:45

#### Step 2: Implement user authentication
- **Status:** In Progress
- **Dependencies:** Step 1
- **Est. Turns:** 80-120

#### Step 3: Build transaction API endpoints
- **Status:** Pending
- **Dependencies:** Step 2

#### Step 4: Create transaction UI components
- **Status:** Pending
- **Dependencies:** Step 3

#### Step 5: End-to-end testing and deployment
- **Status:** Pending
- **Dependencies:** Step 1,2,3,4
```

---

## Migration Strategy

### Phase 1: Opt-in (Backward Compatible)

1. New tasks can use step format
2. Existing tasks continue working as before
3. Manual step creation supported
4. Auto-breakdown disabled by default

### Phase 2: Gradual Enablement

1. Enable auto-breakdown for new tasks only
2. Migrate existing in-progress tasks manually
3. Monitor step execution quality

### Phase 3: Full Adoption

1. Auto-breakdown enabled by default
2. All new complex tasks use steps
3. Simple tasks (<150 turns) remain single-step

---

## Success Metrics

### Immediate (Week 1)
- [ ] Work selector parses steps from goals.md
- [ ] Can manually create multi-step task
- [ ] Agent executes steps in order
- [ ] Priority re-evaluation works between steps

### Short-term (Month 1)
- [ ] Auto-breakdown triggers for complex tasks
- [ ] Agent successfully completes 1+ multi-step task (10+ steps)
- [ ] Priority switch happens mid-task when P1 unblocks
- [ ] Step-level progress visible in dashboard

### Long-term (Month 3)
- [ ] 90% of complex tasks broken into steps
- [ ] Average iteration duration <30 minutes
- [ ] Human responses addressed within 1 iteration (10 min)
- [ ] 50+ hour tasks completed successfully with incremental validation

---

## Risks & Mitigation

### Risk 1: Step Breakdown Quality
**Risk**: Auto-generated steps may be incoherent, incomplete, or poorly scoped.
**Mitigation**:
- Start with manual breakdown, learn patterns
- Use GPT-4 for breakdown (higher quality)
- Validate breakdown with user before executing
- Refine prompts based on failures

### Risk 2: Goals.md Bloat
**Risk**: Large tasks with 20+ steps make goals.md unreadable.
**Mitigation**:
- Collapse steps by default (show only current step)
- Move step details to separate file (e.g., `task-contracts/{task-id}-steps.md`)
- Link from goals.md to detailed breakdown

### Risk 3: Complexity Overhead
**Risk**: Step tracking adds complexity to work-selector, state management.
**Mitigation**:
- Keep simple tasks simple (no forced breakdown)
- Clear separation: single-step vs multi-step logic
- Comprehensive tests for both paths

### Risk 4: Priority Thrashing
**Risk**: Agent keeps switching between tasks, never completing anything.
**Mitigation**:
- "Stickiness" heuristic: prefer continuing current task unless priority delta > 1
- Example: If P2 task in progress, only switch if P1 task unblocks (not another P2)
- Configurable switching threshold

---

## Open Questions

1. **Step Granularity**: What's the ideal number of steps for a 50-hour task?
   - 5-10 large steps (each 5-10 hours)?
   - 20-50 small steps (each 1-2 hours)?
   - Dynamic based on task type?

2. **Breakdown Timing**: When should breakdown happen?
   - Before first execution (research phase)?
   - Lazily (just-in-time before each step)?
   - Upfront with user approval?

3. **Step Storage**: Where should steps live?
   - Inline in goals.md (readable but verbose)?
   - Separate file per task (clean but fragmented)?
   - Database/JSON (flexible but loses markdown simplicity)?

4. **Priority Switching**: How aggressive should switching be?
   - Always switch to higher priority (may thrash)?
   - Only switch if priority delta > 1 (P3→P1 yes, P2→P1 maybe)?
   - Require user confirmation for switches?

5. **Iteration Budget**: Should all steps use same MAX_TURNS_PER_ITERATION?
   - Fixed budget (e.g., 100 turns per step)?
   - Variable based on step complexity?
   - Worker decides when step is "complete enough"?

---

## Appendix: Example Execution Timeline

**Task**: Build Multi-Tenant SaaS Platform (est. 50 hours)

**Timeline**:
```
Jan 25, 16:00 - Iteration 1
  Select: "SaaS Platform - Step 1: Research"
  Execute: Worker researches existing patterns (45 turns, 30 min)
  Validate: Research doc created ✓
  Update: Step 1 complete, progress = 12.5% (1/8 steps)
  Sleep: 10 minutes

Jan 25, 16:40 - Iteration 2
  Check Inputs: Human approved API choice in needs-you.md ✓
  Select: "SaaS Platform - Step 2: Design Schema"
  Execute: Worker designs database schema (67 turns, 45 min)
  Validate: Schema valid, migrations created ✓
  Update: Step 2 complete, progress = 25% (2/8 steps)
  Sleep: 10 minutes

Jan 25, 17:35 - Iteration 3
  Check Inputs: No new responses
  Select: "Notion Integration POC" ← NEW P1 TASK UNBLOCKED!
  Execute: Worker sets up Notion API (82 turns, 1 hour)
  Validate: Notion connection works ✓
  Update: Notion task complete
  Sleep: 10 minutes

Jan 25, 18:45 - Iteration 4
  Check Inputs: No new responses
  Select: "SaaS Platform - Step 3: Auth System" ← RESUME ORIGINAL TASK
  Execute: Worker implements auth (105 turns, 1.5 hours)
  Validate: Auth tests pass ✓
  Update: Step 3 complete, progress = 37.5% (3/8 steps)
  Sleep: 10 minutes

... (50+ more iterations over 2-3 days)

Jan 27, 14:00 - Iteration 55
  Select: "SaaS Platform - Step 8: E2E Tests"
  Execute: Final tests and deployment (98 turns)
  Validate: All verifiers pass ✓
  Update: Step 8 complete, task COMPLETE, progress = 100%
  Archive: Move to completed.md with full audit trail
```

**Key Observations**:
- Task spans 55 iterations over 2+ days
- Priority switch at iteration 3 (Notion became P1)
- Resumed SaaS Platform at iteration 4
- Each step validated independently
- Incremental progress visible throughout
- Human can intervene at any iteration boundary

---

## Next Steps

1. **User Approval**: Confirm this design aligns with vision
2. **Phase 1 Implementation**: Build step tracking foundation
3. **Testing**: Create multi-step test scenario
4. **Phase 2 Implementation**: Add auto-breakdown
5. **Monitor**: Watch first real multi-step task execution
6. **Iterate**: Refine based on actual usage patterns

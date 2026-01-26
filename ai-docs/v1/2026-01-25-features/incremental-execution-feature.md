# Feature: Incremental Execution with Priority Re-evaluation

**Created**: 2026-01-25
**Status**: Design Phase
**Priority**: P1 (User Critical)
**Related PRD**: Section 1.4 (Incremental Execution Model)

---

## Quick Reference

### Configuration (User Approved)

```bash
# Turn budgets
MAX_TURNS=250                       # Single-step tasks (UNCHANGED)
MAX_TURNS_PER_STEP=100              # Multi-step tasks (MINIMUM 100)

# Iteration control
LOOP_SLEEP_SECONDS=600              # 10 minutes between iterations

# Breakdown control
BREAKDOWN_THRESHOLD_TURNS=100       # Trigger breakdown if est. > 100 turns
AUTO_BREAKDOWN_ENABLED=true         # Enable automatic task breakdown
```

### Key Decisions

| Parameter | Value | Rule |
|-----------|-------|------|
| **Step Budget** | 100-150 turns | Sufficient for meaningful work |
| **Single-Task Budget** | 250 turns | Keep high, proven to work |
| **Priority Switching** | ALWAYS | No threshold, immediate switch |
| **Step Storage** | goals.md inline | Refactor later if needed |
| **Exit Code 1** | Auto re-breakdown | Research + split into sub-steps |
| **Re-breakdown Limit** | 2 max | Prevent infinite loops |

### Step Sizing Guidelines

- **Small step**: 50-100 turns (~1 hour)
- **Medium step**: 100-150 turns (~1-2 hours)
- **Large step**: 150+ turns → Break down further
- **50-hour task** = ~30-50 steps (not 150)

### Critical Rules

✅ **DO**:
- Keep MAX_TURNS at 250 for single-step tasks
- Set MAX_TURNS_PER_STEP to at least 100
- Always switch to higher priority (no stickiness)
- Auto re-breakdown on exit code 1

❌ **DON'T**:
- Reduce MAX_TURNS below 250
- Reduce MAX_TURNS_PER_STEP below 100
- Add priority switching thresholds (keep simple)
- Allow >2 re-breakdowns per step

---

## Executive Summary

Transform the executive loop from "one task per iteration" to "one step per iteration" with automatic priority re-evaluation between steps.

**Key Parameters** (User Approved):
- **Step Budget**: 100-150 turns per step (sufficient to complete meaningful work)
- **MAX_TURNS**: 250 for single-step tasks (unchanged, proven to work)
- **MAX_TURNS_PER_STEP**: 100 minimum for multi-step tasks
- **Priority Switching**: ALWAYS switch to higher priority (no stickiness)
- **Step Storage**: Inline in goals.md (refactor later if needed)
- **Breakdown Timing**: Pre-execution (before first step)
- **Exit Code 1 Handling**: Auto-research and re-breakdown failed steps

**Enables**:
- Work on large tasks spanning 50+ agent hours (30-50 steps at 1-2 hours/step)
- Switch to higher priority work within 1-2 hours (next iteration)
- Respond to human input within 10 minutes to 2 hours
- Show incremental progress every 1-2 hours
- Validate and test after each meaningful increment
- Auto-recovery from complexity failures via re-breakdown

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

**Requirement**: Each **step** of multi-step tasks should have sufficient turns to complete meaningful work.

**Acceptance Criteria**:
- Multi-step tasks: MAX_TURNS_PER_STEP = 100-150 (sufficient budget per step)
- Single-step tasks: MAX_TURNS = 250 (KEEP HIGH - proven to work)
- Worker sessions limited by task type (step vs whole task)
- Each step must be evaluatable/testable independently
- If step incomplete after max turns, mark as "partial progress" and resume next time
- Sleep interval = 10 minutes between iterations

**Configuration**:
```bash
# .env
LOOP_SLEEP_SECONDS=600              # 10 minutes between iterations
MAX_TURNS=250                       # For single-step tasks (DON'T REDUCE!)
MAX_TURNS_PER_STEP=100              # For steps of multi-step tasks (minimum 100)
```

**Turn Budget Logic**:
```typescript
function getMaxTurns(item: WorkItem, step?: WorkStep): number {
  if (item.steps && item.steps.length > 0) {
    // Multi-step task: limit per step
    return step?.estimated_turns || MAX_TURNS_PER_STEP; // 100-150 turns
  } else {
    // Single-step task: full budget
    return MAX_TURNS; // 250 turns
  }
}
```

**Step Sizing Guidelines** (for multi-step tasks only):
- Small step: 50-100 turns (~1 hour) - e.g., "Implement API endpoint"
- Medium step: 100-150 turns (~1-2 hours) - e.g., "Build auth system"
- Large step: 150+ turns (>2 hours) - **should be broken down further**

**If step exceeds estimated turns**: Worker continues until step complete or max turns reached, then resumes in next iteration.

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

### FR7: Exit Code 1 Handling (Research & Re-breakdown)

**Requirement**: When worker exits with code 1 (failure), automatically trigger research and step re-breakdown.

**Acceptance Criteria**:
- Detect exit code 1 from worker process
- Classify failure type:
  - Scope too large → Break current step into smaller sub-steps
  - Unclear requirements → Research phase required
  - Technical blocker → Document in needs-you.md
- Automatic re-breakdown:
  - Spawn research worker to analyze failed step
  - Generate N smaller sub-steps (each 50-100 turns)
  - Update goals.md with refined breakdown
  - Retry with first sub-step in next iteration
- Log re-breakdown events to work-ledger.jsonl

**Exit Code 1 Response Flow**:
```typescript
async function handleWorkerFailure(result: WorkerResult, step: WorkStep): Promise<void> {
  if (result.exit_code === 1) {
    log(`Step failed with exit code 1: ${step.title}`);

    // Detect if step is too complex
    if (result.turns_used >= MAX_TURNS_PER_STEP * 0.8) {
      log('Step appears too complex, triggering re-breakdown...');

      // Spawn research worker to analyze and break down
      const breakdown = await researchAndBreakdown(step);

      // Replace current step with N sub-steps
      replaceStepWithSubSteps(item, step, breakdown.subSteps);

      log(`Step broken into ${breakdown.subSteps.length} sub-steps`);

      // Next iteration will pick up first sub-step
      return;
    }

    // Otherwise handle as normal retry
    handleRetry(item, step, result);
  }
}
```

**Research Worker Prompt** (for re-breakdown):
```
The following step failed after ${turns} turns:

Step: ${step.title}
Description: ${step.description}
Error: ${result.error}
Context: ${result.last_actions}

Your task:
1. Analyze why this step failed
2. Break it into 3-5 smaller sub-steps (each 50-100 turns)
3. Each sub-step must be:
   - Independently testable
   - Clear definition of done
   - Scoped to avoid same failure
4. Return breakdown as JSON

Output format:
{
  "analysis": "Why did this fail?",
  "sub_steps": [
    {
      "title": "Sub-step 1 title",
      "description": "What to do",
      "estimated_turns": 75,
      "validation": "How to verify success"
    },
    ...
  ]
}
```

**Re-breakdown Limits**:
- Maximum 2 re-breakdowns per step (prevent infinite recursion)
- If 2nd re-breakdown still fails → Mark as blocked, write to needs-you.md
- Log all re-breakdown attempts to audit trail

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
MAX_TURNS=250                       # KEEP HIGH - for single-step tasks (DON'T REDUCE)
MAX_TURNS_PER_STEP=100              # For individual steps of multi-step tasks (min 100)

# Breakdown control
BREAKDOWN_THRESHOLD_TURNS=100       # Trigger breakdown if est. > 100 turns
AUTO_BREAKDOWN_ENABLED=true         # Enable automatic task breakdown

# Step sizing
STEP_MIN_TURNS=100                  # Minimum turns per step (don't go below this)
STEP_TARGET_TURNS=100               # Target turns per step
STEP_MAX_TURNS=150                  # Maximum turns before suggesting further breakdown
```

**CRITICAL DISTINCTIONS**:
- **MAX_TURNS=250**: For tasks NOT broken into steps (simple tasks, keep high!)
- **MAX_TURNS_PER_STEP=100**: For individual steps of multi-step tasks (MINIMUM 100)
- Never reduce MAX_TURNS below 250 - proven to work
- Never reduce MAX_TURNS_PER_STEP below 100 - insufficient budget causes failures

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
- **Duration:** 1 iteration, 95 turns (1.5 hours)
- **Output:** /agent-outputs/.../nextjs-app
- **Completed:** 2026-01-25 18:15

#### Step 2: Implement user authentication (JWT + session)
- **Status:** In Progress
- **Dependencies:** Step 1
- **Est. Turns:** 100-120
- **Started:** 2026-01-25 18:35

#### Step 3: Build transaction API endpoints (CRUD)
- **Status:** Pending
- **Dependencies:** Step 2
- **Est. Turns:** 110-130

#### Step 4: Create transaction UI components (React)
- **Status:** Pending
- **Dependencies:** Step 3
- **Est. Turns:** 120-150

#### Step 5: End-to-end testing and deployment
- **Status:** Pending
- **Dependencies:** Step 1,2,3,4
- **Est. Turns:** 80-100
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

## Design Decisions (User Approved)

### 1. Step Granularity ✅
**Decision**: Each step should be **evaluatable/testable** with sufficient turn budget.

**Implications**:
- Step budget: **≥100 turns per step** (gives worker room to complete work)
- 50-hour task = ~30-50 steps (reasonable breakdown, not too granular)
- Frequent "look up" points (every ~1-2 hours)
- High responsiveness to priority changes
- MAX_TURNS_PER_STEP = 100-150 (configurable)

**Benefits**:
- Sufficient turns to complete meaningful work
- Testable, validatable increments
- Avoids premature failures from turn exhaustion
- Balance between granularity and practicality

### 2. Priority Switching ✅
**Decision**: **ALWAYS switch to higher priority** on next iteration (no stickiness).

**Rule**:
```
if (highestPriorityWork.priority > currentWork.priority) {
  switchTo(highestPriorityWork);
}
```

**Implications**:
- P1 unblocks while working on P2? Switch immediately (next iteration).
- P2 unblocks while working on P3? Switch immediately.
- No complex heuristics or thresholds.
- Simple, predictable behavior.

**Benefits**:
- Critical work always takes priority
- Human answers addressed within one iteration
- No "priority inversion" (low priority blocking high priority)

### 3. Step Storage ✅
**Decision**: Keep steps **inline in goals.md** for now. Refactor later if needed.

**Format**:
```markdown
### Parent Task
- **Status:** In Progress (Step 3 of 8, 37% complete)
- **Description:** ...

#### Step 1: Title
- **Status:** Complete
- **Output:** path

#### Step 2: Title
- **Status:** Complete

#### Step 3: Title
- **Status:** In Progress
```

**Benefits**:
- Single source of truth
- Easy to read and edit manually
- No file fragmentation
- Can optimize later if goals.md gets too large

### 4. Breakdown Timing
**Decision**: Break down **before first execution** (pre-execution, Option A).

**Why**: Simpler implementation, clearer planning phase, all steps visible upfront.

### 5. Iteration Budget
**Decision**:
- **MAX_TURNS_PER_STEP = 100-150** (for steps of multi-step tasks)
- **MAX_TURNS = 250** (for single-step tasks - UNCHANGED)

**Rationale**:
- Multi-step tasks: Give sufficient turns to complete meaningful work (100+ turns)
- Single-step tasks: Keep existing 250-turn limit (proven to work)
- 100 turns = ~1-2 hours of work per step (practical granularity)
- Never reduce below 100 - workers need room to complete steps properly

**⚠️ CRITICAL**:
- Do NOT reduce MAX_TURNS from 250 for single-step tasks
- Do NOT reduce MAX_TURNS_PER_STEP below 100 - insufficient budget causes failures
- Previous failures occurred when turn budget was too low

---

## Appendix: Example Execution Timeline

**Task**: Build Multi-Tenant SaaS Platform (est. 50 hours = ~40 steps at 1-2 hours each)

**Timeline** (showing first 6 iterations):
```
Jan 25, 16:00 - Iteration 1
  Select: "SaaS Platform - Step 1: Research & design auth system"
  Execute: Worker researches patterns, designs approach (95 turns, 1.5 hours)
  Validate: Design doc created, approach documented ✓
  Update: Step 1 complete, progress = 2.5% (1/40 steps)
  Sleep: 10 minutes

Jan 25, 17:40 - Iteration 2
  Check Inputs: Human approved auth approach in needs-you.md ✓
  Select: "SaaS Platform - Step 2: Implement user model & DB schema"
  Execute: Worker creates models, migrations, tests (110 turns, 2 hours)
  Validate: Schema valid, migrations run, tests pass ✓
  Update: Step 2 complete, progress = 5% (2/40 steps)
  Sleep: 10 minutes

Jan 25, 19:50 - Iteration 3
  Check Inputs: No new responses
  Select: "SaaS Platform - Step 3: Implement JWT auth endpoints"
  Execute: Worker builds login/logout/refresh (88 turns, 1.5 hours)
  Validate: Auth endpoints work, tokens valid ✓
  Update: Step 3 complete, progress = 7.5% (3/40 steps)
  Sleep: 10 minutes

Jan 25, 21:30 - Iteration 4
  Check Inputs: No new responses
  Select: "Notion Integration POC - Step 1: Setup & test API" ← NEW P1 TASK!
  Execute: Worker creates client, tests CRUD (105 turns, 1.75 hours)
  Validate: Notion connection works, CRUD tested ✓
  Update: Notion POC COMPLETE (1 step total)
  Sleep: 10 minutes

Jan 25, 23:15 - Iteration 5
  Check Inputs: No new responses
  Select: "SaaS Platform - Step 4: Build tenant isolation middleware" ← RESUME P2
  Execute: Worker implements multi-tenancy (120 turns, 2 hours)
  Result: EXIT CODE 1 - Scope too large ❌
  Action: Trigger re-breakdown research
  Sleep: 10 minutes

Jan 26, 01:25 - Iteration 6
  Check Inputs: Re-breakdown complete
  Select: "SaaS Platform - Step 4a: Create tenant context middleware" ← SUB-STEP
  Execute: Worker creates tenant context (65 turns, 1 hour)
  Validate: Middleware extracts tenant ID correctly ✓
  Update: Step 4a complete, Step 4 broken into 4a-4c
  Sleep: 10 minutes

Jan 26, 02:35 - Iteration 7
  Check Inputs: No new responses
  Select: "SaaS Platform - Step 4b: Add tenant scoping to queries" ← SUB-STEP
  Execute: Worker adds query scoping (78 turns, 1.3 hours)
  Validate: All queries properly scoped ✓
  Update: Step 4b complete, progress = 12.5% (5/40 steps)
  Sleep: 10 minutes

... (30+ more iterations over 2-3 days)

Jan 28, 14:00 - Iteration 40
  Select: "SaaS Platform - Step 40: Final E2E tests & deploy"
  Execute: Worker runs full test suite, deploys (92 turns, 1.5 hours)
  Validate: All verifiers pass ✓
  Update: Step 40 complete, task COMPLETE, progress = 100%
  Archive: Move to completed.md with full audit trail
```

**Key Observations**:
- Task spans ~40 iterations over 2-3 days (at 1-2 hours/step + 10 min sleep)
- **Priority switch at iteration 4**: Notion (P1) unblocked, SaaS (P2) paused
- **Resumed SaaS at iteration 5**: After Notion complete
- **Exit code 1 at iteration 5**: Step too complex, auto re-breakdown triggered
- **Sub-steps created**: Step 4 split into 4a, 4b, 4c (iterations 6-7)
- Each step 100+ turns: sufficient budget for meaningful work
- "Look up" points every 1-2 hours (practical frequency)
- Human can intervene within 1-2 hours of posting to needs-you.md
- Incremental progress: 2.5% → 5% → 7.5% (every 1-2 hours)
- 100-turn budget = less risk of premature failures

---

## Next Steps

1. **User Approval**: Confirm this design aligns with vision
2. **Phase 1 Implementation**: Build step tracking foundation
3. **Testing**: Create multi-step test scenario
4. **Phase 2 Implementation**: Add auto-breakdown
5. **Monitor**: Watch first real multi-step task execution
6. **Iterate**: Refine based on actual usage patterns

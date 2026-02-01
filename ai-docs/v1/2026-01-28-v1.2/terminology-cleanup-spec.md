# Terminology Cleanup: Goal / Step / Contract

**Status:** Specification (ready for implementation)
**Date:** 2026-02-01
**Scope:** Rename overloaded "Task" terminology + deprecate goals.md + goal packet model

---

## Problem Statement

The word "Task" is used to mean three completely different domain concepts:

1. **Goal** — a top-level work item from a PROMPT.md bundle
2. **Step** — a sub-unit within a multi-step goal (stored in TASKS.json)
3. **Contract** — a runtime execution agreement passed to a worker agent

This causes confusion for both humans and AI agents. Every downstream function calls goals "tasks", the file that stores steps is called "TASKS.json", and contract IDs use a `task-` prefix. Additionally, `task-contractor.ts` (379 lines) is dead code — never imported by any production module.

Second, `workspace/goals.md` is described in CLAUDE.md as an "auto-generated index" and as a "legacy fallback," but in practice **nothing in `src/` reads from it**. It is purely a write-only dashboard regenerated every loop iteration by `goals-index-generator.ts`. Meanwhile, several `.claude/skills/` and `.claude/agents/` files still reference it as if it were the source of truth, which misleads AI workers. The five workspace folders (`drafts/`, `ondeck/`, `in-progress/P{n}/`, `completed/`) are already the actual source of truth. `goals.md` should be deprecated and deleted.

Third, execution history (contracts, attempts, failures) is scattered across global ledgers, in-memory retry trackers, and per-step handoff files. Everything about a goal's execution should live in its own folder as a self-contained "goal packet."

---

## Design: Goal Packet Model

A **goal packet** is a self-contained directory that holds everything about a goal — its definition, steps, execution history, and contracts. Nothing about a specific goal should require reading a global file to understand.

### Goal Packet Directory Structure (After Cleanup)

```
workspace/in-progress/P3/recipe-card-explorer/
  PROMPT.md              # Goal definition (YAML frontmatter + markdown body)
  STEPS.json             # Machine-readable step definitions + status (source of truth for steps)
  PROGRESS_LOG.md        # Append-only human-readable timeline of ALL events
  CONTRACTS.jsonl        # NEW: append-only log of every execution attempt for this goal
  step-0-handoff.md      # Per-step completion context (existing, unchanged)
  step-1-handoff.md
```

### New File: CONTRACTS.jsonl

Each goal packet gets its own append-only JSONL file tracking every worker execution attempt. This replaces the need to grep through the global `work-ledger.jsonl` to find a goal's history.

**Schema (one JSON object per line):**
```jsonl
{"contract_id":"contract-1769685738333","step_id":"step-0","event":"STARTED","timestamp":"2026-01-29T05:44:52Z","strategy":"default","attempt":1}
{"contract_id":"contract-1769685738333","step_id":"step-0","event":"COMPLETED","timestamp":"2026-01-29T05:59:42Z","output_path":"/Users/.../agent-outputs/projects/nextjs/2026-01-29/1769685367609","worker_log":"ledgers/2026-01-29/worker-contract-1769685738333.log"}
{"contract_id":"contract-1769685800000","step_id":"step-1","event":"STARTED","timestamp":"2026-01-29T06:00:00Z","strategy":"default","attempt":1}
{"contract_id":"contract-1769685800000","step_id":"step-1","event":"FAILED","timestamp":"2026-01-29T06:15:00Z","error":"npm build failed","strategy_used":"default","attempt":1}
{"contract_id":"contract-1769685900000","step_id":"step-1","event":"STARTED","timestamp":"2026-01-29T06:16:00Z","strategy":"simplify_scope","attempt":2}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `contract_id` | string | The contract ID for this execution attempt |
| `step_id` | string or null | `"step-N"` if executing a step, `null` if executing whole goal |
| `event` | string | `STARTED`, `COMPLETED`, `FAILED`, `BLOCKED` |
| `timestamp` | ISO 8601 | When the event occurred |
| `strategy` | string | Strategy used for this attempt (from strategy-selector) |
| `attempt` | number | Attempt number (1-indexed) for this goal/step |
| `output_path` | string? | Set on COMPLETED — the worker's output directory |
| `worker_log` | string? | Set on COMPLETED/FAILED — relative path to worker log |
| `error` | string? | Set on FAILED — error summary |

**Writer:** `state-handler.ts` (or a new `contracts-log-writer.ts`) appends to this file alongside existing writes to `work-ledger.jsonl` and `PROGRESS_LOG.md`.

**Readers:** Retry logic can read this file to reconstruct attempt history on PM2 restart (currently lost because `retryTracker` is in-memory only). The prompt builder can read it to include retry context in worker prompts.

**Relationship to global ledgers:** Global `work-ledger.jsonl` continues to exist for cross-cutting queries (e.g., "how many goals completed this week?"). `CONTRACTS.jsonl` is a per-goal view of the same events. Both are append-only, both are written on the same code path. This is **dual-write, not migration** — global ledgers are still the source of truth for aggregate reporting.

### Retry Tracker Persistence

Currently, the in-memory `retryTracker` Map in `execution-handler.ts` is lost on PM2 restart. With `CONTRACTS.jsonl` in the goal packet, the retry count and strategy history can be reconstructed on startup by reading the file:

```typescript
// On work selection, before execution:
function loadRetryHistory(bundlePath: string): RetryContext {
  const contractsPath = path.join(bundlePath, 'CONTRACTS.jsonl');
  // Read CONTRACTS.jsonl, count FAILED events for current step,
  // extract strategies used, determine next attempt number
}
```

This is optional for the initial implementation but is the natural follow-up.

---

## Design: Deprecate goals.md

### Current State Audit

| Concern | Finding |
|---------|---------|
| **Readers in `src/`** | **Zero.** No production code reads from `goals.md`. |
| **Writers in `src/`** | **One.** `goals-index-generator.ts` called from `executive-loop.ts` Phase 1. |
| **Work selector fallback** | **None.** The legacy `goals.md` parsing fallback has been fully removed from `work-selector.ts`. |
| **Stale skill/agent docs** | **5 files** in `.claude/skills/` and `.claude/agents/` reference `goals.md` as source of truth. |
| **Stale compiled dist/** | Old V1.0/V1.1 JS files in `dist/` reference `goals.md`. Cleaned by `npm run build`. |

### What References goals.md (Stale Docs to Update)

| File | Line(s) | Current Reference | Action |
|------|---------|-------------------|--------|
| `.claude/skills/work-selection/SKILL.md` | 9, 22 | "Parse goals.md for all work items" | Rewrite to reference goal bundle folders |
| `.claude/skills/task-contract/SKILL.md` | 18 | `source_goal: "Title from goals.md"` | Rewrite to reference PROMPT.md frontmatter |
| `.claude/skills/practice-loop/SKILL.md` | 27 | "Scan goals.md for required skills" | Rewrite to reference goal bundle folders |
| `.claude/skills/executive-loop/SKILL.md` | 14, 36 | "Read goals.md and queue.md" | Rewrite to reference goal bundle folders |
| `.claude/agents/self-enhancer.md` | 40, 48, 89-94 | Lists goals.md as modifiable, branch tracking in goals.md | Rewrite to reference PROMPT.md frontmatter `branch:` field |
| `CLAUDE.md` | Multiple sections | Describes goals.md as "auto-generated index" and "legacy fallback" | Remove all references |

### Source of Truth: The Five Folders

After deprecation, the **only** source of truth for goal state is the workspace folder tree:

```
workspace/
├── drafts/              # New/unprocessed goal packets
├── ondeck/              # Queued for auto-promotion by priority
├── in-progress/         # Currently active goals
│   ├── P0/              # Critical priority
│   ├── P1/              # Urgent
│   ├── P2/              # High
│   ├── P3/              # Normal
│   └── P4/              # Low / self-improvement
└── completed/           # Successfully completed goals
```

Each folder contains goal packets. Each goal packet is a directory. The packet is self-describing — you never need to read a global file to understand or manage a goal.

---

## Canonical Terminology (After Cleanup)

| Concept | Definition | Persisted As | Type Name |
|---------|-----------|-------------|-----------|
| **Goal** | What the human wants done. Top-level work item. | `PROMPT.md` bundle in `workspace/` | `WorkItem` (unchanged) |
| **Step** | Sub-unit of a complex goal | `STEPS.json` in goal bundle dir | `WorkStep` (unified) |
| **Contract** | Scoped assignment for one worker execution attempt | Runtime only; traced via ID in ledgers | `WorkerContract` |

"Task" should not appear as a domain concept in the codebase after this cleanup (except for the Claude Code SDK `Task` tool, which is external and unchanged).

---

## Change Inventory

### Phase 1: Dead Code Removal

Delete `task-contractor.ts` and its broken test import. This is zero-risk — the function is never called in production.

| Action | File | Details |
|--------|------|---------|
| DELETE | `src/agentic/execution/task-contractor.ts` | 379 lines, entirely dead. `createTaskContract()` has zero production imports. |
| DELETE | `src/agentic/prompts/contracts/contract-creation-v1.0.0.md` | Prompt template for the dead contractor. References `task-[8_char_hex]` format. |
| FIX | `tests/adhoc/2026-01-25-incremental-execution/test-incremental-execution.ts:15` | Remove broken import: `import { createTaskContract } from '../../../src/task-contractor.js'` (path doesn't even resolve). |

### Phase 2: Type Renames (src/core/types.ts)

| Current | New | Line | Rationale |
|---------|-----|------|-----------|
| `TaskStep` | Remove entirely | L27-42 | Merge into `WorkStep`. Having two types for the same concept is the confusion. |
| `TasksFile` | `StepsFile` | L44-51 | Contents are steps, not tasks. Field `steps: TaskStep[]` becomes `steps: WorkStep[]`. |
| `TaskContract` | `WorkerContract` | L114-127 | Contracts are scoped to a worker execution, not a "task". |
| `TaskContract.goal` | `WorkerContract.prompt` | L116 | This field contains the prompt text string sent to the worker, not a Goal entity reference. |
| `LoopState.current_task` | `LoopState.current_contract` | L149 | This field stores a contract ID string, not a task/goal reference. |

**WorkStep / TaskStep unification detail:**

`WorkStep` (types.ts L53-64) and `TaskStep` (types.ts L27-42) are nearly identical. The only difference is `TaskStep` has optional `completed_at` and `completed_by_contract` fields. Merge by adding those optionals to `WorkStep`:

```typescript
// BEFORE: Two types
interface TaskStep {
  id: string; order: number; title: string; description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  dependencies: string[]; estimated_turns: number;
  completed_at?: string; completed_by_contract?: string;
}
interface WorkStep {
  id: string; order: number; title: string; description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  dependencies: string[]; estimated_turns: number;
}

// AFTER: One type
interface WorkStep {
  id: string; order: number; title: string; description: string;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  dependencies: string[]; estimated_turns: number;
  completed_at?: string; completed_by_contract?: string;
}
```

This eliminates `workStepsToTaskSteps()` and `taskStepsToWorkSteps()` entirely — no conversion needed when there's one type.

### Phase 3: File Renames

| Current | New | Rationale |
|---------|-----|-----------|
| `TASKS.json` (on disk in goal bundles) | `STEPS.json` | Contents are steps within a goal, not independent tasks. |
| `src/deterministic/tasks-json-handler.ts` | `src/deterministic/steps-json-handler.ts` | Manages steps, not tasks. |
| `src/agentic/work-selection/task-breakdown.ts` | `src/agentic/work-selection/goal-breakdown.ts` | Breaks down a goal into steps, not a task. |

**STEPS.json migration:** The handler must read both `STEPS.json` (new) and `TASKS.json` (legacy) to avoid breaking existing goal bundles. Read priority: `STEPS.json` first, fall back to `TASKS.json`. Only write `STEPS.json`. Existing bundles are migrated lazily on next write.

### Phase 4: Function Renames

#### state-handler.ts

| Current (line) | New | Operates On |
|----------------|-----|-------------|
| `updateTaskState()` (L85) | `updateGoalState()` | Goal — updates completion, ledger, Notion, project memory |
| `setTaskOutputPath()` (L268) | `setGoalOutputPath()` | Goal — persists output_path in PROMPT.md frontmatter |
| `markTaskBlocked()` (L574) | `markGoalBlocked()` | Goal — marks goal as blocked in PROMPT.md |

#### execution-handler.ts

| Current (line) | New | Operates On |
|----------------|-----|-------------|
| `inferCapabilitiesFromTask()` (L274) | `inferCapabilitiesFromGoal()` | Goal — infers capabilities from WorkItem |
| Inline `TaskContract` construction (L208-243) | Construct `WorkerContract` | Contract — the inline object literal |

#### tasks-json-handler.ts → steps-json-handler.ts

| Current (line) | New |
|----------------|-----|
| `readTasksJson()` (L24) | `readStepsJson()` |
| `writeTasksJson()` (L53) | `writeStepsJson()` |
| `tasksJsonExists()` (L85) | `stepsJsonExists()` |
| `updateStepStatus()` (L93) | `updateStepStatus()` (unchanged — already correct) |
| `workStepsToTaskSteps()` (L122) | DELETE (types unified, no conversion needed) |
| `taskStepsToWorkSteps()` (L140) | DELETE (types unified, no conversion needed) |
| `createTasksFile()` (L162) | `createStepsFile()` |
| `migrateFromPromptMd()` (L188) | `migrateFromPromptMd()` (unchanged) |

#### task-breakdown.ts → goal-breakdown.ts

| Current | New |
|---------|-----|
| `needsBreakdown(item: WorkItem)` | `needsBreakdown(item: WorkItem)` (unchanged — already correct) |
| `generateStaticBreakdown(item: WorkItem)` | `generateStaticBreakdown(item: WorkItem)` (unchanged) |
| `writeStepsToBundle(...)` | `writeStepsToBundle(...)` (unchanged) |

Only the filename changes; function names in this file are already reasonably named.

#### core-verifiers.ts

| Current (line) | New |
|----------------|-----|
| `type TaskType = 'standard' \| 'skill-build' \| 'self-enhance'` (L773) | `type GoalType` |

#### self-improvement-task-generator.ts

| Current (line) | New |
|----------------|-----|
| Local `interface Task` (L40) | `interface SelfImprovementGoal` |
| `generateSelfImprovementTask()` | `generateSelfImprovementGoal()` |

#### work-selector.ts — SelectableWork

| Current (line) | New | Rationale |
|----------------|-----|-----------|
| `SelectableWork.task` (L12) | `SelectableWork.goal` | This field always holds a WorkItem representing a goal. |
| `SelectableWork.type: 'task' \| 'step'` (L11) | `SelectableWork.type: 'goal' \| 'step'` | The discriminator `'task'` means "whole goal without step breakdown." |

All consumers of `selectedWork.task` must update to `selectedWork.goal`. All checks of `selectedWork.type === 'task'` must update to `=== 'goal'`.

### Phase 5: Contract ID Prefix

| Current | New | Location |
|---------|-----|----------|
| `task-${Date.now()}` | `contract-${Date.now()}` | `src/core/executive-loop.ts:283` |
| `task-${Date.now()}` | `contract-${Date.now()}` | `src/agentic/execution/execution-handler.ts:210` |
| `task-${Date.now()}` | `contract-${Date.now()}` | `src/deterministic/state-handler.ts:116` |
| `contract.id.replace('task-', '')` | `contract.id.replace('contract-', '')` | `src/agentic/execution/worker-spawner.ts:78,198,278` |

**Worker log filenames** will change from `worker-task-1769685738333.log` to `worker-contract-1769685738333.log`. This is cosmetic and append-only (old logs keep old names).

### Phase 6: Ledger Event Names

| Current | New | Used In |
|---------|-----|---------|
| `TASK_STARTED` | `GOAL_STARTED` | execution-handler.ts:369, notion-reporter.ts:166 |
| `TASK_COMPLETED` | `GOAL_COMPLETED` | state-handler.ts:102, notion-reporter.ts:169 |
| `TASK_BREAKDOWN` | `GOAL_BREAKDOWN` | task-breakdown.ts:358 |
| `TASK_FAILED` | `GOAL_FAILED` | notion-reporter.ts:172 (reference only — never emitted) |

`STEP_STARTED`, `STEP_COMPLETED`, `STEP_ATTEMPT_FAILED`, and `GOAL_PROMOTED` are already correctly named — no change.

**Backward compatibility:** Ledgers are append-only JSONL. Old entries will have `TASK_*` events. Any code that reads ledgers (e.g., `notion-reporter.ts`, adhoc scripts) must accept BOTH old and new event names. Add a normalization function:

```typescript
function normalizeLedgerEvent(event: string): string {
  const migrations: Record<string, string> = {
    'TASK_STARTED': 'GOAL_STARTED',
    'TASK_COMPLETED': 'GOAL_COMPLETED',
    'TASK_BREAKDOWN': 'GOAL_BREAKDOWN',
    'TASK_FAILED': 'GOAL_FAILED',
  };
  return migrations[event] ?? event;
}
```

### Phase 7: Ledger Field Names in JSONL Entries

| Current | New | Used In |
|---------|-----|---------|
| `task_id` | `goal_id` | state-handler.ts:104,338,375; execution-handler.ts:362,370 |
| `task_title` | `goal_title` | state-handler.ts:339,376; execution-handler.ts:363,371 |

Same backward-compat concern as events — reading code must handle both field names.

### Phase 8: Log Messages in executive-loop.ts

These are cosmetic but important for clarity when debugging:

| Line | Current | New |
|------|---------|-----|
| L160 | `Unblocked tasks:` | `Unblocked goals:` |
| L190 | `Ingested ${createdCount} task(s) from queue as draft bundles` | `Ingested ${createdCount} goal(s) from queue as draft bundles` |
| L209 | `Generate task bundle` | `Generate goal bundle` |
| L212 | `Self-improvement task added` | `Self-improvement goal added` |
| L216 | `Self-improvement task already exists or failed to add` | `Self-improvement goal already exists or failed to add` |
| L233 | `Selected TASK:` | `Selected GOAL:` |
| L237 | comment about `task needs to be broken into steps` | comment about `goal needs to be broken into steps` |
| L263 | `continuing as whole task` | `continuing as whole goal` |
| L266 | `executing as whole task` | `executing as whole goal` |
| L269 | `cannot write steps to bundle, executing as whole task` | `cannot write steps to bundle, executing as whole goal` |
| L314 | `task may not resume correctly` | `goal may not resume correctly` |

### Phase 9: CLAUDE.md and Documentation Updates

All documentation references to "task" that mean "goal" should be updated. Key sections:

- CLAUDE.md "Incremental Execution" section — "Complex tasks (>100 estimated turns)" → "Complex goals"
- CLAUDE.md "Retry & Strategy System" — "Tracks attempts per task" → "per goal"
- CLAUDE.md "Status Values in goals.md" — already uses correct terms
- CLAUDE.md "Step Status Values" — already correct
- CLAUDE.md "Debugging" section — various references
- All prompt templates in `src/agentic/prompts/` that reference "task" when meaning "goal"

### Phase 10: Prompt Template Updates

Prompt templates in `src/agentic/prompts/` reference "task" in instructions sent to workers. These should use "goal" when referring to the top-level work item:

| Directory | Files to Audit |
|-----------|---------------|
| `src/agentic/prompts/contracts/` | Delete `contract-creation-v1.0.0.md` (dead code support) |
| `src/agentic/prompts/execution/` | Update worker prompt templates |
| `src/agentic/prompts/retry/` | Update retry context templates |
| `src/agentic/prompts/diagnosis/` | Update failure analysis templates |
| `src/agentic/prompts/work-selection/` | Update selection templates |
| `src/agentic/prompts/README.md` | Update examples showing `CONTRACT_ID: 'task-abc123'` |

### Phase 11: Deprecate goals.md

Remove the auto-generated `goals.md` index file and its generator. Zero runtime risk — nothing reads from it.

| Action | File | Details |
|--------|------|---------|
| DELETE | `src/deterministic/goals-index-generator.ts` | The only writer of goals.md. ~130 lines. |
| REMOVE IMPORT + CALL | `src/core/executive-loop.ts:47,147-152` | Remove `import { regenerateGoalsIndex }` and the try/catch call in Phase 1. |
| DELETE | `workspace/goals.md` | The generated file itself. |
| UPDATE | `.claude/skills/work-selection/SKILL.md` | Replace "Parse goals.md" with "Scan goal bundle folders in workspace/". |
| UPDATE | `.claude/skills/task-contract/SKILL.md:18` | Replace `source_goal: "Title from goals.md"` with reference to PROMPT.md frontmatter. |
| UPDATE | `.claude/skills/practice-loop/SKILL.md:27` | Replace "Scan goals.md" with "Scan goal bundle folders". |
| UPDATE | `.claude/skills/executive-loop/SKILL.md:14,36` | Replace "Read goals.md" with "Scan workspace folders (drafts, ondeck, in-progress, completed)". |
| UPDATE | `.claude/agents/self-enhancer.md:40,48,89-94` | Remove goals.md from modifiable files list. Replace branch tracking instructions to reference PROMPT.md frontmatter `branch:` field. |
| UPDATE | `CLAUDE.md` | Remove all references to goals.md. Update "Workspace Files" section, "Goal Bundles" section, "File Structure Reference" tree. |

### Phase 12: Add CONTRACTS.jsonl to Goal Packets

Add per-goal execution tracking so each goal packet is fully self-contained.

#### New File: `src/deterministic/contracts-log-writer.ts`

A small module (~50 lines) that appends contract events to a goal packet's `CONTRACTS.jsonl`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

interface ContractEvent {
  contract_id: string;
  step_id: string | null;
  event: 'STARTED' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
  timestamp: string;
  strategy?: string;
  attempt?: number;
  output_path?: string;
  worker_log?: string;
  error?: string;
}

export async function appendContractEvent(
  bundlePath: string,
  event: ContractEvent
): Promise<void> {
  const contractsPath = path.join(bundlePath, 'CONTRACTS.jsonl');
  await fs.appendFile(contractsPath, JSON.stringify(event) + '\n');
}

export async function readContractHistory(
  bundlePath: string
): Promise<ContractEvent[]> {
  const contractsPath = path.join(bundlePath, 'CONTRACTS.jsonl');
  try {
    const content = await fs.readFile(contractsPath, 'utf-8');
    return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}
```

#### Integration Points

| Location | Change |
|----------|--------|
| `src/agentic/execution/execution-handler.ts` | After logging `GOAL_STARTED` / `STEP_STARTED` to `work-ledger.jsonl`, also call `appendContractEvent()` with the goal's `source_path`. |
| `src/deterministic/state-handler.ts` | In `updateGoalState()` and `updateStepState()`, after writing to `work-ledger.jsonl`, also call `appendContractEvent()` with COMPLETED/FAILED event. |
| `src/deterministic/state-handler.ts` | In `markGoalBlocked()` and `markStepBlocked()`, append a BLOCKED event. |

#### Dual-Write Strategy

Both `work-ledger.jsonl` (global) and `CONTRACTS.jsonl` (per-goal) are written on the same code path. This is intentional:

- **Global ledger** = aggregate queries ("how many goals this week?", Notion reporting)
- **Goal packet CONTRACTS.jsonl** = per-goal history ("what happened with this goal?", retry reconstruction)

Neither replaces the other. Both are append-only.

---

## Files Affected (Complete List)

### Deleted (Phase 1, 11)
- `src/agentic/execution/task-contractor.ts` (Phase 1)
- `src/agentic/prompts/contracts/contract-creation-v1.0.0.md` (Phase 1)
- `src/deterministic/goals-index-generator.ts` (Phase 11)
- `workspace/goals.md` (Phase 11)

### Created (Phase 12)
- `src/deterministic/contracts-log-writer.ts` — Per-goal CONTRACTS.jsonl writer/reader

### Renamed (Phase 3)
- `src/deterministic/tasks-json-handler.ts` → `steps-json-handler.ts`
- `src/agentic/work-selection/task-breakdown.ts` → `goal-breakdown.ts`
- `TASKS.json` → `STEPS.json` (on disk, with backward-compat read)

### Modified — Types (Phase 2)
- `src/core/types.ts` — Remove `TaskStep`, rename `TasksFile`→`StepsFile`, `TaskContract`→`WorkerContract`, `LoopState.current_task`→`current_contract`

### Modified — Source (Phases 4-8, 11-12)
- `src/core/executive-loop.ts` — Log messages, contract ID prefix, `current_task`→`current_contract`, remove `regenerateGoalsIndex` import+call (Phase 11)
- `src/agentic/execution/execution-handler.ts` — Contract construction, function rename, ledger events/fields, add `appendContractEvent()` calls (Phase 12)
- `src/agentic/execution/worker-spawner.ts` — Contract ID prefix strip, type references
- `src/agentic/work-selection/work-selector.ts` — `SelectableWork` type changes
- `src/agentic/work-selection/goal-scanner.ts` — `SelectableWork` field access, step type imports
- `src/agentic/work-selection/task-breakdown.ts` (before rename) — Ledger event, step type references
- `src/deterministic/state-handler.ts` — Function renames, ledger events/fields, step type references, add `appendContractEvent()` calls (Phase 12)
- `src/deterministic/tasks-json-handler.ts` (before rename) — Function renames, type references, filename constant, delete conversion functions
- `src/deterministic/progress-log-writer.ts` — Check for TaskStep references
- `src/deterministic/notion-reporter.ts` — Ledger event name mapping (backward compat)
- `src/deterministic/verifiers/core-verifiers.ts` — `TaskType`→`GoalType`
- `src/agentic/calibration/self-improvement-task-generator.ts` — Local `Task` interface → `SelfImprovementGoal`, function rename
- `src/agentic/intelligence/prompt-builder.ts` — `TaskContract`→`WorkerContract` parameter types

### Modified — Skills and Agents (Phase 11)
- `.claude/skills/work-selection/SKILL.md` — Replace goals.md references with goal bundle folders
- `.claude/skills/task-contract/SKILL.md` — Replace goals.md reference with PROMPT.md frontmatter
- `.claude/skills/practice-loop/SKILL.md` — Replace goals.md reference with goal bundle folders
- `.claude/skills/executive-loop/SKILL.md` — Replace goals.md references with workspace folder scanning
- `.claude/agents/self-enhancer.md` — Remove goals.md from modifiable files, update branch tracking to PROMPT.md

### Modified — Adhoc Scripts
- `tests/adhoc/2026-01-25-incremental-execution/test-incremental-execution.ts` — Remove broken import
- `tests/adhoc/backfill-notion-from-ledger.ts` — Add event normalization
- `tests/adhoc/create-january-summary.ts` — Add event normalization
- `tests/adhoc/fix-timeline-backfill.ts` — Add event normalization
- `scripts/migrate-steps-to-tasks-json.ts` — Rename to `migrate-steps-to-steps-json.ts`, update filename constant

### Modified — Documentation (Phases 9-11)
- `CLAUDE.md` — Extensive updates: glossary, terminology, remove all goals.md references, update workspace file structure
- `README.md` — Add glossary section
- `src/agentic/prompts/README.md`
- Prompt templates in `src/agentic/prompts/` subdirectories
- `ai-docs/` — Audit for "task" references meaning "goal"

---

## Phase 9 Deliverable: Glossary for CLAUDE.md and README.md

After all code changes are complete, add a **Glossary** section to both `CLAUDE.md` and `README.md` that formally defines the three domain concepts. This replaces ad-hoc usage and gives future contributors (human and AI) a single source of truth.

### Glossary Content (add to both files)

```markdown
## Glossary

Four domain concepts drive the agent's execution model. These terms are precise — do not use them interchangeably.

### Goal
A top-level unit of work that a human wants done. Represented as a **goal packet** — a self-contained directory in `workspace/` containing all related files. Goals move through a lifecycle: `drafts/` → `ondeck/` → `in-progress/P{n}/` → `completed/`. At runtime, goals are loaded as `WorkItem` objects.

- **Created by:** Humans (manually or via queue.md)
- **Persisted as:** Goal packet directory (see below)
- **Runtime type:** `WorkItem`
- **ID format:** `goal-{slug}`
- **Ledger events:** `GOAL_STARTED`, `GOAL_COMPLETED`, `GOAL_BREAKDOWN`, `GOAL_PROMOTED`

### Goal Packet
The directory structure that contains everything about a single goal. A goal packet is self-describing — you never need to read a global file to understand or manage a goal.

Contents:
- `PROMPT.md` — Goal definition (YAML frontmatter + markdown body)
- `STEPS.json` — Machine-readable step definitions + status (if multi-step)
- `PROGRESS_LOG.md` — Append-only human-readable timeline
- `CONTRACTS.jsonl` — Append-only log of every execution attempt
- `step-N-handoff.md` — Per-step completion context

### Step
A sub-unit of a complex goal. When a goal is estimated to require more than 100 turns, it is automatically broken into 2-4 steps. Steps are executed sequentially, each in its own worker session, all writing to the same output directory.

- **Created by:** `goal-breakdown.ts` (automatic) or manual definition in PROMPT.md
- **Persisted as:** `STEPS.json` in the goal packet
- **Runtime type:** `WorkStep`
- **ID format:** `step-{n}` (0-indexed)
- **Ledger events:** `STEP_STARTED`, `STEP_COMPLETED`, `STEP_ATTEMPT_FAILED`

### Contract
An execution agreement created for each worker session. Contains the prompt, scope, definition of done, and max turns. Used for tracing — the contract ID links ledger entries to worker log files. Contract events are recorded in the goal packet's `CONTRACTS.jsonl` and in the global `work-ledger.jsonl`.

- **Created by:** `execution-handler.ts` (inline, per execution attempt)
- **Persisted as:** Events in `CONTRACTS.jsonl` within the goal packet; traced by ID in global ledgers
- **Runtime type:** `WorkerContract`
- **ID format:** `contract-{timestamp}`
- **Log files:** `ledgers/{date}/worker-contract-{timestamp}.log`

### Source of Truth

The five workspace folders are the **sole source of truth** for goal state:

| Folder | Purpose |
|--------|---------|
| `workspace/drafts/` | New/unprocessed goal packets |
| `workspace/ondeck/` | Queued for auto-promotion by priority |
| `workspace/in-progress/P{0-4}/` | Active goals organized by priority |
| `workspace/completed/` | Successfully completed goals |

There is no global index file. To see all goals, scan the folder tree.
```

### Placement

- **CLAUDE.md:** Add as a new top-level section after "## Project Overview" and before "## Build & Run Commands". This ensures it's one of the first things any agent reads.
- **README.md:** Add as a section near the top, after the project description.

### Additional CLAUDE.md Updates

Beyond the glossary, update these existing sections to use the correct terminology:

| Section | Change |
|---------|--------|
| "Core Architecture" | Replace "task" with "goal" where referring to WorkItem. Keep "task" only when quoting external concepts (Claude Code `Task` tool). |
| "Incremental Execution" | "Complex tasks (>100 estimated turns)" → "Complex goals (>100 estimated turns)". "TASKS.json" → "STEPS.json" throughout. |
| "Executive Loop (8 Phases)" | Phase 4 "Create Task Contract" → "Create Worker Contract". Phase 3 description uses "task" → "goal". |
| "Retry & Strategy System" | "Tracks attempts per task" → "per goal". "After each failure" section — "task" → "goal". |
| "Key Modules" table | `task-contractor.ts` row → remove (dead code deleted). Rename `task-breakdown.ts` → `goal-breakdown.ts`, `tasks-json-handler.ts` → `steps-json-handler.ts`. |
| "Debugging" section | "Worker fails" → keep. "Task marked Blocked" → "Goal marked Blocked". References to TASKS.json → STEPS.json. |
| "File Structure Reference" | Update filenames in the tree to reflect renames. |
| "Human Interaction" section | "unblocks tasks" → "unblocks goals" |
| "Verifier System" | "Verifiers run after each task" → "after each goal execution" |
| "Environment Variables" | `MAX_TURNS` comment — "per worker session for single-step tasks" → "for single-step goals" |

---

## Backward Compatibility Checklist

| Concern | Mitigation |
|---------|-----------|
| Existing `TASKS.json` files in goal bundles | `readStepsJson()` reads `STEPS.json` first, falls back to `TASKS.json`. Only writes `STEPS.json`. Lazy migration. |
| Old ledger entries with `TASK_*` events | `normalizeLedgerEvent()` function maps old→new. All ledger readers use it. |
| Old ledger entries with `task_id`/`task_title` fields | Readers check for both `goal_id` and `task_id` (prefer new). |
| Old worker log filenames `worker-task-*.log` | No migration needed. Old files stay. New files use `worker-contract-*.log`. |
| `completed_by_contract` in TASKS.json → STEPS.json | Field name unchanged — it already correctly says "contract". |
| `goals.md` deletion | Nothing reads from it. Humans who used it as a dashboard can run `ls workspace/in-progress/P*/` or read individual PROMPT.md files. |
| External tools reading ledgers | Document the event name change in CLAUDE.md. |
| Goal bundles without `CONTRACTS.jsonl` | `readContractHistory()` returns empty array if file doesn't exist. No migration needed — old goals simply have no local contract history. |

---

## Implementation Order

Execute phases sequentially. Each phase should compile and the agent should remain functional.

1. **Phase 1** — Delete dead code (task-contractor.ts). Run `npm run typecheck`.
2. **Phase 2** — Type renames in types.ts. This will cause compile errors everywhere — fix all imports in the same commit.
3. **Phase 3** — File renames + STEPS.json backward-compat read. Update all imports.
4. **Phase 4** — Function renames across state-handler, execution-handler, etc.
5. **Phase 5** — Contract ID prefix change.
6. **Phase 6** — Ledger event names + normalization function.
7. **Phase 7** — Ledger field names.
8. **Phase 8** — Log message text updates.
9. **Phase 9** — CLAUDE.md and documentation (including glossary).
10. **Phase 10** — Prompt template updates.
11. **Phase 11** — Deprecate goals.md: delete generator, remove call from executive loop, delete the file, update all skill/agent docs that reference it.
12. **Phase 12** — Add CONTRACTS.jsonl: create `contracts-log-writer.ts`, integrate dual-write into execution-handler and state-handler.

Run `npm run typecheck && npm run build` after every phase. Commit each phase separately for clean git history.

**Ordering notes:**
- Phases 1-10 are the terminology cleanup. Each depends on the prior phase compiling.
- Phase 11 (goals.md deprecation) is independent of phases 1-10 and could technically be done in parallel, but sequencing it after keeps the PR history clean.
- Phase 12 (CONTRACTS.jsonl) depends on Phase 5 (contract ID prefix) and Phase 6 (event names) since it writes the new event/ID formats.

---

## Validation Criteria

### Terminology (Phases 1-10)
- `npm run typecheck` passes with zero errors
- `npm run build` succeeds
- `grep -r "TaskStep" src/` returns zero results (except SDK `Task` tool references)
- `grep -r "TasksFile" src/` returns zero results
- `grep -r "TaskContract" src/` returns zero results
- `grep -r "current_task" src/` returns zero results
- `grep -r "task-contractor" src/` returns zero results
- `grep -r "TASKS.json" src/` returns zero results (only `STEPS.json` and backward-compat `TASKS.json` fallback read)
- `grep -r "TASK_STARTED\|TASK_COMPLETED\|TASK_BREAKDOWN" src/` returns zero results in event emitters (may exist in normalization/compat code)
- Existing goal bundles with `TASKS.json` files are still readable (backward compat)
- Agent can start, select a goal, break it down, execute, validate, and update state
- Ledger entries written after the change use new event names and field names
- Old ledger entries are still parseable by Notion reporter and adhoc scripts

### goals.md Deprecation (Phase 11)
- `grep -r "goals.md" src/` returns zero results
- `grep -r "goals-index-generator" src/` returns zero results
- `workspace/goals.md` does not exist
- `grep -r "goals.md" .claude/` returns zero results (skills/agents updated)
- Agent starts and selects work without goals.md present
- `ls workspace/in-progress/P*/` shows goal packets (human-readable alternative to goals.md)

### Goal Packet Completeness (Phase 12)
- After executing a goal, its bundle directory contains `CONTRACTS.jsonl` with at least one entry
- `CONTRACTS.jsonl` entries have `contract_id`, `step_id`, `event`, `timestamp` fields
- Global `work-ledger.jsonl` still receives entries (dual-write confirmed)
- `readContractHistory()` returns empty array for bundles without `CONTRACTS.jsonl` (no crash)
- A goal packet directory is fully self-describing: `PROMPT.md` + `STEPS.json` + `PROGRESS_LOG.md` + `CONTRACTS.jsonl` + `step-N-handoff.md` files

# Continuous Executive Agent V1.1 - Product Requirements Document

**Version:** 1.1
**Date:** 2026-01-25
**Status:** Implemented
**Author:** Claude (with Jack Zhao Jin)

---

## Executive Summary

### Vision

Flip the human-agent paradigm: instead of humans prompting AI, the agent **finds work** and comes to the human when it needs decisions, insights, or actions.

### What We Built

A continuously-running autonomous agent that:
1. **Finds work proactively** from `goals.md` without waiting for prompts
2. **Spawns workers via Claude Agent SDK** with intelligent prompting
3. **Validates work through verifiers** and updates capability confidence
4. **Communicates asynchronously** via `needs-you.md` when blocked

### Two-Repository Architecture

| Repository | Purpose |
|------------|---------|
| `continuous-agent/` | Agent infrastructure: executive loop, verifiers, capabilities, workspace files |
| `agent-outputs/` | Worker outputs: isolated projects with their own git history |

Workers NEVER write to the agent codebase. Constitution Article I, Section 6 enforces this separation.

---

## System Architecture

### Executive Loop (8 Phases)

The executive loop runs continuously in PM2 via `src/executive-loop.ts`:

1. **Health Check** - Validate GitHub auth, disk space, dependencies
2. **Check Inputs** - Process human responses from `needs-you.md`
3. **Select Work** - Priority-based selection (P1 > P2 > P3) with step awareness
4. **Create Task Contract** - Define scope, risk level, Definition of Done
5. **Execute** - Spawn Agent SDK worker with intelligent prompting
6. **Validate** - Run verifiers on worker's output directory
7. **Update State** - Update goals.md, needs-you.md, ledgers
8. **Continue or Sleep** - Immediately continue if work exists; sleep only when idle

### Worker Delegation

The executive spawns workers via `@anthropic-ai/claude-agent-sdk`. Workers:
- Get isolated project directories in `agent-outputs/`
- Receive prompts built by `prompt-builder.ts` with Constitution, retry context, strategies
- Have access to Claude Code skills via the 'Skill' tool
- Copy `.env` from agent repo for API key access

### Incremental Execution (Multi-Step Tasks)

Complex tasks (>100 estimated turns) are automatically broken into steps:

- **Automatic Breakdown:** `task-breakdown.ts` generates 2-4 steps when complexity exceeds threshold
- **Step Execution:** Each step runs independently with max 100 turns
- **Progress Tracking:** Steps tracked in `goals.md` with status (pending/in-progress/complete/blocked)
- **Shared Output:** All steps write to the SAME project directory
- **Resume Support:** `output_path` persists across PM2 restarts for task continuity

---

## Intelligence Layer

### Intent Classification

`intelligence/intent-classifier.ts` classifies tasks:
- **outcome_only** - High-level goal, research phase mandatory
- **what_only** - Defined deliverable, research recommended
- **what_and_how** - Specific implementation instructions provided

### Strategy Selection

`intelligence/strategy-selector.ts` ensures each retry tries something different:
- Simplify scope
- Research first
- Break into subtasks
- Use different tools

### Prompt Building

`intelligence/prompt-builder.ts` constructs context-rich prompts including:
- Constitution constraints
- Retry history and previous errors
- Selected strategy for this attempt
- Task contract with Definition of Done

---

## Verification & Learning

### Verifier System

Verifiers run after each task in the **worker's output directory** (NOT agent infrastructure):

| Verifier | Purpose |
|----------|---------|
| `git_status_clean` | No uncommitted changes |
| `node_build` | TypeScript compiles, tests pass |
| `docs_checklist` | README/CLAUDE.md present |
| `reference_integrity` | Reference registry valid |

Each verifier returns structured evidence:
```typescript
{
  verifier_id: 'git-clean',
  result: 'PASS' | 'FAIL',
  message: 'No uncommitted changes',
  evidence: { /* structured data */ }
}
```

### Capability Confidence

`learning/capability-updater.ts` updates capability confidence based on verifier results:
- **PASS**: +10 confidence
- **FAIL**: -15 confidence

Capabilities are tracked in YAML registries:
- `capabilities/technical-capabilities.yml` - Tool operations (git, npm)
- `capabilities/delivery-capabilities.yml` - End-to-end outcomes (nextjs app)
- `capabilities/functional-capabilities.yml` - Cross-cutting abilities (debugging)

---

## Human Interaction

### needs-you.md Interface

When the agent blocks after 10 retries, it writes to `workspace/needs-you.md`:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| Get API token | 401 Unauthorized... | | BLOCKING | 2026-01-25 |
```

Human responds by adding to the Response column:

```markdown
| Response |
|----------|
| [APPROVED] Token: sk_xyz |
```

**Response tags:**
- `[APPROVED]` - Grant permission with details
- `[DECISION]` - Provide direction
- `[INFO]` - Supply information
- `[SKIP]` - Cancel task

The agent detects responses in Phase 2, unblocks tasks, resets retry counters.

---

## Constitution (Hard Limits)

**Location:** `workspace/constitution.md` (human-only modification)

8 immutable boundaries:

1. No spending beyond $20/month per service
2. No permanent deletions (archive/soft-delete only)
3. No external publishing without approval
4. No credential exposure
5. No access control expansion
6. No output in agent codebase (all output to agent-outputs/)
7. All activity must be logged
8. 10 retries minimum before BLOCKED

---

## Workspace Files

### Markdown (Human-Editable)

| File | Purpose |
|------|---------|
| `constitution.md` | Immutable hard limits |
| `goals.md` | P1/P2/P3 work items with steps |
| `needs-you.md` | Human-agent interaction |
| `queue.md`, `progress.md`, `completed.md` | State tracking |

### Ledgers (Append-Only JSONL)

| File | Purpose |
|------|---------|
| `work-ledger.jsonl` | Task events with `contract_id` |
| `capability-ledger.jsonl` | Capability attempts and results |
| `executive-{date}.log` | Daily execution logs |
| `{date}/worker-{contract_id}.log` | Worker execution logs |

Ledgers are version-controlled for full audit traceability.

---

## Configuration

### Environment Variables

```bash
# Required: ONE of these for Claude Agent SDK
CLAUDE_CODE_OAUTH_TOKEN=    # Option 1: OAuth (Claude Pro/Max)
ANTHROPIC_API_KEY=          # Option 2: API key

# Optional
MODEL=claude-sonnet-4-5-20250929
MAX_TURNS=250               # Max turns per single-step task
MAX_TURNS_PER_STEP=100      # Max turns per step (MINIMUM 100)

# Loop timing
IDLE_SLEEP_SECONDS=30       # Sleep when no work available
UNHEALTHY_SLEEP_SECONDS=60  # Sleep when system unhealthy

# Incremental execution
BREAKDOWN_THRESHOLD_TURNS=100
AUTO_BREAKDOWN_ENABLED=true
```

### PM2 Deployment

```bash
pm2 start ecosystem.config.cjs
pm2 logs executive-loop
pm2 monit
```

---

## Key Modules

| Module | Purpose |
|--------|---------|
| `executive-loop.ts` | Main 8-phase loop |
| `work-selector.ts` | Parse goals.md, return highest priority task |
| `task-breakdown.ts` | Automatic breakdown of complex tasks |
| `task-contractor.ts` | Create task contracts with DoD |
| `worker-spawner.ts` | Spawn Agent SDK workers, copy .env |
| `input-processor.ts` | Parse needs-you.md responses |
| `health-checker.ts` | Validate system health |
| `intelligence/` | Intent classification, strategy selection, prompt building |
| `verifiers/` | Deterministic validation |
| `learning/` | Capability confidence updates |

---

## Design Principles (Core)

1. **Don't wait, work on it** - Execute on best hypothesis
2. **Decide, don't ask** - Make implementation choices, explain after
3. **Research is mandatory** - For underspecified goals
4. **Retries must change strategy** - Same approach twice = wasted retry
5. **Blockers don't block everything** - Pivot to other productive work
6. **Contract-first execution** - No work without valid task contract
7. **Skills must be proven** - Confidence comes from verifier PASS
8. **Validator is separate from Executor** - Honest assessment
9. **Full autonomy with Constitutional limits** - Agent modifies anything except constitution.md

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Loop uptime | >99% (PM2 managed) |
| Tasks completed per day | Varies by complexity |
| Blocking time (needs human) | <4 hours average response |
| Capability confidence accuracy | Evidence-based updates |

---

## File Structure

```
continuous-agent/
├── src/
│   ├── executive-loop.ts
│   ├── work-selector.ts
│   ├── task-breakdown.ts
│   ├── task-contractor.ts
│   ├── worker-spawner.ts
│   ├── input-processor.ts
│   ├── health-checker.ts
│   ├── intelligence/
│   ├── verifiers/
│   ├── learning/
│   └── types.ts
├── workspace/
│   ├── constitution.md
│   ├── goals.md
│   ├── needs-you.md
│   └── ...
├── ledgers/
│   ├── work-ledger.jsonl
│   ├── capability-ledger.jsonl
│   └── executive-{date}.log
├── capabilities/
│   ├── technical-capabilities.yml
│   ├── delivery-capabilities.yml
│   └── functional-capabilities.yml
├── .claude/skills/
└── ai-docs/
```

---

**End of PRD**

*This document reflects the implemented v1.1 architecture with prompting-based Agent SDK workers, step-aware execution, and project directory persistence.*

# Continuous Executive Agent V1.2 - Product Requirements Document

**Version:** 1.2
**Date:** 2026-01-28
**Status:** Draft
**Author:** Claude (with Jack Zhao Jin)

---

## TLDR: Feature Overview

### V1.0 → V1.1 → V1.2 Evolution

| Version | Theme | Key Capabilities |
|---------|-------|------------------|
| **V1.0** | Foundation | Executive loop, task contracts, worker spawning, constitution |
| **V1.1** | Execution | Multi-step tasks, step resumption, self-enhancement, project persistence |
| **V1.2** | Learning & Visibility | Goal maturation, multi-project access, Notion reporting, project memory |

### V1.2 Features at a Glance

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| **Goal State Machine** | Folder-based pipeline: drafts → ondeck → in-progress → blocked → archive | Goals mature before execution; no more wasted retries on half-baked ideas |
| **Goal Bundles** | Each goal is a folder with PROMPT.md + references/assets | Space for specs to breathe; complex goals get proper scaffolding |
| **Notion Reporting** | Dashboard of milestones, highlights, daily/weekly summaries | Rich visibility into agent activity without parsing logs |
| **Multi-Project Access** | Copy-in → isolated work → approval → copy-back | Agent can enhance existing projects safely |
| **Project Memory** | Capability confidence anchored to actual built projects with lessons | Agent references real outputs and past lessons, not abstract percentages |

### What V1.2 Explicitly Does NOT Include

- **Knowledge Absorption / RAG** — Extracting patterns from prompt logs, harnesses, and external knowledge sources is deferred to V1.3. The infrastructure (project memory, archived goals) built in V1.2 creates the foundation for this.
- **Cloud Ledger Storage** — Deferred to V1.3. Local ledgers work fine; Notion provides visibility.
- **Multi-agent orchestration** — Single executive loop, single worker at a time. Parallelism is V2.0.

---

## Version History Summary

### V1.0: The Foundation

**Core innovation:** Flip the human-agent paradigm — agent finds work, human responds asynchronously.

**What was built:**
- **Executive Loop** — 8-phase continuous cycle via PM2
- **Two-Repository Architecture** — `continuous-agent/` for infrastructure, `ai-sandbox/` for worker outputs
- **Task Contract System** — Scope, risk, Definition of Done before execution
- **Constitution** — 8 immutable hard limits
- **Workspace Files** — Markdown-based state: goals.md, needs-you.md
- **Verifier System** — Deterministic post-task validation
- **Capability Tracking** — YAML registries with confidence scores

---

### V1.1: Execution Maturity

**Core innovation:** Multi-step task execution with intelligent resumption.

**What was built:**
- **Incremental Execution** — Complex tasks auto-broken into steps (100+ turns each)
- **Step Resumption** — Resume mid-task after PM2 restart or priority switch
- **Project Directory Persistence** — `output_path` tracked in goals.md
- **Self-Enhancement Workflow** — Dedicated subagent modifies agent codebase on branches
- **Prompt Management System** — Versioned markdown prompts with `{{VARIABLE}}` rendering (`src/agentic/prompts/`)
- **Self-Improvement Triggers** — Practice loop, retrospective, reference refresh when idle
- **needs-you.md Async Interaction** — Full agent blocks → human responds → agent resumes loop

---

## V1.2: Learning & Visibility

### Vision

V1.2 transforms the agent from a task executor into a **learning system with rich visibility**. Goals mature through a structured pipeline instead of landing raw in a flat file. The agent works on your existing projects safely. Notion provides a window into agent activity. Past work informs future execution through project memory.

### Current System Snapshot (What V1.2 Builds On)

Before specifying V1.2 features, here is where the V1.1 system stands:

**Work selection** (`src/agentic/work-selection/work-selector.ts`): Parses `workspace/goals.md` as flat markdown. Extracts `### Title` headings under `## P0-P4` sections. Parses `- **Status:**`, `- **Output:**`, `- **Branch:**` metadata and `#### Step N:` sub-headings. Returns highest-priority non-blocked, non-complete item.

**Worker spawning** (`src/agentic/execution/worker-spawner.ts`): Calls `query()` from `@anthropic-ai/claude-agent-sdk`. Generates project paths as `ai-sandbox/projects/{category}/{date}/{slug}`. Copies `.env` and `.gitignore` template. Streams responses and logs to `ledgers/{date}/worker-{id}.log`.

**State management** (`src/deterministic/state-handler.ts`): Updates goals.md via regex-based find-and-replace on `### Title` patterns. Writes to needs-you.md action table. Appends JSONL to work-ledger and capability-ledger.

**Validation** (`src/deterministic/validation-handler.ts`): Runs YAML-defined verifiers against `result.output_path`. Step-aware (lighter validation for research steps).

**Intelligence layer**: Intent classifier (outcome_only vs what_and_how), strategy selector (rotates strategies across retries), prompt builder (composes versioned markdown prompts with variables).

**Self-improvement** (`src/agentic/calibration/`): Triggers practice, retrospective, and reference-refresh tasks when idle. Injects `[SELF-ENHANCE]` tasks into goals.md.

---

## Feature 1: Goal State Machine + Bundles

### Problem

In V1.1, `workspace/goals.md` is a flat file where everything is "ready to execute." A one-line idea (`### Build a dashboard`) and a thoroughly-specified task (`### Build Next.js Transactional App` with 4 steps and full description) receive identical treatment. Half-baked goals burn retries while the agent figures out what was meant.

The flat-file approach also creates scalability issues: goals.md grows unbounded, completed tasks clutter the active workspace, and there's no natural place for supporting materials (specs, mockups, research).

### Solution

Replace the flat `workspace/goals.md` with a folder-based state machine where each goal is a **bundle** — a directory containing `PROMPT.md` and optional supporting files.

### Directory Structure

```
workspace/
├── goals.md               # RETAINED (read-only index, auto-generated)
├── constitution.md         # Unchanged (IMMUTABLE)
├── needs-you.md            # Unchanged
│
├── drafts/                 # Ideas incubating — agent MAY research, MUST NOT execute
│   └── {goal-slug}/
│       ├── PROMPT.md       # Required: execution instructions
│       ├── references/     # Optional: research, links, prior art
│       └── assets/         # Optional: diagrams, mockups, screenshots
│
├── ondeck/                 # Validated and ready — auto-promoted when priority is set in PROMPT.md
│   └── {goal-slug}/
│       └── PROMPT.md
│
├── in-progress/            # Active work — agent executes highest priority first
│   ├── P0/
│   │   └── {goal-slug}/
│   │       └── PROMPT.md
│   ├── P1/
│   │   └── {goal-slug}/
│   ├── P2/
│   │   └── {goal-slug}/
│   ├── P3/
│   │   └── {goal-slug}/
│   └── P4/
│       └── {goal-slug}/
│
├── blocked/                # Hard-blocked on human input (10 retries exhausted)
│   └── {goal-slug}/
│       └── PROMPT.md       # PROMPT.md updated with block reason + needs-you.md ref
│
└── archive/                # Completed or abandoned
    └── 2026-01/            # Grouped by month
        └── {goal-slug}/
            └── PROMPT.md   # PROMPT.md updated with outcome, output_path, lessons
```

**goals.md is retained as an auto-generated read-only index.** The work selector regenerates it from the folder tree on each iteration. This preserves backward compatibility for human readability while the folders become the source of truth. Humans can still glance at goals.md to see the state, but edits happen by moving folders and editing PROMPT.md files.

### PROMPT.md Format

```markdown
---
title: Build Next.js Transactional App
slug: build-nextjs-transactional-app
priority: P2                        # P0-P4 — determines execution order and in-progress placement
status: pending
complexity: complex
created: 2026-01-25
tags: [nextjs, typescript, full-stack]
output_path:                        # Set by agent when work begins
branch:                             # Set by agent for [SELF-ENHANCE] tasks
---

## Problem
What problem does this goal solve? Why does it matter?

## Definition of Done
- [ ] Functional Next.js app with transaction handling
- [ ] All code compiles and tests pass
- [ ] Changes committed to git with clean status

## Approach
How should the agent tackle this? Key decisions, constraints, technology choices.

## Open Questions
- What authentication method? (for drafts — resolved before moving to ondeck)

## Steps
<!-- Auto-generated by task-breakdown.ts when complexity > threshold -->

## Agent Notes
<!-- Accumulated by agent during execution — research findings, decisions made -->
```

The `priority` field (P0-P4) is critical: it determines which `in-progress/P{n}/` subdirectory the goal lands in, and controls execution order. Goals in `ondeck/` or `drafts/` use this field for auto-promotion (see "Ondeck Auto-Promotion" below).

The YAML frontmatter provides structured metadata for the work selector. The markdown body provides rich context for the worker prompt. This mirrors the SKILL.md pattern used by Claude Code skills.

### Goal Bundle Template

A `_TEMPLATE/` directory at `workspace/_TEMPLATE/` provides the canonical goal bundle structure:

```
workspace/_TEMPLATE/
├── PROMPT.md              # Full PROMPT.md with all frontmatter fields
├── references/            # Place example code, patterns, API docs
│   └── README.md
└── requirements/          # Detailed technical requirements
    └── requirements.md
```

To create a new goal, copy `_TEMPLATE/` to the appropriate state folder and customize. The goal scanner ignores directories starting with `_`.

### State Transitions

```
                    human moves folder
    ┌──────────┐   (or agent suggests)   ┌──────────┐
    │  DRAFTS  │ ────────────────────── ► │  ONDECK  │
    └──────────┘                          └──────────┘
         │                                      │
         │ agent researches,                    │ human sets priority in
         │ adds to references/,                 │ PROMPT.md frontmatter
         │ suggests "ready" in                  │ → agent auto-promotes
         │ needs-you.md                         ▼
         │                              ┌─────────────┐
         │                              │ IN-PROGRESS  │
         │                              │  P0-P4    │◄─── human responds
         │                              └─────────────┘     (from blocked)
         │                                      │
         │                            agent executes │
         │                                      │
         │                          ┌───────────┴───────────┐
         │                          │                       │
         │                          ▼                       ▼
         │                   ┌──────────┐           ┌──────────┐
         │                   │ BLOCKED  │           │ ARCHIVE  │
         │                   │          │           │ /2026-01 │
         │                   └──────────┘           └──────────┘
         │                          │                     ▲
         │                  10 retries                    │
         │                  exhausted              DoD met │
         └────────────────────────────────────────────────┘
                        (drafts can also be archived if abandoned)
```

### Agent Behavior Rules by State

| State | Agent Can | Agent Cannot |
|-------|-----------|--------------|
| **drafts** | Read PROMPT.md, research topic, add findings to `references/`, suggest "ready" via needs-you.md | Execute (spawn worker), move folder to ondeck |
| **ondeck** | Read PROMPT.md, estimate complexity, suggest priority via needs-you.md, **auto-promote to in-progress/P{n}/ when priority is set in frontmatter** | Execute directly from ondeck (must promote first), set priority without human (human assigns priority) |
| **in-progress** | Full execution: spawn workers, run verifiers, update PROMPT.md with notes | Skip verification, move to archive without DoD passing |
| **blocked** | Work on other goals, continue researching alternatives | Retry without human input, modify block reason |
| **archive** | Reference for project memory (Feature 5), read lessons | Modify PROMPT.md content |

### Ondeck Auto-Promotion

Goals in `ondeck/` have a `priority` field in their PROMPT.md frontmatter. When the work selector scans for work, it also scans `ondeck/` and **auto-promotes** goals that have a priority assigned:

```
Phase 3 (Select Work) — Ondeck promotion step:

1. Scan workspace/ondeck/ for goal bundles
2. For each bundle with a priority field set (e.g., priority: P1):
   a. Move the goal directory to workspace/in-progress/P{n}/
   b. Update PROMPT.md frontmatter status: pending → in_progress
   c. Log the promotion to work-ledger.jsonl
3. Continue normal in-progress scanning (now includes newly promoted goals)
```

This means the human workflow is:
1. Create goal bundle in `drafts/` (idea incubation)
2. Move to `ondeck/` when ready (or agent suggests via needs-you.md)
3. Set `priority: P1` in PROMPT.md frontmatter
4. Agent auto-promotes to `in-progress/P1/` on next iteration

**Without a priority field**, ondeck goals remain in ondeck indefinitely — they require a human-assigned priority before execution.

### Priority Preemption

The agent always executes the **highest-priority work available**. This creates implicit preemption:

```
Scenario: Agent is working on P3 task. Human adds P1 goal to ondeck/.

Iteration N:   Agent is executing P3 task (worker spawned, running)
               Worker completes or times out naturally at end of iteration

Iteration N+1: Phase 3 scans ondeck/ → finds P1 goal → auto-promotes to in-progress/P1/
               Phase 3 scans in-progress/P0/ (empty) → P1/ (new goal!) → selects P1
               P3 task remains in in-progress/P3/ with status: in_progress (paused)
               Agent begins executing P1 task

Iteration N+2: P1 completes → agent looks for next work → finds P3 still in-progress → resumes P3
```

**Key rules:**
- The agent does NOT abort a running worker mid-execution. Preemption happens between iterations.
- The paused P3 task keeps its `status: in_progress` and `output_path` — it resumes where it left off.
- P0 goals are treated as emergencies: if a P0 appears in ondeck, it is promoted and selected immediately on the next iteration.
- Priority ties (multiple P1 goals) are resolved by creation date (oldest first).

### Key Implementation: Work Selector Rewrite

The current `work-selector.ts` (460 lines) parses `goals.md` with regex. V1.2 replaces this with directory traversal:

```
Phase 3 (Select Work) flow:

0. ONDECK AUTO-PROMOTION (before scanning in-progress)
   a. Scan workspace/ondeck/ for goal bundles
   b. For each bundle where PROMPT.md has priority field set:
      - Move directory to workspace/in-progress/P{n}/
      - Log promotion event to work-ledger.jsonl
   c. Skip bundles without priority (remain in ondeck)

1. Scan workspace/in-progress/P0/ → P1/ → P2/ → P3/ → P4/  (priority order)
2. For each goal-slug/ directory found:
   a. Read PROMPT.md, parse YAML frontmatter
   b. Check status field (skip if "blocked" or "complete")
   c. If steps exist, find first non-complete step
   d. Return as SelectableWork (highest priority wins — preempts lower priority work)
3. If no in-progress work found:
   a. Scan workspace/drafts/ for research opportunities
   b. If draft has no references/ content yet → research task
   c. Return research task (capped scope, no full execution)
4. If nothing anywhere → check self-improvement triggers (existing behavior)
```

**Priority preemption is implicit:** Step 1 always returns the highest-priority goal. If a P1 was just promoted from ondeck, it will be selected over an existing P3 that was previously in-progress. The P3 stays in `in-progress/P3/` and resumes when higher-priority work is done.

The `SelectableWork` and `WorkItem` interfaces in `src/core/types.ts` gain a `source_path` field pointing to the goal directory. Priority is read from the PROMPT.md `priority` frontmatter field — for `in-progress/` goals the directory location (P0-P4) is authoritative, for `ondeck/` goals the frontmatter field determines which priority directory to promote into.

### Auto-Generated Index (goals.md)

After each iteration, the state handler regenerates `workspace/goals.md` from the folder tree:

```markdown
# Strategic Goals (Auto-generated — edit PROMPT.md files, not this file)

## P1 - Critical Priority
### Build Next.js Transactional App
- **Status:** In Progress (Step 2 of 4, 50% complete)
- **Source:** workspace/in-progress/P0/build-nextjs-transactional-app/
- **Output:** /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-01-25/d5d9e97f

## Drafts
### Dashboard POC
- **Source:** workspace/drafts/dashboard-poc/
- **Status:** Researching (2 references collected)
```

### Migration Plan (V1.1 → V1.2)

1. Create folder structure under `workspace/`
2. For each existing goal in `goals.md`:
   - Create `{goal-slug}/PROMPT.md` with frontmatter extracted from markdown metadata
   - Place in appropriate state folder based on current status
   - Copy step breakdowns into PROMPT.md Steps section
3. Rename old `goals.md` to `goals.md.v1.1-backup`
4. Generate new `goals.md` index from folder tree
5. Run `npm run typecheck && npm run build` to validate

### Files That Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/agentic/work-selection/work-selector.ts` | **Rewrite** | Replace regex parsing with directory traversal + PROMPT.md YAML parsing |
| `src/deterministic/state-handler.ts` | **Major** | Update task/step state by modifying PROMPT.md frontmatter instead of regex on goals.md. Add goals.md index regeneration. |
| `src/deterministic/workspace-writers.ts` | **Major** | Write new goal bundles (mkdir + write PROMPT.md) instead of appending to goals.md |
| `src/deterministic/queue-processor.ts` | **Moderate** | Ingest queue items as new draft bundles instead of goals.md entries |
| `src/core/types.ts` | **Moderate** | Add `source_path` to WorkItem. Add PROMPT.md metadata interface. |
| `src/agentic/execution/execution-handler.ts` | **Minor** | Update output_path persistence to write to PROMPT.md frontmatter |
| `src/agentic/calibration/self-improvement-task-generator.ts` | **Minor** | Generate self-improvement goals as draft bundles |
| `src/core/executive-loop.ts` | **Minor** | After Phase 6 state update, trigger goals.md index regeneration |

### New Files

| File | Purpose |
|------|---------|
| `src/agentic/work-selection/goal-scanner.ts` | Scan folder tree, read/parse PROMPT.md files, auto-promote ondeck goals with priority set, build SelectableWork list |
| `src/deterministic/prompt-md-parser.ts` | Parse PROMPT.md YAML frontmatter + markdown body (reuse `js-yaml` dep) |
| `src/deterministic/goal-index-generator.ts` | Regenerate goals.md from folder tree |
| `workspace/drafts/.gitkeep` | Ensure empty directories are tracked |
| `workspace/ondeck/.gitkeep` | |
| `workspace/in-progress/P0/.gitkeep` | |
| `workspace/in-progress/P1/.gitkeep` | |
| `workspace/in-progress/P2/.gitkeep` | |
| `workspace/in-progress/P3/.gitkeep` | |
| `workspace/in-progress/P4/.gitkeep` | |
| `workspace/blocked/.gitkeep` | |
| `workspace/archive/.gitkeep` | |
| `workspace/_TEMPLATE/` | Canonical goal bundle template (PROMPT.md + references/ + requirements/) |

---

## Feature 2: Notion Reporting

### Problem

Agent activity lives in local JSONL ledgers and daily log files. Understanding what the agent accomplished requires SSH + `grep` + `jq`. There's no human-friendly visibility layer.

### Solution

Integrate Notion as a reporting destination for milestone events, curated highlights, and periodic summaries. The agent already has Notion API access (`NOTION_API_KEY` in `.env`) and a completed Notion Integration POC (`ai-sandbox/projects/misc/2026-01-26/1769393294746`).

### Architecture

```
Executive Loop                          Notion
─────────────                          ─────

Phase 4: logWorkStart()  ──────────►  Milestones Database
Phase 6: updateTaskState() ────────►    (page per event)
Phase 8: markTaskBlocked() ────────►

Daily (after last iteration           Daily Summary Page
 of the day, or explicit              (appended to running
 24h trigger) ─────────────────────►   monthly page)

Weekly (Sunday, alongside              Weekly Rollup Page
 existing retrospective               (standalone page)
 trigger) ─────────────────────────►
```

Notion writes are **fire-and-forget with retry**. If Notion API fails, the agent logs the failure and continues. Local ledgers remain the source of truth.

### Notion Database Schema: Milestones

| Property | Type | Values |
|----------|------|--------|
| Title | Title | Task title |
| Event | Select | Started, Completed, Failed, Blocked, Step Completed |
| Priority | Select | P0, P1, P2, P3, P4 |
| Timestamp | Date | ISO timestamp |
| Duration | Number | Minutes (for completed events) |
| Contract ID | Rich Text | Links to local worker log |
| Output Path | URL/Text | Path to project output |
| Error Summary | Rich Text | First 200 chars of error (for failures) |

### Notion Pages: Summaries

**Daily Summary** (appended as a section to a monthly page):

```
## 2026-01-28

Tasks touched: 3
Steps completed: 5
Total worker time: 47 minutes
Retries: 2

### Completed
- Build Next.js App (P1) — 101 turns, 23 min

### In Progress
- Notion Integration (P1) — Step 3 of 4

### Blocked
- Self-Improvement Triggers (P3) — Scope misalignment
```

**Weekly Rollup** (standalone page, generated alongside existing retrospective trigger):

- Tasks completed this week
- Total execution time
- Retry rate (failures / attempts)
- Goals moved through pipeline (drafts → ondeck → in-progress → archive)
- Top lesson learned (from project memory)

### Reporting Module Structure

```
src/
└── deterministic/
    └── notion-reporter.ts      # Notion API client + reporting functions
```

The reporter exposes three functions called from existing code paths:

- `reportMilestone(event, workItem, contractId)` — Called from `state-handler.ts` during Phase 6
- `reportDailySummary()` — Called from executive loop when day changes
- `reportWeeklySummary()` — Called alongside retrospective trigger in Phase 3

### Integration Points (Existing Code)

| Existing Function | In File | New Addition |
|-------------------|---------|--------------|
| `logWorkStart()` | `execution-handler.ts` | Add `reportMilestone('Started', ...)` |
| `updateTaskState()` | `state-handler.ts` | Add `reportMilestone('Completed'/'Failed', ...)` |
| `markTaskBlocked()` | `state-handler.ts` | Add `reportMilestone('Blocked', ...)` |
| `updateStepState()` | `state-handler.ts` | Add `reportMilestone('Step Completed', ...)` |
| `checkSelfImprovementTriggers()` | `self-improvement-triggers.ts` | Add daily summary check |

### Configuration

```bash
# .env additions
NOTION_DATABASE_ID=              # Milestones database ID
NOTION_MONTHLY_PAGE_ID=          # Parent page for daily summaries
NOTION_REPORTING_ENABLED=true    # Kill switch
```

### Files That Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/deterministic/state-handler.ts` | **Minor** | Add `reportMilestone()` calls after existing ledger writes |
| `src/agentic/execution/execution-handler.ts` | **Minor** | Add `reportMilestone('Started')` in `logWorkStart()` |
| `src/agentic/calibration/self-improvement-triggers.ts` | **Minor** | Add daily/weekly summary trigger logic |
| `src/core/executive-loop.ts` | **Minor** | Call daily summary if day boundary crossed |

### New Files

| File | Purpose |
|------|---------|
| `src/deterministic/notion-reporter.ts` | Notion API client, milestone/summary reporting |

---

## Feature 3: Multi-Project Access

### Problem

V1.1 workers can only write to `ai-sandbox/`. Existing projects (harnesses, blogs, tools) can't be enhanced without manual copy-paste. The agent builds greenfield projects but can't iterate on real codebases.

### Solution

Copy-in → isolated work → approval → copy-back pattern that respects Constitution Section 6 (output isolation).

### Workflow

```
┌───────────────────────────────────────────────────────────────────┐
│                   EXTERNAL PROJECT WORKFLOW                        │
│                                                                    │
│  1. GOAL REFERENCES PROJECT                                       │
│     PROMPT.md frontmatter includes:                                │
│       source_project: harness-eds                                  │
│       (looked up in workspace/project-registry.yml)                │
│                                                                    │
│  2. COPY-IN (automated by worker-spawner.ts)                       │
│     ┌──────────────────┐         ┌──────────────────────────┐     │
│     │ /Users/jackjin/  │ ──cp──► │ ai-sandbox/external/  │     │
│     │ dev/harness-eds  │  (rsync │ harness-eds-{timestamp}/ │     │
│     └──────────────────┘  w/     └──────────────────────────┘     │
│                          exclude)          │                       │
│                                            │                       │
│  3. ISOLATED WORK                          ▼                       │
│     Worker operates in copied directory.                           │
│     Original project is untouched.                                 │
│     All changes tracked in git (separate from original).           │
│                                            │                       │
│  4. COMPLETION → APPROVAL REQUEST          ▼                       │
│     Agent writes to needs-you.md:                                  │
│     "Changes ready for harness-eds. Diff: +3 files, -1 file"      │
│     Agent generates patch: ai-sandbox/external/harness-eds.patch│
│                                            │                       │
│  5. HUMAN APPLIES (manual)                 ▼                       │
│     Human reviews diff, applies patch to original project.         │
│     Agent does NOT write to original project (Constitution §6).    │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```

**Key design decision:** The agent generates a patch file but does NOT copy-back automatically. Constitution Section 6 prohibits writing outside `ai-sandbox/`. The human applies the patch. This is safer and simpler than building an automated copy-back with approval gates.

### Project Registry

```yaml
# workspace/project-registry.yml
projects:
  harness-eds:
    path: /Users/jackjin/dev/harness-eds
    description: Edge Delivery Services harness for da.live
    tech: [html, css, javascript, aem]
    exclude:                      # rsync --exclude patterns
      - node_modules/
      - .env
      - .git/                     # Don't copy git history — agent starts fresh

  continuous-agent:
    path: /Users/jackjin/dev/continuous-agent
    description: This agent's own codebase (for [SELF-ENHANCE] tasks)
    tech: [typescript, node]
    self_enhance: true            # Handled by existing self-enhance workflow
```

Human maintains this registry. Agent reads it when PROMPT.md references a `source_project`.

### Worker Spawner Changes

In `worker-spawner.ts`, the `generateProjectPath()` function currently creates paths under `ai-sandbox/projects/{category}/{date}/{slug}`. For external project goals:

1. Look up `source_project` in `project-registry.yml`
2. If found, `rsync` the project to `ai-sandbox/external/{project-name}-{timestamp}/`
3. Set `projectPath` to the copied directory
4. After worker completes, generate unified diff: `git diff --no-index original/ copy/ > patch`

### PROMPT.md Integration

```yaml
---
title: Add testimonial block to harness-eds
source_project: harness-eds          # Triggers copy-in workflow
status: pending
---
```

When `source_project` is present in PROMPT.md frontmatter, the execution handler triggers the copy-in workflow instead of creating a fresh project directory.

### Files That Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/agentic/execution/worker-spawner.ts` | **Moderate** | Add copy-in logic when `source_project` is set. Add patch generation on completion. |
| `src/agentic/execution/execution-handler.ts` | **Minor** | Pass `source_project` from WorkItem to spawner |
| `src/deterministic/state-handler.ts` | **Minor** | Write patch path to needs-you.md on completion |
| `src/core/types.ts` | **Minor** | Add `source_project` to WorkItem interface |

### New Files

| File | Purpose |
|------|---------|
| `src/deterministic/project-registry.ts` | Parse `workspace/project-registry.yml`, validate paths |
| `workspace/project-registry.yml` | Human-maintained registry of external projects |

---

## Feature 4: Project Memory

### Problem

V1.1 tracks capability confidence as abstract numbers in YAML (`capabilities/*.yml`). The `capability-updater.ts` adjusts scores (+10 PASS, -15 FAIL) but these numbers don't tell the agent what it actually knows how to do, what worked, or what failed.

When the agent encounters a new Next.js task, it can't reference the Next.js app it already built successfully. It starts from zero every time.

### Solution

Extend the capability system with **project references and lessons learned**. Each successful project completion adds a concrete entry to a project memory file. The prompt builder includes relevant past project context when building worker prompts.

### Project Memory Format

```yaml
# capabilities/project-memory.yml

projects:
  - id: d5d9e97f
    name: Next.js Transactional App
    category: nextjs
    completed: 2026-01-25
    output_path: /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-01-25/d5d9e97f
    archive_path: workspace/archive/2026-01/build-nextjs-transactional-app/
    turns: 101
    duration_minutes: 23
    capabilities_exercised:
      - deliver.nextjs.app.basic
      - git.commit
      - npm.install
    features_built:
      - Transaction handling
      - TypeScript strict mode
      - Git-committed clean project
    lessons:
      - "Next.js App Router preferred over Pages Router for new projects"
      - "Must run npm install before build verification"
    verifier_results:
      git_status_clean: PASS
      node_build: PASS
      docs_checklist: PASS

  - id: "1769393294746"
    name: Notion Integration POC
    category: misc
    completed: 2026-01-26
    output_path: /Users/jackjin/dev/ai-sandbox/projects/misc/2026-01-26/1769393294746
    turns: 360
    capabilities_exercised:
      - deliver.notion.integration
    features_built:
      - Notion API page creation
      - Database operations
    lessons:
      - "Notion MCP requires specific page/database IDs"
      - "Rate limiting needs backoff on Notion API"
```

### How Project Memory Is Used

**1. During prompt building** (`prompt-builder.ts`):

When building a worker prompt, query project memory for projects with matching capabilities or categories. Include relevant lessons in the prompt:

```
## Relevant Past Experience

You have successfully built similar projects before:

### Next.js Transactional App (2026-01-25)
- Features: Transaction handling, TypeScript strict mode
- Lessons: "Next.js App Router preferred over Pages Router"
- Reference: Check /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-01-25/d5d9e97f for patterns
```

**2. During strategy selection** (`strategy-selector.ts`):

When selecting retry strategies, check if a similar project succeeded before. If so, prioritize the approach that worked.

**3. During task archival** (new in V1.2):

When a goal moves to archive, the state handler extracts project memory entries from the worker's output and appends them to `project-memory.yml`.

### Project Memory Collection Flow

```
Worker completes task
        │
        ▼
Verifiers run (existing)
        │
        ▼
State handler updates status (existing)
        │
        ▼
NEW: Extract project memory
     - Parse worker log for features built
     - Record verifier results
     - Record duration and turns
     - Prompt agent to summarize lessons (1 agentic call)
        │
        ▼
Append to capabilities/project-memory.yml
        │
        ▼
Move goal bundle to archive/ (if using Goal State Machine)
```

### Files That Change

| File | Change Type | Description |
|------|-------------|-------------|
| `src/agentic/intelligence/prompt-builder.ts` | **Moderate** | Query project-memory.yml for relevant past projects, include in worker prompt |
| `src/agentic/intelligence/strategy-selector.ts` | **Minor** | Check project memory for successful past approaches |
| `src/deterministic/state-handler.ts` | **Moderate** | On task completion, extract and append project memory entry |
| `src/agentic/learning/capability-updater.ts` | **Minor** | Write to project-memory.yml in addition to capability YAML scores |

### New Files

| File | Purpose |
|------|---------|
| `capabilities/project-memory.yml` | Persistent project memory (append-only, version controlled) |
| `src/deterministic/project-memory-store.ts` | Read/write/query project-memory.yml |

### What This Does NOT Do (V1.3 Scope)

- Does not index or search the actual code in past projects (no RAG)
- Does not learn from external prompt logs or human-authored harnesses
- Does not automatically extract patterns — lessons are recorded per-project
- The prompt builder includes lessons as text context, not embeddings

---

## Implementation Sequence

Features are ordered by dependency and risk. Each feature is independently shippable.

```
Phase 1: Notion Reporting
    │   (most independent, lowest risk, immediate value)
    │   Hooks into existing ledger write points
    │   No changes to core work selection or execution
    │
    ▼
Phase 2: Goal State Machine + Bundles
    │   (foundation for everything else)
    │   Rewrites work selector from regex to directory traversal
    │   Migrates existing goals to folder structure
    │   Retains goals.md as auto-generated index
    │
    ▼
Phase 3: Project Memory
    │   (builds on archive/ from Phase 2)
    │   Captures lessons from completed work
    │   Feeds into prompt builder for future tasks
    │
    ▼
Phase 4: Multi-Project Access
        (builds on PROMPT.md source_project field from Phase 2)
        Copy-in workflow in worker-spawner
        Patch generation on completion
```

### Why This Order

1. **Notion Reporting** touches only reporting paths (state-handler, execution-handler). Zero risk to core loop. Delivers immediate visibility. Can be developed and shipped in a single self-enhancement branch.

2. **Goal State Machine** is the riskiest change (rewrites work selector). But it's the foundation that Phase 3 and 4 depend on (archive/ for project memory, PROMPT.md frontmatter for source_project). Must be done before anything else that depends on the new structure.

3. **Project Memory** requires the archive/ structure from Phase 2 to store completed goal context. It also requires working PROMPT.md parsing to extract metadata.

4. **Multi-Project Access** requires PROMPT.md with `source_project` field (Phase 2) and benefits from project memory (Phase 3) to reference past work on the same project.

---

## Constitution Implications

### Section 6 (Output Isolation)

**Affected by:** Multi-Project Access (Feature 3)

The copy-in pattern is Constitution-compliant: the agent copies external projects INTO `ai-sandbox/external/` and works there. The agent generates a patch but does NOT write back to the original project. Human applies the patch manually.

**No amendment needed.** The copy-in destination (`ai-sandbox/external/`) is within the allowed output area.

### Section 7 (Mandatory Logging)

**Affected by:** All features

All new operations (goal state transitions, Notion reporting, project copy-in) must be logged to ledgers. The Notion reporter is a visibility layer ON TOP of ledgers, not a replacement.

### No Other Sections Affected

- Spending: Notion API is free tier. No new paid services.
- Deletions: Archive is soft-archive (move, not delete). Original projects untouched.
- Publishing: Notion workspace is private.
- Credentials: No new credential handling.
- Access control: No visibility changes.

---

## Success Criteria

### V1.2 is complete when:

| Criterion | Measure | Phase |
|-----------|---------|-------|
| **Notion milestones visible** | Task start/complete/fail events appear in Notion database | 1 |
| **Daily summary generated** | At least one daily summary page created in Notion | 1 |
| **Goals live in folders** | All active goals are in `workspace/in-progress/P{0-4}/{slug}/PROMPT.md` | 2 |
| **Drafts don't execute** | Agent researches drafts but does not spawn workers for them | 2 |
| **goals.md auto-generated** | `workspace/goals.md` is regenerated from folder tree after each iteration | 2 |
| **Existing goals migrated** | All V1.1 goals.md entries converted to goal bundles | 2 |
| **Lessons captured** | Completed tasks have lessons recorded in `project-memory.yml` | 3 |
| **Past work informs prompts** | Worker prompts include relevant lessons from similar past projects | 3 |
| **External project enhanced** | Copy-in → work → patch → human applies completes end-to-end | 4 |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Work selector rewrite breaks task selection** | Agent stops finding work | Keep old `work-selector.ts` as fallback. Feature-flag new scanner. Run both in parallel and compare results during migration. |
| **goals.md index generation loses data** | Human can't see current state | Generate index AFTER folder operations succeed. Keep `.v1.1-backup`. |
| **Notion API rate limits** | Reporting calls slow down executive loop | Fire-and-forget with async. Queue failed writes for retry. Kill switch via `NOTION_REPORTING_ENABLED`. |
| **PROMPT.md parsing errors** | Goal can't be read, appears as "no work" | Strict YAML validation with fallback to treating entire file as description. Log parse errors prominently. |
| **Large external project copy-in** | Disk space exhaustion | Size check before copy. Respect `.gitignore` and registry `exclude` patterns. Warn in needs-you.md if > 500MB. |

---

## Appendix A: Branching Model

Current development workflow:

- **main** — Stable, production
- **develop** — Feature work via git worktree
- **self-enhance/{slug}** — Agent self-enhancement branches (merged to develop after human review)

V1.2 features should be implemented as `[SELF-ENHANCE]` tasks, each on its own branch, merged sequentially in phase order.

---

## Appendix B: Dependencies

| Dependency | Current | Notes |
|------------|---------|-------|
| `@anthropic-ai/claude-agent-sdk` | ^0.1.30 | No changes needed |
| `js-yaml` | ^4.1.0 | Already used for capabilities. Will use for PROMPT.md frontmatter parsing. |
| `dotenv` | ^16.4.5 | No changes needed |
| `@notionhq/client` | **NEW** | Notion API client. Add to dependencies. |

---

## Appendix C: Deferred to V1.3

| Feature | Reason for Deferral |
|---------|-------------------|
| **Knowledge Absorption** | Requires RAG-like infrastructure (indexing, similarity search). Project memory in V1.2 creates the data foundation. V1.3 adds the search and pattern extraction layer. |
| **Cloud Ledger Storage** | Local ledgers + Notion reporting covers current needs. Cloud migration when cross-device access is needed. |
| **Automated Copy-Back** | V1.2 generates patches for human review. Automated copy-back with approval gates adds complexity and Constitution risk. |

---

**End of V1.2 PRD**

*This document specifies outcomes, constraints, data formats, and affected files. Implementation details are left to the building agent, guided by the architecture described here.*

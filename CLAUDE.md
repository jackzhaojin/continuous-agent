# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **continuously-running autonomous agent** that finds and executes work proactively without waiting for human prompts. The agent operates in an 8-phase executive loop, spawns workers via the Claude Agent SDK, validates work through verifiers, and communicates with humans asynchronously through markdown files.

**Key Philosophy:** The agent is autonomous by default. It acts, builds, and ships without waiting for permission, except when hitting constitutional hard limits. Human interaction happens asynchronously via `workspace/needs-you.md`.

## Glossary

| Term | Meaning |
|------|---------|
| **Goal** | A unit of work the agent pursues (previously called "task"). Stored as a goal bundle in `workspace/`. |
| **Step** | A sub-unit of a goal, created when a goal is too complex for a single worker session. Tracked in `STEPS.json`. |
| **Contract** | A scoped work agreement given to a worker: prompt, tools allowed, Definition of Done, turn budget. ID prefix: `contract-`. |
| **Worker** | A spawned Claude Agent SDK session that executes a contract. Runs in `agent-outputs/`. |
| **Goal Bundle** | A directory containing `PROMPT.md` (frontmatter + description), `STEPS.json` (step definitions), and `PROGRESS_LOG.md`. |

## Build & Run Commands

```bash
# Build TypeScript to dist/
npm run build

# Type checking without emitting files
npm run typecheck

# Run in development (uses tsx, no build needed)
npm run dev

# Run in production (requires build first)
npm run build && npm start
```

**Entry points:** `src/index.ts` re-exports `src/core/executive-loop.ts`. PM2 runs `dist/core/executive-loop.js` directly. The PM2 process name is `executive-loop`.

**Production deployment:** Use PM2 to run continuously:

```bash
# Start with PM2
pm2 start ecosystem.config.cjs

# Monitor and manage
pm2 list                   # View processes
pm2 logs executive-loop    # Stream logs
pm2 monit                  # Interactive monitoring
pm2 restart executive-loop # Restart agent
pm2 stop executive-loop    # Stop agent
```

**IMPORTANT:** When making code changes, **rebuild but don't restart PM2** unless explicitly needed. The agent should not be interrupted mid-task:

```bash
npm run build  # Rebuild only - changes take effect on next natural restart
```

**PM2 gotcha:** `NODE_ENV` is set to `development` (not `production`) in `ecosystem.config.cjs` so that `npm install` in worker directories installs devDependencies (needed for TypeScript). The PM2 `cwd` and `AGENT_OUTPUTS_PATH` are hardcoded absolute paths in that file.

## Two-Repository Architecture

**CRITICAL SEPARATION:**

- **`continuous-agent/`** (this repo) - Agent infrastructure ONLY
  - Executive loop, worker spawner, verifiers, capabilities, workspace files
  - NO application code, NO project outputs

- **`agent-outputs/`** (sibling directory) - ALL worker outputs
  - Monorepo root: `CLAUDE.md`, `.env` (synced from `.env.worker`), `.claude/` live at root (shared across all projects)
  - Isolated project directories: `agent-outputs/projects/{category}/{date}/{goal-slug}/`
  - Real codebases with their own git history
  - Workers NEVER write to the agent codebase
  - **Agent SDK CWD is `agent-outputs/`** — workers navigate to their project subdirectory via prompt
  - **Shared `.env`** at root (copied from `.env.worker`); projects can have their own for project-specific vars
  - **Shared `.claude/`** at root (skills + agents); projects must NOT create their own `.claude/`
  - **CLAUDE.md inherits hierarchically** — root provides shared context, projects CAN have their own CLAUDE.md for project-specific instructions

This separation is enforced by **Constitution Article I, Section 6** (zero tolerance violation).

**EXCEPTIONS:**
- **Self-Enhancement Goals** - Goals prefixed with `[SELF-ENHANCE]` are routed to the self-enhancer subagent which works in the continuous-agent codebase. See "Self-Enhancement Workflow" below.
- **Skill-Build Goals** - Goals prefixed with `[SKILL-BUILD]` are routed to the skill-builder subagent (`.claude/agents/skill-builder.md`) which creates Claude Code skills in the agent codebase.

## Self-Enhancement & Skill-Build Workflows

The agent can modify its own infrastructure code through special pathways using tag prefixes.

### How It Works

1. **Tag-based Detection**: Goals prefixed with `[SELF-ENHANCE]` or `[SKILL-BUILD]` are recognized
2. **Special Routing**: Worker spawner routes these to the agent codebase instead of agent-outputs
3. **Subagent Delegation**: Uses the appropriate subagent via Task tool:
   - `[SELF-ENHANCE]` → `.claude/agents/self-enhancer.md`
   - `[SKILL-BUILD]` → `.claude/agents/skill-builder.md`
4. **Staged Changes**: All changes are made on a branch for human review before merge

**Branch Tracking:** When a self-enhancement or skill-build goal starts, the subagent updates `PROMPT.md` with a `branch:` frontmatter field. This allows the agent to resume work on the same branch across restarts, preventing duplicate branches.

### What Can Be Modified

| Category | Examples | Allowed |
|----------|----------|---------|
| Agent source code | `src/**/*.ts` | ✅ Yes |
| Prompt templates | `src/agentic/prompts/**/*.md` | ✅ Yes |
| Skills & Agents | `.claude/skills/`, `.claude/agents/` | ✅ Yes |
| Configuration | `capabilities/*.yml`, `tsconfig.json` | ✅ Yes |
| Documentation | `CLAUDE.md`, `README.md`, `ai-docs/` | ✅ Yes |
| Constitution | `workspace/constitution.md` | ❌ **NEVER** |

### Branch Workflow

```
1. Create branch: self-enhance/<goal-slug> (or skill-build/<goal-slug>)
2. Make changes
3. Run: npm run typecheck && npm run build
4. Commit with clear message
5. Report for human review
   (Human merges or rejects)
```

### Key Files

- **Self-enhancer agent:** `.claude/agents/self-enhancer.md`
- **Skill-builder agent:** `.claude/agents/skill-builder.md`
- **Detection logic:** `src/agentic/work-selection/work-selector.ts` (parses `[SELF-ENHANCE]` and `[SKILL-BUILD]` prefixes, preserves full title for regex matching)
- **Routing logic:** `src/agentic/execution/worker-spawner.ts` (routes to agent codebase, adds Task tool for subagent delegation)
- **Review notification:** `src/deterministic/state-handler.ts` (adds review request to needs-you.md on completion)

## Core Architecture

### Agentic vs Deterministic Split

The codebase enforces a strict separation between AI decision-making and mechanical operations:

| Layer | Location | Purpose | Uses LLM? |
|-------|----------|---------|-----------|
| **Agentic** | `src/agentic/` | AI decisions - work selection, strategy, diagnosis, learning | Yes |
| **Deterministic** | `src/deterministic/` | Mechanical ops - file I/O, health checks, state updates | No |
| **Core** | `src/core/` | Infrastructure - loop orchestration, types, logging | No |

**Why this matters:**
- Agentic code can be improved by the AI itself (via self-enhancement)
- Deterministic code is predictable, testable, and cheap to run
- Logging tags operations as `[AGENTIC]` or `[DETERMINISTIC]` for debugging

### Goal Bundles (V1.2 - Folder-Based Goals)

Work items are now organized as **goal bundles** — directories containing a `PROMPT.md` file with YAML frontmatter. This replaces the old flat `goals.md` approach (legacy fallback still exists).

**Workspace directory layout:**
```
workspace/
├── _TEMPLATE/           # Goal bundle template (copy to create new goals)
│   ├── PROMPT.md        # Template with all fields
│   ├── references/      # Reference materials
│   └── requirements/    # Detailed requirements
├── drafts/              # New/unprocessed goal bundles
├── ondeck/              # Queued for auto-promotion by priority
├── in-progress/         # Currently active goals
│   ├── P0/              # Critical priority
│   ├── P1/              # Urgent
│   ├── P2/              # High
│   ├── P3/              # Normal (default for queue items)
│   └── P4/              # Low / self-improvement
├── completed/           # Successfully completed goals
```

**PROMPT.md frontmatter:**
```yaml
---
title: "Goal Title"
slug: "goal-slug"
priority: P3
status: pending
complexity: medium
created: "2026-01-01"
tags: [tag1, tag2]
output_path:             # Set by worker on first execution
branch:                  # Set for self-enhancement tasks
source_project:          # V1.2: slug of source project to copy from
---
```

**Goal lifecycle:** `drafts/` → `ondeck/` → `in-progress/P{n}/` → `completed/`

**Blocked goals** stay in `in-progress/P{n}/` with `status: blocked` in frontmatter. They are unblocked in-place when a human responds in `needs-you.md`.

**Auto-promotion:** `goal-scanner.ts` auto-promotes goals from `ondeck/` to `in-progress/P{n}/` based on the `priority` field in frontmatter. Logs `GOAL_PROMOTED` events to `work-ledger.jsonl`.

**Queue ingestion:** Items from `queue.md` are ingested as draft bundles with P3 priority.

### Executive Loop (8 Phases)

`src/core/executive-loop.ts` runs continuously in PM2:

1. **Health Check** - GitHub auth, disk space, dependencies; regenerates `goals.md` index from bundles
2. **Check Inputs** - Process human responses from `needs-you.md`
3. **Select Work** - Scans goal bundles by priority (P0 > P1 > P2 > P3 > P4), falls back to legacy goals.md if no bundles exist
4. **Create Worker Contract** - Scope, risk level, Definition of Done
5. **Execute** - Spawn Agent SDK worker with intelligent prompting
6. **Validate** - Run verifiers on worker's output directory (NOT agent infrastructure)
7. **Update State** - Update goal bundle status, needs-you.md, ledgers
8. **Continue or Sleep** - Immediately continue if work exists, sleep only when idle

### Incremental Execution (Multi-Step Goals)

Complex goals (>100 estimated turns) are automatically broken down into steps:

- **Automatic Breakdown:** `goal-breakdown.ts` generates 2-4 steps when `estimateComplexity()` exceeds threshold
- **Step Execution:** Each step is executed independently with max 100 turns per step
- **Progress Tracking:** Steps are tracked in **STEPS.json** (machine-readable source of truth) + **PROGRESS_LOG.md** (append-only timeline).
- **Shared Output:** All steps for a goal write to the SAME project directory
- **Re-breakdown:** If a step fails with exit code 1, the system can re-breakdown remaining work (max `MAX_RE_BREAKDOWN_COUNT = 2` times per step)
- **Step Retry Persistence:** `retry_count` is stored in STEPS.json and survives PM2 restarts (unlike in-memory retry tracker)
- **Configuration:**
  - `BREAKDOWN_THRESHOLD_TURNS=100` - Trigger breakdown if estimated > 100 turns
  - `MAX_TURNS_PER_STEP=100` - Max turns per step (MINIMUM 100)
  - `AUTO_BREAKDOWN_ENABLED=true` - Enable/disable auto-breakdown

**Step tracking files per goal bundle:**
```
workspace/in-progress/P2/my-goal/
  PROMPT.md          # Content only (problem, DoD, approach)
  STEPS.json         # Machine-readable step definitions + status (source of truth)
  CONTRACTS.jsonl    # Per-bundle contract event log (started, completed, failed, blocked)
  PROGRESS_LOG.md    # Append-only human-readable timeline
  step-1-handoff.md  # Per-step handoff context (still written during transition)
```

**STEPS.json schema:**
```json
{
  "version": 1,
  "created_at": "2026-01-29T05:44:52Z",
  "trigger": "auto",
  "revision": 3,
  "steps": [
    {
      "id": "step-0",
      "order": 0,
      "title": "Research and plan approach",
      "description": "Analyze requirements...",
      "status": "complete",
      "dependencies": [],
      "estimated_turns": 80,
      "completed_at": "2026-01-29T05:59:42Z",
      "completed_by_contract": "contract-1769665492207"
    }
  ]
}
```

**Read/write strategy:**
- **Reads:** STEPS.json first, falls back to TASKS.json for backward compat
- **Writes:** STEPS.json (primary) + PROGRESS_LOG.md (append-only)
- **Migration:** Run `npx tsx scripts/migrate-steps-to-steps-json.ts` to convert existing bundles

### Key Modules

**Agentic Layer** (`src/agentic/`) - AI decision-making:
- `work-selection/work-selector.ts` - Selects highest priority unblocked goal (goal bundles first, legacy goals.md fallback)
- `work-selection/goal-scanner.ts` - Scans workspace folder tree for goal bundles, reads STEPS.json (primary) or PROMPT.md (fallback), auto-promotes ondeck goals
- `work-selection/goal-breakdown.ts` - Automatic breakdown of complex goals into steps; `writeStepsToBundle()` writes STEPS.json + PROGRESS_LOG.md
- `execution/worker-spawner.ts` - Spawns Claude Agent SDK sessions with prompts, copies `.env.worker` to worker directory
- `execution/execution-handler.ts` - Orchestrates work execution with retry tracking
- `intelligence/intent-classifier.ts` - Classifies goals as outcome_only vs what_and_how
- `intelligence/strategy-selector.ts` - Chooses different strategies per retry
- `intelligence/prompt-builder.ts` - Builds context-rich prompts with retry history
- `diagnosis/agentic-diagnosis.ts` - Analyzes failures to determine next actions
- `learning/capability-updater.ts` - Updates capability confidence: +10 on PASS, -15 on FAIL
- `calibration/self-improvement-task-generator.ts` - Generates self-improvement opportunities
- `calibration/self-improvement-triggers.ts` - Detects when self-improvement should occur
- `calibration/retrospective.ts` - Weekly retrospective: analyzes ledgers, calibrates confidence, generates recommendations
- `prompts/loader.ts` - Loads prompt templates from categorized subdirectories (supports versioned filenames like `v1.1.0`)

**Deterministic Layer** (`src/deterministic/`) - Mechanical operations:
- `health-checker.ts` - Validates auth, tools, disk space
- `input-processor.ts` - Parses human responses from needs-you.md
- `prompt-md-parser.ts` - Parses PROMPT.md files (YAML frontmatter + markdown body)
- `state-handler.ts` - Updates goal bundles (STEPS.json + PROMPT.md + PROGRESS_LOG.md), needs-you.md, ledgers; multi-project patch generation
- `steps-json-handler.ts` - Read/write/update STEPS.json files (atomic writes via temp+rename)
- `progress-log-writer.ts` - Append-only PROGRESS_LOG.md writer for goal bundles
- `contracts-log-writer.ts` - Per-bundle CONTRACTS.jsonl tracking (started, completed, failed, blocked events)
- `notion-reporter.ts` - Fire-and-forget Notion integration (`reportMilestone()`, `closeMilestone()`, daily/weekly summaries)
- `project-registry.ts` - Tracks completed projects for reuse (V1.2: `workspace/project-registry.yml`)
- `project-memory-store.ts` - Records completed projects with capabilities and lessons (`capabilities/project-memory.yml`)
- `validation-handler.ts` - Runs verifiers on worker output
- `verifiers/` - Deterministic checks (git-clean, node-build, docs-complete)
- `backoff-manager.ts` - Rate limit detection and exponential backoff
- `workspace-writers.ts` - Writes to workspace markdown files
- `queue-processor.ts` - Parses queue.md
- `inputs-log.ts` - Appends to JSONL audit logs
- `self-improvement-state.ts` - Tracks self-improvement state (`workspace/self-improvement-state.json`)

**Core Layer** (`src/core/`):
- `executive-loop.ts` - Main 8-phase loop orchestration
- `types.ts` - Shared TypeScript interfaces
- `logging.ts` - Structured logging with agentic/deterministic distinction

### Workspace Files (Markdown + JSONL)

**Human-editable markdown:**
- `workspace/constitution.md` - **IMMUTABLE** hard limits (human-only modification)
- `workspace/goals.md` - Auto-generated index from goal bundles (also serves as legacy fallback if no bundles exist)
- `workspace/needs-you.md` - Human-agent interaction interface
- `workspace/queue.md`, `progress.md`, `completed.md` - State tracking
- `workspace/preferences.md` - Learned preferences and conventions (code style, workflow, anti-patterns)
- `workspace/project-registry.yml` - Tracks completed projects for reuse (V1.2: multi-project access)
- `workspace/self-improvement-state.json` - Tracks last practice/retrospective/refresh timestamps and outcome counts

**Append-only ledgers (JSONL):**
- `ledgers/work-ledger.jsonl` - Goal events (GOAL_STARTED, GOAL_COMPLETED, GOAL_BLOCKED, STEP_STARTED, STEP_COMPLETED, GOAL_PROMOTED)
  - Each entry includes `contract_id` linking to worker log
- `ledgers/capability-ledger.jsonl` - Capability attempts and results
  - Each entry includes `contract_id` linking to worker log
- `ledgers/inputs-log.jsonl` - Human input audit trail (legacy, not currently used)
- `ledgers/executive-{date}.log` - Daily executive loop logs
- `ledgers/{yyyy-mm-dd}/worker-{contract_id}.log` - Worker execution logs (organized by date)

**Tracing goals to worker logs:**
```bash
# Find contract_id for a goal in work ledger
grep "Build Next.js" ledgers/work-ledger.jsonl | jq -r '.contract_id'
# Output: contract-b25db16e

# View detailed worker log
cat ledgers/2026-01-25/worker-contract-b25db16e.log
```

**IMPORTANT:** The `ledgers/` directory is **version controlled** and committed to git for full audit traceability.

**Capability registries (YAML):**
- `capabilities/technical-capabilities.yml` - Tool operation capabilities (git, npm, ssh, docker)
- `capabilities/delivery-capabilities.yml` - End-to-end outcomes (nextjs app, EDS site)
- `capabilities/functional-capabilities.yml` - Cross-cutting capabilities (debugging, research)
- `capabilities/sdk-registry.yml` - Agent SDK capability mappings
- `capabilities/project-memory.yml` - Completed project records with capabilities, features, and lessons learned

## Constitution (Hard Limits)

**Location:** `workspace/constitution.md`

The agent CANNOT modify this file. It defines 8 absolute boundaries:

1. **No spending beyond $20/month per service** (ask when uncertain)
2. **No permanent deletions** (archive/soft-delete only)
3. **No external publishing** (npm publish, blog posts require approval)
4. **No credential exposure** (never log, commit, or transmit credentials)
5. **No access control expansion** (no making private things public)
6. **No output in agent codebase** (all output → agent-outputs/)
7. **All activity must be logged** (no silent execution)
8. **10 retries minimum before BLOCKED** (needs-you.md entry required)

If you encounter a constitutional limit, stop and document the blocker in `needs-you.md`.

## Human Interaction via needs-you.md

When the agent blocks after 10 retries, it writes to `workspace/needs-you.md`:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| Get API token | 401 Unauthorized... | | BLOCKING | 2026-01-25 |
```

**Human responds by adding to the Response column:**

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| Get API token | 401 Unauthorized... | [APPROVED] Token: sk_xyz | BLOCKING | 2026-01-25 |
```

**Response tags:**
- `[APPROVED]` - Grant permission with optional details
- `[DECISION]` - Provide a choice/direction
- `[INFO]` - Supply requested information
- `[SKIP]` - Cancel this goal entirely

The agent automatically detects responses in Phase 2, unblocks goals, resets retry counters, and logs interactions to `work-ledger.jsonl`.

## Retry & Strategy System

**Retry Tracker** (in-memory Map):
- Tracks attempts per goal (max 10 per Constitution)
- **Persists output_path** from first attempt so retries continue working on the SAME project
- After each failure, `strategy-selector.ts` picks a DIFFERENT approach
- Retry context passed to worker includes: attempts, strategies tried, last error, existing project path

**Strategy Selection:**
- Simplify scope → Research first → Break into subtasks → Different tools
- Each retry MUST try something different (same approach twice = wasted retry)

**Blocking Logic:**
```typescript
if (retry.attempts >= 10) {
  // Mark as Blocked in goals.md
  // Write to needs-you.md with error context
  // Clear retry tracker
  // Continue other work (don't wait for human)
}
```

## Verifier System

**Philosophy:** Deterministically triggered, agentically evaluated.

**CRITICAL:** Verifiers run in the **worker's output directory** (`result.output_path`), NOT the agent infrastructure directory. This was a bug that was fixed - verifiers must check the actual work output in `agent-outputs/`.

Verifiers run after each goal and return structured evidence:

```typescript
{
  verifier_id: 'git-clean',
  result: 'PASS' | 'FAIL',
  message: 'No uncommitted changes',
  evidence: { /* structured data */ }
}
```

**Core verifiers:**
- `git_status_clean` - No uncommitted changes in worker's project
- `node_build` - TypeScript compiles, tests pass in worker's project
- `docs_checklist` - README/CLAUDE.md present
- `reference_integrity` - Reference registry valid

Verifier results update capability confidence scores: +10 on PASS, -15 on FAIL.

## Environment Variables

Create tiered env files from the examples:

```bash
cp .env.executive.example .env.executive
cp .env.worker.example .env.worker
cp .env.app.example agent-outputs/projects/<project>/.env.app
```

- **.env.executive** → Executive loop config + Notion reporting keys.
- **.env.worker** → Claude Agent SDK auth + worker tool API keys.
- **.env.app** → App/runtime credentials per project (DBs, caches, storage). Optional: projects may instead use Docker envs, shell exports, iOS build settings, or other platform-specific config.

**API Key Management:** `.env.worker` is copied to the `agent-outputs/` root as `.env` by `worker-spawner.ts` (centralized, not per-project). Workers access shared API keys from there. Projects needing their own config can create a separate `.env` or `.env.app`, or use platform-specific mechanisms (Docker envs, shell exports, mobile build settings).

## Notion Reporting

The agent reports milestone events and summaries to Notion. This is fire-and-forget — failures are logged but never block the agent. Local JSONL ledgers remain the source of truth.

**Workspace layout and database schema:** `ai-docs/notion/workspace-layout.md`

**What gets reported:**
- **Milestone events** → rows in the Agent Milestones database (Started, Completed, Failed, Blocked, Step Completed)
- **Milestone closure** → `closeMilestone()` updates the Started row's Timestamp to a date range (start + end) when a goal completes/fails
- **Daily summaries** → heading blocks appended to the monthly summaries page
- **Weekly summaries** → child pages under the monthly summaries page

**Monthly rotation:** At the start of each month, create a new summaries page in Notion and update `NOTION_MONTHLY_PAGE_ID` in `.env.executive`. The milestones database persists across months.

**Setup:** Run `npx tsx scripts/setup-notion-workspace.ts <PARENT_PAGE_ID> --write-env` (see `ai-docs/v1/2026-01-28-v1.2/notion-api-automation.md` for full runbook).

## Code Modification Guidelines

**When modifying the agent codebase:**

1. **Executive loop changes:** Test with `npm run dev` before deploying to PM2
2. **Verifiers:** Must return `VerifierResult` interface with PASS/FAIL + evidence
   - **CRITICAL:** Verifiers must check `result.output_path` (worker's directory), NOT `process.cwd()` (agent infrastructure)
3. **Intelligence layer:** Changes to prompts/strategies affect all future tasks. Prompts are in `src/agentic/prompts/` organized by category subdirectories (calibration, communication, contracts, diagnosis, execution, intelligence, research, retry, strategy, validation, work-selection, worker)
4. **Workspace files:** Never auto-modify `constitution.md` (human-only)
5. **Ledgers:** Append-only JSONL, never truncate or modify existing entries
6. **PM2 restarts:** After rebuilding, only restart PM2 if explicitly needed - avoid interrupting running tasks

**TypeScript notes:**
- ES modules (`type: "module"` in package.json)
- Target ES2022, strict mode enabled
- Import paths need `.js` extension (e.g., `'./types.js'` even for `.ts` files)
- Run `npm install` to ensure `@types/node` is installed (required for TypeScript)
- No test framework is currently configured — validation is done through verifiers at runtime, not unit tests

## Capabilities & Claude Agent SDK

**Claude Code Skills:** `.claude/skills/{skill-name}/SKILL.md` (Claude Code's built-in skill system)

Note: The agent's "capabilities" are distinct from Claude Code's "skills". Claude Code skills are documentation files that help Claude understand project context. Agent capabilities are tracked competencies with confidence scores.

Each Claude Code skill must have:
```yaml
---
name: Skill Name
description: |
  When to use this skill...
---
```

### Project Documentation Skills

Complex features should follow a **WHY → WHAT → HOW → WHEN** progression. Use these skills for multi-day features requiring architectural planning:

1. **PRD Writer** (`.claude/skills/prd-writer.md`) - Creates Product Requirements Documents
   - **WHY**: Define the problem and business value
   - **WHAT**: Specify functional requirements, success criteria, user outcomes
   - Output: `ai-docs/prd-{feature-name}.md`

2. **Project Architect** (`.claude/skills/project-architect.md`) - Creates architectural documentation
   - **WHAT**: System design, components, data flow
   - **HOW (high-level)**: Technology choices, integration patterns
   - Output: `ai-docs/architect/{feature-name}-architecture.md`

3. **Task Breakdown** (`.claude/skills/task-breakdown/`) - Creates detailed task specifications
   - **HOW (detailed)**: Step-by-step implementation instructions
   - **WHEN**: Dependencies, duration estimates, phases
   - Output: `ai-docs/tasks/task-{phase}-{number}-{feature-name}.md`

4. **Project Analysis** (`.claude/skills/project-analysis/`) - Analyzes existing codebases
   - Documents tech stack, patterns, architecture
   - Used before designing new features to understand existing patterns
   - Output: `ai-docs/project-analysis.md`

**Workflow for Complex Features:**
```
User describes need
  ↓
PRD Writer (define WHY/WHAT)
  ↓
Project Architect (design system)
  ↓
Task Breakdown (detail HOW)
  ↓
Implementation (workers execute tasks)
```

**When NOT to use these skills:**
- Simple bug fixes or single-file changes
- Features under 1 day of work
- Minor refactors or updates
- Quick prototypes or experiments

**Agent SDK Integration:**
- Worker spawning: `worker-spawner.ts` calls `@anthropic-ai/claude-agent-sdk`
- Workers get isolated project directories in `agent-outputs/`
- Prompts built via `prompt-builder.ts` include Constitution, retry context, strategies
- Each worker includes 'Skill' tool for accessing Claude Code skills

## Reference POCs

Foundational proof-of-concept projects are stored in `references/poc/`, organized by agent platform. This structure supports expanding the agent pool beyond Claude to include ChatGPT, Gemini, and other agents.

**`references/poc/claude/chat-cli/`** - Interactive CLI demonstrating Claude Agent SDK patterns
- How to use `query()` from `@anthropic-ai/claude-agent-sdk`
- Streaming message handling (`for await of stream`)
- Message type handling (system, assistant, user, result)
- Authentication patterns (OAuth token vs API key)

**`references/poc/claude/agent-sdk-skills-poc/`** - Skills integration with Agent SDK
- `settingSources: ['user', 'project']` is REQUIRED for skills
- `allowedTools` must include 'Skill' for skill invocation
- `cwd` must point to project root for `.claude/skills/` discovery
- SKILL.md format with frontmatter and instructions

**`references/poc/claude/agent-sdk-subagents-poc/`** - Subagent delegation via Task tool
- `allowedTools` must include 'Task' to enable subagent delegation
- `settingSources: ['user', 'project']` loads agents from filesystem
- User-level agents (`~/.claude/agents/`) and project-level agents (`.claude/agents/`) both work
- Custom subagents specify: tools, model, permissionMode, hooks, skills
- Built-in subagents: Explore (haiku), Plan, general-purpose, Bash
- Subagents run in isolated context, return results to main agent
- Subagents CANNOT spawn other subagents (no nesting)
- See `FINDINGS.md` in the POC for complete validation results

**Skills vs Subagents:**
| Aspect | Skills | Subagents |
|--------|--------|-----------|
| Location | `.claude/skills/` | `.claude/agents/` |
| Tool | `Skill` | `Task` |
| Context | Runs in main context | Isolated context |
| Purpose | Reusable prompts | Delegated autonomous tasks |

**Running POCs:**
```bash
cd references/poc/claude/chat-cli && npm install && npm run build && npm start
cd references/poc/claude/agent-sdk-skills-poc && npm install && npm run build && npm start
cd references/poc/claude/agent-sdk-subagents-poc && npm install && npm run build && npm start
```

These POCs have their own `.env` files (not committed) - copy from `.env.example` and add credentials.

## File Structure Reference

```
continuous-agent/
├── src/                        # TypeScript source (compiles to dist/)
│   ├── core/                   # Core infrastructure
│   │   ├── executive-loop.ts   # Main 8-phase loop
│   │   ├── types.ts            # Shared interfaces
│   │   └── logging.ts          # Structured logging
│   ├── agentic/                # AI decision-making (LLM-powered)
│   │   ├── work-selection/     # Goal selection & breakdown
│   │   │   ├── work-selector.ts  # Selects work from goal bundles (fallback: goals.md)
│   │   │   ├── goal-scanner.ts   # Scans workspace folders, auto-promotes ondeck goals
│   │   │   └── goal-breakdown.ts # Complex goal decomposition
│   │   ├── execution/          # Worker spawning
│   │   │   ├── worker-spawner.ts # Agent SDK integration, .env.worker copying
│   │   │   └── execution-handler.ts # Orchestrates execution
│   │   ├── intelligence/       # Intent classification, strategy selection
│   │   ├── diagnosis/          # Failure analysis
│   │   ├── learning/           # Capability confidence updates
│   │   ├── calibration/        # Self-improvement triggers, goal generation, retrospective
│   │   └── prompts/            # Prompt templates organized by category (loader.ts + subdirs)
│   └── deterministic/          # Mechanical operations (no LLM)
│       ├── health-checker.ts   # System health validation
│       ├── input-processor.ts  # Parses needs-you.md responses
│       ├── prompt-md-parser.ts # Parses PROMPT.md frontmatter + body
│       ├── steps-json-handler.ts # STEPS.json read/write/update (atomic writes)
│       ├── progress-log-writer.ts # Append-only PROGRESS_LOG.md writer
│       ├── contracts-log-writer.ts # Per-bundle CONTRACTS.jsonl tracking
│       ├── notion-reporter.ts  # Notion integration (milestones, summaries)
│       ├── project-registry.ts # Completed project registry (V1.2)
│       ├── project-memory-store.ts # Project memory with lessons learned
│       ├── state-handler.ts    # Updates goal bundles, needs-you.md
│       ├── validation-handler.ts # Runs verifiers
│       ├── verifiers/          # Deterministic validation checks
│       ├── backoff-manager.ts  # Rate limit handling
│       ├── workspace-writers.ts # Writes to workspace files
│       ├── queue-processor.ts  # Parses queue.md
│       ├── inputs-log.ts       # JSONL audit logging
│       └── self-improvement-state.ts # Self-improvement tracking

├── workspace/                  # Human-editable state + goal bundles
│   ├── constitution.md         # **IMMUTABLE** hard limits
│   ├── goals.md                # Auto-generated index from goal bundles
│   ├── needs-you.md            # Human interaction interface
│   ├── preferences.md          # Learned preferences and conventions
│   ├── project-registry.yml    # Completed projects for reuse (V1.2)
│   ├── self-improvement-state.json # Self-improvement tracking
│   ├── {queue,progress,completed}.md
│   ├── _TEMPLATE/              # Goal bundle template
│   ├── drafts/                 # New goal bundles
│   ├── ondeck/                 # Queued for auto-promotion
│   ├── in-progress/P{0-4}/    # Active goals by priority
│   └── completed/              # Successfully completed goals

├── ledgers/                    # Append-only logs (version controlled)
│   ├── work-ledger.jsonl       # Goal events
│   ├── capability-ledger.jsonl # Capability results
│   └── executive-{date}.log    # Daily execution logs

├── capabilities/               # YAML capability registries
│   ├── technical-capabilities.yml    # Tool capabilities
│   ├── delivery-capabilities.yml     # End-to-end outcomes
│   ├── functional-capabilities.yml   # Cross-cutting capabilities
│   └── project-memory.yml            # Completed project records

├── references/                 # External references and POCs
│   ├── poc/                    # Foundational proof-of-concept projects
│   │   └── claude/             # Claude Agent SDK POCs
│   │       ├── chat-cli/           # Agent SDK CLI demo
│   │       ├── agent-sdk-skills-poc/  # Skills integration demo
│   │       └── agent-sdk-subagents-poc/  # Subagent delegation demo
│   └── reference-registry.yaml # Reference tracking
│
├── .claude/
│   ├── agents/                 # Subagent definitions (self-enhancer, skill-builder, code-validator, task-researcher)
│   └── skills/                 # Claude Code skill definitions (SKILL.md files)
├── verifiers/
│   ├── definitions/            # Verifier YAML configs (git-status-clean, node-build, etc.)
│   └── run-verifier.sh         # Shell runner for verifiers
└── ai-docs/                    # PRDs, specs, feature docs
    └── notion/                 # Notion workspace layout, schema, page IDs
```

## Important Distinctions

**Agent vs Worker:**
- **Agent** = This codebase (executive loop, orchestration)
- **Worker** = Spawned Agent SDK session for a specific goal/step

**Capability Types:**
- **Technical** = Tool operation (git.commit, npm.install)
- **Delivery** = End-to-end outcomes (deliver.nextjs.app)
- **Functional** = Cross-cutting abilities (reason.debugging)

**Status Values in goals.md:**
- `Pending` - Not started, eligible for selection
- `In Progress` - Currently being worked on (or retrying)
- `Blocked` - Failed 10x, needs human input (entry in needs-you.md)
- `Complete` - Verified via verifiers

**Step Status Values:**
- `pending` - Not started
- `in-progress` - Currently executing
- `complete` - Successfully completed
- `blocked` - Failed after retries

## Debugging

**Check agent health:**
```bash
# View recent logs
tail -f ledgers/executive-$(date +%Y-%m-%d).log

# Check PM2 logs
pm2 logs executive-loop

# Check current state
cat workspace/goals.md
cat workspace/needs-you.md

# View event history
tail -20 ledgers/work-ledger.jsonl
```

**Common issues:**
- Worker fails immediately → Check auth tokens in `.env.worker`
- Goal marked Blocked → Check `needs-you.md` for details, add human response
- Build fails → Run `npm run typecheck` for detailed errors
- Retry loops → Check `strategy-selector.ts` is picking different strategies
- Verifiers checking wrong directory → Ensure verifiers use `result.output_path`, not `process.cwd()`
- TypeScript errors → Run `npm install` to ensure `@types/node` is installed
- Steps lost on restart → Check STEPS.json exists in the bundle; if only `## Steps` in PROMPT.md, run migration: `npx tsx scripts/migrate-steps-to-steps-json.ts`
- Step status not updating → Check STEPS.json is writable; `steps-json-handler.ts` uses atomic temp+rename writes
- Self-enhance steps repeat → Title prefix must be preserved (not stripped) for regex matching in `updateStepStatus`
- PM2 running stale code → Verify `ecosystem.config.cjs` script path points to `dist/core/executive-loop.js`
- No work selected → Check `workspace/in-progress/P{0-4}/` for goal bundles with `status: pending` in PROMPT.md; also check `workspace/ondeck/` for goals awaiting auto-promotion
- Goal not promoted → Ensure PROMPT.md frontmatter has a valid `priority` field (P0-P4)
- Notion not reporting → Check `NOTION_REPORTING_ENABLED` is not `false`, verify `NOTION_API_KEY` and `NOTION_DATABASE_ID` are set
- Skill-build steps repeat → Same as self-enhance: title prefix `[SKILL-BUILD]` must be preserved for regex matching

## Documentation Locations

- **PRD:** `ai-docs/v1/init/continuous-executive-agent-v1-prd.md`
- **Constitution:** `workspace/constitution.md`
- **Features:** `ai-docs/features/` (human-interaction, etc.)
- **Notion workspace layout:** `ai-docs/notion/workspace-layout.md` (page hierarchy, database schema, IDs, data flow)
- **Notion setup runbook:** `ai-docs/v1/2026-01-28-v1.2/notion-api-automation.md`
- **Claude Code Skills:** `.claude/skills/{skill-name}/SKILL.md`
- **Agent Capabilities:** `capabilities/*.yml`

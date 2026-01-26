# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **continuously-running autonomous agent** that finds and executes work proactively without waiting for human prompts. The agent operates in an 8-phase executive loop, spawns workers via the Claude Agent SDK, validates work through verifiers, and communicates with humans asynchronously through markdown files.

**Key Philosophy:** The agent is autonomous by default. It acts, builds, and ships without waiting for permission, except when hitting constitutional hard limits. Human interaction happens asynchronously via `workspace/needs-you.md`.

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

## Two-Repository Architecture

**CRITICAL SEPARATION:**

- **`continuous-agent/`** (this repo) - Agent infrastructure ONLY
  - Executive loop, worker spawner, verifiers, capabilities, workspace files
  - NO application code, NO project outputs

- **`agent-outputs/`** (sibling directory) - ALL worker outputs
  - Isolated project directories: `agent-outputs/projects/{category}/{date}/{task-slug}/`
  - Real codebases with their own git history
  - Workers NEVER write to the agent codebase
  - **API keys are copied:** Each worker gets a copy of `.env` from agent repo

This separation is enforced by **Constitution Article I, Section 6** (zero tolerance violation).

## Core Architecture

### Executive Loop (8 Phases)

`src/executive-loop.ts` runs continuously in PM2:

1. **Health Check** - GitHub auth, disk space, dependencies
2. **Check Inputs** - Process human responses from `needs-you.md`
3. **Select Work** - Priority-based selection from `goals.md` (P1 > P2 > P3), with step awareness
4. **Create Task Contract** - Scope, risk level, Definition of Done
5. **Execute** - Spawn Agent SDK worker with intelligent prompting
6. **Validate** - Run verifiers on worker's output directory (NOT agent infrastructure)
7. **Update State** - Update goals.md, needs-you.md, ledgers
8. **Continue or Sleep** - Immediately continue if work exists, sleep only when idle

### Incremental Execution (Multi-Step Tasks)

Complex tasks (>100 estimated turns) are automatically broken down into steps:

- **Automatic Breakdown:** `task-breakdown.ts` generates 2-4 steps when `estimateComplexity()` exceeds threshold
- **Step Execution:** Each step is executed independently with max 100 turns per step
- **Progress Tracking:** Steps tracked in `goals.md` with status (pending/in-progress/complete/blocked)
- **Shared Output:** All steps for a task write to the SAME project directory
- **Configuration:**
  - `BREAKDOWN_THRESHOLD_TURNS=100` - Trigger breakdown if estimated > 100 turns
  - `MAX_TURNS_PER_STEP=100` - Max turns per step (MINIMUM 100)
  - `AUTO_BREAKDOWN_ENABLED=true` - Enable/disable auto-breakdown

**Step statuses in goals.md:**
```markdown
### Task Title
- **Status:** In Progress (Step 2 of 4, 50% complete)
#### Step 1: Research and planning
- **Status:** complete
#### Step 2: Implementation
- **Status:** in-progress
#### Step 3: Testing
- **Status:** pending
```

### Key Modules

**Work Selection & Execution:**
- `work-selector.ts` - Parses goals.md, returns highest priority unblocked task
- `task-breakdown.ts` - Automatic breakdown of complex tasks into steps
- `task-contractor.ts` - Creates task contracts with DoD and constraints
- `worker-spawner.ts` - Spawns Claude Agent SDK sessions with prompts, copies `.env` to worker directory
- `input-processor.ts` - Parses human responses from needs-you.md

**Intelligence Layer:**
- `intelligence/intent-classifier.ts` - Classifies tasks as outcome_only vs what_and_how
- `intelligence/strategy-selector.ts` - Chooses different strategies per retry
- `intelligence/prompt-builder.ts` - Builds context-rich prompts with retry history

**Verification & Learning:**
- `verifiers/` - Deterministic checks (git-clean, node-build, docs-complete, etc.)
- `learning/capability-updater.ts` - Updates capability confidence: +10 on PASS, -15 on FAIL

**State Management:**
- `health-checker.ts` - Validates auth, tools, disk space
- `types.ts` - Shared TypeScript interfaces

### Workspace Files (Markdown + JSONL)

**Human-editable markdown:**
- `workspace/constitution.md` - **IMMUTABLE** hard limits (human-only modification)
- `workspace/goals.md` - P1/P2/P3 prioritized work items with status and steps
- `workspace/needs-you.md` - Human-agent interaction interface
- `workspace/queue.md`, `progress.md`, `completed.md` - State tracking

**Append-only ledgers (JSONL):**
- `ledgers/work-ledger.jsonl` - Task events (STARTED, COMPLETED, BLOCKED, STEP_STARTED, STEP_COMPLETED)
  - Each entry includes `contract_id` linking to worker log
- `ledgers/capability-ledger.jsonl` - Capability attempts and results
  - Each entry includes `contract_id` linking to worker log
- `ledgers/inputs-log.jsonl` - Human input audit trail (legacy, not currently used)
- `ledgers/executive-{date}.log` - Daily executive loop logs
- `ledgers/{yyyy-mm-dd}/worker-{contract_id}.log` - Worker execution logs (organized by date)

**Tracing tasks to worker logs:**
```bash
# Find contract_id for a task in work ledger
grep "Build Next.js" ledgers/work-ledger.jsonl | jq -r '.contract_id'
# Output: task-b25db16e

# View detailed worker log
cat ledgers/2026-01-25/worker-task-b25db16e.log
```

**IMPORTANT:** The `ledgers/` directory is **version controlled** and committed to git for full audit traceability.

**Capability registries (YAML):**
- `capabilities/technical-capabilities.yml` - Tool operation capabilities (git, npm, ssh, docker)
- `capabilities/delivery-capabilities.yml` - End-to-end outcomes (nextjs app, EDS site)
- `capabilities/functional-capabilities.yml` - Cross-cutting capabilities (debugging, research)
- `capabilities/sdk-registry.yml` - Agent SDK capability mappings

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
- `[SKIP]` - Cancel this task entirely

The agent automatically detects responses in Phase 2, unblocks tasks in `goals.md`, resets retry counters, and logs interactions to `work-ledger.jsonl`.

## Retry & Strategy System

**Retry Tracker** (in-memory Map):
- Tracks attempts per task (max 10 per Constitution)
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

Verifiers run after each task and return structured evidence:

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

Create `.env` from `.env.example`:

```bash
# Required: ONE of these for Claude Agent SDK
CLAUDE_CODE_OAUTH_TOKEN=    # Option 1: OAuth (Claude Pro/Max)
ANTHROPIC_API_KEY=          # Option 2: API key

# Optional configuration
MODEL=claude-sonnet-4-5-20250929
MAX_TURNS=250               # Max turns per worker session for single-step tasks
MAX_TURNS_PER_STEP=100      # Max turns per step for multi-step tasks (MINIMUM 100)

# Loop timing (continuous execution by default)
# Agent continues immediately after completing work - no sleep between tasks
# Sleep only occurs when idle (queue empty) or unhealthy
IDLE_SLEEP_SECONDS=30       # Sleep when no work available (polling interval)
UNHEALTHY_SLEEP_SECONDS=60  # Sleep when system unhealthy before retrying

# Incremental execution
BREAKDOWN_THRESHOLD_TURNS=100  # Trigger breakdown if estimated > 100 turns
AUTO_BREAKDOWN_ENABLED=true    # Enable automatic task breakdown

# Third-party API keys (copied to each worker's .env)
NOTION_API_KEY=                # Notion integration key
```

**API Key Management:** The `.env` file is automatically copied to each worker's project directory by `worker-spawner.ts`. This allows workers to access third-party APIs without exposing credentials in git.

## Code Modification Guidelines

**When modifying the agent codebase:**

1. **Executive loop changes:** Test with `npm run dev` before deploying to PM2
2. **Verifiers:** Must return `VerifierResult` interface with PASS/FAIL + evidence
   - **CRITICAL:** Verifiers must check `result.output_path` (worker's directory), NOT `process.cwd()` (agent infrastructure)
3. **Intelligence layer:** Changes to prompts/strategies affect all future tasks
4. **Workspace files:** Never auto-modify `constitution.md` (human-only)
5. **Ledgers:** Append-only JSONL, never truncate or modify existing entries
6. **PM2 restarts:** After rebuilding, only restart PM2 if explicitly needed - avoid interrupting running tasks

**TypeScript notes:**
- ES modules (`type: "module"` in package.json)
- Target ES2022, strict mode enabled
- Import paths need `.js` extension (e.g., `'./types.js'` even for `.ts` files)
- Run `npm install` to ensure `@types/node` is installed (required for TypeScript)

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

Foundational proof-of-concept projects are stored in `references/poc/`. These are working examples that demonstrate core Agent SDK patterns:

**`references/poc/chat-cli/`** - Interactive CLI demonstrating Claude Agent SDK patterns
- How to use `query()` from `@anthropic-ai/claude-agent-sdk`
- Streaming message handling (`for await of stream`)
- Message type handling (system, assistant, user, result)
- Authentication patterns (OAuth token vs API key)

**`references/poc/agent-sdk-skills-poc/`** - Skills integration with Agent SDK
- `settingSources: ['user', 'project']` is REQUIRED for skills
- `allowedTools` must include 'Skill' for skill invocation
- `cwd` must point to project root for `.claude/skills/` discovery
- SKILL.md format with frontmatter and instructions

**`references/poc/agent-sdk-subagents-poc/`** - Subagent delegation via Task tool
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
cd references/poc/chat-cli && npm install && npm run build && npm start
cd references/poc/agent-sdk-skills-poc && npm install && npm run build && npm start
cd references/poc/agent-sdk-subagents-poc && npm install && npm run build && npm start
```

These POCs have their own `.env` files (not committed) - copy from `.env.example` and add credentials.

## File Structure Reference

```
continuous-agent/
├── src/                        # TypeScript source (compiles to dist/)
│   ├── executive-loop.ts       # Main 8-phase loop
│   ├── work-selector.ts        # Parses goals.md with step awareness
│   ├── task-breakdown.ts       # Automatic breakdown of complex tasks
│   ├── task-contractor.ts      # Creates task contracts
│   ├── worker-spawner.ts       # Agent SDK integration, .env copying
│   ├── input-processor.ts      # Parses needs-you.md responses
│   ├── health-checker.ts       # System health validation
│   ├── intelligence/           # Intent classification, strategy selection
│   ├── verifiers/              # Deterministic validation
│   ├── learning/               # Capability confidence updates
│   └── types.ts                # Shared interfaces

├── workspace/                  # Human-editable state
│   ├── constitution.md         # **IMMUTABLE** hard limits
│   ├── goals.md                # P1/P2/P3 work items with steps
│   ├── needs-you.md            # Human interaction interface
│   └── {queue,progress,completed}.md

├── ledgers/                    # Append-only logs (version controlled)
│   ├── work-ledger.jsonl       # Task events
│   ├── capability-ledger.jsonl # Capability results
│   └── executive-{date}.log    # Daily execution logs

├── capabilities/               # YAML capability registries
│   ├── technical-capabilities.yml    # Tool capabilities
│   ├── delivery-capabilities.yml     # End-to-end outcomes
│   └── functional-capabilities.yml   # Cross-cutting capabilities

├── references/                 # External references and POCs
│   ├── poc/                    # Foundational proof-of-concept projects
│   │   ├── chat-cli/           # Agent SDK CLI demo
│   │   ├── agent-sdk-skills-poc/  # Skills integration demo
│   │   └── agent-sdk-subagents-poc/  # Subagent delegation demo
│   └── reference-registry.yaml # Reference tracking
│
├── .claude/skills/             # Claude Code skill documentation
├── verifiers/definitions/      # Verifier YAML configs
├── strategies/prompts/         # Prompt templates
└── ai-docs/                    # PRDs, specs, feature docs
```

## Important Distinctions

**Agent vs Worker:**
- **Agent** = This codebase (executive loop, orchestration)
- **Worker** = Spawned Agent SDK session for a specific task

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
- Worker fails immediately → Check auth tokens in `.env`
- Task marked Blocked → Check `needs-you.md` for details, add human response
- Build fails → Run `npm run typecheck` for detailed errors
- Retry loops → Check `strategy-selector.ts` is picking different strategies
- Verifiers checking wrong directory → Ensure verifiers use `result.output_path`, not `process.cwd()`
- TypeScript errors → Run `npm install` to ensure `@types/node` is installed

## Documentation Locations

- **PRD:** `ai-docs/v1/init/continuous-executive-agent-v1-prd.md`
- **Constitution:** `workspace/constitution.md`
- **Features:** `ai-docs/features/` (human-interaction, etc.)
- **Claude Code Skills:** `.claude/skills/{skill-name}/SKILL.md`
- **Agent Capabilities:** `capabilities/*.yml`

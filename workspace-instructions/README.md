# Workspace Instructions

How the `workspace/` directory drives the autonomous agent's goal lifecycle.

`workspace/` is the AI agent's source of truth for goals, state, and human interaction. It is currently **gitignored** until we complete our cloud migration (e.g., Supabase/Notion backend), at which point workspace state will be persisted externally. This `workspace-instructions/` folder is the **tracked, canonical reference** for workspace structure, templates, and field definitions.

## Goal Bundle Lifecycle

```
workspace/drafts/       --> Author writes PROMPT.md here
workspace/ondeck/       --> goal-scanner auto-promotes by priority
workspace/in-progress/P{0-4}/  --> Executive loop picks up and executes
workspace/completed/    --> Finished work (permanent record)
```

Goals move through these directories automatically. Each goal is a **directory** (named after the slug) containing at minimum a `PROMPT.md`.

## Per-Bundle File Structure

```
my-goal/
  PROMPT.md          # Goal definition (YAML frontmatter + markdown body) -- REQUIRED
  STEPS.json         # Machine-readable step tracking (auto-generated for complex goals)
  CONTRACTS.jsonl    # Contract events: started, completed, failed, blocked
  PROGRESS_LOG.md    # Append-only human-readable timeline
  step-N-handoff.md  # Per-step handoff context between iterations
  references/        # Optional: example code, patterns, docs for the agent
  requirements/      # Optional: detailed technical requirements
```

## PROMPT.md Frontmatter Reference

Every goal's `PROMPT.md` starts with YAML frontmatter between `---` delimiters. Fields marked **(required)** must be present; others are optional.

### Core Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | **yes** | `"Untitled"` | Human-readable goal name. Special prefixes: `[SELF-ENHANCE]` routes to agent codebase, `[SKILL-BUILD]` routes to skill builder. |
| `slug` | string | **yes** | `"untitled"` | URL-safe identifier. Used as directory name and for cross-references. |
| `priority` | enum | **yes** | `P4` | Execution order. Higher priority = picked first. |
| `status` | enum | **yes** | `pending` | Current lifecycle state. |
| `complexity` | enum | no | _(none)_ | Informational hint for breakdown heuristics. |
| `created` | string | no | _(none)_ | ISO 8601 date (e.g., `"2026-04-05"`). |
| `tags` | string[] | no | `[]` | Categorization labels. |

### Execution Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `execution_pattern` | enum | `plan-then-execute` | How the worker approaches the task. |
| `max_turns` | integer | `200` | Max agent turns per step. Set `500` for Playwright/complex tasks. |
| `worker_vendor` | enum | `claude` | Which LLM vendor executes the work. |
| `output_path` | string | _(auto-set)_ | Directory where worker writes output. Set by worker on first execution. |
| `branch` | string | _(none)_ | Git branch for self-enhancement/skill-build goals. |
| `source_project` | string | _(none)_ | Slug of an existing project to copy as starting point. |

### Field Value Reference

#### `status` (multiple choice)

| Value | Meaning |
|-------|---------|
| `pending` | Ready to be picked up. Default for new goals. |
| `in_progress` | Currently being executed by a worker. |
| `blocked` | Waiting on human input (see `needs-you.md`). Stays in `in-progress/P{n}/`. |
| `complete` | Finished and validated. Moved to `completed/`. |

#### `priority`

| Value | Meaning |
|-------|---------|
| `P0` | Critical / immediate. Always picked first. |
| `P1` | High priority. |
| `P2` | Normal priority. |
| `P3` | Default for queue-ingested items. |
| `P4` | Low priority / backlog. Fallback default. |

#### `complexity`

| Value | Meaning | Auto-breakdown? |
|-------|---------|-----------------|
| `low` | Simple task, ~50 turns | No |
| `medium` | Multi-component, ~100-200 turns | Maybe (if >100 estimated turns) |
| `high` | Large project, 200+ turns | Yes (split into 2-5 steps) |

The `BREAKDOWN_THRESHOLD_TURNS` env var controls the auto-breakdown cutoff (default: `100`).

#### `execution_pattern`

| Value | Behavior |
|-------|----------|
| `plan-then-execute` | **Default.** Research/plan phase, then build phase. Best for most tasks. |
| `loop-until-progress` | Keep iterating while making forward progress. Good for exploratory/incremental work. |
| `plan-mode` | Read-only tools only. For research, analysis, architecture planning. |
| `deterministic-pipeline` | Fixed step sequence. For well-defined multi-stage pipelines. |

**Resolution precedence:** PROMPT.md `execution_pattern` > playbook match > system default (`plan-then-execute`).

#### `worker_vendor`

| Value | Provider | Auth |
|-------|----------|------|
| `claude` | Claude Agent SDK | `CLAUDE_CODE_OAUTH_TOKEN` |
| `codex` | OpenAI Codex SDK | `codex login` (ChatGPT session) |
| `kimi` | Kimi wire or CLI | `kimi login` (CLI session) |
| `kimi-cli` | Kimi CLI mode | `kimi login` |
| `kimi-wire` | Kimi wire SDK | `kimi login` |

**Per-goal override:** Set `worker_vendor` in frontmatter. Otherwise falls back to `WORKER_VENDOR` env, then `claude`.

## Special Workspace Files

| File | Purpose |
|------|---------|
| `constitution.md` | **IMMUTABLE** hard limits. NEVER auto-modify. |
| `needs-you.md` | Human-agent async interaction. Agent writes questions, human responds with tags: `[APPROVED]`, `[DECISION]`, `[INFO]`, `[SKIP]`. |
| `queue.md` | Quick-add items. Ingested as P3 draft bundles by `queue-processor.ts`. |
| `goals.md` | Auto-generated index from goal bundles (also legacy fallback). |
| `preferences.md` | Learned conventions (code style, anti-patterns). |
| `project-registry.yml` | Completed projects available for reuse via `source_project`. |
| `self-improvement-state.json` | Practice/retrospective timestamps. |

## Template

See `_TEMPLATE/` in this directory for the canonical goal bundle template with all fields documented inline.

To create a new goal:
1. Copy `workspace-instructions/_TEMPLATE/` to `workspace/drafts/your-goal-slug/`
2. Fill in `PROMPT.md` frontmatter and body
3. Add any references/requirements files
4. The goal-scanner will auto-promote it to `ondeck/` then `in-progress/`

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
| `build_target` | enum | `worktree` | Where build output lands: `worktree`, `existing`, or legacy `monorepo`. |
| `target_dir` | string | _(none)_ | Required when `build_target: existing`; local directory to build in. |
| `target_branch` | string | _(auto)_ | Optional branch hint for worktree creation (`proj/<slug>` if omitted). |
| `max_turns` | integer | `200` | Max agent turns per step. Set `500` for Playwright/complex tasks. |
| `worker_vendor` | enum | `claude` | Which LLM vendor executes the work. |
| `output_path` | string | _(auto-set)_ | Directory where worker writes output. Set by worker on first execution. |
| `branch` | string | _(none)_ | Git branch for self-enhancement/skill-build goals. |
| `source_project` | string | _(none)_ | Slug of an existing project to copy as starting point. |

### User-Journey Fields (v2.1.7) — required for UI goals

These came out of the B2B postal-checkout retro (`ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout.md`). Without them the executive refuses to start UI goals (and should — the postal run shipped 32 steps of undemoable product because none of these were declared).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `definition_of_done_journey` | string | **yes for UI goals** | A concrete literal user flow the final state must execute end-to-end. NOT a checklist, NOT a vague goal. Example: `"Fill shipment form → submit → rates page loads quote from real API → select → payment → confirm → reference number displayed and persisted in Supabase"`. The integration validator (Phase 5b) asserts against this. |
| `data_requirements` | string | **yes for data-backed goals** | What data must exist before the UI can demo. Names the persistence layer (cloud service, not local), tables, and seed rows. Example: `"Cloud Supabase (see .env.app APP_SUPABASE_*); tables shipments/rates/payments; seed shipments with ids 1..3 so the rates page renders with real data"`. Triggers breakdown Pass A (prerequisite seed step). |
| `integration_gate_cadence` | integer | no | Override the automatic `[GATE]` integration checkpoint cadence in breakdown Pass B. Default auto (clamped 3–8 based on total step count). Lower = more journey gates. |

**Why these are load-bearing:**
- Breakdown Pass A reads `data_requirements` to prepend a locked `[PREREQUISITE]` step (schema + seed + API smoke) so no UI step starts with an empty DB.
- Breakdown Pass B inserts `[GATE]` steps every N build steps to extend `tests/e2e/journey.spec.ts`.
- Phase 5b runs an integration validator on every gate/user-visible step; if it flags "beautiful pieces, broken whole," it files a defect subtask that runs depth-first before the next sibling.
- Workers see `definition_of_done_journey` verbatim in their prompt so every step knows the flow it contributes to.

## Input Quality Rules (lessons from 2026-04-05 postal-checkout retro)

Treat the input PROMPT.md as part of the harness. The agent can only build what the input actually describes. These rules apply especially to web/UI goals:

1. **Declare the real user journey literally.** "B2B checkout flow" is not a journey; a step-by-step sentence of what a human would click, with the data that flows between steps, is. Write it in `definition_of_done_journey`.
2. **Name the persistence layer concretely, and cloud-first.** If the goal uses Supabase, say "cloud Supabase via `.env.app` (`APP_SUPABASE_URL`, `APP_SUPABASE_ANON_KEY`, `APP_SUPABASE_SERVICE_ROLE_KEY`)." Never say "Supabase (local or hosted)." Never let Open Questions contain "local vs hosted?" — decide it in the input. The postal run wasted cycles on a `supabase start` that never worked and then silently fell back to localStorage.
3. **No localStorage fallbacks when a DB is declared.** Add an explicit constraint: "Do not persist wizard state in localStorage. The declared persistence layer is authoritative."
4. **Seed data is a deliverable, not a footnote.** If the flow needs rows to render, write `data_requirements` naming the exact tables and ID ranges. Breakdown Pass A turns this into a locked first step.
5. **Definition of Done is a journey, not a checklist.** Lists like "Step 1 renders", "Step 2 renders", … are how the postal run produced 6 unconnected pages. Replace them with one sentence describing the full flow (see field above).
6. **Forbid hardcoded mock data in checkout-style flows.** Add it to Constraints: "Components must read from the declared persistence layer, not in-file mock arrays."
7. **Journey test is mandatory and append-only.** Require `tests/e2e/journey.spec.ts` and say each step adds one block covering its segment. The `journey_spec_grows` verifier enforces this.
8. **Pick a worker vendor deliberately.** `worker_vendor: kimi` made sense when the goal WAS "test kimi." For goals whose success criterion is a shippable product, default to `claude` unless you have a specific reason. The postal run was both a Kimi showcase AND a checkout test, and neither succeeded cleanly.
9. **Resolve Open Questions before promoting to ondeck.** Any unresolved "should we …?" in Open Questions is an input quality defect — the agent will guess, and guesses compound across 30+ steps.
10. **Name a dedicated DB schema/namespace when the DB is shared.** The cloud Supabase project in `.env.app` is shared across every goal that uses `APP_SUPABASE_*`. Never let a new goal put tables in `public` — collisions with prior goals' data are a guaranteed failure mode. Always declare a dedicated Postgres schema in `data_requirements` (e.g., `postal_v2`, `finance_dashboard`, `analytics_v3`) and require the worker to `DROP SCHEMA IF EXISTS <name> CASCADE; CREATE SCHEMA <name>;` as its Step 0. This is the only destructive DDL permitted, and it's scoped so it cannot touch other goals' tables. Configure Supabase clients with `db: { schema: '<name>' }` so REST queries hit the right namespace. The 2026-04-11 audit of the postal-checkout re-run caught three prior projects in `public` that would have collided with `supabase db push`.

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

#### `build_target`

| Value | Behavior |
|-------|----------|
| `worktree` | **Default.** Creates/uses a git worktree in `~/dev/ai-sandbox-v2-worktrees/<slug>/` from `~/dev/ai-sandbox-v2`. |
| `existing` | Uses `target_dir` directly (must already exist). No scaffold/copy-in. |
| `monorepo` | Legacy layout under `~/dev/ai-sandbox/projects/...` (backward-compat). |

**Resolution precedence:** PROMPT.md `build_target` > inferred `existing` when `target_dir` is present > default `worktree`.

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

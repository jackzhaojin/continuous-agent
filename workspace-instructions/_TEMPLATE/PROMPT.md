---
title: "[Goal Title]"              # Required. Use [SELF-ENHANCE] or [SKILL-BUILD] prefix for agent-codebase work.
slug: "goal-slug"                  # Required. URL-safe identifier, used as directory name.
priority: P3                       # P0 (critical) | P1 (high) | P2 (normal) | P3 (default) | P4 (backlog)
status: pending                    # pending | in_progress | blocked | complete
complexity: medium                 # low | medium | high (informational, affects auto-breakdown heuristic)
created: "2026-01-01"             # ISO 8601 date
tags: [tag1, tag2]                # Categorization labels
execution_pattern:                 # plan-then-execute (default) | loop-until-progress | plan-mode | deterministic-pipeline
max_turns:                         # Default 200. Set 500 for Playwright/complex. Any positive integer.
worker_vendor:                     # claude (default) | codex | kimi | kimi-cli | kimi-wire
output_path:                       # Auto-set by worker on first execution. Leave blank.
branch:                            # For [SELF-ENHANCE] / [SKILL-BUILD] goals only.
source_project:                    # Slug of existing project to copy as starting point.

# --- v2.3 Unified Build Target ---
# See ai-docs/v2/xxxx-xx-xx-v2.3/harness-build-target-prd.md
build_target:                      # worktree | existing | monorepo (default during v2.3 transition: monorepo)
target_dir:                        # REQUIRED when build_target=existing. Absolute path to an existing project.
target_branch:                     # Optional. worktree: defaults to proj/<slug>. existing/monorepo: explicit branch to check out.

# --- User-Journey fields (REQUIRED for UI goals, see README.md) ---
definition_of_done_journey: >
  [One literal sentence describing the full user flow the final app must execute end-to-end.
   Example: "Open /shipments/new → fill origin/destination → submit → rates page loads a real
   quote from /api/rates → pick carrier → payment → confirm → reference number saved in
   Supabase and visible on /shipments/{id}." NOT a checklist. NOT 'all 6 steps render'.]
data_requirements: >
  [Name the persistence layer (cloud-first), the DEDICATED schema/namespace, and the
   seed rows the UI needs to render. The cloud Supabase project is shared across goals,
   so always pin a dedicated Postgres schema — never `public`. Example:
   "Cloud Supabase via .env.app (APP_SUPABASE_URL / APP_SUPABASE_ANON_KEY /
   APP_SUPABASE_SERVICE_ROLE_KEY). ALL tables live in a dedicated `<goal_slug>_v1`
   schema — never `public`. Step 0 prerequisite authorized to run
   `DROP SCHEMA IF EXISTS <goal_slug>_v1 CASCADE; CREATE SCHEMA <goal_slug>_v1;`
   before applying migrations. Tables: shipments, rates, payments. Seed 3 shipments
   with ids 1..3 so the rates page renders against real data. Supabase clients
   configured with db: { schema: '<goal_slug>_v1' }."]
integration_gate_cadence:          # Optional integer override. Default auto (clamped 3–8).
---

## Problem

[Describe what you want to build or change, and why it matters.]

**What success looks like:**
- [Criterion 1]
- [Criterion 2]
- [Criterion 3]

## Project Context

### Language/Stack

- **Language**: [TypeScript, Python, Rust, Go, etc.]
- **Framework**: [React, Next.js, Express, etc.]
- **Build system**: [npm, pip, cargo, etc.]
- **Database**: [Supabase, PostgreSQL, SQLite, etc.]

### Existing Project?

- [ ] **New project** - Building from scratch
- [ ] **Existing project** - Enhancing/modifying

If existing, describe the current state:
```
[Current structure and functionality]
```

## References & Inputs

### Requirements (Optional)

- **Technical specs**: `./requirements/requirements.md`

### Reference Code (Optional)

- **Examples**: `./references/`

## Definition of Done

**User Journey (the real one):** see `definition_of_done_journey` in the frontmatter. That literal sentence is authoritative. If this section contradicts it, the frontmatter wins.

**Build**:
- [ ] Project builds without errors
- [ ] No compiler/linter warnings

**Journey Tests (append-only)**:
- [ ] `tests/e2e/journey.spec.ts` exists and has one `test(...)` block per segment of the declared user journey
- [ ] The full `journey.spec.ts` passes (not just the latest block)
- [ ] Each step extends this file — no step is done if the journey regresses

**Data & Persistence**:
- [ ] The persistence layer declared in `data_requirements` is wired and reachable (cloud credentials in `.env.app`, not local Docker)
- [ ] Seed data from `data_requirements` loads successfully
- [ ] No step persists wizard state in `localStorage` when a DB is declared

**Functionality**:
- [ ] All requirements implemented AND composed into the declared journey (not isolated pages)
- [ ] Edge cases handled

**Code Quality**:
- [ ] Code is readable and follows conventions
- [ ] Git committed with clean status
- [ ] No hardcoded mock data in components that should read from the persistence layer

## Approach

[Describe the technical approach, component structure, key libraries, etc.]

## Constraints

### What the Agent CAN Do

- Write/modify source code files
- Run build and test commands
- Create new files and directories
- Install dependencies
- Read reference documentation

### What the Agent CANNOT Do

- Push to remote repository
- Deploy to production
- Access external services without credentials
- Delete important files without confirmation
- Persist wizard/checkout state in `localStorage` when a real persistence layer is declared in `data_requirements`
- Populate components from hardcoded mock arrays when the declared persistence layer is reachable
- Run `supabase start` / spin up local Docker stacks when cloud credentials are available in `.env.app`
- Mark a step "complete" if the next step in the declared journey cannot read the state this step wrote

## Cloud Services & Credentials

For apps that need external services, the agent uses **`.env.app`** (copied into the project at worker spawn) with the `APP_` prefix stripped. Prefer cloud over local:

| Service | Frontmatter hint | `.env.app` keys (prefix stripped on inject) |
|---------|------------------|---------------------------------------------|
| Supabase (cloud) | `data_requirements: "Cloud Supabase ..."` | `APP_SUPABASE_URL`, `APP_SUPABASE_ANON_KEY`, `APP_SUPABASE_SERVICE_ROLE_KEY` |
| ElevenLabs | _(mention in approach)_ | `APP_ELEVENLABS_API_KEY` |
| Claude Agent SDK (in built apps) | _(mention in approach)_ | `APP_CLAUDE_CODE_OAUTH_TOKEN` |

**Never** tell the worker "use Supabase local or hosted" — pick one, cloud, and say so explicitly. The postal-checkout retro documents what happens when this is left ambiguous.

## Open Questions

- [Question 1 that needs clarification?]
- [Question 2?]

> **Input-quality rule:** Do not promote a goal to `ondeck/` with unresolved Open Questions. The worker will guess, and the guesses compound across dozens of steps.

## Steps

<!-- Optional: Pre-define execution steps for complex goals -->
<!-- The agent auto-generates steps for tasks exceeding the complexity threshold (~100 turns) -->

## Agent Notes

<!-- Accumulated by agent during execution -->

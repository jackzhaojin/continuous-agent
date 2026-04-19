---
name: goal-drafter
description: |
  Draft comprehensive goal bundles for the autonomous agent. Creates PROMPT.md with proper frontmatter, requirements docs, and reference files in workspace/drafts/. Use when: the user describes a project to build, says "create a goal", "draft a goal", "/goal-drafter", or wants to prepare work for the executive loop. This is a human-facing skill for authoring goals before the agent executes them.
---

# Goal Drafter

Draft goal bundles that the executive loop picks up and executes via worker agents. Guide the user through every decision with multiple-choice options.

## Guided Interview Process

Walk the user through these decisions **in order**. Present each as a multiple-choice question. Do not skip ahead or assume answers. Wait for user input at each step before proceeding.

### Step 1: What are we building?

Ask the user to describe the project in their own words. If they point to existing code or specs, read them thoroughly before proceeding.

### Step 2: Complexity assessment

Based on the description, present:

```
How complex is this project?

  (a) Simple — Frontend-only, single page, no database, no API routes
      → Single PROMPT.md, no requirements/ folder, ~100 lines
      → Example: ./references/simple/finance-dashboard-claude/PROMPT.md

  (b) Medium — Fullstack with DB + API + UI, or multi-step flow
      → PROMPT.md + 3-5 requirements docs + references
      → Example: ./references/medium/b2b-postal-checkout/PROMPT.md

  (c) High — Large SaaS app, complex business logic, many pages
      → PROMPT.md + 6-10 requirements docs + references
      → Same structure as medium but more docs
```

### Step 3: Priority

```
What priority?

  (a) P0 — Critical / immediate. Agent picks this up first.
  (b) P1 — High priority.
  (c) P2 — Normal priority. [recommended for most goals]
  (d) P3 — Default queue priority.
  (e) P4 — Backlog / low priority.
```

### Step 4: Worker vendor

```
Which LLM vendor should build this?

  (a) claude  — Claude Agent SDK. Best quality, highest cost.
  (b) codex   — OpenAI Codex SDK. Strong at code generation.
  (c) kimi    — Kimi K2.5 (wire mode). Good balance of quality and speed.
  (d) kimi-cli — Kimi K2.5 (CLI mode). Simpler, cleaner logs.
  (e) Leave blank — Use system default (currently: claude)
```

### Step 5: Execution pattern

```
How should the worker approach this?

  (a) plan-then-execute — [default] Research/plan first, then build.
      Best for most tasks.
  (b) loop-until-progress — Keep iterating while making forward progress.
      Good for incremental/exploratory work.
  (c) plan-mode — Read-only. For research and analysis only.
  (d) deterministic-pipeline — Fixed step sequence.
      For well-defined multi-stage builds.
```

### Step 6: Max turns

```
How many turns per step?

  (a) 200 — Standard. Good for simple goals.
  (b) 300 — Extended. Good for medium goals.
  (c) 500 — Large. For complex goals, Playwright testing, fullstack.
  (d) Custom — Enter a number.
```

### Step 7: Tech stack

Ask the user to confirm or specify:
- Language (TypeScript, Python, Rust, Go, etc.)
- Framework (React, Next.js, Express, etc.)
- Database (Supabase, PostgreSQL, SQLite, none)
- Build system (npm, pip, cargo, etc.)
- Any key libraries

### Step 8: Existing code or references?

```
Are there existing codebases to reference?

  (a) No — Building from scratch
  (b) Yes — Point me to the path(s) and I'll reverse-engineer requirements
  (c) source_project — Copy from a completed project in project-registry.yml
```

If (b): Read ALL referenced code thoroughly. Extract every feature, field, validation rule, business rule, data model, API endpoint, component, and algorithm. See "When Referencing Existing Code" below.

### Step 9: Confirm and generate

Summarize all choices in a table and ask for confirmation before writing files:

```
Goal Summary:
  Title:             B2B Postal Checkout Flow
  Slug:              2026-04-19-b2b-postal-checkout    ← ALWAYS prefix with today's YYYY-MM-DD
  Priority:          P2
  Complexity:        High (6-10 requirements docs)
  Worker:            kimi
  Pattern:           plan-then-execute
  Max turns:         500
  Stack:             Next.js 15, Supabase, Tailwind, shadcn/ui
  Source project:    (none)

Proceed? (y/n)
```

**Slug rule (MANDATORY):** Always prefix the slug with today's date in `YYYY-MM-DD-` form before the descriptive part. Use the actual calendar date of drafting (from the system clock, not made-up). `hello-react` → `2026-04-19-hello-react`. This scales across dozens of generated projects — without the date prefix, finding the fifth recipe-book build in a long `workspace/completed/` list is a nightmare. The bundle directory name MUST match the slug, so the directory also carries the date.

## Output Location

All output goes to `workspace/drafts/<slug>/`.

## Bundle Structure

**Simple goals** (complexity: low):
```
workspace/drafts/<slug>/
  PROMPT.md          # Everything in one file
```

**Medium/High goals** (complexity: medium or high):
```
workspace/drafts/<slug>/
  PROMPT.md                          # Main goal (references requirement docs)
  requirements/
    01-overview.md                   # Overview & user journey
    02-data-models.md                # Database schema / data structures
    03-api-endpoints.md              # API route specs
    04-business-logic.md             # Core business rules & algorithms
    05-components.md                 # UI component specs
    06-design-system.md              # Styling, colors, typography
    ...additional as needed...
  references/
    architecture.md                  # Architecture decisions
    tech-stack.md                    # Technology choices & setup commands
```

## PROMPT.md Frontmatter

Full field reference: `workspace-instructions/README.md`

```yaml
---
title: "[from interview]"
slug: "YYYY-MM-DD-[derived-from-title]"   # REQUIRED: today's date prefix (see Step 9 slug rule)
priority: P2                           # From Step 3
status: pending                        # Always 'pending' for drafts
complexity: medium                     # From Step 2
created: "YYYY-MM-DD"                 # Today's date
tags: [relevant, tags]
execution_pattern: plan-then-execute   # From Step 5
max_turns: 500                         # From Step 6
worker_vendor:                         # From Step 4
output_path:                           # Leave blank
branch:                                # Leave blank (unless [SELF-ENHANCE])
source_project:                        # From Step 8c if applicable
---
```

## Requirements Quality Standards

**Be thorough.** Requirements are the worker's primary input. A worker that doesn't understand what to build will fail.

1. **Specificity**: Name exact fields, types, validation rules, error messages
2. **Completeness**: Every page, API endpoint, component documented
3. **Structure**: Tables for fields, code blocks for schemas, hierarchical headers
4. **Testability**: Every requirement verifiable ("POST /api/x returns 201")
5. **Cross-references**: Link between docs ("See 08-payment-methods.md")

Avoid: vague language, skipping "obvious" features, mixing concerns across docs, requirements without acceptance criteria.

## When Referencing Existing Code

If the user provides codebases:

1. Read ALL relevant files (don't skim)
2. Extract every feature, field, validation rule, business rule
3. Document complete data model (every table, column, relationship)
4. Document every API endpoint with request/response schemas
5. Document every UI component and its behavior
6. Document all business logic algorithms
7. Note what to keep vs change for new implementation

Goal: a **complete discovery packet** — thorough enough that a worker who has never seen the reference code can build from requirements alone.

## References

Real goal bundles at two complexity levels. Read before drafting to calibrate output.

- **Simple**: `./references/simple/finance-dashboard-{claude,codex,kimi-cli}/PROMPT.md`
- **Medium**: `./references/medium/b2b-postal-checkout/` (PROMPT.md + 9 requirement docs + 2 reference docs)

## Final Checklist

After generating all files, verify:

- [ ] PROMPT.md frontmatter has all required fields filled
- [ ] **Slug is prefixed with today's `YYYY-MM-DD-`** and the bundle directory name matches the slug
- [ ] `created:` matches the date prefix embedded in the slug
- [ ] `status: pending` (always for drafts)
- [ ] `output_path` and `branch` are blank
- [ ] Requirements docs exist for medium/high complexity
- [ ] Every requirement is specific and testable
- [ ] List all files with line counts for user review

---
paths:
  - "ai-docs/**"
---

# AI Docs

`ai-docs/` is the planning, accountability, and incremental improvement history for the agent system. It is written and read primarily by AI (with human review), and provides traceability from "why did we build this?" to "did it work?" across versions.

## Directory Structure

```
ai-docs/
└── v2/
    ├── 2026-04-01-v2.1/           # Shipped version — date is release date
    │   ├── goal-2.1.6.md          # Goal doc for a specific release
    │   ├── retro-*.md             # Retrospectives after real runs
    │   └── prompt-log-*.md        # Session logs of human+AI collaboration
    ├── xxxx-xx-xx-v2.3/           # Planned version — date TBD
    │   └── goal.md                # Goal doc (what this version will deliver)
    └── ...
```

## Document Types

### Goal docs (`goal*.md`)

Define what a version or sub-release will deliver. Written before or during implementation.

- **Purpose:** Scope, success criteria, key files affected, open questions
- **Naming:** `goal.md` for the version's primary goal, `goal-X.Y.Z.md` for sub-releases
- **When to create:** Before starting a version's work
- **When to update:** When scope changes during implementation

### Retrospectives (`retro-*.md`)

Post-run analysis of a real execution. The most important document type — this is where the system learns.

- **Purpose:** What went well, what didn't, root causes, must-fix items for next iteration
- **Naming:** `retro-{goal-slug}.md`, add version suffix if multiple runs of same goal (e.g., `retro-b2b-postal-checkout-v2.1.6.md`)
- **Structure:** Must have clear sections for:
  - What went well (with evidence)
  - What didn't work (with root causes)
  - Must-fix items split by ownership: **Harness/Executive code (H1, H2...)** vs **Goal Input/Skills/Prompts (I1, I2...)**
  - Raw data references (ledger paths, STEPS.json, worker logs)
- **When to create:** After any significant autonomous run completes
- **Who reads these:** The next version's goal doc should reference the previous retro. Self-enhance and skill-build goals should read relevant retros before starting work.

### Prompt logs (`prompt-log-*.md`)

Session-by-session record of human+AI collaboration. Provenance trail.

- **Purpose:** What was discussed, decided, and built in each session
- **Naming:** `prompt-log-{version}.md`
- **When to update:** End of each collaborative session (via `/conversation-logger`)
- **Git rule:** Always commit with related code changes — never leave untracked (see `jack-git-commit` skill rule 3a)

## Conventions

1. **Version directories use release date when shipped** (`2026-04-01-v2.1/`), placeholder `xxxx-xx-xx` when planned
2. **Retrospectives reference specific files** — ledger paths, STEPS.json locations, worker log contract IDs. Don't just say "check the logs."
3. **Must-fix items use H/I numbering** — H for harness/infrastructure code, I for input/skills/prompts. This makes them referenceable ("fix H1 before next run").
4. **Don't duplicate what's in code** — ai-docs captures *why* and *what happened*, not *how it works*. Architecture and implementation details belong in `.claude/rules/` and code comments.
5. **Retros are append-friendly** — if new findings emerge after the initial retro, add a dated section rather than rewriting history.
6. **Goal docs for future versions are living documents** — update them as the previous version's retro reveals what matters most.

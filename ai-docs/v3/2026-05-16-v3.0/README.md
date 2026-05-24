# V3.0 — Second Brain Release · document index

Chronological index of this version's docs (by creation time). The folder name is the
release-work date; files are ordered below by when they were written.

Naming conventions in this folder:
- **Prompt/session logs** follow the `conversation-logger` skill format: `prompt-log-YYYY-MM-DD-{N}-{topic-slug}.md` (N = zero-based within-day sequence).
- **Other dated docs** (migration records, etc.) use `YYYY-MM-DD-{N}-{topic}.md`.
- The three **load-bearing spec anchors** (goal, hosting-decision, impl-plan) keep their
  original names on purpose — they're referenced across the repo *and* inside the mem0
  second brain (`metadata.source` paths), so renaming them would break resolution. Their
  creation dates are in the table below for chronology.

| # | Date | File | What it is |
|---|------|------|------------|
| 1 | 2026-04-03 | [`goal.md`](goal.md) | **Anchor.** V3.0 goal — the second-brain vision, scope, success criteria, pre-implementation hosting gate. |
| 2 | 2026-05-15 | [`second-brain-hosting-decision.md`](second-brain-hosting-decision.md) | **Anchor.** Hosting decision record — mem0 cloud, the 4 locked pillars, read/write contract, failure modes. |
| 3 | 2026-05-16 | [`prompt-log-2026-05-16-0-poc.md`](prompt-log-2026-05-16-0-poc.md) | Session log — the mem0 POC (does it work?), READMEs, exec summaries. |
| 4 | 2026-05-16 | [`implementation-plan-1-agentic-memory.md`](implementation-plan-1-agentic-memory.md) | **Anchor.** Implementation plan — 5 hooks, run-hook glue, staged rollout, file-by-file. |
| 5 | 2026-05-16 | [`prompt-log-2026-05-16-1-taxonomy.md`](prompt-log-2026-05-16-1-taxonomy.md) | Session log — taxonomy v1.0.0 design + agentic structure. |
| 6 | 2026-05-24 | [`2026-05-24-1-migration-corpus-backfill.md`](2026-05-24-1-migration-corpus-backfill.md) | Migration record — the corpus backfill into mem0 (why/what/how + source→destination trace). |

> True 2026-05-16 order: prompt-log-0-poc → implementation-plan (anchor, unprefixed) → prompt-log-1-taxonomy. The prompt logs keep their original 0/1 stage numbers under the new `prompt-log-` prefix.

## Not docs
- `mem0-snapshots/` — versioned JSON backups of the mem0 store (written/read by the
  `memory-snapshot` skill + 04:00 cron). Date-named data, not prose; left unprefixed.

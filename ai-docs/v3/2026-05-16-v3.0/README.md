# V3.0 — The Second Brain Release

This is the release where the harness got a **memory**. Before V3.0, the agent's
operational history lived in scattered JSONL ledgers, markdown retros, and ad-hoc logs —
useful traces, but not a memory system any agent could *trust* or *query*. V3.0 turns
that history into a coherent **second brain**: a cloud-hosted, searchable knowledge store
the executive agent writes to as it works and reads from before it acts.

The folder name (`2026-05-16-v3.0`) is the release-work date. Individual docs carry their
own creation dates as `YYYY-MM-DD-` filename prefixes, so the directory reads top-to-bottom
as the story actually unfolded — **sequence is the point here.**

---

## The arc — how this release happened

**1 · The vision (2026-04-03 → 04-19).** It started as a v2.3 "migrate ledgers & state to
a cloud database" goal and evolved into something bigger: not just *store* history, but make
it a **second brain** — searchable by goal/capability/incident, accurate enough to plan
against, linkable across artifacts, and useful to *agents*, not just humans. Positioned
2026-04-19 as the second-brain release (with V3.1 to layer observability on top).
→ [`2026-04-03-goal.md`](2026-04-03-goal.md)

**2 · The "how" gate (2026-05-15).** The goal forbade implementation until a hosting
decision was written. The answer: **mem0 cloud** as the store, **git + markdown as the
canonical source of truth** (mem0 is a rebuildable projection), and four locked pillars —
(1) **executive-tier only** (workers never touch mem0), (2) **pre-search + inject** (the
executive bakes a "memory pack" into each worker's CLAUDE.md), (3) **skills-first, not a TS
module** (the contract lives in markdown; plumbing is a packaged sidecar), (4) **versioned
schema + per-side editorial playbooks**.
→ [`2026-05-15-second-brain-hosting-decision.md`](2026-05-15-second-brain-hosting-decision.md)

**3 · Does it even work? (2026-05-16).** A mem0 POC — add/search/async-write behavior,
graph vs. vanilla, the limitations the CLI would later paper over.
→ [`prompt-log-2026-05-16-0-poc.md`](prompt-log-2026-05-16-0-poc.md)

**4 · The build plan (2026-05-16).** Five lifecycle hooks (A–E) wired into the executive
loop, the `run-hook` glue, and a **staged rollout** — one hook per week with audit gates,
because we had zero data on whether the playbooks would produce useful memories.
→ [`2026-05-16-implementation-plan-1-agentic-memory.md`](2026-05-16-implementation-plan-1-agentic-memory.md)

**5 · The taxonomy (2026-05-16).** Five memory types — `principle`, `semantic`,
`procedural`, `episodic`, `reflective` — taxonomy v1.0.0, the 4-field ID convention, and a
validator that rejects malformed writes before mem0 sees them.
→ [`prompt-log-2026-05-16-1-taxonomy.md`](prompt-log-2026-05-16-1-taxonomy.md)

**6 · Wiring it in (2026-05-23 → 05-24).** mem0 MCP set up as the human/ad-hoc tool, then
the agentic skills (`memory-harvester` / `memory-reader`) and the unified `./bin/mem0` CLI
integrated into the codebase — and the existing local corpus **backfilled** into mem0 so the
brain didn't start empty.
→ [`prompt-log-2026-05-23-0-mem0-mcp-setup.md`](prompt-log-2026-05-23-0-mem0-mcp-setup.md)
· [`prompt-log-2026-05-24-0-codebase-integration-and-backfill.md`](prompt-log-2026-05-24-0-codebase-integration-and-backfill.md)
· [`2026-05-24-1-migration-corpus-backfill.md`](2026-05-24-1-migration-corpus-backfill.md)

**7 · Going live — the milestone (2026-05-30).** The full **read → pack → execute → write**
loop ran end-to-end for the first time. Two sessions in one day:
- *Storage & retrieval review + diagrams* — walked the agentic storage/retrieval paths,
  flipped Stage-1 on, and found the bug that mattered: an **empty-string `V3_MEM0_COHORT`**
  was silently failing **every** write (dotenv loads `""`, the validator rejects it, the
  hook still logged "ok"). Root-caused and fixed.
  → [`prompt-log-2026-05-30-0-agentic-storage-retrieval-review-diagrams.md`](prompt-log-2026-05-30-0-agentic-storage-retrieval-review-diagrams.md)
- *Making retrieval genuinely agentic* — watching the live mem0 request log, the reader was
  emitting short **keyword-bag** queries (`"npm install build first try clean success"`) that
  embed weakly. Reframed `memory-reader` from a fixed query checklist into an **agentic,
  natural-language judgment task**: the executive decides what memory serves *this* goal and
  asks for it in full sentences. Verified E2E — Hook B's pack correctly told a worker to mimic
  a prior run's module pattern and not push per the constitution.
  → [`prompt-log-2026-05-30-1-agentic-retrieval-natural-language-search.md`](prompt-log-2026-05-30-1-agentic-retrieval-natural-language-search.md)

---

## Document index (chronological)

| # | Date | File | What it is |
|---|------|------|------------|
| 1 | 2026-04-03 | [`2026-04-03-goal.md`](2026-04-03-goal.md) | **Anchor.** V3.0 goal — the second-brain vision, scope, success criteria, pre-implementation hosting gate. (Lineage traces to the v2.3 cloud-migration goal; second-brain positioning locked 2026-04-19.) |
| 2 | 2026-05-15 | [`2026-05-15-second-brain-hosting-decision.md`](2026-05-15-second-brain-hosting-decision.md) | **Anchor.** Hosting decision record — mem0 cloud, the 4 locked pillars, read/write contract, failure modes. |
| 3 | 2026-05-16 | [`prompt-log-2026-05-16-0-poc.md`](prompt-log-2026-05-16-0-poc.md) | Session log — the mem0 POC (does it work?), READMEs, exec summaries. |
| 4 | 2026-05-16 | [`2026-05-16-implementation-plan-1-agentic-memory.md`](2026-05-16-implementation-plan-1-agentic-memory.md) | **Anchor.** Implementation plan — 5 hooks, run-hook glue, staged rollout, file-by-file. |
| 5 | 2026-05-16 | [`prompt-log-2026-05-16-1-taxonomy.md`](prompt-log-2026-05-16-1-taxonomy.md) | Session log — taxonomy v1.0.0 design + agentic structure. |
| 6 | 2026-05-23 | [`prompt-log-2026-05-23-0-mem0-mcp-setup.md`](prompt-log-2026-05-23-0-mem0-mcp-setup.md) | Session log — mem0 MCP server setup (the human/ad-hoc tool). |
| 7 | 2026-05-24 | [`prompt-log-2026-05-24-0-codebase-integration-and-backfill.md`](prompt-log-2026-05-24-0-codebase-integration-and-backfill.md) | Session log — integrating the skills + CLI into the codebase; corpus backfill. |
| 8 | 2026-05-24 | [`2026-05-24-1-migration-corpus-backfill.md`](2026-05-24-1-migration-corpus-backfill.md) | Migration record — local corpus → mem0 (why/what/how + source→destination trace). |
| 9 | 2026-05-30 | [`prompt-log-2026-05-30-0-agentic-storage-retrieval-review-diagrams.md`](prompt-log-2026-05-30-0-agentic-storage-retrieval-review-diagrams.md) | Session log — storage/retrieval review, Stage-1 go-live, the empty-cohort write bug. |
| 10 | 2026-05-30 | [`prompt-log-2026-05-30-1-agentic-retrieval-natural-language-search.md`](prompt-log-2026-05-30-1-agentic-retrieval-natural-language-search.md) | Session log — making retrieval natural-language + genuinely agentic. |

> True 2026-05-16 order: `prompt-log-0-poc` → implementation-plan → `prompt-log-1-taxonomy`.

## Naming conventions in this folder

- **All docs are prefixed `YYYY-MM-DD-`** by git initial-creation date, so the folder sorts
  chronologically and the sequence is legible at a glance.
- **Prompt/session logs** keep the `conversation-logger` format on top of that prefix:
  `prompt-log-YYYY-MM-DD-{N}-{topic-slug}.md` (N = zero-based within-day sequence).
- **Other dated docs** (migration records, etc.) use `YYYY-MM-DD-{N}-{topic}.md`.

### ⚠ Anchor rename note (2026-05-31)

The three load-bearing anchors (goal, hosting-decision, impl-plan) were **renamed** from
their original bare names to date-prefixed names on 2026-05-31 for chronological consistency.
All **repo references** (runtime skills, `mem0-cli.ts`, cross-doc links, frontmatter) were
updated. **However:** memories already written to the live mem0 store carry the *old*
`metadata.source` paths (e.g. `…/second-brain-hosting-decision.md`), and historical records
that document what was stamped — namely the `2026-05-24-1-migration-corpus-backfill.md`
source table and verbatim quotes in the 05-16 prompt logs — were **left as-is** on purpose
(they're append-only history). So `metadata.source` on pre-2026-05-31 memories is expected to
drift from the on-disk filenames. mem0 is a rebuildable projection of the git source of
truth, so a future re-backfill would re-stamp the new paths.

## Not docs
- `../mem0-snapshots/` — versioned JSON backups of the mem0 store (written/read by the
  `memory-snapshot` skill + 04:00 cron). Date-named data, not prose; left unprefixed.

## Current status (as of 2026-05-31)

The second brain is **live**. The full read→pack→execute→write loop is validated end-to-end.
Hook config: **C** (post-run harvest), **B** (pre-spawn pack), **D** (failure-diagnosis), and
**E** (post-retro harvest) are ON; **A** (pre-work-selection) is OFF until its synthesis
actually biases work selection (it's currently audit-only and costs ~8–14 retrievals/spawn).
Store size ≈ 134 memories. Retrieval is natural-language and agentic. The binding constraint
is the mem0 Hobby plan's 1K/month retrieval budget — read hooks are the expensive side.

# Backfill Playbook — migrating the existing local corpus into mem0

> **Trigger: `manual-harvest`.** This is the operator-initiated, one-time-ish sweep that distills the *existing* repo corpus into the second brain. It complements `playbook.md` (the forward, event-driven side). Read `taxonomy.md` + `playbook.md` first; this doc only adds the bucket→type map and the distill-vs-dump rules.
>
> **Guiding intent (operator, 2026-05-24):** *every valuable bucket should be captured in mem0 eventually.* "Captured" means **distilled into findable memories**, NOT mirrored byte-for-byte. The repo stays canonical; mem0 is the derived projection. Nothing below licenses dumping raw files.

---

## The three dispositions

Every local artifact falls into exactly one:

1. **HARVEST NOW** — durable knowledge. Distill into `principle / semantic / procedural / episodic / reflective` per the taxonomy.
2. **DISTILL LATER** — verbose raw streams that *contain* knowledge but can't be dumped. Captured as periodic *summary* memories in a later phase, never line-by-line.
3. **NEVER** — transient live-state (a snapshot of "right now," constantly overwritten) or generated artifacts. Not history; capturing them is meaningless. They stay local.

The test for NEVER vs HARVEST: *"If I deleted this file and regenerated it next loop, would anything be lost?"* If no (it's live state) → NEVER. If yes (it's a record of something that happened) → HARVEST or DISTILL.

---

## Bucket → disposition map

| Bucket | Disposition | Memory type(s) | `app_id` | `run_id` pattern | Notes |
|---|---|---|---|---|---|
| `workspace/constitution.md` | **HARVEST NOW** | principle (immutable) | `_global` | `YYYY-MM-DD-spec-constitution` | One per hard limit / article. critical importance. |
| `ai-docs/v3/**` spec docs (hosting-decision, goal, impl-plan) | **HARVEST NOW** | principle + reflective | `_global` | `YYYY-MM-DD-spec-<slug>` | One principle per locked pillar; reflective for design rationale. |
| `ai-docs/v2/**/retro-*.md` (3) | **HARVEST NOW** | reflective / semantic / procedural | `_global` or bundle | `YYYY-MM-DD-retro-<slug>` | Follow `playbook.md` post-retro tree. |
| `learning/retrospectives/*.md` (13) | **HARVEST NOW** | reflective / semantic / procedural | `_global` or bundle | `YYYY-MM-DD-retro-<slug>` | Densest source. ~3–6 memories each, skip restatements. |
| `learning/evolution-log.jsonl` | **HARVEST NOW** | reflective / semantic | `_executive` | `YYYY-MM-DD-manual-evolution-log` | Distill notable evolution events, not every line. |
| `learning/*comparison*.md` | **HARVEST NOW** | semantic | bundle or `_global` | `YYYY-MM-DD-manual-<topic>` | Vendor/approach comparisons → semantic facts. |
| `capabilities/*.yml` (6 registries) | **HARVEST NOW** ⚠ | semantic | `_global` (or `_skill-<slug>`) | `YYYY-MM-DD-manual-capabilities` | **Mutability caveat:** YAML is live (confidence/maturity change). Harvest only `maturity: Demonstrated` (or high-confidence) as a *point-in-time* snapshot; stamp `tags:["capability-snapshot"]` + `expires_at` ~90d. YAML stays source of truth. |
| `workspace/completed/` bundles (44) | **HARVEST NOW** | episodic | `<bundle-slug>` | `YYYY-MM-DD-<bundle-slug>` | One episodic per finished project; cross-ref ledger outcome (success/fail), vendor, step count. `actor: worker` + `worker_vendor`. |
| `workspace/preferences.md` | **HARVEST NOW** | principle / semantic | `_global` | `YYYY-MM-DD-manual-preferences` | Operator preferences → durable. |
| `workspace/project-registry.yml` | index only | — | — | — | Use to resolve bundle slugs/outcomes; not its own memories. |
| `ledgers/*.jsonl` (work/capability/retro/inputs) | index only | — | — | — | Cross-reference for episodic outcomes; not converted wholesale. |
| **`ledgers/*.log` (264M raw)** | **DISTILL LATER** | episodic / reflective (summaries) | `_executive` | `YYYY-MM-DD-manual-loghistory-<period>` | Phase 2. Summarize per week/incident ("week of X: N runs, M fails, notable: …"), never raw lines. The .log files may be compressed/cold-archived after. |
| `reports/dashboard.html`, `*-data.json` | **NEVER** | — | — | — | Generated render artifacts. |
| `workspace/progress.md`, `needs-you.md`, `queue.md`, `completed.md`*, `*-state.json` | **NEVER** | — | — | — | Transient live-state. *(`completed.md` is a rolling index of the bundles — harvest the *bundles*, not this file.)* |

---

## Initial migration scope (this run)

**Phase 1 (now):** all **HARVEST NOW** buckets → ~150–200 memories. Lanes:

- **Lane A — principles:** constitution + `ai-docs/v3` pillars + preferences
- **Lane B — retros:** 13 `learning/retrospectives` + 3 `ai-docs` retros + evolution-log + comparison
- **Lane C — capabilities:** `capabilities/*.yml` Demonstrated subset (snapshot, expiring)
- **Lane D — episodic:** 44 completed bundles (cross-ref ledgers)

**Phase 2 (deferred):** raw-log distillation (DISTILL LATER bucket). Tracked, not run now.

---

## Backfill-specific authoring rules

1. **`trigger: "manual-harvest"`, `actor`** = `human` for authored docs (retros, specs, constitution, preferences), `worker` (+`worker_vendor`) for run/bundle episodics.
2. **`env`** = `prod` (these are real). Never `test`.
3. **`source`** = the real repo-relative path read. Never invent.
4. **De-dupe across lanes** — a lesson in both a retro and a completed bundle gets ONE memory (prefer the retro's reflective framing). Lane D should `mem0 search` the scope before writing an episodic to avoid colliding with Lane B.
5. **Respect the soft ceiling** — if a single retro is generating >6 memories, you're restating it. Write pointers, not paraphrases (taxonomy §C, playbook §C gallery).
6. **Batch writes** per source doc via `mem0 add --batch` for durability + fewer event polls.

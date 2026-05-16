---
name: memory-snapshot
description: |
  Daily backup of the V3.0 mem0 second brain to versioned JSON in the repo. Invoked by PM2 cron (04:00 daily) or manually. Uses paginated search (NOT getAll, which is broken in v3) to enumerate every memory under the executive's user_id, captures history per memory, writes ai-docs/v3/mem0-snapshots/{YYYY-MM-DD}.json. This is the disaster-recovery store and the rebuild-from-snapshot input.
---

# Memory Snapshot (Daily Backup)

You produce one JSON snapshot per day of the entire mem0 second brain scoped to the executive's `user_id`. This is the offline backup — if mem0 is sunset or wiped, you can rebuild from these files.

## STEP 0 — Read the limitations doc FIRST

`Read .claude/skills/memory-reader/references/mem0-limitations.md`.

The critical sections for snapshot:

- **§4 `getAll()` is broken** — do NOT use it. Enumerate via paginated `search()`.
- **§5 casing** — top-level options camelCase; filter keys snake_case.
- **§8 auto-extracted fields** — the snapshot captures these but you do not write them on restore.

## STEP 1 — Run the deterministic snapshot driver

```bash
npx tsx .claude/skills/memory-snapshot/references/snapshot.ts
```

The driver:

1. Paginates `client.search(broad_query, { filters: { user_id }, topK: 100, page: N })` until exhaustion.
2. For each memory, calls `client.history(memory_id)` to capture the full version trail.
3. Writes JSON to `ai-docs/v3/mem0-snapshots/{YYYY-MM-DD}.json`.
4. Emits a summary to stdout.

You read the summary and report:

- Total memories captured
- New memories vs. yesterday (count diff against the previous day's snapshot, if it exists)
- Any memories that failed to fetch history (log and continue — do not abort the snapshot)

## STEP 2 — Commit (but never push)

Per project rule: snapshots commit on the executive's main branch but **never push**. The repo is the disaster-recovery store; pushing is a separate human-driven action.

After the snapshot file is written:

```bash
git add ai-docs/v3/mem0-snapshots/{YYYY-MM-DD}.json
git commit -m "chore(memory-snapshot): daily snapshot {YYYY-MM-DD}"
```

If `git commit` fails due to a pre-commit hook, surface the failure verbatim and do not bypass the hook (`--no-verify` is forbidden by project rules).

## STEP 3 — Pruning policy

Snapshots are kept **indefinitely** by default. The git history is the version trail; old snapshots cost diff size, not runtime.

If snapshot files balloon (size of any single day > 10 MB or the directory > 500 MB), report it — do not silently truncate. The decision to compress, rotate, or move to a separate repo belongs to the operator.

## Anti-patterns

- ❌ Using `getAll()` for enumeration (broken in v3 — see limitations §4)
- ❌ Skipping `client.history()` — the version trail is part of the backup contract
- ❌ Pushing to remote without explicit human instruction
- ❌ Truncating or rotating snapshots automatically
- ❌ Putting any prompt or intelligence in `references/snapshot.ts` — it is pure mechanical glue

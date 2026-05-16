---
title: V3.0 Implementation Plan — Agentic Memory Layer
status: Draft (awaiting executive-loop integration approval)
created_on: 2026-05-16
applies_to:
  - ai-docs/v3/2026-05-16-v3.0/goal.md
  - ai-docs/v3/2026-05-16-v3.0/second-brain-hosting-decision.md
related:
  - references/poc/mem0/graph-poc/README.md
  - references/poc/mem0/mcp-poc/README.md
  - ai-docs/v3/2026-05-16-v3.0/prompt-log-0-poc.md
---

# V3.0 Implementation Plan — Agentic Memory Layer

This plan turns the V3.0 second-brain decision into concrete file additions and the smallest possible modification to `executive-loop.ts`. The executive becomes **agentic at memory-decision points** while the rest of the loop stays deterministic (lowest-risk wedge for the V3.0 → V4.0 agentic shift).

## Locked architecture (from 2026-05-16 alignment)

| Question | Choice |
|---|---|
| Agentic scope | Agentic memory loop, deterministic everything else |
| Limitations doc | Dedicated `mem0-limitations.md` reference loaded by every memory skill |
| Write path | Agentic invocation of skill; deterministic plumbing inside `references/` |
| Read path | Agent SDK `query()` + stdio MCP + read-only `allowedTools` at lifecycle hooks |

**Prompting rule (non-negotiable):** all prompts live in markdown files (SKILL.md or `references/*.md`). TypeScript only loads markdown and passes it to `query()` — no inline prompt strings, no template literals containing instructions.

## What the executive actually gains

Today: executive-loop.ts is a deterministic state machine. It has no memory of prior runs beyond reading ledger files.

After V3.0: at five lifecycle hooks the executive runs a short Agent SDK `query()` with mem0 MCP attached. The LLM decides whether to query, what to search, and how to handle async writes. The deterministic loop wraps these turns; the agentic turns wrap memory.

```
┌──────────────────────── deterministic executive-loop.ts ────────────────────────┐
│                                                                                  │
│  Phase 2 → [HOOK A: pre-work-selection memory consult] → Phase 3 work selection │
│                                                                                  │
│  Phase 3 → [HOOK B: pre-spawn memory pack build] → Phase 4 worker spawn         │
│                                                                                  │
│  Phase 6 (success) → [HOOK C: episodic harvest]                                 │
│                                                                                  │
│  Phase 7 (3+ failures) → [HOOK D: similar-failure consult]                      │
│                                                                                  │
│  Post-retrospective (existing weekly) → [HOOK E: reflective harvest]            │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Each `[HOOK X]` is `query({ prompt: <loaded markdown>, options: { mcpServers, allowedTools, settingSources } })`. The hook prompts and behavior are defined in skill SKILL.md files, not TypeScript.

## File-by-file plan

### NEW — skills (executive-only, in `.claude/skills/`)

| Path | Purpose | Loads quirks doc? |
|---|---|---|
| `.claude/skills/memory-reader/SKILL.md` | Agentic instructions for reading memory: scope defaults, when to issue multiple queries, when to stop searching, how to format a memory pack for worker injection. | ✅ |
| `.claude/skills/memory-reader/references/mem0-limitations.md` | **Single source of truth** for mem0 quirks. Linked from all other memory skills. | — |
| `.claude/skills/memory-reader/references/scope.md` | Scope-field reference (user_id, agent_id, app_id, run_id) plus the snake/camel casing rules. | — |
| `.claude/skills/memory-harvester/SKILL.md` | Agentic instructions for writing memory: classify the artifact, decide which `type` (principle/semantic/procedural/episodic/reflective), validate before write, invoke deterministic helpers via Bash. | ✅ |
| `.claude/skills/memory-harvester/references/event-polling.ts` | `pollEventTerminal(eventId)` helper (lifted from POC). Bash-invoked. | — |
| `.claude/skills/memory-harvester/references/classify.ts` | Schema validator for `MemoryWrite`. Pre-write gate. | — |
| `.claude/skills/memory-harvester/references/harvest.ts` | Driver: takes a markdown artifact path + type + scope, runs add() + polling, persists to harvester ledger. | — |
| `.claude/skills/memory-snapshot/SKILL.md` | Agentic instructions for daily snapshot job: paginated search (not getAll), per-memory history, write JSON to repo. | ✅ |
| `.claude/skills/memory-snapshot/references/snapshot.ts` | Paginated search + history dumper. Cron-invoked. | — |

### NEW — agentic hook skills (`.claude/skills/memory-hook-*`)

These are **wrapper skills** following the executive's existing convention. The TS glue loads each via `loadSkillPrompt('<skill-name>', { CONTEXT_JSON: ... })` from `src/agentic/intelligence/skill-prompt-loader.ts` — same path `email-triage`, `failure-diagnosis`, `goal-breakdown` already use. Frontmatter `description:` doubles as the Skill-tool descriptor; body becomes the prompt with `{{CONTEXT_JSON}}` placeholder substitution. The loader logs `EXECUTIVE_SKILL_USED` to `ledgers/work-ledger.jsonl` per invocation — provenance for free.

| Path | Used at | Length budget |
|---|---|---|
| `.claude/skills/memory-hook-pre-work-selection/SKILL.md` | Hook A | ~500 tokens |
| `.claude/skills/memory-hook-pre-spawn-pack/SKILL.md` | Hook B | ~500 tokens |
| `.claude/skills/memory-hook-post-run-harvest/SKILL.md` | Hook C | ~700 tokens |
| `.claude/skills/memory-hook-failure-diagnosis/SKILL.md` | Hook D | ~600 tokens |
| `.claude/skills/memory-hook-post-retro-harvest/SKILL.md` | Hook E | ~700 tokens |

Each wrapper skill opens with `Read .claude/skills/memory-reader/references/mem0-limitations.md before doing anything memory-related.` That single line is the operational expression of the "limitations doc loaded by every memory skill" pillar.

> Note: an earlier draft of this plan proposed `.claude/prompts/v3-memory/` as a new top-level directory. That was non-standard — the executive already has the `.claude/skills/<name>/SKILL.md` + `loadSkillPrompt()` convention, and inventing a parallel path would have bypassed the ledger logging. Decision recorded 2026-05-16: use the existing skill convention. See `CLAUDE.md` § "Skill & Prompt Locations" for the canonical map.

### NEW — TypeScript glue (thin)

| Path | Purpose |
|---|---|
| `src/agentic/memory/run-hook.ts` | Single helper: `runMemoryHook(hookName: HookName, ctx: HookContext): Promise<HookResult>`. Calls `loadSkillPrompt('memory-hook-<hookName>', { CONTEXT_JSON: JSON.stringify(ctx) })` from the existing `src/agentic/intelligence/skill-prompt-loader.ts`, builds the standard `mcpServers` + `allowedTools` block, calls Agent SDK `query()`, returns transcript + final answer. No prompt strings inside this file. |
| `src/agentic/memory/types.ts` | `HookName`, `HookContext`, `HookResult` types only. No prompts. |

This is the **only** new TS module. It's the agent-spawning chokepoint, mirrored on the worker-spawner pattern. It reuses the existing `loadSkillPrompt` loader rather than introducing a parallel prompt-loading path.

### MODIFY — `src/core/executive-loop.ts`

Targeted insertions at five lines (deferred until you approve this plan). Total addition: ~30 lines of orchestration, no prompt strings.

| Hook | Insert before/after | What it does |
|---|---|---|
| A | After Phase 2 (line ~265) | `await runMemoryHook('pre-work-selection', { recentFailures, queueSummary })` — surfaces relevant prior runs into a markdown block the LLM can use during Phase 3. |
| B | Inside Phase 4 spawn prep (line ~440) | `const memoryPack = await runMemoryHook('pre-spawn-pack', { workItem })` — builds the worker's Memory Pack section, injected into worker CLAUDE.md by the existing worker-spawner. |
| C | After Phase 6 success path (line ~690) | `await runMemoryHook('post-run-harvest', { workItem, contractEvents, output_path })` — agentic write decision: classify outcome, write episodic memory. |
| D | Inside Phase 7 diagnosis (line ~770) | `await runMemoryHook('failure-diagnosis-memory', { failureSignals })` — surfaces prior failures with similar signals before the existing failure-diagnosis skill runs. |
| E | Inside `runWeeklyRetrospective` callsite (line ~283) | After retro completes, `await runMemoryHook('post-retro-harvest', { retroPath })` — writes reflective memories from the new retro doc. |

Each insertion is a single `await` call wrapped in `try/catch` (memory failures must not block the loop, per failure-mode pillar §5 of the decision doc).

### MODIFY — `src/agentic/workers/worker-spawner.ts` (or wherever CLAUDE.md is generated)

Single change: append `result.memoryPack` (from Hook B) as a `## Memory Pack` section in the generated worker CLAUDE.md. No prompt logic in TS — the pack is already-formatted markdown returned by the skill.

### MODIFY — `.env.executive.example`

Already done in the POC pass. Lines added:

```
V3_MEMORY_ENABLED=true
V3_MEM0_API_KEY=
V3_MEM0_USER_ID=
V3_MEM0_TOP_K=10
V3_MEM0_CONFIDENCE_FLOOR=0.7
```

### MODIFY — `ecosystem.config.cjs`

Add a cron entry for the daily snapshot:

```js
{
  name: 'memory-snapshot',
  script: 'npx',
  args: 'claude -p "/memory-snapshot daily"',  // or equivalent skill-invocation shape
  cron_restart: '0 4 * * *',  // 04:00 daily
  autorestart: false,
},
```

(Exact form depends on whether we run snapshot as a skill via `claude -p` or as a direct `tsx` call against `references/snapshot.ts`. Either is acceptable; the deterministic plumbing path is the same.)

## Order of operations

Phased so each phase is independently reviewable and revertible.

| Phase | Deliverables | Reviewable artifact |
|---|---|---|
| **0 — this plan** | This document | Markdown only; no code |
| **1 — limitations doc + scope doc** | `mem0-limitations.md`, `scope.md` | Two markdown files; can be hand-reviewed |
| **2 — three skills** | `memory-reader`, `memory-harvester`, `memory-snapshot` SKILL.md + references/ | Skills exist but executive doesn't call them yet — fully reversible |
| **3 — hook wrapper skills** | Five SKILL.md files under `.claude/skills/memory-hook-*/` with frontmatter + `{{CONTEXT_JSON}}` placeholder | Skills exist and are discoverable; still no executive integration |
| **4 — TS glue** | `src/agentic/memory/run-hook.ts` + types | New file only; nothing wired in. Runs only when called. |
| **5 — executive-loop hooks** | Five `await runMemoryHook(...)` insertions wrapped in try/catch | **Requires explicit approval before this phase** |
| **6 — worker-spawner injection** | Memory Pack section in generated CLAUDE.md | Single edit in spawner |
| **7 — cron** | PM2 snapshot entry | One config entry |
| **8 — backfill** | Manual harvest run against existing retros and ledgers | Skill invocation; data-only |

Phases 1–4 are pure additions — they don't change behavior anywhere until phase 5 wires them in. That means we can build them, you can review the markdown contracts (which is most of the surface area), and the loop stays untouched.

## Why `executive-loop.ts` doesn't go fully agentic in V3.0

The decision doc and your direction both anchor V3.0 on **second brain foundation**. A full agentic rewrite of the executive loop deserves its own version (V4.0 candidate). The memory hooks are the minimum agentic wedge that proves out:

- Per-turn `query()` cost is bounded
- Failure isolation works (memory turn fails → loop continues)
- The prompts-as-markdown rule scales
- The agent does iterative search well enough in practice (already shown in MCP POC: 5–8 refined searches per turn)

If all four hold, V4.0 can extend the same pattern to work selection, breakdown, and validation — but only after V3.0 retros confirm the wedge.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Memory hook latency adds 10–30s per loop iteration | Hooks A and B run only on iterations that actually pick new work. Hooks C/D/E are post-event, not in critical path. Worst-case total added latency per loop with new work: ~30s. |
| Memory query failure blocks the loop | `try/catch` around every `runMemoryHook` call; failures log `WORKER_MEMORY_UNAVAILABLE` and return empty result; loop proceeds. |
| Async writes (PENDING → SUCCEEDED) leak into the next loop turn before they're indexed | Harvester skill blocks on `pollEventTerminal` before returning, so the hook only returns after `SUCCEEDED`. ~3-5s server-side per the POC. |
| Memory pack inflates worker prompt | top_k cap (V3_MEM0_TOP_K=10) + confidence floor (V3_MEM0_CONFIDENCE_FLOOR=0.7) enforced inside `memory-reader`. Pack budget ≤2K tokens. |
| Limitations doc goes stale as mem0 evolves | Single physical file; one-touch update. Re-run POCs quarterly to catch behavior drift; update the doc. |

## Open questions to resolve during build

- **Skill discovery from the executive's `query()` calls** — need to confirm `settingSources: ['user', 'project']` finds `.claude/skills/memory-*` correctly when the executive is the SDK caller (not interactive CC). Will validate in phase 4.
- **Whether snapshot runs via `claude -p` (true skill invocation) or `tsx` directly** — both work; defer to phase 7 based on what's simplest.
- **Whether Hook B blocks worker spawn or runs concurrently** — concurrent is faster but the memory pack must land in the CLAUDE.md before the worker starts. Sequential is simpler and the latency is bounded. Default sequential.

## Sign-off gate

Phases 1–4 can proceed without further alignment. **Phase 5 (executive-loop edits) requires explicit approval** — that's the only phase that changes runtime behavior of the executive.

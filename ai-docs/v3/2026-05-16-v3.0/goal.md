# V3.0 Goal: Build the AI Harness "Second Brain" Foundation

**Status:** Planned

> **Positioning update (2026-04-19):** V3.0 is now explicitly the **second-brain release**. V3.1 remains the primary **observability unification** release. Observability work can start in V3.0 only where it is required to support the second-brain data model.

## Vision

V3.0 should turn ledgers, capabilities, run history, and retrospective artifacts into a coherent **second brain** for the AI harness.

Today we have many useful traces, but they are scattered, loosely structured, and often unreliable as a memory system. In V3.0, we want the system to accumulate operational knowledge in a way that is:

- **Searchable** (by goal, capability, component, incident pattern, date range)
- **Accurate enough to trust** for future planning and execution
- **Linkable** across artifacts (goal -> steps -> contracts -> outcomes -> retros)
- **Useful to agents** (not just humans reading raw files)

## Problem Statement

Current state is "early, loose second brain":

- Capability and execution history exists, but confidence in accuracy is low
- Historical context is fragmented across JSONL, markdown, and ad hoc logs
- Retrospective knowledge is valuable but not consistently structured for reuse
- The harness lacks a stable memory contract for "what this system can do" and "what happened before"

This limits planning quality, repeatability, and autonomous decision-making.

## Core Goal for V3.0

Create a **Second Brain Data Contract + Storage Foundation** so all major historical artifacts can be captured, searched, and reused with consistent semantics.

V3.0 is not about polishing dashboards first. It is about making the underlying memory reliable so V3.1 observability can sit on top of trustworthy records.


## Pre-Implementation Decision: "How" the Second Brain Is Hosted

Before build work starts, V3.0 must lock a concrete hosting/access pattern for where this second brain lives and how agents/operators reach it online.

This goal intentionally keeps implementation options open, but **does not** allow implementation to start without selecting one:

- Git + markdown as canonical source, synced to cloud-accessible storage/search
- Obsidian-compatible vault with cloud sync and API/indexing bridge
- Custom cloud knowledge base service backed by DB/object storage
- Hybrid approach (e.g., git as source of truth + GitHub Action publish/index pipeline)

### Decision Requirements (must be written before implementation starts)

1. **Online accessibility** — the second brain must be reachable beyond a single local machine.
2. **Canonical source of truth** — explicit declaration of where authoritative records are written first.
3. **Sync/index path** — how updates propagate and become searchable.
4. **Agent read/write contract** — how executive/workers query and append knowledge safely.
5. **Failure/degraded behavior** — what happens when cloud sync/indexing is unavailable.

If this decision is not documented, V3.0 remains in planning and should not move into implementation.

### Locked Architecture Pillars (2026-05-15)

The hosting decision record (`second-brain-hosting-decision.md`) is decided. Three implementation pillars are now locked and override any contrary draft in that file:

1. **Executive-tier only.** The second brain is owned and accessed by the **executive agent**. Worker agents never call mem0, never hold a mem0 API key, and never receive the mem0 MCP server. Workers are *fed* relevant context by the executive (see pillar 2).
2. **Pre-search + inject pattern for workers.** Before spawning a worker, the executive runs a scoped mem0 search and bakes the top-K results into the worker's prompt (a "memory pack" section in the generated CLAUDE.md). The worker sees static markdown — same shape as any other reference doc — and has no runtime dependency on mem0 being reachable.
3. **Skills-first, not a TypeScript module.** The harvester, reader, classifier, and snapshot jobs are each implemented as **skills** (SKILL.md files). Deterministic helpers (schema validation, mem0 SDK calls, snapshot serialization) live inside each skill's own `references/` folder — bundled with the skill, invoked by the skill via Bash. There is no `src/agentic/memory/` module. AI tends to default to TypeScript; for V3.0 we explicitly pivot to skill-as-a-service: the contract lives in markdown, the deterministic plumbing is a packaged sidecar of each skill.

Only the **harvester skill, run by the executive**, writes to mem0. Direct `client.add()` calls from any worker or any standalone script are an anti-pattern.

### Schema & editorial guidance (2026-05-16 amendment)

Two further commitments layer on top of the pillars above:

4. **Versioned schema (taxonomy v1.0.0).** All writes share a single SSOT at `.claude/skills/memory-harvester/references/taxonomy.md`. Every record carries a `schema_version` stamp. The validator (`classify.ts`) rejects malformed payloads before mem0 receives them. Schema bumps follow semver; history lives in `taxonomy-changelog.md`.
5. **Per-side editorial playbooks.** Agentic decisions (what to write, what to load, what to inject into the worker pack) are guided by markdown playbooks colocated with each skill:
   - `.claude/skills/memory-harvester/references/playbook.md` — soft write budgets per trigger, good vs junk gallery, zero-write scenarios.
   - `.claude/skills/memory-reader/references/playbook.md` — two audiences (executive consult vs worker pack), query plans per hook, pack composition rules.
6. **Phase 5 ships in stages, not all-at-once.** Five lifecycle hooks turn on one at a time over ~5 weeks with explicit audit gates between stages. See `implementation-plan-1-agentic-memory.md` § Staged rollout. This is deliberate: we have zero data on whether the playbooks produce useful output until we run the loop with one hook live.

## Scope

### In Scope

1. **Second Brain Canonical Entities**
   - Define canonical records for:
     - capabilities (declared + observed)
     - goals and runs
     - steps and contract events
     - outcomes and validations
     - retros and learned lessons
   - Require stable IDs and timestamps to connect these entities.

2. **Ledger Normalization + Accuracy Pass**
   - Audit current ledgers and logs for drift, missing fields, and semantic mismatch.
   - Introduce normalization rules so existing and future records follow one contract.
   - Add explicit quality markers (e.g., confidence/provenance/source) where records are inferred.

3. **Searchability Foundation**
   - Provide deterministic query paths for:
     - "what capabilities have worked before?"
     - "what similar goals failed and why?"
     - "what changed between attempts?"
   - Ensure historical lookup is practical without manual line-by-line parsing.

4. **Retrospective System Rethink**
   - Redesign retro capture so lessons are first-class, referenceable records (not just narrative docs).
   - Link must-fix items directly to capability areas and future goals.

5. **Storage Access via Skills (not a TS module)**
   - Mem0 reads/writes are encapsulated in skills, each bundling its own deterministic helpers under `references/`.
   - No `src/agentic/memory/` module is introduced. Skill-as-a-service is the pattern: markdown defines the contract, packaged scripts handle plumbing.
   - Preserve local append-only ledger compatibility; mem0 is a derived projection, never the source of truth.

6. **Local Artifact -> Second Brain Policy**
   - All critical local artifacts (ledgers, run logs, step files, contracts, retros, capability notes) must follow one of three paths:
     1) restructured directly into second-brain canonical records,
     2) read directly from a second-brain-native store, or
     3) pushed/synced into the second brain through a deterministic pipeline.
   - No critical operational history should remain as isolated local-only data once V3.0 foundations are complete.

### Out of Scope (Primary)

- End-to-end observability UX unification (targeted for V3.1)
- Dashboard-first work not required by second-brain data integrity
- Broad analytics polish before memory contract is stable

## Proposed Deliverables

1. **V3.0 Second Brain Spec**
   - Canonical entity model, field definitions, ID strategy, provenance rules.

2. **Second Brain Hosting Decision Record (required pre-implementation)**
   - Chosen "how" (platform/storage/sync/indexing), rationale, and fallback behavior.

3. **Ledger Accuracy Audit Report**
   - Gap analysis of current artifacts and prioritized fixes.

4. **Normalized Write/Read Path Plan**
   - Mapping of existing writers/readers to the new memory contract.

5. **Retro Knowledge Schema + Migration Plan**
   - Structured lessons and linking strategy for historical retros.

6. **Initial Search Interface Contract**
   - Query shapes for agents/executive flow to retrieve relevant prior knowledge.

7. **Local Artifact Migration/Sync Inventory**
   - File-by-file mapping of local artifacts to: restructure, direct second-brain usage, or push/sync path.

## Success Criteria

V3.0 is successful when:

1. The harness has a documented second-brain hosting decision (the "how") before implementation starts, with online accessibility guaranteed.
2. The harness has a documented, implemented second-brain contract for historical knowledge.
3. Capability history and run history are materially more trustworthy than current loose logs.
4. The **executive** can retrieve prior outcomes/lessons through structured queries rather than ad hoc file parsing.
5. **Workers** receive relevant prior context via memory packs injected into their prompts — without any direct mem0 dependency at runtime. Pack composition rules live in `memory-reader/references/playbook.md` (Audience 2).
6. Retrospective insights are linkable to future execution decisions.
7. Critical local historical data is no longer stranded in local-only formats; it is restructured, directly second-brain-backed, or deterministically pushed/synced.
8. Implementation is delivered as a small set of skills with `references/` sidecars — not as a new TypeScript subsystem.
9. A follow-on release path is defined for actively using this second-brain knowledge in higher-level planning/execution behaviors.
10. V3.1 observability work can build on this model without redoing foundational data semantics.

## Priority

**Very high.** The second brain is foundational to better autonomy. Without trustworthy memory, observability and planning improvements will remain shallow.

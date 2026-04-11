# V2.2 Goal: Harness Integration + Open Source Release

**Status:** Requirements capture only. NOT an implementation plan. The "how" is deferred to an ultra-plan session.

## Vision

Bring Jack's standalone "harnesses" (plan-then-build multi-agent pipelines, currently living in `jack-dev-server-configs/local/`) into the continuous-agent codebase so that:

1. **They still run standalone** — like skills, a harness can be invoked by itself without needing the 24x7 executive loop around it.
2. **They plug into the 24x7 agent** — a goal bundle can declare "use harness X" and the executive loop will drive it through the existing goal → contract → steps lifecycle.
3. **They run on Claude, Codex, AND Kimi K2.5** — the harness agents (WHY/WHAT/HOW/WHEN/RESEARCH/BUILD/VALIDATE etc.) must work across all three worker vendors, not just Claude Agent SDK.
4. **They can be open-sourced together** — the harness code + the 24x7 agent code ship as one repo (or one coordinated release) so the community gets both the "single-shot autonomous builder" and the "continuous autonomous operator" in one place.

## Harnesses In Scope

All three live under `/Users/jackjin/dev/jack-dev-server-configs/local/`:

| Harness | Path | Purpose |
|---------|------|---------|
| **Generic Harness v2** | `generic-harness-v2026-01-v2/` | 7-agent pipeline (WHY → WHAT → HOW → WHEN → RESEARCH → BUILD → VALIDATE) for Rust/Go/Python/Node/web. `ai-docs/` lives in target project. YAML frontmatter in `PROMPT.md`. Playwright MCP conditional. |
| **EDS Site Builder Harness v1** | `eds-site-builder-harness-v2026-01-v1/` | Same 7-agent architecture, Adobe AEM Edge Delivery Services specialized. Two-repo model (harness + target EDS site), block-based, `.hlxignore` auto-managed, `boilerplate-default` branching strategy. |
| **Study Harness v1** | `study-harness-v2026-03-v1/` | Different pipeline shape: DECOMPOSE → RESEARCH → SYNTHESIZE → CONTENT → TTS → DEPOSIT → VALIDATE. Coordinator-agent-spawns-specialists model via SDK `Task` tool + `Skill` tool. Skills in `.claude/skills/`, agents in `.claude/agents/`. Idempotent phases via STATUS.json. |

### What These Harnesses Have In Common

- **Orchestrator loop** written in Node.js (`src/orchestrator.js`) driving a sequence of isolated agent runs via Claude Agent SDK.
- **State file** (`STATUS.json` / `TASKS.json`) persisted in the target project's `ai-docs/` (generic + EDS) or target's `ai-docs/` (study).
- **Validator-cannot-write-code** design — honest QA via read-only access, defects become subtasks.
- **Mode detection** (bootstrap / adopt / extend / extend-deep / resume) based on existing state.
- **OAuth auth** via `CLAUDE_CODE_OAUTH_TOKEN` (no API key).
- **Prompts as files** in `src/prompts/plan/` and `src/prompts/task/`.
- **Retry and subtask escalation** (max build attempts, max validate attempts, defect subtasks 1.1, 1.2…).

### What They Do Differently

- Generic and EDS share the 7-agent spec-then-task pipeline. Study harness has a 7-phase linear pipeline (not agent-per-phase; phases are implemented as coordinator-spawned specialists with the `Skill` tool).
- Generic/EDS assume a git-backed target repo and create feature branches with date prefixes. Study harness uses orphan branches in the target.
- Generic is language-agnostic; EDS is Adobe-EDS-specific; Study produces a React + ShadCN study app with TTS and quiz data.
- Only study harness uses the `.claude/skills/` + `.claude/agents/` pattern. Generic + EDS use flat prompt files under `src/prompts/`.

## Requirements

### Requirement 1: Harnesses Run Standalone (Like Skills)

A harness is a first-class, self-contained unit of capability. Analogous to how skills in this repo can be invoked independently of the executive loop, a harness must be runnable:

- **From the CLI, directly**: `npm run harness -- --name eds-site-builder --prompt input/my-site/PROMPT.md` (or equivalent). No executive loop. No goal bundle. No queue. Just "run this harness on this input, done."
- **Without loss of functionality**: Everything the current standalone harnesses can do today (bootstrap/adopt/extend/extend-deep/resume, subtask creation, Playwright testing, mode auto-detection) must still work when invoked this way.
- **With the same inputs they accept today**: Existing `PROMPT.md` files (with YAML frontmatter) should continue to work without rewrite.

**Intent:** Users who only want the "single-shot autonomous builder" experience should be able to `git clone`, `npm install`, set their OAuth token, and run any harness — without ever starting the executive loop.

### Requirement 2: Harnesses Integrate With the 24x7 Executive Loop

In addition to standalone mode, harnesses must be invocable as the execution strategy for a goal bundle. Concretely:

- A goal bundle's `PROMPT.md` can declare `execution_pattern: harness` (or similar) plus `harness: eds-site-builder` / `harness: generic` / `harness: study`.
- When the executive loop selects such a goal, the worker-spawner routes to the harness orchestrator instead of a direct worker session.
- The harness's internal lifecycle (spec agents → task agents → validator → subtasks) must map cleanly into the executive's **goals → contracts → steps** model:
  - The goal = "finish this harness run."
  - Contract = task-contract for the harness invocation (DoD, allowed ops, risk level).
  - Steps = harness phases (spec phases, per-task research/build/validate passes, etc.) so that progress, retry, and failure diagnosis work the same way as any other goal.
- STATUS.json / TASKS.json generated by the harness must be visible to the executive (whether by reading them directly from the target or by mirroring them into the bundle's STEPS.json).
- Failures inside a harness run (e.g., a build task stuck after 3 attempts) must be surfaceable to the executive's Phase 7 diagnosis and Phase 8 blocking logic so the 24x7 agent can act on them without humans diving into the harness internals.

**Note:** We are *not* deciding in this doc whether "harness as execution_pattern" is implemented by shelling out to the harness CLI, by importing its orchestrator as a library, or by expressing every harness phase as a skill. That's an ultra-plan question. The requirement here is: **both usage modes must coexist, and the integrated mode must fit the existing goal/contract/steps model.**

### Requirement 3: Multi-Vendor Execution (Claude + Codex + Kimi K2.5)

Today, all three harnesses are hard-wired to the Claude Agent SDK (`query()`, SDK `Task` tool, SDK `Skill` tool, Claude-specific tool names). The continuous-agent repo already has a vendor abstraction for workers (`src/core/vendor/`) supporting:

- Claude Agent SDK
- OpenAI Codex SDK
- Kimi (wire SDK + CLI stream-json)

**Requirement:** Harness agents (WHY/WHAT/HOW/WHEN, RESEARCH/BUILD/VALIDATE, coordinator + specialists, etc.) must be runnable against any of the three vendors, controlled by the same mechanism already used for regular workers:

- `WORKER_VENDOR` env var (global default)
- `worker_vendor:` frontmatter in `PROMPT.md` (per-goal override)
- Ideally also per-harness-agent override (e.g., "use Opus for spec agents, Kimi for build") consistent with the existing `MODEL_SPEC_WHY` / `MODEL_BUILD` / etc. pattern.

**Consequences to document (not solve):**

- Codex and Kimi do NOT read `CLAUDE.md` or `.claude/skills/` automatically. All instructions must be injected into the prompt string — same problem the existing V2 prompt composition layer solves. Harness prompts may need to route through `buildV2ComposedPrompt()` (or an equivalent adaptation) instead of being passed raw.
- Tool names differ per vendor (Read vs ReadFile, Write vs WriteFile, Bash vs Shell, etc.). The existing `vendor-adapter.ts` handles this for workers; harnesses will need the same treatment.
- The SDK `Task` tool (used by the study harness coordinator to spawn specialists) and the SDK `Skill` tool are Claude-specific. Codex and Kimi equivalents may need to be emulated by the harness orchestrator itself (spawn N sequential/parallel worker calls instead of relying on a single agentic coordinator).
- Playwright MCP availability varies across vendors.

### Requirement 4: Open Source Release Readiness

Both the harness code and the 24x7 executive agent should be open-sourceable together. Document (do not solve):

- What secrets / personal paths / hardcoded usernames need to be scrubbed.
- How the two codebases merge: single monorepo, two top-level packages, or sibling packages in a workspace?
- Which pieces stay private (e.g., Jack's specific `input/` prompts, personal `.env` examples, real da.live URLs, study certification content).
- Licensing decision — the current harnesses say "Internal tool - not for distribution."
- README/docs story: one entry-point README that explains both modes (standalone harness vs 24x7 executive), with pointers into each.

## Out of Scope For This Doc

- Implementation strategy (ultra-plan will decide CLI-vs-library, skill-vs-executor, prompt composition strategy, vendor adaptation specifics).
- Specific database / storage changes (those belong to v2.3).
- Dashboards and observability (v2.4).
- Rewriting the harnesses in TypeScript (the harnesses are currently JavaScript; the continuous-agent is TypeScript). Whether to port or wrap is an ultra-plan decision.
- Deciding whether to consolidate generic + EDS harnesses into one (they're already 90% the same). Maybe yes, maybe no — defer.

## Success Criteria (for v2.2 as a whole, not this doc)

1. A new user can clone the repo, set their OAuth token, and run any of the three harnesses standalone — no executive loop needed.
2. A user can also `pm2 start ecosystem.config.cjs` and drop a goal bundle that says `execution_pattern: harness` into `workspace/ondeck/`, and the 24x7 agent will execute it end-to-end, with progress visible in STEPS.json and failures handled by the normal diagnosis/blocking path.
3. The same harness runs with `WORKER_VENDOR=claude`, `WORKER_VENDOR=codex`, and `WORKER_VENDOR=kimi` and completes successfully on a representative prompt.
4. The repo is in a state where it could be made public: no personal secrets, no hardcoded absolute paths outside of config, a clear top-level README describing both modes.

## Decisions (captured from Q&A, 2026-04-11)

These answer the three scoping questions before ultra-plan. Treat as binding constraints on the plan, not suggestions.

### D1. Integration shape: **Both A and C (Q1 = D), with C as the real target**

- **Short term (A):** Harnesses remain runnable as standalone JS orchestrators. The executive loop can shell out to them and parse `STATUS.json` / `TASKS.json` to update STEPS.json. This path exists so we never regress standalone usage and so we can land integration quickly.
- **Long term (C):** Each harness is also wrapped as a meta-worker that the executive spawns through the existing `AgentWorkerProvider` interface, running its full pipeline under a single goal/contract. This is the preferred end state — we are *not* just copying harnesses in as a shell-out and calling it done.
- **Explicit non-goal:** Option B (dissolving each harness phase into individual skills driven step-by-step by the executive) is rejected. Harnesses must keep their own orchestrator — the value of a harness *is* its tight internal loop.

### D2. Standalone entry point: **Unified CLI (Q2 = B)**

- One CLI dispatches to any harness: `npm run harness -- --name <generic|eds|study> --prompt <path>` (or equivalent).
- Each harness no longer ships its own top-level `npm start`; they're all routed through the unified entry point.
- Rationale: consistent with the "break out / unify" theme — one repo, one way to run a harness, same flags across all three.
- Standalone mode must still work with zero dependency on PM2, the executive loop, or goal bundles.

### D3. Multi-vendor scope: **Full parity across all harness agents (Q3 = A)**

- All three vendors (Claude Agent SDK, Codex, Kimi K2.5) must work for *every* harness agent: WHY/WHAT/HOW/WHEN spec agents, RESEARCH/BUILD/VALIDATE task agents, and the study harness's coordinator + specialists pattern.
- No "Claude-only for spec agents, other vendors for task agents" compromise.
- Implication for ultra-plan: the SDK `Task` tool and SDK `Skill` tool (study harness coordinator/specialist spawning, both Claude-specific) must be emulated at the orchestrator layer for Codex and Kimi — likely by the orchestrator spawning multiple sequential worker calls instead of relying on an in-agent coordinator.
- Implication for prompts: harness prompts will need to route through the existing V2 prompt composition + `vendor-adapter.ts` so tool-name mappings and full-context injection work for Codex/Kimi (which don't read `CLAUDE.md` or `.claude/skills/`).
- Acceptance: each of the three harnesses completes a representative prompt end-to-end under `WORKER_VENDOR=claude`, `WORKER_VENDOR=codex`, and `WORKER_VENDOR=kimi`.

## References

- Harness sources:
  - `/Users/jackjin/dev/jack-dev-server-configs/local/generic-harness-v2026-01-v2/`
  - `/Users/jackjin/dev/jack-dev-server-configs/local/eds-site-builder-harness-v2026-01-v1/`
  - `/Users/jackjin/dev/jack-dev-server-configs/local/study-harness-v2026-03-v1/`
- Existing vendor abstraction: `src/core/vendor/` (registry, types, providers)
- Existing prompt composition: `src/agentic/intelligence/prompt-builder.ts`, `vendor-adapter.ts`
- Existing goal/contract/steps model: `workspace-instructions/`, `src/deterministic/steps-json-handler.ts`
- Related future versions: v2.3 (cloud DB migration), v2.4 (cloud observability unification)

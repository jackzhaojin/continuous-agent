# Changelog

All notable changes to the Continuous Executive Agent.

Builds are tracked in the sibling `ai-sandbox/` repo. New v2.3 work happens on per-project worktrees at `~/dev/ai-sandbox-worktrees/proj/<slug>/` (branch `proj/<slug>` forked from `base`). Pre-rebaseline builds are preserved on the `monorepo/legacy-v2.2` branch under `projects/{react,nextjs,node,misc}/{date}/` and deployed to [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/).

## [Unreleased] - develop

Next up: v2.4 capability hardening + retro carry-forward (executive→harness integration with a real LLM, build-target manual e2e carried from v2.3 P1-6/P1-7, v2.2 capability matrix, H/I items from v2.1.6 retro). See [`ai-docs/v2/xxxx-xx-xx-v2.4/goal.md`](ai-docs/v2/xxxx-xx-xx-v2.4/goal.md). Cloud migration (v3.0) and observability (v3.1) deferred — see `ai-docs/v2/xxxx-xx-xx-v3.0/` and `xxxx-xx-xx-v3.1/`.

## [2.3.0] - 2026-04-18

### Added
- **Unified Build Targets** — Three-mode output model selected per-goal via PROMPT.md frontmatter: `worktree` (default, tiered-namespace path under `~/dev/ai-sandbox-worktrees/<namespace>/<slug>/` off `ai-sandbox` `base`), `existing` (work directly in an external repo/directory via `target_dir`), `monorepo` (legacy flat layout anchored at the `monorepo/legacy-v2.2` worktree). Resolver centralized in `src/deterministic/build-target-resolver.ts`; PROMPT.md fields parsed by `prompt-md-parser.ts` (`build_target`, `target_dir`, `target_branch`); `BuildTarget` type in `core/types.ts`.
- **`getLegacyMonorepoWorktreePath()`** in `build-target-resolver.ts` — single helper for the legacy archive base.
- **Regression tests** — `build-target-resolver.adhoc.ts` (tiered-path + default-flip), `monorepo-legacy-routing.adhoc.ts` (legacy routing stays inside worktrees parent), `real-ai-sandbox-integration.adhoc.ts` (against the real rebaselined `ai-sandbox`).

### Changed
- **`ai-sandbox` rebaselined in place** (2026-04-17) — replaced the planned standalone `ai-demos` repo with an in-place rebaseline. Three branches now share the rebaselined ancestry: `base` (frozen Apache 2.0 + `.gitignore` init, backdated 2026-03-28), `main` (= `base` plus a README), `monorepo/legacy-v2.2` (original 156 commits with original SHAs and timestamps). Safety-net tag `pre-rebaseline-backup` pins the pre-surgery tip.
- **Tiered-namespace worktree convention** — `<namespace>/<slug>` branches map to `~/dev/ai-sandbox-worktrees/<namespace>/<slug>/` so `git worktree list` and the filesystem stay in lockstep.
- **Default `build_target` flipped to `worktree`** — `getDefaultBuildTarget()` returns `'worktree'`. Override via `BUILD_TARGET_DEFAULT` env if a deployment needs the legacy default.
- **Harness target resolution via PROMPT.md** — `harness-executor.resolveHarnessTarget()` uses the shared resolver; CLI `--target` is now an optional override.
- **Env vars renamed** — `AI_DEMOS_PATH` → `AI_SANDBOX_PATH`, `AI_DEMOS_WORKTREES_PATH` → `AI_SANDBOX_WORKTREES_PATH`. New `AI_SANDBOX_LEGACY_MONOREPO_PATH` overrides the legacy worktree path. `AGENT_OUTPUTS_BASE` redirected to `getLegacyMonorepoWorktreePath()` so the centralized `.env`/`.claude`/`CLAUDE.md` setup lands in the legacy worktree.

### Scope split
v2.3 was originally scoped as "Unified Build Targets + Hardening Release." Phase 1 (build targets) shipped as v2.3.0; Phase 2 (hardening) and Phase 3 (retro carry-forward) moved to v2.4. Manual e2e for `worktree` and `existing` targets (P1-6 / P1-7) carries into v2.4.

### Deferred
- v3.0 — Cloud DB migration for ledgers and agent state (was v2.4)
- v3.1 — Cloud observability unification (was v2.5)

## [2.2.0] - 2026-04-11

### Added
- **Harness Integration Framework** -- Three multi-agent plan-then-build pipelines (`generic-v2`, `eds-site-builder`, `study`) ported from JavaScript to TypeScript and integrated into the executive loop as first-class agents. Standalone via `npm run harness -- --name <name> --prompt <path>` or in 24x7 mode via `execution_pattern: harness` goal bundles.
- **HarnessOrchestrator interface** -- Vendor-agnostic chokepoint in `src/harnesses/core/` that maps harness phase events (phase_start, phase_complete, agent_message, subtask_created) to STEPS.json and worker transcripts. Internal harness retries do not count against the executive's 3-strike threshold; only `run_complete(success=false)` increments goal failure count.
- **Multi-vendor harness execution** -- Claude Sonnet 4.6, Codex, and Kimi K2.5 (wire + CLI) all run across the harnesses through the v2.1 vendor abstraction. Tool name mapping (e.g., `Shell` instead of `Bash` for non-Claude vendors) and prompt adaptation handled in `harness-agent-runner.ts`.
- **Unified harness CLI** -- Single entry point with flags for mode (bootstrap/adopt/extend/resume), vendor, target, and model overrides. Auto-detects mode and manages state via STATUS.json + TASKS.json (generic/EDS) or per-phase STATUS.json (study).
- **Comprehensive harness test suite** -- 105 passing tests: 71 unit (core, state/mode, loaders), 6 mock-provider e2e (full orchestrator flows with canned handoff), 28 Kimi K2.5 validation (tool mapping, prompt adaptation, model resolution, registry). Gated live e2e for Claude via `RUN_LIVE_E2E=1`.
- **HARNESS.md reference docs** -- CLI guide, frontmatter fields, phased delivery status (P1–P7), vendor notes, troubleshooting, architecture rationale, and key files index.

### Changed
- V2 prompt composition and vendor adapter extended to harness agents — all harness invocations route through `runHarnessAgent()` for prompt adaptation, tool name mapping, and multi-vendor provider dispatch.
- OSS-readiness: upstream harness sources at `/jack-dev-server-configs/local/*-harness-*` remain untouched; all v2.2 fixes live in the continuous-agent adapter layer.

### Known Issues (deferred to v2.3)
- **Kimi K2.5 CLI handoff** — intermittently passes wrong file set to next phase. Wire path is reliable; CLI not recommended for production.
- **Kimi K2.5 HOW translation** — prompt adaptation for non-Claude vendors needs reinforcement for the spec-when (HOW) phase.
- **Codex multi-vendor parity** — full parity for EDS and study harnesses deferred (generic works across all three vendors).

### Projects built
v2.2 was infrastructure-focused; functional output landed during v2.1.4–v2.1.6 sub-releases (see [v2.1 below](#210---2026-04-01)). The v2.2 release validated the harness framework via [generic/EDS/study e2e runs](ai-docs/v2/2026-04-11-v2.2/validation-report-kimi-k2.5.md) across Claude/Codex/Kimi rather than producing new sandbox apps.

---

## [2.1.0] - 2026-04-01

### Added
- **Vendor Abstraction Layer** -- Multi-vendor LLM support for workers. `src/core/vendor/` provides two interfaces: `AgentWorkerProvider` (full agentic execution) and `ChatCompletionProvider` (simple text-in/text-out). Three vendor backends: Claude Agent SDK (default), OpenAI Codex SDK, and Kimi SDK (wire + CLI modes).
- **Per-goal vendor override** -- Goals can specify `worker_vendor: codex` (or `kimi`) in PROMPT.md frontmatter. Priority: goal frontmatter > `WORKER_VENDOR` env > `claude` default.
- **Kimi dual-mode support** -- `KIMI_MODE` env selects `wire` (bidirectional SDK) or `cli` (stream-json, simpler logs).
- **Vendor E2E tests** -- `tests/e2e/vendor-workers/` with standalone test scripts for each vendor and the registry.
- **GitHub Pages deployment** -- Automated CI pipeline deploys all React projects from `ai-sandbox/` to [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/). Recursive project discovery, per-project `--base` path injection, landing page grouped by date, SPA 404 fallback.
- **Multi-vendor output comparison** -- Same prompt ("build a finance dashboard") executed across Claude, Codex, Kimi CLI, and Kimi Wire. [Live comparison](https://jackzhaojin.github.io/ai-sandbox/) with all 4 variants deployed. Detailed analysis in `learning/finance-dashboard-comparison-2026-03-31.md`.
- **Skill-based prompt composition (v2.1.4)** -- Two-CWD architecture syncs worker skills from `claude-files-to-output/skills/` to `ai-sandbox/.claude/skills/` per spawn. Per-vendor prompt adaptation: Claude gets lightweight prompts via SDK auto-discovery; Kimi/Codex get heavyweight injected prompts with tool name mappings.
- **Build verification hardening (v2.1.5)** -- Promoted `node_build` verifier from advisory to hard failure for web projects; dynamic port detection (no more hardcoded `:3000`); orphan process cleanup between steps; `web-testing` skill with forced playwright-cli usage.
- **Executive self-triage & recovery (v2.1.6)** -- Failure classification (worker vs infrastructure vs environment), self-triage skill that spawns to fix verifier bugs, recovery pipeline that unblocks failed goals after fixes land.
- **Defect-subtask pipeline (v2.1.6)** -- STEPS.json supports hierarchical subtasks (step-5 → step-5.1 → step-5.1.1). Phase 5b integration-validator files defects; work-selector walks depth-first so subtasks run before next sibling.
- **Journey-first worker discipline (v2.1.6)** -- New `definition_of_done_journey` PROMPT.md field specifies the full user flow workers must validate (e.g., "form → submit → rates → confirm"). Auto-inserted `[GATE]` steps run full E2E journey tests at regular cadence; `journey.spec.ts` grows append-only across gates.
- **PM2 SIGUSR2 hot reload (v2.1.2)** -- `npm run build` triggers graceful next-iteration restart without killing the in-flight worker. Build version stamped with timestamp + git commit hash for ledger tracking.
- **Agentic email triage (v2.1.1)** -- LLM-driven inbox classification (queue/reply/archive) replaces hardcoded rules, with throttling.

### Changed
- Worker spawner routes to vendor-specific provider based on goal frontmatter or env config.
- All vendor outputs normalized to `AgentWorkerMessage` with structured `[tool_call]`, `[tool_result]`, `[thinking]` prefixes for uniform logging.
- `ai-sandbox` submodule-style project directories converted to regular tracked files for CI compatibility.
- Worker prompts refactored into `worker-prompts/` structure with versioned templates.
- Step granularity tuned to break work into finer chunks within max-steps constraints.

### Projects built
Multi-vendor finance-dashboard benchmark (built late v2.0, deployed via v2.1 Pages CI):
- [finance-dashboard-claude](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-31/finance-dashboard-claude/) — Claude, 575 LOC, 88/130 (3rd)
- [finance-dashboard-codex](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-31/finance-dashboard-codex/) — Codex, 1,233 LOC, 115/130 (1st), best architecture + working dark mode
- [finance-dashboard-kimi-cli](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-31/finance-dashboard-kimi-cli/) — Kimi CLI, 92/130 (2nd), richest interactivity
- [finance-dashboard-kimi-wire](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-31/finance-dashboard-kimi-wire/) — Kimi Wire, 87/130 (4th)

Refinement iteration (v2.1):
- `ai-sandbox/projects/react/2026-04-04/finance-dashboard-{kimi-cli,kimi-wire}` — re-run after vendor abstraction settled

B2B postal-checkout — flagship test of v2.1.4–v2.1.6 capabilities:
- `ai-sandbox/projects/nextjs/2026-04-05/1775414201963` — v2.1.4 first run (Next.js 15, 32 steps, 52 commits, broken end-to-end data flow but 40+ polished components). [Retro](ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.5.md).
- `ai-sandbox/projects/nextjs/2026-04-11/1775939155064` — v2.1.6 final re-run with full pipeline (55 steps, 11 gates, 60 commits, 83 components). [Retro](ai-docs/v2/2026-04-01-v2.1/retro-b2b-postal-checkout-v2.1.6.md).
- `ai-sandbox/projects/nextjs/2026-04-11/{1775931318881,1775937114098,1775938112028}` — parallel iterations and intermediate state snapshots
- `ai-sandbox/projects/misc/2026-04-11/1775935234448` — Supabase-backed B2B checkout (carrier rate shopping, multi-step wizard)

---

## [2.0.0] - 2026-03-29

### Added
- **Agent Identity System** -- Gmail inbox checking (Phase 0.5) and Discord webhook notifications. The agent can now receive goals via email and push completion/blocked alerts to Discord. Email intent parsing (priority_change, new_goal, approval, clarification). All opt-in, disabled by default with kill switches and independent auth health checks.
- **Execution Patterns** -- Four worker execution modes: `plan-then-execute` (default), `loop-until-progress`, `plan-mode` (read-only — Write/Edit/Bash removed), and `deterministic-pipeline`. Specified per-goal in PROMPT.md frontmatter.
- **Skills & Playbooks Libraries** -- Separated reusable knowledge into skills (atomic tool/API how-tos) and playbooks (goal-oriented workflows). Loaded by `skill-loader.ts` and `playbook-loader.ts` with frontmatter validation, forbidden-field enforcement, and deterministic warnings.
- **Track Record System** -- Skills and playbooks carry execution history (total executions, success rate, confidence, maturity level). `skill-updater.ts` updates both independently, with confidence/maturity transitions and review-needed flags.
- **Execution Pattern Resolver** -- Determines effective execution pattern with precedence: PROMPT.md override > playbook match > system default.
- **Dashboard Writer & UI** -- `dashboard-writer.ts` projects agent state into atomic `workspace/dashboard-data.json` (goal pipeline, active worker, needs-you, activity feed, skill health). Next.js/React read-only dashboard at `dashboard/`.
- **Pipeline Executor** -- `src/harness/pipeline-executor.ts` for deterministic multi-step execution: frontmatter → typed steps, per-step retries, step output → next step input chaining, abort on exhaustion.
- **Feature flags** -- `V2_PROMPT_COMPOSITION`, `V2_TRACK_RECORDS`, `IDENTITY_ENABLED`, `GMAIL_ENABLED`, `DISCORD_ENABLED` for safe incremental rollout (all default OFF).

### Changed
- Executive loop now has Phase 0.5 (inbox check) before health check.
- Worker spawner supports execution pattern routing and tool restriction for plan-mode.
- Prompt builder supports v2 skill+playbook composition when `V2_PROMPT_COMPOSITION=true`.

### Projects built
Smoke tests of the v2.0 executive loop and execution patterns:
- [react/2026-03-29/1774808631099](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-29/1774808631099/), [1774810899300](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-29/1774810899300/) — React + Vite scaffolds
- [react/2026-03-30/1774836190444](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-30/1774836190444/) — React + Vite template
- `ai-sandbox/projects/node/2026-03-30/1774845112711` — V2 Smoke Test (Hello World validating v2.0 loop end-to-end)

Late v2.0 produced the multi-vendor finance-dashboard benchmark (deployed via v2.1 Pages CI; see v2.1 Projects above).

---

## [1.3.0] - 2026-02-04

### Added
- **Three-tier credential system** -- Physical separation of executive (`.env.executive`), worker (`.env.worker`), and application (`.env.app`) credentials. Leak detection validates no cross-tier contamination.
- **Tier 3 format helpers** -- `credential-tiers.ts` converts app credentials to dotenv, JSON, shell, docker-compose, or YAML for platform-agnostic projects.
- **OAuth-first authentication** -- `CLAUDE_CODE_OAUTH_TOKEN` via Claude Pro/Max subscription. No Anthropic API key required.

### Changed
- Worker spawner copies `.env.worker` to `ai-sandbox/.env` centrally (not per-project).
- Environment loading order: `.env.executive` > `.env.worker` > `.env` (legacy fallback).

### Projects built
- `ai-sandbox/projects/misc/2026-02-02/1769995575621` — **Calibration Project Delivery Framework** (AI agent capability self-assessment)
- `ai-sandbox/projects/nextjs/2026-02-04/1770173908713` — **Recipe Discovery Platform** (Next.js + Supabase, validating three-tier credentials)
- `ai-sandbox/projects/nextjs/2026-02-04/1770180822334` — Next.js template scaffold

---

## [1.2.0] - 2026-01-28

### Added
- **Goal bundles** -- Goals are now directories with `PROMPT.md` (YAML frontmatter + markdown body), replacing flat `goals.md`. Legacy fallback preserved.
- **Workspace folder lifecycle** -- `drafts/` -> `ondeck/` -> `in-progress/P{0-4}/` -> `completed/` with auto-promotion by priority.
- **STEPS.json** -- Machine-readable step tracking (source of truth) with atomic writes via temp+rename. Replaces inline `## Steps` in PROMPT.md.
- **CONTRACTS.jsonl** -- Per-bundle contract event log (started, completed, failed, blocked).
- **PROGRESS_LOG.md** -- Append-only human-readable timeline per goal bundle.
- **Notion reporting** -- Fire-and-forget integration: milestone events, milestone closure with duration, daily/weekly summaries. Local ledgers remain source of truth.
- **Goal scanner** -- `goal-scanner.ts` scans workspace folder tree, reads STEPS.json, auto-promotes ondeck goals. Logs `GOAL_PROMOTED` events.
- **Project registry** -- `workspace/project-registry.yml` tracks completed projects for multi-project access and source copying.
- **Project memory** -- `capabilities/project-memory.yml` records completed projects with capabilities, features, and lessons learned.
- **Skill-build workflow** -- `[SKILL-BUILD]` prefixed goals route to skill-builder subagent for creating Claude Code skills.

### Changed
- Terminology: Task -> Goal, TaskStep -> WorkStep across codebase.
- Queue ingestion creates draft bundles with P3 priority instead of appending to goals.md.

### Projects built
- `ai-sandbox/projects/misc/2026-01-26/1769393294746` — **Notion API Integration POC** (`@notionhq/client`)
- `ai-sandbox/projects/misc/2026-01-26/1769398504453` — **Agent Capabilities POC** (Claude Agent SDK)
- `ai-sandbox/projects/misc/2026-01-26/1769399545316` — Design analysis spike
- `ai-sandbox/projects/misc/2026-01-29/1769665492207` — **Full-Stack Conversational Chat Application** (Next.js 14, auth, persistent conversations)
- `ai-sandbox/projects/misc/2026-01-29/1769664602125` — Music player research spike
- `ai-sandbox/projects/nextjs/2026-01-29/1769678844738` — **Retro CRT Analytics Dashboard** (Next.js 15+)
- `ai-sandbox/projects/nextjs/2026-01-29/{1769667885840,1769671611924,1769683759694,1769685367609}` — Multi-step Next.js builds with HANDOFF/STEP docs (early incremental execution validation)

---

## [1.1.0] - 2026-01-25

### Added
- **Incremental execution** -- Goals >100 estimated turns auto-break into 2-5 steps. Each step runs independently with shared project state. Re-breakdown on failure (max 2 times).
- **Self-enhancement workflow** -- `[SELF-ENHANCE]` prefixed goals route to agent codebase via self-enhancer subagent. Changes made on branch for human review.
- **Prompt management** -- Versioned markdown templates in `src/agentic/prompts/{category}/` with `{{VARIABLE}}` rendering.
- **Intent classification** -- `outcome_only` (research mandatory) vs `what_and_how` (implementation provided) for smarter prompt building.
- **Strategy rotation** -- Retries cycle through: simplify scope, research first, break into subtasks, different tools. Each retry must try something different.
- **Agentic diagnosis** -- After 3+ failures, LLM analyzes root cause and determines next action (retry vs escalate).
- **Self-improvement triggers** -- Practice loop, retrospective, and reference refresh tasks generated when idle.
- **needs-you.md interaction** -- Structured async communication with response tags: `[APPROVED]`, `[DECISION]`, `[INFO]`, `[SKIP]`.

### Changed
- Worker spawner preserves `output_path` across retries so workers continue in the same project directory.

### Projects built
- `ai-sandbox/projects/nextjs/2026-01-25/d5d9e97f/transactional-app` — first Next.js bundle test (early goal-bundle dry run)

---

## [1.0.0] - 2026-01-24

### Added
- **Executive loop** -- 8-phase continuous loop: health check, input processing, work selection, contract creation, execution, validation, state updates, sleep/continue.
- **Two-repository architecture** -- Agent infrastructure (`continuous-agent/`) strictly separated from worker outputs (`ai-sandbox/`).
- **Worker delegation** -- Claude Agent SDK sessions spawned per contract with isolated project directories.
- **Contract system** -- Scoped work agreements with prompt, allowed tools, Definition of Done, and turn budgets.
- **Verifier system** -- Deterministic post-execution validation: git-clean, node-build, docs-checklist, reference-integrity.
- **Capability tracking** -- YAML registries (technical, delivery, functional) with confidence scoring (+10 on PASS, -15 on FAIL).
- **Constitution** -- 8 immutable hard limits: spending caps, no deletions, no credential exposure, mandatory logging, 10-retry minimum.
- **Workspace files** -- Markdown-based state management: goals.md, progress.md, completed.md, needs-you.md.
- **Append-only ledgers** -- JSONL audit trail: work-ledger, capability-ledger, daily executive logs, per-contract worker logs.
- **PM2 deployment** -- Production-ready continuous execution with hot reload (rebuild without restart).

### Projects built
v1.0 was foundation only — no functional sandbox builds yet. First builds landed during v1.1 (`nextjs/2026-01-25/d5d9e97f`).

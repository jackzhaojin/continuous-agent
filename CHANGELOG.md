# Changelog

All notable changes to the Continuous Executive Agent.

## [2.1.0] - 2026-04-01

### Added
- **Vendor Abstraction Layer** -- Multi-vendor LLM support for workers. `src/core/vendor/` provides two interfaces: `AgentWorkerProvider` (full agentic execution) and `ChatCompletionProvider` (simple text-in/text-out). Three vendor backends: Claude Agent SDK (default), OpenAI Codex SDK, and Kimi SDK (wire + CLI modes).
- **Per-goal vendor override** -- Goals can specify `worker_vendor: codex` (or `kimi`) in PROMPT.md frontmatter. Priority: goal frontmatter > `WORKER_VENDOR` env > `claude` default.
- **Kimi dual-mode support** -- `KIMI_MODE` env selects `wire` (bidirectional SDK) or `cli` (stream-json, simpler logs).
- **Vendor E2E tests** -- `tests/e2e/vendor-workers/` with standalone test scripts for each vendor and the registry.
- **GitHub Pages deployment** -- Automated CI pipeline deploys all React projects from `ai-sandbox/` to [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/). Recursive project discovery, per-project `--base` path injection, landing page grouped by date, SPA 404 fallback.
- **Multi-vendor output comparison** -- Same prompt ("build a finance dashboard") executed across Claude, Codex, Kimi CLI, and Kimi Wire. [Live comparison](https://jackzhaojin.github.io/ai-sandbox/) with all 4 variants deployed. Detailed analysis in `learning/finance-dashboard-comparison-2026-03-31.md`.

### Changed
- Worker spawner routes to vendor-specific provider based on goal frontmatter or env config.
- All vendor outputs normalized to `AgentWorkerMessage` with structured `[tool_call]`, `[tool_result]`, `[thinking]` prefixes for uniform logging.
- `ai-sandbox` submodule-style project directories converted to regular tracked files for CI compatibility.

## [2.0.0] - 2026-03-29

### Added
- **Agent Identity System** -- Gmail inbox checking (Phase 0.5) and Discord webhook notifications. The agent can now receive goals via email and push completion/blocked alerts to Discord. All opt-in, disabled by default.
- **Execution Patterns** -- Four worker execution modes: `plan-then-execute` (default), `loop-until-progress`, `plan-mode` (read-only), and `deterministic-pipeline`. Specified per-goal in PROMPT.md frontmatter.
- **Skills & Playbooks Libraries** -- Separated reusable knowledge into skills (atomic tool/API how-tos) and playbooks (goal-oriented workflows). Loaded by `skill-loader.ts` and `playbook-loader.ts` with frontmatter validation.
- **Track Record System** -- Skills and playbooks carry execution history (total executions, success rate, confidence, maturity level). Updated automatically after each goal via `skill-updater.ts`.
- **Execution Pattern Resolver** -- Determines effective execution pattern with precedence: PROMPT.md override > playbook match > system default.
- **Dashboard Writer** -- Generates `workspace/dashboard-data.json` with goal pipeline, active worker status, needs-you queue, activity feed, and skill health metrics.
- **Dashboard UI** -- Next.js/React read-only dashboard in `dashboard/` for visualizing agent state.
- **Pipeline Executor** -- `src/harness/pipeline-executor.ts` for deterministic multi-step execution with per-step retries and chained outputs.
- **Feature flags** -- `V2_PROMPT_COMPOSITION`, `V2_TRACK_RECORDS`, `IDENTITY_ENABLED`, `GMAIL_ENABLED`, `DISCORD_ENABLED` for safe incremental rollout.

### Changed
- Executive loop now has Phase 0.5 (inbox check) before health check.
- Worker spawner supports execution pattern routing and tool restriction for plan-mode.
- Prompt builder supports v2 skill+playbook composition when `V2_PROMPT_COMPOSITION=true`.

## [1.3.0] - 2026-02-04

### Added
- **Three-tier credential system** -- Physical separation of executive (`.env.executive`), worker (`.env.worker`), and application (`.env.app`) credentials. Leak detection validates no cross-tier contamination.
- **Tier 3 format helpers** -- `credential-tiers.ts` converts app credentials to dotenv, JSON, shell, docker-compose, or YAML for platform-agnostic projects.
- **OAuth-first authentication** -- `CLAUDE_CODE_OAUTH_TOKEN` via Claude Pro/Max subscription. No Anthropic API key required.

### Changed
- Worker spawner copies `.env.worker` to `ai-sandbox/.env` centrally (not per-project).
- Environment loading order: `.env.executive` > `.env.worker` > `.env` (legacy fallback).

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

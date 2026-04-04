# V2.1 Completion Report

**Completed:** 2026-04-01

## What Shipped

### Vendor Abstraction Layer (`src/core/vendor/`)

Two provider interfaces:
- **`AgentWorkerProvider`** — Full agentic execution (tools, file editing, code execution)
- **`ChatCompletionProvider`** — Simple text-in/text-out LLM calls (breakdown, diagnosis)

Three worker backends registered in `vendor-registry.ts`:

| Vendor | Provider | Auth | Mode |
|--------|----------|------|------|
| `claude` (default) | Claude Agent SDK `query()` | `CLAUDE_CODE_OAUTH_TOKEN` | Single |
| `codex` | OpenAI Codex SDK threads | `codex login` (ChatGPT) | Single |
| `kimi` | Wire SDK or CLI stream-json | `kimi login` (CLI session) | Dual (`KIMI_MODE`: `wire` or `cli`) |

All providers normalize output to `AgentWorkerMessage` with structured `[tool_call]`, `[tool_result]`, and `[thinking]` prefixes for uniform logging.

### Per-Goal Vendor Override

Goals can specify `worker_vendor: codex` (or `kimi`) in PROMPT.md frontmatter.
Priority: goal frontmatter > `WORKER_VENDOR` env > `claude` default.

### E2E Vendor Tests

`tests/e2e/vendor-workers/` — standalone test scripts for each vendor and the registry.

### GitHub Pages Deployment

Automated CI pipeline deploys all Vite projects from `ai-sandbox/` to GitHub Pages:
- **Landing page:** [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/)
- Build script: `ai-sandbox/scripts/build-pages-site.mjs`
- Workflow: `ai-sandbox/.github/workflows/deploy-pages.yml`
- Recursive project discovery, per-project `--base` path injection
- Landing page grouped by date, SPA 404 fallback

### Multi-Vendor Output Comparison

Same prompt ("build a personal finance dashboard in React") executed across all 4 vendor modes:

| Variant | Live URL | Rank | Score |
|---------|----------|------|-------|
| [Claude](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-31/finance-dashboard-claude/) | :3001 | 3rd | 88/130 |
| [Codex](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-31/finance-dashboard-codex/) | :3002 | 1st | 115/130 |
| [Kimi CLI](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-31/finance-dashboard-kimi-cli/) | :3003 | 2nd | 92/130 |
| [Kimi Wire](https://jackzhaojin.github.io/ai-sandbox/projects/react/2026-03-31/finance-dashboard-kimi-wire/) | :3004 | 4th | 87/130 |

Detailed analysis: `learning/finance-dashboard-comparison-2026-03-31.md`

## Scope Decisions

| Decision | Rationale |
|----------|-----------|
| Worker tier only (not Executive or Application) | Executive loop is mostly deterministic — LLM only used for breakdown/diagnosis. Multi-model executive adds complexity without clear value. |
| Kimi dual-mode (Wire + CLI) | Wire SDK for bidirectional streaming, CLI for simpler logs. Both coexist via `KIMI_MODE` env. |
| No new API keys needed | Codex and Kimi both use CLI login sessions, matching Claude's OAuth approach. |
| Uniform `AgentWorkerMessage` format | All vendors emit the same output shape so executive loop, verifiers, and ledgers work identically. |

## Key Files

| File | Purpose |
|------|---------|
| `src/core/vendor/types.ts` | Provider interfaces |
| `src/core/vendor/vendor-registry.ts` | Vendor registration and lookup |
| `src/core/vendor/claude-provider.ts` | Claude Agent SDK backend |
| `src/core/vendor/codex-provider.ts` | OpenAI Codex SDK backend |
| `src/core/vendor/kimi-provider.ts` | Kimi Wire/CLI backend |
| `src/agentic/execution/worker-spawner.ts` | Routes to vendor based on goal/env config |
| `tests/e2e/vendor-workers/` | E2E test scripts per vendor |
| `references/poc/{claude,codex,kimi}/` | Standalone proof-of-concept scripts |
| `ai-sandbox/.github/workflows/deploy-pages.yml` | GitHub Pages CI |
| `ai-sandbox/scripts/build-pages-site.mjs` | Pages build script |

## Comparison Highlights

- **Codex** produced the best architecture (separated types/hooks/lib, reusable `DashboardCard`, `Intl` formatters) and the only fully working dark mode using CSS custom properties
- **Claude** was the most concise (575 LOC vs Codex's 1,233) with the best LOC-to-feature ratio
- **Kimi CLI** had the richest interactivity (search, user profile, notifications) but broken dark mode
- **Kimi Wire** had a working dark mode but the largest bundle (1.2MB) and a visible "All Categori" text truncation bug
- All 4 passed TypeScript strict checks with zero errors; none wrote tests

# V2.1 Goal: Multi-Model Worker Support

**Status:** Completed (2026-04-01)

## Vision

Make the continuous agent multi-model at the **Worker tier** — workers can be spawned on different model providers, not just Claude.

## Target Models

- **Claude** (existing, default) — Claude Agent SDK `query()`
- **OpenAI Codex** — Codex SDK threads
- **Kimi K2.5** (Moonshot AI) — Wire SDK or CLI stream-json

## Scope (Revised from Original)

The original goal targeted all three tiers (Executive, Worker, Application). Revised to **Worker tier only**, which is where multi-model support provides the most value — comparing output quality across providers for the same prompt.

| Tier | V2.0 | V2.1 Target | Status |
|------|------|-------------|--------|
| **Worker** (task execution) | Claude only | Claude, Codex, Kimi (Wire + CLI) | **Done** |
| Executive (loop orchestration) | Claude | Claude (unchanged) | Deferred |
| Application (built apps) | N/A | N/A | Out of scope |

## Key Considerations

- Abstract the Agent SDK layer so different model backends can be swapped in
- Each model has different CLI/API patterns (Codex is a CLI tool, Kimi has Wire SDK + CLI modes)
- Auth per provider via CLI login sessions (no new API keys needed)
- All vendor outputs normalized to a common message format for uniform logging
- Per-goal vendor override via PROMPT.md frontmatter

## Deliverables

1. Vendor abstraction layer with provider interfaces
2. Three worker backends (Claude, Codex, Kimi)
3. Per-goal vendor override in PROMPT.md frontmatter
4. E2E vendor tests
5. Multi-vendor output comparison (same prompt, 4 variants)
6. GitHub Pages deployment for live comparison

See [completion.md](./completion.md) for what shipped and results.

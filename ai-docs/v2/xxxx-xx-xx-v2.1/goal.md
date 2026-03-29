# V2.1 Goal: Multi-Model Support

## Vision

Make the continuous agent truly multi-model — all three tiers (Executive, Worker, Application) should be able to run on different model providers, not just Claude.

## Target Models

- **OpenAI Codex** (CLI agent)
- **Kimi K2.5** (Moonshot AI)
- Claude (existing, baseline)

## Scope

All three tiers should support model swapping:

| Tier | Current | V2.1 Target |
|------|---------|-------------|
| **Executive** (loop orchestration) | Claude via Agent SDK | Codex, Kimi K2.5, Claude |
| **Worker** (task execution) | Claude via Agent SDK | Codex, Kimi K2.5, Claude |
| **Application** (built apps) | Claude API calls | Codex, Kimi K2.5, Claude |

## Key Considerations

- This is a large goal — will need incremental planning to get there
- Need to abstract the Agent SDK layer so different model backends can be swapped in
- Each model has different CLI/API patterns (Codex is a CLI tool, Kimi K2.5 has its own API)
- Credential management per provider (new env vars per tier per provider)
- Prompt compatibility — prompts may need adaptation per model

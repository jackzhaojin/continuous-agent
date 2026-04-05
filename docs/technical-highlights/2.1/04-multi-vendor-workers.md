# Technical Highlight 4: Multi-Vendor Worker Abstraction

**File:** [`src/core/vendor/vendor-registry.ts`](../../../src/core/vendor/vendor-registry.ts)

## What It Does

The vendor registry is the abstraction layer that lets the coding agent spawn workers using different LLM backends -- Claude, OpenAI Codex, or Kimi K2.5 -- through a unified interface. The executive loop doesn't know or care which model is doing the coding.

```
┌─────────────────┐
│  Executive Loop  │  Picks work, builds contracts
└────────┬────────┘
         │ AgentWorkerProvider interface
         ▼
┌────────────────────────────────────────┐
│          Vendor Registry               │
│  resolves vendor from env or frontmatter│
├──────────┬──────────┬─────────────────┤
│  Claude  │  Codex   │  Kimi           │
│  Agent   │  SDK     │  Wire or CLI    │
│  SDK     │  Threads │  stream-json    │
└──────────┴──────────┴─────────────────┘
```

## Two Provider Interfaces

| Interface | Purpose | Used By |
|-----------|---------|---------|
| `AgentWorkerProvider` | Full agentic execution (tools, file editing, code execution) | Worker spawner |
| `ChatCompletionProvider` | Simple text-in/text-out LLM calls | Goal breakdown, diagnosis, intent classification |

## Vendor Selection

Three levels of override (highest priority wins):

1. **Per-goal frontmatter**: `worker_vendor: codex` in PROMPT.md
2. **Environment variable**: `WORKER_VENDOR=kimi`
3. **Default**: `claude`

## Normalized Output

All vendors normalize their output to `AgentWorkerMessage` with structured prefixes (`[tool_call]`, `[tool_result]`, `[thinking]`) so logs and validation work identically regardless of backend.

## Talk Points

- Same goal definition, same validation -- swap the coding engine underneath
- Kimi has two modes: Wire SDK (bidirectional, richer) and CLI (simpler, cleaner logs)
- Live comparison: same "finance dashboard" prompt across all 4 vendor modes, deployed at [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/)

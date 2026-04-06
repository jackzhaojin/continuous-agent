# Technical Highlight 4: Multi-Vendor Worker Abstraction

**Files:** [`src/core/vendor/vendor-registry.ts`](../../../src/core/vendor/vendor-registry.ts), [`src/agentic/intelligence/vendor-adapter.ts`](../../../src/agentic/intelligence/vendor-adapter.ts)

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

## Per-Vendor Prompt Adaptation

The prompt builder composes a universal prompt from skills, then the vendor adapter (`vendor-adapter.ts`) tailors it for each backend. This is critical because vendors differ in what they can auto-discover:

| What Workers Get | Claude | Kimi CLI | Codex |
|------------------|--------|----------|-------|
| Reads `CLAUDE.md` at ai-sandbox root? | Yes (SDK auto-loads) | No | No |
| Reads `.claude/skills/` directory? | Yes (SDK auto-discovers) | No | No |
| Tool names | Read, Write, Edit, Bash | ReadFile, WriteFile, StrReplaceFile, Shell | read_file, write_file, apply_diff, shell |
| Prompt weight | Lighter (SDK provides context) | Heavy (everything inline) | Heavy (everything inline) |

**What the adapter does for non-Claude vendors:**

1. **Tool name translation** -- Replaces backtick-quoted tool references throughout the prompt (`` `Bash` `` -> `` `Shell` `` for Kimi) and appends a mapping section
2. **No duplicate injection** -- Skill content (worker-base, web-testing) is already in the composed prompt for all vendors; the adapter only adds the mapping footer

```
## Tool Name Mappings

In this environment, use these tool names:
- Instead of "Bash", use "Shell"
- Instead of "Read", use "ReadFile"
- Instead of "Write", use "WriteFile"
- Instead of "Edit", use "StrReplaceFile"
```

## Normalized Output

All vendors normalize their output to `AgentWorkerMessage` with structured prefixes (`[tool_call]`, `[tool_result]`, `[thinking]`) so logs and validation work identically regardless of backend.

## Talk Points

- Same goal definition, same validation -- swap the coding engine underneath
- Vendor adaptation is a pure function: compose universal prompt, then post-process per vendor
- Kimi has two modes: Wire SDK (bidirectional, richer) and CLI (`--print stream-json`, cleaner turn counting)
- Live comparison: same "finance dashboard" prompt across all 4 vendor modes, deployed at [jackzhaojin.github.io/ai-sandbox](https://jackzhaojin.github.io/ai-sandbox/)

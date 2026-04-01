---
paths:
  - "src/agentic/execution/**/*.ts"
---

# Worker Spawning & Execution

## Worker Spawner (`worker-spawner.ts`)

- Spawns Claude Agent SDK sessions with `query()` from `@anthropic-ai/claude-agent-sdk`
- 30-minute wall-clock timeout per worker
- Copies `.env.worker` to `ai-sandbox/.env` (centralized, not per-project)
- Copies `.env.app` to `ai-sandbox/.env.app` if it exists
- Validates no executive-tier keys leaked into worker env
- Project directory auto-setup with `.gitignore`

**Special routing:**
- `[SELF-ENHANCE]` goals -> agent codebase (`AGENT_BASE`), adds Task tool for self-enhancer subagent
- `[SKILL-BUILD]` goals -> agent codebase, delegates to skill-builder subagent
- All other goals -> `ai-sandbox/` with isolated project directories

**Execution patterns:**
- `plan-then-execute`: Standard worker (default)
- `plan-mode`: Restricts tools to read-only
- `loop-until-progress`: Standard worker (wrapper TBD)
- `deterministic-pipeline`: Falls back to plan-then-execute (executor built but not wired)

**Retry context preservation:** `output_path` from first attempt persists so retries continue in the SAME project directory.

## Execution Handler (`execution-handler.ts`)

- Orchestrates work execution with in-memory retry tracking
- Retry tracker is a Map: tracks attempts, strategies tried, output_path per goal
- After each failure, `strategy-selector.ts` picks a DIFFERENT approach
- Passes full retry context to worker: attempts, strategies tried, last error, existing project path

## Prompt Builder (`prompt-builder.ts`)

- Builds context-rich prompts including: Constitution, retry context, selected strategy, task contract
- V2: When `V2_PROMPT_COMPOSITION=true`, loads skill+playbook libraries for deterministic composition
- V1 fallback: Uses versioned template files from `src/agentic/prompts/`

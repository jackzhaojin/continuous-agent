# Agentic Test Harness

A small in-repo pattern for testing agentic capabilities (skills loaded via `loadSkillPrompt` → Agent SDK `query()` → tool calls → side effects → final output) without pulling in an external framework.

**Why this exists:** the codebase has been historically deterministic — hand-rolled `tsx` scripts under `tests/`, no test framework. As V3.0 adds agentic capabilities (memory hooks, agentic harvester writes, agentic reader synthesis), we need a way to validate "the agent loaded a skill, called the right tools, and produced the right side effects." This module is that pattern.

## What the field has converged on (May 2026)

Reading the current best practice across [Anthropic's eval guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [TribeAI/claude-evals](https://github.com/TribeAI/claude-evals), [Promptfoo's Agent SDK provider](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/), [LangSmith](https://www.langchain.com/langsmith/evaluation), and [DeepEval](https://www.braintrust.dev/articles/deepeval-alternatives-2026), three patterns appear in every credible source:

### 1. Three-layer assertion model

| Layer | What | Why |
|---|---|---|
| **Trajectory** | Which tools/skills the agent called, with what params | Microsoft AgentPex found 83% of Claude 3.5 Sonnet traces with perfect final-output scores still had at least one procedural violation. Final output alone misses most failures. |
| **Side effects** | Real state changes: files created, ledger entries appended, memory IDs persisted | The ground truth. If the memory landed in mem0, the test passed regardless of what the agent said. |
| **Output** | Final text quality, citation discipline, format | Lightweight; catches obvious regressions (missing citations, hallucinated IDs). |

You don't have to assert on all three for every test, but you should assert on **at least two**. Output-only tests are the most common antipattern.

### 2. Deterministic graders where possible, LLM-judge where necessary

Anthropic's blunt rule: *"deterministic graders where possible, LLM graders where necessary."*

For the V3.0 memory work, almost everything is deterministic:

- "Did agent call `mcp__mem0__search_memories`?" → check the message stream
- "Did a memory_id end up in `ledgers/harvest-runs/<date>.jsonl`?" → file check
- "Does mem0 return our test memory via `client.get(memoryId)`?" → API check
- "Does the final answer cite memory IDs?" → regex

Only "is this synthesis high quality?" needs LLM-judge. Skip it until you actually need it.

### 3. Isolation + cleanup

Anthropic: *"Each trial should be 'isolated' by starting from a clean environment."* Shared state causes correlated failures from infrastructure flakiness, not agent regressions.

For us, isolation = a **unique scope** (`app_id: test-mem-{timestamp}-{nonce}`) per test. Cleanup = delete every memory under that scope in `finally{}`.

### What we explicitly skipped

- **Promptfoo / DeepEval / LangSmith / Braintrust** — full eval platforms with run history, rubric tooling, regression detection, cost controls. Useful at 50–500+ test cases. **Premature at our scale** — we have 5 new skills and an empty test set.
- **Lifecycle hooks (PreToolUse / PostToolUse / SubagentStop)** — Promptfoo and claude-evals rely on these. We can extract everything we need from the Agent SDK's existing message stream (the stream yields `tool_use` and `tool_result` blocks per turn). No need for hooks.
- **LLM-as-judge graders** — non-deterministic, requires calibration runs, adds latency and cost. Add only when deterministic checks can't capture the property.
- **Large golden datasets** — Anthropic recommends "20–50 simple tasks from real failures" as a starting point. We have zero failures yet; tests grow organically.

## The harness API

### `runAgenticTest(opts)`

Runs an Agent SDK `query()` with a skill prompt as the input, captures the full message stream, and returns a structured trace plus the final result.

```typescript
const result = await runAgenticTest({
  skill: 'memory-hook-post-run-harvest',        // skill name; loaded via loadSkillPrompt
  vars: { CONTEXT_JSON: JSON.stringify(ctx) },  // placeholder substitution
  scope: { app_id: TEST_APP_ID },               // unique per run for cleanup
  options: {                                    // forwarded to query()
    model: 'claude-sonnet-4-5',
    maxTurns: 12,
    mcpServers: { mem0: { type: 'stdio', command: 'uvx', args: ['mem0-mcp-server'], env: { ... } } },
    allowedTools: ['Read', 'Bash', 'Skill', 'mcp__mem0__search_memories', ...],
  },
});

// result has:
//   .finalText        — the agent's final assistant text
//   .toolCalls        — array of { name, input, ms } from the stream
//   .skillsInvoked    — array of skill names (parsed from Skill tool calls)
//   .messages         — raw SDKMessage[] for advanced introspection
```

### Assertions

Three layers. Use what you need; don't force coverage on layers that don't apply.

**Trajectory:**

```typescript
expectSkillCalled(result, 'memory-harvester');
expectToolCalled(result, 'Bash', /harvest\.ts/);  // optional regex on input
expectToolCalledAtLeastN(result, 'mcp__mem0__search_memories', 3);
```

**Side effects:**

```typescript
await expectLedgerHasEntry('ledgers/harvest-runs/<today>.jsonl', { memoryId: result.capturedMemoryId });
await expectMem0MemoryExists(memoryId);  // hits client.get()
await expectFileWritten('<path>');
```

**Output:**

```typescript
expectOutputContains(result, /Harvest summary/);
expectOutputMatchesAll(result, [/\b[a-f0-9]{8}\b/, /SUCCEEDED/]);  // cited ID + status
```

### Cleanup

```typescript
afterEach: await cleanupMem0Scope({ user_id, app_id: TEST_APP_ID });
```

Deletes every memory under the test scope. Safe to call multiple times (idempotent).

## Test conventions

- **One file per test scenario.** No grouping into `describe` blocks; each `*.test.ts` is independently runnable via `npx tsx tests/e2e/v3-memory/01-skill-loadability.test.ts`.
- **Three categories of tests** distinguished by filename and cost:
  - `*-mocked.test.ts` or no suffix — deterministic, no API call (free, fast)
  - `*-live.test.ts` — hits real APIs (mem0, Claude OAuth); pennies per run, gated behind env vars when needed
  - `*-bench.test.ts` — performance / latency benchmark (optional)
- **Unique test scope per run.** Generate via `makeTestScope()`; tear down in `finally{}`.
- **No external test framework.** Plain `tsx` execution, exit code 0 = pass, non-zero = fail. Matches the existing `tests/adhoc/*.ts` convention.

## When to graduate to a framework

If we hit any of these, time to consider promptfoo or LangSmith:

- More than 50 test cases under management → tag/filter tooling becomes valuable
- Need for run history and regression detection across model upgrades
- Need to share runs with non-developers (PMs, designers)
- LLM-judge grading becomes routine (rubric tooling pays off)
- Multi-model A/B comparison becomes a recurring need

None of those apply yet. Revisit at the V3.2 retro.

## References

- [Anthropic — Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — Core 3-layer model, isolation rule, dataset sizing guidance.
- [TribeAI/claude-evals](https://github.com/TribeAI/claude-evals) — Reference framework using `PreToolUse`/`PostToolUse`/`SubagentStop` hooks. Python; we mirror the patterns in TS.
- [Promptfoo — Claude Agent SDK provider](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/) — YAML/JS assertions on `metadata.toolCalls` and `metadata.skillCalls`.
- [LangSmith Evaluation](https://www.langchain.com/langsmith/evaluation) — Trajectory evaluation as a first-class concept.
- Existing in-repo precedent: [`tests/e2e/v2.1-skills-agents/executive-skill-prompts-e2e.ts`](../e2e/v2.1-skills-agents/executive-skill-prompts-e2e.ts) — hand-rolled assertions over `loadSkillPrompt()` outputs.
- Existing in-repo precedent: [`tests/e2e/vendor-workers/claude-worker-e2e.ts`](../e2e/vendor-workers/claude-worker-e2e.ts) — iterates Agent SDK message stream and asserts on tool calls.

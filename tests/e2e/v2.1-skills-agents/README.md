# V2.1 Skills, Agents & Rules E2E Tests

End-to-end tests that spawn real Claude Agent SDK sessions and ChatCompletion calls to verify `.claude/skills/`, `.claude/agents/`, and `.claude/rules/` are loaded and working.

## Prerequisites

- `CLAUDE_CODE_OAUTH_TOKEN` set (loaded from `.env.app`, `.env.worker`, `.env.backup.local`, or environment)

## Running

```bash
# All tests
npx tsx tests/e2e/v2.1-skills-agents/skills-agents-rules-e2e.ts
npx tsx tests/e2e/v2.1-skills-agents/executive-skill-prompts-e2e.ts

# Local-only (no API calls)
npx tsx tests/adhoc/v2.1-skill-prompt-loader.adhoc.ts
```

## Test Files

### `skills-agents-rules-e2e.ts` (15 assertions)

Spawns real Claude workers with `cwd: continuous-agent/` and `settingSources: ['user', 'project']` to verify the `.claude/` directory is loaded.

| Test | What it proves |
|------|----------------|
| 1. Worker lists skills | `settingSources` loading works -- worker sees all 7 skills in `.claude/skills/` |
| 2. Worker reads skill content | Worker can read `email-triage/SKILL.md` and identify its actions (archive, queue, reply) |
| 3. Rules files accessible | Worker can discover all rule files in `.claude/rules/` |
| 4. skill-prompt-loader + ChatCompletion | Loads `failure-diagnosis` skill, renders variables, sends to LLM, gets valid JSON diagnosis back |
| 5. Agent definitions visible | Worker finds `self-enhancer.md` and `skill-builder.md` in `.claude/agents/` |

### `executive-skill-prompts-e2e.ts` (15 assertions)

Loads each executive skill from `.claude/skills/`, renders variables, sends to `ChatCompletionProvider`, and validates the LLM returns correctly structured output.

| Test | Skill | Validates |
|------|-------|-----------|
| 1. email-triage | `.claude/skills/email-triage/` | Bounce email -> archive, human email -> queue/new_goal. Returns `decisions` array with correct actions. |
| 2. goal-breakdown | `.claude/skills/goal-breakdown/` | Returns JSON array of 3+ steps. Step 0 is research/planning with 20+ turns. All steps have title, description, estimated_turns. |
| 3. failure-diagnosis | `.claude/skills/failure-diagnosis/` | Returns JSON with rootCause, shouldRetry, escalateToHuman. Correctly identifies `.env.production` as the issue. |

### `_test-helpers.ts`

Shared utilities:
- `loadAgentEnv()` -- loads credentials from all env tiers (`.env.executive`, `.env.worker`, `.env.app` with `APP_` prefix stripping)
- `createAssert()` -- test assertion helper with pass/fail counting

## Gotchas

**Triple backticks in SKILL.md break ChatCompletion.** The `ClaudeChatProvider` uses Agent SDK single-turn mode, which interprets `` ``` `` code blocks as tool output and returns empty responses. Use indented examples instead of fenced code blocks in skill files that are sent through `ChatCompletionProvider`.

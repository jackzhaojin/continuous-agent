---
paths:
  - "src/agentic/execution/worker-spawner.ts"
  - "src/agentic/work-selection/work-selector.ts"
  - ".claude/agents/**"
---

# Self-Enhancement & Skill-Build Workflows

The agent can modify its own infrastructure through special goal prefixes.

## How It Works

1. **Tag detection**: `[SELF-ENHANCE]` or `[SKILL-BUILD]` prefix in goal title
2. **Special routing**: Worker spawner routes to agent codebase instead of `ai-sandbox/`
3. **Subagent delegation**: Uses Task tool:
   - `[SELF-ENHANCE]` -> `.claude/agents/self-enhancer.md`
   - `[SKILL-BUILD]` -> `.claude/agents/skill-builder.md`
4. **Branch isolation**: Changes made on `self-enhance/<slug>` or `skill-build/<slug>` branch

**Branch tracking:** Subagent updates `PROMPT.md` with `branch:` frontmatter field to resume on same branch across restarts.

## What Can Be Modified

| Category | Examples | Allowed |
|----------|----------|---------|
| Agent source code | `src/**/*.ts` | Yes |
| Prompt templates | `src/agentic/worker-prompts/**/*.md` | Yes |
| Skills & Agents | `.claude/skills/`, `.claude/agents/` | Yes |
| Configuration | `capabilities/*.yml`, `tsconfig.json` | Yes |
| Documentation | `CLAUDE.md`, `README.md`, `ai-docs/` | Yes |
| Constitution | `workspace/constitution.md` | **NEVER** |

## Key Implementation Files

- **Detection:** `work-selector.ts` parses prefixes, preserves full title for regex matching
- **Routing:** `worker-spawner.ts` routes to agent codebase, adds Task tool
- **Review notification:** `state-handler.ts` adds review request to needs-you.md on completion

## Critical Bug to Avoid

Title prefix (`[SELF-ENHANCE]` / `[SKILL-BUILD]`) must be **preserved** (not stripped) for regex matching in `updateStepStatus`. Stripping it causes step status updates to fail silently, making steps repeat.

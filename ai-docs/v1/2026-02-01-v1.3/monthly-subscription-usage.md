# Monthly Subscription Usage (V1.3)

## Purpose
Provide a clear, operator-focused guide for using **monthly subscriptions** with the Continuous Executive Agent, covering:
- Claude Agent SDK (OAuth subscription)
- Codex CLI headless (OpenAI subscription)
- Required permissions/tools for skills, MCP, subagents, and tasks
- When to route work to each runtime

## Summary
- **Claude Agent SDK** supports **Claude Pro/Max** monthly subscriptions via OAuth tokens.
- **Codex CLI (headless)** supports **OpenAI monthly subscriptions** (plan-based), but does **not** support Claude-style skills or project/user skills.
- The executive should choose the runtime based on required tools/skills:
  - Use **Claude Agent SDK** for anything requiring skills, subagents, or tool gating.
  - Use **Codex CLI** for simple bash/code tasks where skills aren’t required.

## Claude Agent SDK — Monthly Subscription Path (OAuth)
**Best for:** complex multi-step tasks, skill usage (`SKILL.md`), subagents, or tool/permission gating.

### OAuth Subscription Flow
1. Generate OAuth token via Claude CLI:
   ```bash
   claude setup-token
   ```
2. Set `CLAUDE_CODE_OAUTH_TOKEN` in `.env` (must start with `sk-ant-`).
3. Run agent normally — usage bills against monthly subscription.

### Required Settings (Skills + Subagents)
When spawning Claude SDK workers, include:
- `cwd: <project root>`
- `settingSources: ['user', 'project']` (loads `~/.claude/skills` and `.claude/skills`)
- `allowedTools` including:
  - `Skill` (for SKILL.md-based workflows)
  - `Task` (for subagent delegation)

### Subagent Notes
- Subagents are defined in `.claude/agents/` (project) or `~/.claude/agents/` (user).
- Subagents **cannot spawn other subagents**.
- Background subagents **do not** have MCP tools available.

## Codex CLI (Headless) — Monthly Subscription Path
**Best for:** cost-sensitive, simpler bash/code tasks with minimal tooling requirements.

### Capabilities & Limitations
- **No Skill tool** → cannot use `SKILL.md` workflows.
- **No settingSources** → cannot load project/user skills or agents.
- **Different tool model** → treat as a basic CLI runner for code + shell.

### Recommended Task Types
- Simple code edits, refactors, or transformations
- Scripted tasks that do not require skills or agent delegation
- Quick fixes that can be executed with shell + file context only

## Runtime Selection Guidance
### Use Claude Agent SDK when:
- Task requires skills (`Skill` tool)
- Subagents are necessary (`Task` tool)
- MCP integrations are needed
- Complex or multi-phase execution is expected

### Use Codex CLI when:
- Task is simple and bounded
- No skills/subagents/MCP are required
- You want a lower-cost, lightweight worker

## Permissions, Tools, MCP, Subagents, Tasks — Quick Matrix

| Capability | Claude Agent SDK | Codex CLI (Headless) |
|---|---|---|
| Monthly subscription billing | ✅ OAuth (Pro/Max) | ✅ OpenAI plan |
| Skills (`SKILL.md`) | ✅ Skill tool | ❌ Not supported |
| Project/User skills | ✅ via `settingSources` | ❌ Not supported |
| Subagents (`Task`) | ✅ Supported | ❌ Not supported |
| MCP tools | ✅ Supported (main context) | ❌ Not supported |
| Shell integration | ✅ via tools | ✅ basic CLI |

## Implementation Notes for the Executive
- Tag capabilities in the registry with `sdk_compatibility` so the selector can route work correctly.
- If a task references skills/subagents/MCP explicitly, **force Claude Agent SDK**.
- If a task is purely bash/code and doesn’t need skills, **Codex CLI is acceptable**.


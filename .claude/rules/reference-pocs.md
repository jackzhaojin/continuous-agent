---
paths:
  - "references/**"
---

# Reference POCs

Proof-of-concept projects in `references/poc/claude/` demonstrating Agent SDK patterns.

## chat-cli

Interactive CLI showing:
- `query()` from `@anthropic-ai/claude-agent-sdk`
- Streaming message handling (`for await of stream`)
- OAuth token authentication (subscription-first, no API key)

## agent-sdk-skills-poc

Skills integration:
- `settingSources: ['user', 'project']` is REQUIRED for skills
- `allowedTools` must include `'Skill'`
- `cwd` must point to project root for `.claude/skills/` discovery

## agent-sdk-subagents-poc

Subagent delegation via Task tool:
- `allowedTools` must include `'Task'`
- User-level (`~/.claude/agents/`) and project-level (`.claude/agents/`) both work
- Subagents CANNOT spawn other subagents (no nesting)

**Skills vs Subagents:**

| Aspect | Skills | Subagents |
|--------|--------|-----------|
| Location | `.claude/skills/` | `.claude/agents/` |
| Tool | `Skill` | `Task` |
| Context | Main context | Isolated |
| Purpose | Reusable prompts | Delegated tasks |

## Running POCs

```bash
cd references/poc/claude/<name> && npm install && npm run build && npm start
```

Each has its own `.env.example` to copy and configure.

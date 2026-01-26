# References

External references and foundational POCs for the continuous agent.

## POCs (`poc/`)

Working proof-of-concept projects demonstrating Agent SDK patterns:

| POC | Purpose | Key Learnings |
|-----|---------|---------------|
| `chat-cli/` | Interactive CLI demo | `query()` usage, streaming, message types, auth patterns |
| `agent-sdk-skills-poc/` | Skills integration | `settingSources`, `allowedTools: ['Skill']`, SKILL.md format |
| `agent-sdk-subagents-poc/` | Subagent delegation | `allowedTools: ['Task']`, user/project agents, isolated context |

### Skills vs Subagents

| Aspect | Skills | Subagents |
|--------|--------|-----------|
| Location | `.claude/skills/` | `.claude/agents/` |
| Tool | `Skill` | `Task` |
| Context | Runs in main | Isolated |
| Nesting | Can be invoked by subagents | Cannot spawn subagents |

**Running:**
```bash
cd poc/<name> && npm install && npm run build && npm start
```

Each POC has its own `.env.example` - copy to `.env` and add credentials.

## Registry (`reference-registry.yaml`)

Single source of truth for all external references. Modes:
- **Mode A:** Pinned clone (read-only, ~70-80%)
- **Mode B:** Clone + patches (small fixes, ~15-25%)
- **Mode C:** Fork (active dependencies, <5%)

See `reference-registry.yaml` for full details and decision tree.

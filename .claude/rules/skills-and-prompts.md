---
paths:
  - ".claude/skills/**"
  - "claude-files-to-output/**"
  - "src/agentic/intelligence/prompt-builder.ts"
  - "src/agentic/intelligence/vendor-adapter.ts"
---

# Skills Architecture & Prompt System

## Two-CWD Skill Model

Skills are separated into **executive skills** and **worker skills** based on which process reads them. The separation is enforced by CWD — the executive runs from `continuous-agent/`, workers run from `ai-sandbox/`.

### Executive Skills — `.claude/skills/`

Located at `continuous-agent/.claude/skills/`. Read by the executive loop and Claude Code when working on the agent codebase.

| Skill | Purpose |
|-------|---------|
| `executive-loop` | 8-phase loop orchestration |
| `work-selection` | Priority-based goal selection |
| `goal-breakdown` | LLM-based task decomposition |
| `goal-drafter` | Goal bundle creation |
| `task-contract` | Executive-worker contract creation |
| `failure-diagnosis` | Root cause analysis after failures |
| `validator` | Post-worker verification |
| `email-triage` | Gmail inbox classification |
| `practice-loop` | Idle-time skill improvement |
| `retrospective` | Performance analysis |
| `long-agent-monitor` | PM2/log monitoring |

### Worker Skills — `claude-files-to-output/skills/`

**Synced to `ai-sandbox/.claude/skills/` before every worker spawn** by `worker-spawner.ts`.

```
continuous-agent/claude-files-to-output/    ──cpSync──>    ai-sandbox/.claude/
├── skills/                                                ├── skills/
│   ├── calibration-nextjs/SKILL.md                       │   ├── calibration-nextjs/SKILL.md
│   ├── project-architect/SKILL.md                        │   ├── project-architect/SKILL.md
│   └── ...                                               │   └── ...
└── agents/                                               └── agents/
    ├── code-validator.md                                     ├── code-validator.md
    └── task-researcher.md                                    └── task-researcher.md
```

- **Claude workers** (CWD = `ai-sandbox/`) read `ai-sandbox/.claude/skills/` automatically via the SDK and invoke them with the `Skill` tool
- **Kimi/Codex workers** do NOT read `.claude/skills/`. All instructions must be injected into the prompt by the V2 prompt builder
- **To add a new worker skill:** create it in `claude-files-to-output/skills/{name}/SKILL.md` — synced on next spawn

### Other `.claude/` directories

| Directory | Purpose |
|-----------|---------|
| `.claude/agents/` | Subagent definitions (self-enhancer, skill-builder). Spawned for `[SELF-ENHANCE]` and `[SKILL-BUILD]` goals. |
| `.claude/rules/` | Contextual rules loaded by Claude Code — domain knowledge about each subsystem. Manually referenced from `CLAUDE.md` for non-Claude agents. |

## Prompt System (Skill-Based Composition)

Worker prompts are built by `buildV2ComposedPrompt()` in `src/agentic/intelligence/prompt-builder.ts`. V1 templates removed — this is the only path.

**Composition order:**
1. **Objective** — task title, description, priority, contract ID, project path
2. **Constraints** — tools allowed, max turns, definition of done
3. **Worker-base skill** — constitution limits, monorepo rules, execution guidelines
4. **Execution pattern** — plan-then-execute, loop-until-progress, etc.
5. **Playbook** — matched from `playbooks/` (if any)
6. **Skill references** — loaded from `claude-files-to-output/skills/` (if playbook references them)
7. **Web-testing skill** — playwright-cli protocol, auto-loaded for web projects
8. **Validation criteria** — definition of done as checklist
9. **Vendor adaptation** — tool name mappings for non-Claude vendors (via `vendor-adapter.ts`)

**Vendor-specific behavior:**

| Vendor | Reads CLAUDE.md? | Reads Skills? | Tool Names | Prompt Adaptation |
|--------|-----------------|---------------|------------|-------------------|
| Claude | Yes (SDK auto-loads) | Yes (Skill tool) | Read, Write, Edit, Bash | Lighter prompt |
| Kimi CLI | No | No | ReadFile, WriteFile, StrReplaceFile, Shell | Full prompt + tool maps |
| Codex | No | No | Own tool set | Full prompt + tool maps |

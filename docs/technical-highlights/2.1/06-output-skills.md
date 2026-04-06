# Technical Highlight 6: Output Skills for Target Applications

**Directory:** [`claude-files-to-output/`](../../../claude-files-to-output/)

## What It Does

When a worker starts coding in `ai-sandbox/`, it needs pre-built skills, agent definitions, and templates available in the target workspace. The `claude-files-to-output/` directory holds these assets, which the worker spawner copies to `ai-sandbox/.claude/` before every spawn via `cpSync()`.

```
claude-files-to-output/
  skills/                        Worker skills (synced to ai-sandbox/.claude/skills/)
    worker-base/SKILL.md         Constitution, monorepo rules, execution guidelines
    web-testing/SKILL.md         Playwright-cli visual verification protocol
    calibration-nextjs/SKILL.md  Next.js project patterns
    project-architect/SKILL.md   Architecture planning
    prd-writer/SKILL.md          Product requirements generation
    project-analysis/SKILL.md    Codebase analysis
    task-breakdown/SKILL.md      Task decomposition
    claude-skill-creator/SKILL.md Meta-skill: create new skills
    ...10 skills total

  agents/                        Subagent definitions for workers
    code-validator.md            Validates code quality in output projects
    task-researcher.md           Research-focused subagent

  templates/                     Dynamic templates
    ai-sandbox-claude-md.md      CLAUDE.md generated at ai-sandbox root
```

## Two Layers of Skills (Two-CWD Model)

The executive and workers run in different directories. This separation is enforced by CWD:

| Layer | Location | CWD | Purpose |
|-------|----------|-----|---------|
| **Executive skills** | `.claude/skills/` | `continuous-agent/` | Control how the *executive agent* operates (work selection, diagnosis, validation) |
| **Worker skills** | `claude-files-to-output/skills/` | `ai-sandbox/` | Control how *workers* build applications (testing, architecture, analysis) |

The executive agent's skills govern the loop. The worker skills govern the coding work itself.

## Core Worker Skills

Two skills are loaded for every worker task by the prompt builder:

| Skill | Loaded When | Content |
|-------|-------------|---------|
| `worker-base` | Always | Constitution limits, monorepo rules, navigate-and-assess protocol, technology preferences, execution guidelines |
| `web-testing` | Web projects only | Pre-flight site health check, mandatory playwright-cli verification, fallback instructions |

Additional skills are loaded when referenced by a matched playbook's `composes_skills` list.

## How It Works

1. Worker spawner calls `cpSync(claude-files-to-output/, ai-sandbox/.claude/)` before every spawn
2. Prompt builder reads skill files from `claude-files-to-output/skills/` (source of truth)
3. For Claude workers: skills are also available via the Skill tool at `ai-sandbox/.claude/skills/`
4. For Kimi/Codex workers: skill content is injected directly into the prompt string
5. Templates are rendered with dynamic sections (services, credentials) and written to `ai-sandbox/CLAUDE.md`

## Talk Points

- Separation of concerns: executive intelligence vs worker intelligence
- Skills are composable -- workers can use project-architect, then task-breakdown, then code
- New skills added to `claude-files-to-output/skills/` are immediately available to all future workers
- The worker-base skill ensures every worker starts with the Constitution -- safety is structural, not opt-in

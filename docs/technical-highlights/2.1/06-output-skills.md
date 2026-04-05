# Technical Highlight 6: Output Skills for Target Applications

**Directory:** [`claude-files-to-output/`](../../../claude-files-to-output/)

## What It Does

When a worker starts coding in `ai-sandbox/`, it needs pre-built skills and agent definitions available in the target workspace. The `claude-files-to-output/` directory holds these assets, which the worker spawner copies to `ai-sandbox/.claude/` before execution.

```
claude-files-to-output/
  agents/                    Subagent definitions for workers
    code-validator.md        Validates code quality in output projects
    task-researcher.md       Research-focused subagent

  skills/                    Pre-built skills available to workers
    calibration-eds/         EDS calibration patterns
    calibration-nextjs/      Next.js project calibration
    claude-skill-creator/    Meta-skill: create new skills
    playwright-demo-video/   Browser testing + video recording
    prd-writer/              Product requirements generation
    project-analysis/        Codebase analysis
    project-architect/       Architecture planning
    task-breakdown/          Task decomposition
```

## Two Layers of Skills

| Layer | Location | Purpose |
|-------|----------|---------|
| **Executive skills** | `.claude/skills/` | Control how the *executive agent* operates (work selection, diagnosis, validation) |
| **Output skills** | `claude-files-to-output/skills/` | Control how *workers* build applications (architecture, testing, analysis) |

The executive agent's skills govern the loop. The output skills govern the coding work itself.

## How It Works

1. Worker spawner calls `copyClaudeFilesToOutput()` before spawning
2. Files from `claude-files-to-output/` are synced to `ai-sandbox/.claude/`
3. Workers see these skills/agents as native Claude Code capabilities
4. Workers can invoke skills via `/skill` commands in their coding session

## Talk Points

- Separation of concerns: executive intelligence vs worker intelligence
- Skills are composable -- workers can use project-architect, then task-breakdown, then code
- New skills added to `claude-files-to-output/` are immediately available to all future workers

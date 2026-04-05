# Technical Highlight 3: Skills & Rules (Executive Agent Configuration)

**Directories:** [`.claude/skills/`](../../../.claude/skills/), [`.claude/rules/`](../../../.claude/rules/), [`.claude/agents/`](../../../.claude/agents/)

## What It Does

The `.claude/` directory defines the executive agent's behavior -- its skills, domain rules, and subagent definitions. This is where the coding agent's intelligence is configured *declaratively*, without changing TypeScript code.

```
.claude/
  skills/              Reusable skill definitions (SKILL.md files)
    executive-loop/    Central orchestration skill
    work-selection/    Priority-based task picking
    validator/         Output verification
    failure-diagnosis/ Root cause analysis
    goal-breakdown/    Complex goal decomposition
    email-triage/      Inbox classification
    ...11 skills total

  rules/               Contextual domain knowledge
    executive-loop.md  Phase details, sleep logic
    worker-spawner.md  Spawning, routing, timeouts
    credentials-and-env.md  Three-tier credential system
    verifiers.md       Validation patterns
    ...11 rules total

  agents/              Subagent definitions
    self-enhancer.md   Modifies agent's own code (on branch)
    skill-builder.md   Creates new Claude Code skills
```

## How Skills Work

Each skill has a `SKILL.md` with frontmatter (name, description, triggers) and a prompt body. The executive loop loads relevant skills to compose worker prompts. Skills are also invocable directly via Claude Code's `/skill` command.

## How Rules Work

Rules are loaded contextually by Claude Code when working on this codebase. They provide domain knowledge (e.g., "verifiers must check `result.output_path`, not `process.cwd()`") that prevents common mistakes without requiring code changes.

## Talk Points

- Skills and rules are the "soft configuration" layer -- change agent behavior without touching TypeScript
- The self-enhancer agent can create new skills autonomously (on a branch for human review)
- Rules prevent recurring mistakes by encoding domain knowledge as context

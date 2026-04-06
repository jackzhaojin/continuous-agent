# Technical Highlights: v2.1 (Multi-Vendor Coding Agent)

7 deep dives into the continuous coding agent architecture, organized into 3 categories for a 10-minute technical talk.

## Category 1: The Executive Brain (~3 min)

How the coding agent decides what to build and how to approach it.

| # | Highlight | Key File |
|---|-----------|----------|
| 1 | [The Executive Loop](01-executive-loop.md) | `src/core/executive-loop.ts` |
| 2 | [Work Selection & Goal Breakdown](02-work-selection.md) | `src/agentic/work-selection/` |
| 3 | [Skills & Rules](03-skills-and-rules.md) | `.claude/skills/`, `.claude/rules/` |

## Category 2: Worker Execution (~4 min)

How coding workers are spawned, prompted, and equipped across multiple LLM vendors.

| # | Highlight | Key File |
|---|-----------|----------|
| 4 | [Multi-Vendor Workers](04-multi-vendor-workers.md) | `src/core/vendor/vendor-registry.ts` |
| 5 | [Skill-Based Prompt Composition](05-worker-prompts.md) | `src/agentic/intelligence/prompt-builder.ts` |
| 6 | [Output Skills for Apps](06-output-skills.md) | `claude-files-to-output/` |

## Category 3: The Feedback Loop (~3 min)

How the agent validates, self-diagnoses, and retries with different strategies.

| # | Highlight | Key File |
|---|-----------|----------|
| 7 | [Validation, Diagnosis & Retry](07-validation-diagnosis-retry.md) | `src/agentic/diagnosis/` |

## Key Takeaway

The executive layer (Claude) orchestrates and reasons. The worker layer (Claude, Codex, or Kimi K2.5) writes code. Worker instructions live in SKILL.md files, not TypeScript. A vendor adapter translates tool names so the same skills work across all backends. The whole system is a coding agent that treats LLMs as interchangeable coding engines behind a unified interface.

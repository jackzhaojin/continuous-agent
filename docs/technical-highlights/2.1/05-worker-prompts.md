# Technical Highlight 5: Worker Prompt System

**Directory:** [`src/agentic/worker-prompts/`](../../../src/agentic/worker-prompts/)

## What It Does

Worker prompts are versioned markdown templates that define *exactly what a worker agent sees* when it starts coding. The prompt builder composes these templates with runtime context (task details, retry history, strategy guidance) to produce the full prompt sent to the worker.

```
src/agentic/worker-prompts/
  worker/                  Base worker prompts (versioned)
    worker-base-v2.1.0.md  Current: Constitution, monorepo rules, Definition of Done
    worker-base-v2.0.0.md  Previous versions kept for rollback
    worker-base.md         Symlink to current version

  execution/               Execution context
    ai-sandbox-claude-md-v1.0.0.md   CLAUDE.md injected into ai-sandbox
    incremental-execution-v1.0.0.md  Continue-from-existing instructions

  strategy/                Retry strategy guidance
    strategy-guidance-v1.0.0.md      Different approaches per retry attempt

  evaluations/             Output evaluation criteria
  metadata/                Prompt metadata and loading
  research/                Research-phase prompts
  retry/                   Retry-specific context
```

## Template Variables

The base worker prompt uses `{{VARIABLE}}` interpolation:

```markdown
# Task: {{TASK_TITLE}}
Priority: {{PRIORITY}} | Contract: {{CONTRACT_ID}}

## CONSTITUTION LIMITS (IMMUTABLE)
...8 hard limits injected into every worker...

## Definition of Done
{{DEFINITION_OF_DONE}}

## Project Context
Your Project Directory: {{PROJECT_PATH}}
```

## Prompt Composition (V2)

When `V2_PROMPT_COMPOSITION=true`, the prompt builder uses library-based composition:

```
objective -> constraints -> execution-pattern -> playbook -> skill references -> validation
```

This lets you change worker behavior by editing markdown files, not TypeScript.

## Talk Points

- Every worker starts with the Constitution baked in -- safety is non-negotiable
- Versioned templates mean you can A/B test prompt changes and roll back
- The prompt builder is the bridge between "what to build" (PROMPT.md) and "how to build it" (worker instructions)

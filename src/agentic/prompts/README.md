# Prompt Management System

This directory contains versioned prompt templates for the Continuous Executive Agent system.

## Philosophy

**Prompts are first-class artifacts** in agentic systems. They require:
- Version control (like code)
- Testing and evaluation
- Observability (tracking impact on performance/cost)
- Rollback capability

## Directory Structure

```
prompts/
├── README.md                    # This file
├── versions/                    # Version history
│   ├── v1/                     # Initial prompts
│   ├── v2/                     # Second iteration
│   └── current -> v2/          # Symlink to active version
│
├── templates/                   # Jinja2 templates
│   ├── worker-base.jinja       # Base worker prompt
│   ├── research-phase.jinja    # Research mode addition
│   ├── retry-persistence.jinja # Retry/persistence guidance
│   ├── strategy-guidance.jinja # Strategy-specific guidance
│   └── diagnosis.jinja         # Diagnostic agent prompt
│
├── metadata/                    # Template metadata (YAML)
│   ├── worker-base.yaml
│   ├── research-phase.yaml
│   └── ...
│
└── evaluations/                 # Prompt evaluation results
    └── YYYY-MM-DD/             # Daily evaluation logs
        └── eval-results.jsonl
```

## Template Format

We use **Jinja2** (industry standard for LLMs):
- Variables: `{{ variable_name }}`
- Conditionals: `{% if condition %} ... {% endif %}`
- Loops: `{% for item in list %} ... {% endfor %}`
- Comments: `{# This is a comment #}`

## Version Management

### Current Version
The `current/` symlink always points to the active prompt version in production.

### Creating a New Version

1. Copy current version to new version directory:
   ```bash
   cp -r prompts/versions/v2 prompts/versions/v3
   ```

2. Modify templates in new version

3. Update metadata YAML with version and changelog

4. Test new version with evaluation suite

5. Update symlink when ready to deploy:
   ```bash
   ln -sfn v3 prompts/versions/current
   ```

### Rollback

Simply update the symlink:
```bash
ln -sfn v2 prompts/versions/current
```

## Metadata Format

Each template has a YAML metadata file:

```yaml
name: worker-base
description: Base prompt for all worker agents
template_format: jinja2
version: 2.1.0
created_at: "2026-01-25T00:00:00Z"
updated_at: "2026-01-25T12:00:00Z"
changelog:
  - version: 2.1.0
    date: "2026-01-25"
    changes:
      - "Added Claude Code skills guidance"
      - "Improved Constitution section clarity"
  - version: 2.0.0
    date: "2026-01-20"
    changes:
      - "Refactored into modular sections"

variables:
  - name: TASK_TITLE
    type: string
    required: true
    description: "Title of the task"
  - name: PRIORITY
    type: string
    enum: ["P1", "P2", "P3"]
    required: true
  - name: PROJECT_PATH
    type: string
    required: true

skills_referenced:
  - prd-writer
  - project-architect
  - task-breakdown
  - project-analysis

performance_metrics:
  avg_success_rate: 0.85
  avg_turns_used: 45
  cost_per_invocation: "$0.12"
```

## Evaluation

### Metrics Tracked
- Success rate (task completion)
- Average turns used
- Cost per invocation
- Error patterns
- Retry frequency

### Evaluation Process

1. Run agents with candidate prompt
2. Log results to `evaluations/YYYY-MM-DD/`
3. Compare against baseline (current version)
4. Analyze regression/improvements
5. Decide: deploy, iterate, or rollback

## Best Practices

### DO:
✅ Use semantic versioning (MAJOR.MINOR.PATCH)
✅ Document ALL changes in changelog
✅ Test prompts before deploying
✅ Track performance metrics
✅ Keep templates modular and reusable
✅ Reference Claude Code skills when appropriate

### DON'T:
❌ Modify `current/` templates directly (always create new version)
❌ Skip evaluation before deploying
❌ Delete old versions (keep history)
❌ Hardcode values (use variables)
❌ Mix multiple concerns in one template

## Template Composition

Templates can be composed using Jinja2 includes:

```jinja
{# worker-intelligent.jinja #}
{% include 'worker-base.jinja' %}

{% if research_required %}
{% include 'research-phase.jinja' %}
{% endif %}

{% if retry_context %}
{% include 'retry-persistence.jinja' %}
{% endif %}

{% if strategy %}
{% include 'strategy-guidance.jinja' %}
{% endif %}
```

## Integration with Agent SDK

The `prompt-builder.ts` module loads and renders templates:

```typescript
import { loadTemplate, renderTemplate } from './prompt-loader.js';

// Load template
const template = await loadTemplate('worker-base');

// Render with variables
const prompt = renderTemplate(template, {
  TASK_TITLE: 'Build Next.js app',
  PRIORITY: 'P1',
  PROJECT_PATH: '/path/to/project',
  // ...
});

// Send to Agent SDK
const result = await spawnWorker(prompt);
```

## References

- [MLOps in 2026 — The Definitive Guide](https://rahulkolekar.com/mlops-in-2026-the-definitive-guide-tools-cloud-platforms-architectures-and-a-practical-playbook/)
- [Prompt Versioning | Confident AI](https://www.confident-ai.com/docs/llm-evaluation/prompt-optimization/prompt-versioning)
- [Jinja2 Prompt Templates | Microsoft Learn](https://learn.microsoft.com/en-us/semantic-kernel/concepts/prompts/jinja2-prompt-templates)
- [Managing Prompt Templates with Jinja2](https://blog.promptlayer.com/prompt-templates-with-jinja2-2/)

# Prompt Management System

**For an agentic system, prompts ARE the code.** This directory contains all prompts used by the Continuous Executive Agent, with individual versioning and clear management practices.

## Philosophy

Prompts are **first-class artifacts** that require:
- ✅ **Individual versioning** (not global) - each prompt has its own version
- ✅ **Immutability** - once created, never modified (new version = new file)
- ✅ **Separation from code** - prompts are data, not buried in TypeScript
- ✅ **Observable** - track which prompt versions produce which outcomes
- ✅ **Rollback-ready** - symlinks enable instant rollback

## Directory Structure

```
prompts/
├── README.md                           # This file
├── loader.ts                           # Prompt loading & rendering
│
├── worker/                             # Worker agent prompts
│   ├── worker-base-v1.0.0.md
│   └── worker-base.md -> worker-base-v1.0.0.md
│
├── research/                           # Research phase prompts
│   ├── research-phase-v1.0.0.md
│   └── research-phase.md -> research-phase-v1.0.0.md
│
├── retry/                              # Retry/persistence prompts
│   ├── retry-context-v1.0.0.md
│   └── retry-context.md -> retry-context-v1.0.0.md
│
├── strategy/                           # Strategy-specific guidance
│   ├── strategy-simplify-v1.0.0.md
│   ├── strategy-research-v1.0.0.md
│   ├── strategy-breakdown-v1.0.0.md
│   └── strategy-tools-v1.0.0.md
│
├── diagnosis/                          # Diagnostic agent prompts
│   ├── diagnosis-failure-v1.0.0.md
│   └── diagnosis-failure.md -> diagnosis-failure-v1.0.0.md
│
├── intelligence/                       # Intelligence layer prompts
│   ├── intent-classification-v1.0.0.md
│   ├── task-breakdown-v1.0.0.md
│   └── capability-assessment-v1.0.0.md
│
├── validation/                         # Validation interpretation prompts
│   ├── validation-interpret-v1.0.0.md
│   └── validation-interpret.md -> validation-interpret-v1.0.0.md
│
├── communication/                      # Human communication prompts
│   ├── needs-you-blocker-v1.0.0.md
│   ├── needs-you-question-v1.0.0.md
│   └── needs-you-approval-v1.0.0.md
│
├── contracts/                          # Task contract prompts
│   ├── contract-creation-v1.0.0.md
│   ├── risk-assessment-v1.0.0.md
│   └── dod-creation-v1.0.0.md
│
├── calibration/                        # Calibration & practice prompts
│   ├── calibration-task-v1.0.0.md
│   ├── practice-task-v1.0.0.md
│   └── retrospective-v1.0.0.md
│
├── execution/                          # Execution guidance prompts
│   └── incremental-execution-v1.0.0.md
│
├── work-selection/                     # Work selection prompts
│   └── work-selection-priority-v1.0.0.md
│
└── evaluations/                        # Prompt evaluation results
    └── YYYY-MM-DD/
        └── eval-results.jsonl
```

## Prompt Format

All prompts are **Markdown files with YAML frontmatter**:

```markdown
---
name: worker-base
description: Base prompt for all Agent SDK worker sessions
version: 1.0.0
variables:
  - name: TASK_TITLE
    type: string
    required: true
  - name: PRIORITY
    type: enum[P1,P2,P3]
    required: true
---

# Task: {{TASK_TITLE}}

Priority: {{PRIORITY}}

Your task is to...
```

### Frontmatter Fields

- **name** (required): Prompt identifier (matches filename)
- **description** (required): What this prompt does and when to use it
- **version** (required): Semantic version (X.Y.Z)
- **variables** (optional): List of variables used in template
  - **name**: Variable name (e.g., TASK_TITLE)
  - **type**: Variable type (string, number, boolean, enum[...])
  - **required**: Whether variable is required (default: true)
  - **description**: What the variable represents

### Variable Syntax

Use `{{VARIABLE_NAME}}` for substitution:
- `{{TASK_TITLE}}` - Required variables
- `{{OPTIONAL_CONTEXT}}` - Optional variables (provide empty string if not needed)

## Versioning

### Semantic Versioning

Each prompt uses **semantic versioning (X.Y.Z)**:

- **MAJOR** (X): Breaking changes
  - Variable name changes
  - Variable removals
  - Output format changes
  - Complete prompt rewrite

- **MINOR** (Y): New features
  - New sections added
  - New guidance added
  - New optional variables

- **PATCH** (Z): Bug fixes
  - Typo fixes
  - Clarifications
  - Formatting improvements

### Creating a New Version

1. **Copy current version to new version**:
   ```bash
   cp worker/worker-base-v1.0.0.md worker/worker-base-v1.1.0.md
   ```

2. **Update frontmatter**:
   - Change `version: 1.1.0`
   - Add changelog comment in file

3. **Make changes** to content

4. **Update symlink**:
   ```bash
   cd worker
   ln -sf worker-base-v1.1.0.md worker-base.md
   ```

5. **Commit with tag**:
   ```bash
   git add worker/worker-base-v1.1.0.md worker/worker-base.md
   git commit -m "feat(prompts): Update worker-base to v1.1.0"
   git tag prompts/worker-base/v1.1.0
   ```

### Rollback

To rollback to previous version:

```bash
cd worker
ln -sf worker-base-v1.0.0.md worker-base.md
git commit -m "rollback(prompts): Rollback worker-base to v1.0.0"
```

## Usage

### Loading a Prompt

```typescript
import { loadPrompt } from './prompts/loader.js';

// Load current version (follows symlink)
const prompt = await loadPrompt('worker', 'worker-base');
console.log(prompt.metadata.version); // "1.0.0"
console.log(prompt.content); // Markdown content
```

### Rendering with Variables

```typescript
import { loadAndRender } from './prompts/loader.js';

const { metadata, rendered } = await loadAndRender('worker', 'worker-base', {
  TASK_TITLE: 'Build Next.js app',
  PRIORITY: 'P1',
  CONTRACT_ID: 'task-abc123',
  PROJECT_PATH: '/path/to/project',
  TOOLS_ALLOWED: 'Read, Write, Bash',
  MAX_TURNS: 250
});

// Send rendered to Agent SDK
```

### Composing Multiple Prompts

```typescript
import { composePrompts } from './prompts/loader.js';

const composed = await composePrompts([
  ['worker', 'worker-base', { TASK_TITLE: 'Build app', ... }],
  ['research', 'research-phase', { INTENT_TYPE: 'outcome_only', ... }],
  ['retry', 'retry-context', { CURRENT_ATTEMPT: 3, ... }]
]);

// composed = base + research + retry prompts joined
```

## Best Practices

### ✅ DO:

- **Individual versions** - Each prompt has its own version lifecycle
- **Immutable prompts** - Never modify existing version files
- **Clear variables** - Document all variables in frontmatter
- **Semantic versioning** - Follow MAJOR.MINOR.PATCH rules
- **Test before deploy** - Validate new versions work
- **Track performance** - Log prompt versions in work-ledger.jsonl
- **Rollback when needed** - Don't hesitate to revert

### ❌ DON'T:

- **Global versioning** - Don't version all prompts together
- **Modify in place** - Don't edit existing version files
- **Hardcode prompts** - Don't put prompts in TypeScript code
- **Skip testing** - Don't deploy untested prompt versions
- **Delete old versions** - Keep version history

## Prompt Categories

### Worker (`worker/`)
Base prompts for Agent SDK worker sessions. Includes Constitution limits, project context, execution guidelines.

### Research (`research/`)
Research phase prompts for outcome_only and what_only tasks. Includes Claude Code skills guidance.

### Retry (`retry/`)
Retry/persistence prompts with context about previous attempts, strategies tried, remaining attempts.

### Strategy (`strategy/`)
Strategy-specific guidance for different retry approaches (simplify, research, breakdown, tools).

### Diagnosis (`diagnosis/`)
Diagnostic agent prompts for investigating failures, root cause analysis.

### Intelligence (`intelligence/`)
Intelligence layer prompts for intent classification, task breakdown, capability assessment.

### Validation (`validation/`)
Validation interpretation prompts for analyzing verifier results, updating capability confidence.

### Communication (`communication/`)
Human communication prompts for needs-you.md entries (blockers, questions, approvals).

### Contracts (`contracts/`)
Task contract creation prompts (contract creation, risk assessment, Definition of Done).

### Calibration (`calibration/`)
Calibration and practice prompts for capability validation, idle time practice, retrospectives.

### Execution (`execution/`)
Execution guidance prompts for incremental execution, step-by-step work.

### Work Selection (`work-selection/`)
Work selection prompts for priority-based work selection from goal bundles.

## Evaluation

### Running Evaluations

```typescript
// Record prompt version used
await appendToWorkLedger({
  event: 'TASK_STARTED',
  prompt_version: 'worker-base-v1.0.0',
  // ...
});

// Later: analyze success rates by prompt version
const results = analyzePromptPerformance('worker-base', '1.0.0');
```

### Metrics to Track

- **Success rate** - % of tasks completed successfully
- **Average turns** - How many turns per task
- **Cost per task** - Token cost per invocation
- **Retry rate** - How often tasks need retries
- **Capability confidence delta** - Impact on capability learning

### Baseline Comparison

When testing new prompt version:
1. Run 10+ tasks with old version (baseline)
2. Run 10+ tasks with new version (candidate)
3. Compare metrics (success rate, turns, cost)
4. Deploy if new version improves or maintains baseline

## References

- [Mastering Prompt Versioning](https://dev.to/kuldeep_paul/mastering-prompt-versioning-best-practices-for-scalable-llm-development-2mgm)
- [Prompt Versioning Best Practices](https://latitude-blog.ghost.io/blog/prompt-versioning-best-practices/)
- [Prompt Management Guide](https://launchdarkly.com/blog/prompt-versioning-and-management/)
- [Confident AI Prompt Versioning](https://documentation.confident-ai.com/docs/prompt-management/prompt-versioning)

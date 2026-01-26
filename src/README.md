# Source Code Organization

This document explains the folder structure for the Continuous Executive Agent codebase.

## Philosophy: AGENTIC vs DETERMINISTIC

The agent is designed to be **as agentic as possible**. We clearly separate AI decision-making from mechanical operations:

- **🤖 AGENTIC**: AI makes decisions, interprets results, adapts strategies
- **⚙️ DETERMINISTIC**: Fixed algorithms, file I/O, simple checks

## Folder Structure

```
src/
├── core/                           # Main loop and fundamental systems
│   ├── executive-loop.ts          # 8-phase continuous loop
│   ├── types.ts                   # Shared TypeScript interfaces
│   └── logging.ts                 # Logging with AGENTIC/DETERMINISTIC markers
│
├── agentic/                        # 🤖 AI DECISION-MAKING
│   │
│   ├── prompts/                   # ⭐ THE CORE - Versioned prompt templates
│   │   ├── README.md              # Prompt management documentation
│   │   ├── versions/              # Version history
│   │   │   ├── v1/                # Version 1 (current)
│   │   │   │   ├── templates/     # Jinja2 prompt templates
│   │   │   │   │   ├── worker-base.jinja
│   │   │   │   │   ├── research-phase.jinja
│   │   │   │   │   ├── retry-persistence.jinja
│   │   │   │   │   └── strategy-guidance.jinja
│   │   │   │   └── metadata/      # Template metadata (YAML)
│   │   │   │       ├── worker-base.yaml
│   │   │   │       ├── research-phase.yaml
│   │   │   │       └── retry-persistence.yaml
│   │   │   └── current -> v1/     # Symlink to active version
│   │   ├── templates/             # Symlink to current version templates
│   │   ├── metadata/              # Symlink to current version metadata
│   │   └── evaluations/           # Prompt evaluation results
│   │
│   ├── work-selection/            # WHAT to work on (priority reasoning)
│   │   ├── work-selector.ts       # Parse goals.md, select highest priority work
│   │   └── task-breakdown.ts      # Break complex tasks into steps
│   │
│   ├── execution/                 # HOW to execute work (agent spawning)
│   │   ├── worker-spawner.ts      # Spawn Agent SDK workers
│   │   ├── execution-handler.ts   # Execute work with retry logic
│   │   └── task-contractor.ts     # Create task contracts with DoD
│   │
│   ├── diagnosis/                 # WHY things fail (investigation)
│   │   └── agentic-diagnosis.ts   # Spawn diagnostic agents to investigate failures
│   │
│   ├── intelligence/              # Strategy and intent understanding
│   │   ├── intent-classifier.ts   # Classify task intent (outcome_only vs what_and_how)
│   │   ├── strategy-selector.ts   # Select different strategies per retry
│   │   ├── prompt-builder.ts      # Build context-rich prompts for workers
│   │   └── prompt-loader.ts       # Load and render Jinja2 templates
│   │
│   └── learning/                  # Capability confidence updates
│       └── capability-updater.ts  # Update capability scores based on results
│
└── deterministic/                  # ⚙️ MECHANICAL OPERATIONS
    │
    ├── health-checker.ts          # Check file existence, auth tokens, disk space
    ├── state-handler.ts           # File I/O for goals.md, needs-you.md
    ├── validation-handler.ts      # Run verifiers (with agentic interpretation)
    ├── input-processor.ts         # Parse markdown tables in needs-you.md
    ├── queue-processor.ts         # Parse queue.md file
    ├── workspace-writers.ts       # Write to workspace files
    ├── inputs-log.ts              # Append to JSONL logs
    ├── backoff-manager.ts         # Fixed exponential backoff calculations
    │
    └── verifiers/                 # Deterministic validation checks
        ├── core-verifiers.ts      # Git status, build tests, file existence
        ├── reference-integrity.ts # Reference registry validation
        └── index.ts               # Verifier exports
```

## Key Files

### Core Loop
- **`core/executive-loop.ts`** - The main 8-phase continuous loop
  - Clearly marked AGENTIC vs DETERMINISTIC phases
  - ~275 lines (was 1,275 before refactor)

### Entry Point
- **`index.ts`** - PM2 entry point (re-exports executive-loop)

## Import Patterns

```typescript
// Import from core
import { log, logAgentic, logDeterministic } from '../core/logging.js';
import type { WorkItem, WorkerResult } from '../core/types.js';

// Import agentic modules
import { selectWorkWithSteps } from '../agentic/work-selection/work-selector.js';
import { diagnoseFailure } from '../agentic/diagnosis/agentic-diagnosis.js';
import { classifyIntent } from '../agentic/intelligence/intent-classifier.js';

// Import deterministic modules
import { checkHealth } from '../deterministic/health-checker.js';
import { validateWork } from '../deterministic/validation-handler.js';
```

## Unused Files (TO BE DELETED)

- **`/strategies/prompts/`** - Not being used, prompts are built dynamically
- **`src/executive-loop-old.ts`** - Backup of old monolithic loop

## Phase Mapping

Each phase of the executive loop is clearly marked:

1. ⚙️  **Health Check** - deterministic/health-checker.ts
2. ⚙️  **Process Inputs** - deterministic/input-processor.ts (parsing only, NOT agentic)
3. 🤖 **Select Work** - agentic/work-selection/work-selector.ts
4. 🤖 **Execute** - agentic/execution/worker-spawner.ts
5. 🤖 **Validate** - deterministic/validation-handler.ts (runs checks) + agentic interpretation
6. ⚙️  **Update State** - deterministic/state-handler.ts (file I/O)
7. 🤖 **Diagnose** - agentic/diagnosis/agentic-diagnosis.ts
8. ⚙️  **Handle Max Retries** - deterministic/state-handler.ts (constitutional limit)

## Why This Structure?

1. **Clarity**: Immediately obvious what's AI vs mechanical
2. **Maintainability**: Related code grouped together
3. **Scalability**: Easy to add new agentic capabilities
4. **Understandability**: Anyone can read the loop and understand what's happening
5. **Prompt Visibility**: ⭐ THE CORE - Prompts are first-class artifacts, versioned and visible

## ⭐ THE MOST IMPORTANT PART: Prompts

**For an agentic system, prompts ARE the code.** They're now:

✅ **Visible** - In `agentic/prompts/versions/v1/templates/`
✅ **Versioned** - Using semantic versioning with full changelog
✅ **Metadata-tracked** - YAML files with variables, dependencies, performance metrics
✅ **Template-based** - Using Jinja2 (industry standard)
✅ **Composable** - Templates can include other templates
✅ **Rollback-ready** - Version symlinks allow instant rollback
✅ **Evaluation-ready** - Directory for tracking prompt performance

**Before:** Prompts were buried in TypeScript code, impossible to see or version
**After:** Prompts are in `agentic/prompts/` with proper version control

See `agentic/prompts/README.md` for full documentation on prompt management.

## What's Next

1. **Compile and test** - Fix all imports after reorganization
2. **Implement prompt-loader.ts** - Load and render Jinja2 templates
3. **Migrate prompt-builder.ts** - Use template system instead of string concatenation
4. **Add evaluations** - Track prompt performance over time
5. **Delete unused** - Remove `/strategies/prompts/` (not being used)

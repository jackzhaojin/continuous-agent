# Continuous Executive Agent V1 — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-01-24  
**Status:** Ready for Build  
**Author:** Claude (with Jack Zhao Jin)

---

## Executive Summary

### The Vision

Flip the human-agent paradigm: instead of humans prompting AI, the agent **finds work** and comes to the human when it needs decisions, insights, or actions. Human responds when they choose.

### What We're Building

A continuously-running autonomous agent that:
1. **Understands goals** well enough to reason, plan, and build real things
2. **Finds work proactively** — maintains momentum without waiting for prompts
3. **Keeps human in the loop asynchronously** via prioritized needs list
4. **Runs in a force-march loop** — pauses only when genuinely nothing to do

### Two-Repository Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         REPOSITORY STRATEGY                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ~/dev/continuous-agent/              ~/dev/agent-outputs/              │
│   ┌──────────────────────┐            ┌──────────────────────┐          │
│   │   AGENT REPO         │            │   OUTPUT MONOREPO    │          │
│   │                      │            │                      │          │
│   │   • Executive loop   │   builds   │   • nextjs-todo-app/ │          │
│   │   • Skills           │ ─────────► │   • eds-site-1/      │          │
│   │   • Workspace files  │   into     │   • notion-writer/   │          │
│   │   • Verifiers        │            │   • blog-research/   │          │
│   │   • Task contracts   │            │   • ... (50+ later)  │          │
│   │                      │            │                      │          │
│   │   Infrastructure     │            │   Real codebases     │          │
│   │   for the agent      │            │   with git history   │          │
│   └──────────────────────┘            └──────────────────────┘          │
│                                                                          │
│   Private / operational               Public / portfolio                 │
│   npm install ignored in outputs      Real .gitignore per project        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Day-One Proof Goals

**IMPORTANT DISTINCTION:**
- **Initial Build Scope** = MVP agent infrastructure that can run the loop
- **Agent Self-Enhancement** = Tasks the agent works on AFTER it's running (not build scope)

| Category | Item | Notes |
|----------|------|-------|
| **Initial Build (MVP)** | Executive loop | PM2, health checks, work selection |
| **Initial Build (MVP)** | Workspace files | goals.md, needs-you.md, progress.md |
| **Initial Build (MVP)** | Skill registry | Seeded, SDK-tagged |
| **Initial Build (MVP)** | Core verifiers | git, node, docs |
| **Initial Build (MVP)** | Worker spawning | Agent SDK integration |
| | | |
| **Agent Tasks (P1)** | Next.js Transactional App | Agent builds this after running |
| **Agent Tasks (P1)** | Notion Integration POC | Agent researches & figures this out |
| **Agent Tasks (P2)** | Self-enhance human interface | Improve needs-you.md, dashboard |
| **Agent Tasks (P2)** | POC new capabilities | Explore what's possible |

The agent's job is to do POCs, figure things out, and self-enhance. We don't pre-build solutions — the agent discovers them.

---

## Part 1: System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       CONTINUOUS EXECUTIVE AGENT                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      EXECUTIVE LOOP (PM2)                        │   │
│   │                                                                  │   │
│   │   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐        │   │
│   │   │ Health  │ → │  Work   │ → │ Execute │ → │ Validate│        │   │
│   │   │ Check   │   │ Select  │   │   or    │   │   &     │        │   │
│   │   │         │   │         │   │Delegate │   │ Learn   │        │   │
│   │   └─────────┘   └─────────┘   └─────────┘   └─────────┘        │   │
│   │        │                            │              │            │   │
│   │        ▼                            ▼              ▼            │   │
│   │   ┌─────────┐              ┌────────────────┐  ┌─────────┐     │   │
│   │   │ Health  │              │  Agent SDK     │  │ Skill   │     │   │
│   │   │ Status  │              │  Workers       │  │Registry │     │   │
│   │   └─────────┘              └────────────────┘  └─────────┘     │   │
│   │                                    │                            │   │
│   └────────────────────────────────────│────────────────────────────┘   │
│                                        │                                 │
│   ┌────────────────────────────────────│────────────────────────────┐   │
│   │                    WORKSPACE (Markdown + JSONL)                  │   │
│   │                                    │                             │   │
│   │   ┌──────────┐  ┌──────────┐  ┌───▼──────┐  ┌──────────┐       │   │
│   │   │ goals.md │  │progress  │  │completed │  │needs-you │       │   │
│   │   │          │  │   .md    │  │   .md    │  │   .md    │       │   │
│   │   └──────────┘  └──────────┘  └──────────┘  └──────────┘       │   │
│   │                                                                  │   │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│   │   │inputs-log    │  │work-ledger   │  │capability-   │          │   │
│   │   │   .jsonl     │  │   .jsonl     │  │ledger.jsonl  │          │   │
│   │   └──────────────┘  └──────────────┘  └──────────────┘          │   │
│   │                                                                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Executive Loop Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXECUTIVE LOOP CYCLE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   STARTUP                                                                │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────┐                                                   │
│   │ 1. HEALTH CHECK │ ← GitHub, Azure, Oracle VM, disk space            │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ 2. CHECK INPUTS │ ← goals.md changed? New work in queue.md?         │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐     ┌─────────────────┐                           │
│   │ 3. SELECT WORK  │ ──► │ Priority Engine │                           │
│   └────────┬────────┘     │ • Explicit P1-P3│                           │
│            │              │ • Dependencies  │                           │
│            │              │ • Effort/Impact │                           │
│            │              │ • Learned prefs │                           │
│            │              └─────────────────┘                           │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ 4. CREATE       │ ← Scope, risk, DoD, logging obligations           │
│   │    TASK CONTRACT│                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐     ┌─────────────────┐                           │
│   │ 5. EXECUTE      │ ──► │ Direct or       │                           │
│   │                 │     │ Spawn Worker    │                           │
│   └────────┬────────┘     └─────────────────┘                           │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ 6. VALIDATE     │ ← Run verifiers, update skill confidence          │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ 7. UPDATE STATE │ ← progress.md, completed.md, needs-you.md         │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            ▼                                                             │
│   ┌─────────────────┐                                                   │
│   │ 8. SLEEP        │ ← 30s default, longer if idle                     │
│   └────────┬────────┘                                                   │
│            │                                                             │
│            └──────────────────────► LOOP BACK TO 1                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Worker Delegation Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WORKER DELEGATION                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   EXECUTIVE (runs in PM2)                                               │
│   ┌──────────────────────────────────────────────────────────┐          │
│   │ • Prioritizes work                                        │          │
│   │ • Creates task contracts                                  │          │
│   │ • Decides: execute directly OR spawn worker               │          │
│   │ • Monitors worker progress                                │          │
│   │ • Handles failures                                        │          │
│   └──────────────────────────┬───────────────────────────────┘          │
│                              │                                           │
│              ┌───────────────┴───────────────┐                          │
│              │      SPAWN DECISION           │                          │
│              │                               │                          │
│              │  Small task (< 5 min)?        │                          │
│              │    → Execute directly         │                          │
│              │                               │                          │
│              │  Large task OR needs focus?   │                          │
│              │    → Spawn Agent SDK worker   │                          │
│              └───────────────┬───────────────┘                          │
│                              │                                           │
│                              ▼                                           │
│   WORKERS (Agent SDK sessions)                                          │
│   ┌──────────────────────────────────────────────────────────┐          │
│   │                                                           │          │
│   │   Worker 1                 Worker 2                       │          │
│   │   ┌─────────────┐         ┌─────────────┐                │          │
│   │   │ Task: Build │         │ Task: Write │                │          │
│   │   │ Next.js app │         │ Notion int. │                │          │
│   │   │             │         │             │                │          │
│   │   │ Skills:     │         │ Skills:     │                │          │
│   │   │ • nextjs-*  │         │ • notion-*  │                │          │
│   │   │ • git-*     │         │ • research  │                │          │
│   │   └─────────────┘         └─────────────┘                │          │
│   │                                                           │          │
│   │   Human is OUT of the loop on worker execution            │          │
│   │   Executive handles completion/failure                    │          │
│   │                                                           │          │
│   └──────────────────────────────────────────────────────────┘          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Skills Architecture

### 2.1 Skills Integration (Proven via FINDINGS.md)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SKILLS ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   CONFIGURATION REQUIRED (proven working):                               │
│   ┌──────────────────────────────────────────────────────────┐          │
│   │  settingSources: ['user', 'project']  ← REQUIRED         │          │
│   │  allowedTools: ['Skill', 'Read', 'Bash', 'Write', ...]   │          │
│   │  cwd: PROJECT_ROOT  ← for project skills                 │          │
│   └──────────────────────────────────────────────────────────┘          │
│                                                                          │
│   SKILL LOCATIONS                                                        │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │   USER SKILLS                      PROJECT SKILLS               │    │
│   │   ~/.claude/skills/                .claude/skills/              │    │
│   │   (symlink to jack-dev-server)     (bundled with agent)         │    │
│   │                                                                 │    │
│   │   ┌─────────────────┐              ┌─────────────────┐         │    │
│   │   │ Universal       │              │ Agent-Specific  │         │    │
│   │   │                 │              │                 │         │    │
│   │   │ • harness-build │              │ • executive-*   │         │    │
│   │   │ • harness-spec  │              │ • verifier-*    │         │    │
│   │   │ • conversation- │              │ • calibration-* │         │    │
│   │   │   logger        │              │ • practice-*    │         │    │
│   │   │ • claude-pdf    │              │                 │         │    │
│   │   │ • claude-mcp-   │              │ Project-bound   │         │    │
│   │   │   builder       │              │ skills that     │         │    │
│   │   │                 │              │ ship with agent │         │    │
│   │   └─────────────────┘              └─────────────────┘         │    │
│   │                                                                 │    │
│   │   Loaded when:                     Loaded when:                 │    │
│   │   settingSources                   settingSources               │    │
│   │   includes 'user'                  includes 'project'           │    │
│   │                                                                 │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 SDK Runtime Registry

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SDK RUNTIME REGISTRY                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Skills must be tagged by which SDK can execute them.                  │
│   Different SDKs have different capabilities.                           │
│                                                                          │
│   V1 SDKS                                                               │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                                                                  │   │
│   │   CLAUDE AGENT SDK                 CODEX CLI (HEADLESS)         │   │
│   │   $100/month Anthropic plan        $35/month OpenAI plan        │   │
│   │                                                                  │   │
│   │   ✅ Skill tool (SKILL.md)         ❌ No Skill tool             │   │
│   │   ✅ settingSources config         ❌ No settingSources         │   │
│   │   ✅ Project-bundled skills        ❌ No bundled skills         │   │
│   │   ✅ User skills (~/.claude/)      ❌ Different config          │   │
│   │   ✅ allowedTools granular         ⚠️ Different tool model      │   │
│   │   ✅ maxTurns control              ⚠️ Different limits          │   │
│   │                                                                  │   │
│   │   Best for:                        Best for:                     │   │
│   │   • Complex multi-skill tasks      • Simple bash/code tasks     │   │
│   │   • Tasks needing SKILL.md         • Cost-sensitive work        │   │
│   │   • Full harness execution         • Parallel simple workers    │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   SKILL ENTRY SCHEMA (with SDK compatibility)                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  - id: nextjs.build.basic                                        │   │
│   │    confidence: 85                                                │   │
│   │    maturity: Demonstrated                                        │   │
│   │    sdk_compatibility:                                            │   │
│   │      claude_agent_sdk: true    # Full support                   │   │
│   │      codex_cli: true           # Works (no skills needed)       │   │
│   │    requires_skills: false      # Pure tool operation            │   │
│   │                                                                  │   │
│   │  - id: harness.eds.full                                          │   │
│   │    confidence: 70                                                │   │
│   │    maturity: Demonstrated                                        │   │
│   │    sdk_compatibility:                                            │   │
│   │      claude_agent_sdk: true    # Uses harness-build skill       │   │
│   │      codex_cli: false          # Can't invoke SKILL.md          │   │
│   │    requires_skills: true       # Needs Skill tool               │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Three-Bucket Skill Taxonomy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SKILL TAXONOMY                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   TECHNICAL SKILLS                    FUNCTIONAL SKILLS                  │
│   (Tool Operation)                    (Reasoning & Discipline)           │
│   ├── git.branch_commit: 95%          ├── reason.decomposition: 85%     │
│   ├── github.pr.create: 90%           ├── reason.debugging: 80%         │
│   ├── node.npm.install: 88%           ├── reason.risk_assessment: 75%   │
│   ├── nextjs.build.basic: 85%         ├── exec.strategy_switching: 65%  │
│   ├── notion.mcp.pages: ??%           └── comm.needs_you.quality: 80%   │
│   └── azure.deploy: 55%                        │                        │
│            │                                   │                        │
│            └───────────────┬───────────────────┘                        │
│                            │                                             │
│                            ▼                                             │
│                     DELIVERY SKILLS                                      │
│                     (End-to-End Outcomes)                                │
│                     ├── deliver.site.static: 90%                        │
│                     ├── deliver.nextjs.app.basic: 80%                   │
│                     ├── deliver.nextjs.app.transactional: ??%           │
│                     ├── deliver.eds.site: 70%                           │
│                     ├── deliver.notion.integration: ??%                 │
│                     └── deliver.mcp.server: 40%                         │
│                                                                          │
│   CONFIDENCE: 0-100% (evidence-weighted)                                │
│   MATURITY: Declared → Demonstrated → Reliable                          │
│   SDK: claude_agent_sdk | codex_cli | both                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Skill ↔ Agent SDK Mapping

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SKILL INVOCATION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   1. EXECUTIVE SELECTS TASK                                             │
│      │                                                                   │
│      ▼                                                                   │
│   2. CHECK REQUIRED SKILLS                                              │
│      ┌──────────────────────────────────────────┐                       │
│      │ Task: "Build transactional Next.js app"  │                       │
│      │                                          │                       │
│      │ Required skills:                         │                       │
│      │  • nextjs.build.basic (conf: 85%)       │                       │
│      │  • nextjs.data.api_routes (conf: ??)    │                       │
│      │  • git.branch_commit (conf: 95%)        │                       │
│      └──────────────────────────────────────────┘                       │
│      │                                                                   │
│      ▼                                                                   │
│   3. SPAWN WORKER WITH SKILLS                                           │
│      ┌──────────────────────────────────────────┐                       │
│      │ query({                                  │                       │
│      │   prompt: task_contract,                 │                       │
│      │   options: {                             │                       │
│      │     cwd: OUTPUT_REPO_PATH,              │                       │
│      │     settingSources: ['user', 'project'],│                       │
│      │     allowedTools: ['Skill', ...]        │                       │
│      │   }                                      │                       │
│      │ })                                       │                       │
│      └──────────────────────────────────────────┘                       │
│      │                                                                   │
│      ▼                                                                   │
│   4. WORKER INVOKES SKILLS AS NEEDED                                    │
│      ┌──────────────────────────────────────────┐                       │
│      │ Skill tool → "nextjs-build"              │                       │
│      │ SKILL.md injected as context             │                       │
│      │ Worker follows skill instructions        │                       │
│      └──────────────────────────────────────────┘                       │
│      │                                                                   │
│      ▼                                                                   │
│   5. EXECUTIVE VALIDATES & UPDATES CONFIDENCE                           │
│      ┌──────────────────────────────────────────┐                       │
│      │ Verifiers run → PASS/FAIL                │                       │
│      │ Skill confidence adjusted                │                       │
│      │ Capability ledger updated                │                       │
│      └──────────────────────────────────────────┘                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Directory Structures

### 3.1 Agent Repository (`~/dev/continuous-agent/`)

```
continuous-agent/
├── .claude/
│   └── skills/                          # Project-bundled skills
│       ├── executive-loop/
│       │   └── SKILL.md
│       ├── task-contract/
│       │   └── SKILL.md
│       ├── work-selection/
│       │   └── SKILL.md
│       ├── validator/
│       │   └── SKILL.md
│       ├── calibration-nextjs/
│       │   └── SKILL.md
│       └── calibration-eds/
│           └── SKILL.md
│
├── src/
│   ├── executive-loop.ts                # Main PM2-managed process
│   ├── worker-spawner.ts                # Agent SDK worker management
│   ├── health-checker.ts                # System health monitoring
│   └── verifiers/
│       ├── git-status-clean.ts
│       ├── node-build.ts
│       ├── node-test.ts
│       ├── docs-checklist.ts
│       └── reference-integrity.ts
│
├── workspace/
│   ├── goals.md                         # Strategic objectives (human inputs)
│   ├── queue.md                         # Tactical task backlog
│   ├── progress.md                      # Active work status
│   ├── completed.md                     # Outcomes and results
│   ├── needs-you.md                     # Blockers requiring human
│   ├── preferences.md                   # Learned patterns
│   ├── capabilities.md                  # Tools, auth, capacity
│   └── constitution.md                  # Boundaries, principles
│
├── ledgers/
│   ├── inputs-log.jsonl                 # Immutable input audit trail
│   ├── work-ledger.jsonl                # Time/effort/artifact tracking
│   └── capability-ledger.jsonl          # Skill attempt/result events
│
├── skills/
│   ├── technical-skills.yml             # Tool operation skills
│   ├── delivery-skills.yml              # End-to-end outcomes
│   ├── functional-skills.yml            # Reasoning/discipline
│   └── sdk-registry.yml                 # SDK capabilities & compatibility
│
├── verifiers/
│   ├── definitions/                     # Verifier YAML specs
│   └── results/                         # Run outputs
│
├── learning/
│   ├── evolution-log.jsonl              # Self-modification audit
│   ├── retrospectives/                  # Periodic analysis
│   └── calibration/                     # Calibration project records
│
├── references/
│   ├── sources/                         # Mode A & B: Pinned clones
│   ├── patches/                         # Mode B: Overlay patches
│   ├── forks/                           # Mode C: Active dependencies
│   ├── wrappers/                        # Runtime adaptation scripts
│   └── reference-registry.yaml          # Single source of truth
│
├── task-contracts/                      # Active and historical contracts
│
├── reports/
│   ├── dashboard.html                   # Visual interface
│   ├── validation/                      # Validation reports
│   ├── transcripts/                     # Execution transcripts
│   └── diffs/                           # Code changes by task
│
├── package.json
├── tsconfig.json
├── ecosystem.config.js                  # PM2 configuration
└── README.md
```

### 3.2 Output Monorepo (`~/dev/agent-outputs/`)

```
agent-outputs/
├── .gitignore                           # Repo-level ignores
├── README.md                            # Index of all projects
│
├── projects/
│   ├── nextjs-todo-transactional/       # P1: Transactional Next.js app
│   │   ├── .gitignore                   # node_modules ignored
│   │   ├── package.json
│   │   ├── src/
│   │   └── README.md
│   │
│   ├── notion-integration/              # P1: Notion writing capability
│   │   ├── research/
│   │   │   └── notion-best-practices.md
│   │   ├── src/
│   │   └── README.md
│   │
│   ├── calibration-nextjs-hello/        # Calibration project
│   │   └── ...
│   │
│   ├── calibration-eds-hello/           # Calibration project
│   │   └── ...
│   │
│   └── ... (50+ eventually)
│
├── templates/
│   ├── nextjs-starter/
│   ├── eds-starter/
│   └── static-html/
│
└── shared/
    ├── components/                      # Shared React components
    └── utils/                           # Shared utilities
```

---

## Part 4: Task Contract System

### 4.1 Contract Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TASK CONTRACT LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   INPUT RECEIVED                                                         │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ 1. LOG TO inputs-log.jsonl (immutable)                          │   │
│   │    • raw_input, priority, scope_allowed, intent_type            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ 2. CLASSIFY INTENT                                               │   │
│   │                                                                  │   │
│   │    outcome_only  → "I want to be seen as thought leader"        │   │
│   │    what_only     → "Build a blog post about continuous agents"  │   │
│   │    what_and_how  → "Write a post using outline in drafts/"      │   │
│   │                                                                  │   │
│   │    If outcome_only or what_only → RESEARCH PHASE MANDATORY      │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ 3. RESEARCH (if needed)                                          │   │
│   │    • Investigate implementation options                          │   │
│   │    • Check preferences.md                                        │   │
│   │    • Consider API/infrastructure implications                   │   │
│   │    • Weigh tradeoffs                                            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ 4. CREATE TASK CONTRACT                                          │   │
│   │    • task_id, interpreted_goal, chosen_approach                 │   │
│   │    • scope (repos, systems allowed/forbidden)                   │   │
│   │    • risk_assessment (level, factors)                           │   │
│   │    • definition_of_done                                         │   │
│   │    • approvals_needed                                           │   │
│   │                                                                  │   │
│   │    HIGH/CRITICAL RISK → Queue for human approval before start   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│      │                                                                   │
│      ▼                                                                   │
│   EXECUTE (see Worker Delegation)                                       │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ 5. VALIDATE                                                      │   │
│   │    • Run all applicable verifiers                                │   │
│   │    • Check DoD criteria                                          │   │
│   │    • Produce validation report                                   │   │
│   │    • Update skill confidence                                     │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│      │                                                                   │
│      ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ 6. COMPLETE                                                      │   │
│   │    • Update work-ledger.jsonl                                    │   │
│   │    • Update completed.md                                         │   │
│   │    • Update needs-you.md (if blockers remain)                   │   │
│   │    • Archive task contract                                       │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Approval Posture Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPROVAL POSTURE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ✅ AUTONOMOUS                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ • Writing/running code locally                                   │   │
│   │ • Creating branches in agent-outputs/                            │   │
│   │ • Research, documentation                                        │   │
│   │ • Running verifiers                                              │   │
│   │ • Updating skill confidence                                      │   │
│   │ • Creating task contracts                                        │   │
│   │ • Spawning worker sessions                                       │   │
│   │ • Adding references (Mode A, B, C)                               │   │
│   │ • Creating GitHub forks                                          │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   📋 QUEUE AND CONTINUE                                                  │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ • Requesting API keys / secrets                                  │   │
│   │ • Deploy to Oracle VM (queue, build locally)                    │   │
│   │ • Opening PRs (queue, prepare branch)                           │   │
│   │ • High-risk task contracts (queue, await approval)              │   │
│   │ • Ambiguous goal clarification (queue, work on best guess)      │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ❌ NEVER                                                               │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ • Merging PRs                                                    │   │
│   │ • Production systems                                             │   │
│   │ • Spending money beyond free tier                               │   │
│   │ • Deleting references                                            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Verification & Learning System

### 5.1 Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        VERIFICATION SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   EXECUTOR                                 VALIDATOR                     │
│   (Worker)                                 (Separate mode)               │
│   ┌──────────────────┐                    ┌──────────────────┐          │
│   │ • Builds things  │                    │ • Runs verifiers │          │
│   │ • Creates code   │    handoff         │ • Checks DoD     │          │
│   │ • Makes commits  │ ───────────────►   │ • Critiques      │          │
│   │ • Documents      │                    │ • Updates skills │          │
│   └──────────────────┘                    └──────────────────┘          │
│                                                  │                       │
│                                                  ▼                       │
│                                           VERIFICATION REPORT            │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  verifier_results:                                                │  │
│   │    - verifier: git_status_clean                                   │  │
│   │      result: PASS                                                 │  │
│   │    - verifier: node_build                                         │  │
│   │      result: PASS                                                 │  │
│   │    - verifier: node_test                                          │  │
│   │      result: FAIL                                                 │  │
│   │                                                                   │  │
│   │  overall_result: PARTIAL                                          │  │
│   │                                                                   │  │
│   │  skills_exercised:                                                │  │
│   │    - skill_id: nextjs.build.basic                                 │  │
│   │      confidence_delta: +10                                        │  │
│   │    - skill_id: nextjs.testing                                     │  │
│   │      confidence_delta: -15                                        │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Self-Improvement Loop

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SELF-IMPROVEMENT LOOP                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   What "learning" actually means for an LLM agent:                      │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  Model weights are FROZEN. "Learning" = changing external        │  │
│   │  artifacts that affect future context assembly.                   │  │
│   │                                                                   │  │
│   │  The agent "learns" by writing better files that its             │  │
│   │  future self will read.                                          │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│   WHAT CAN BE IMPROVED                                                   │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│   │ Skill Registry  │  │ Preferences.md  │  │ Context Rules   │        │
│   │ • Confidence %  │  │ • Patterns      │  │ • What context  │        │
│   │ • Maturity      │  │ • Risk tol.     │  │   for what task │        │
│   │ • Failure modes │  │                 │  │                 │        │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                          │
│   PRACTICE LOOP (when idle)                                             │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  1. Identify highest-impact unproven skill needed by P1 goals    │  │
│   │  2. Generate practice task to exercise that skill safely         │  │
│   │  3. Execute → Validate → Record evidence                         │  │
│   │  4. Update confidence/maturity                                   │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Day-One Bootstrap Sequence

### 6.0 MVP vs Self-Enhancement Philosophy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MVP BUILD vs AGENT SELF-ENHANCEMENT                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   WHAT WE BUILD (MVP Infrastructure)                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  The minimum viable agent that can:                              │   │
│   │    • Run a continuous loop                                       │   │
│   │    • Read goals.md and select work                               │   │
│   │    • Create task contracts                                       │   │
│   │    • Spawn workers via Agent SDK                                 │   │
│   │    • Run verifiers and update skills                             │   │
│   │    • Communicate via needs-you.md                                │   │
│   │                                                                  │   │
│   │  This is INFRASTRUCTURE, not solutions.                          │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   WHAT THE AGENT FIGURES OUT (Self-Enhancement)                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Once running, the agent continuously works on:                  │   │
│   │                                                                  │   │
│   │  P1 TASKS (in initial goals.md)                                 │   │
│   │    • Build Next.js transactional app (prove capability)         │   │
│   │    • POC Notion integration (research → experiment → build)     │   │
│   │                                                                  │   │
│   │  P2 SELF-ENHANCEMENT (ongoing)                                  │   │
│   │    • Improve human interface (better needs-you.md format?)      │   │
│   │    • Build dashboard.html (or discover better approach)         │   │
│   │    • POC new capabilities (what else can I do?)                 │   │
│   │    • Optimize own workflows                                      │   │
│   │    • Document learnings                                          │   │
│   │                                                                  │   │
│   │  The agent DISCOVERS solutions through POCs and experimentation │   │
│   │  We don't pre-build answers — the agent figures them out        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   EXAMPLE: NOTION INTEGRATION                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  ❌ NOT: We pre-build Notion integration code                   │   │
│   │  ✅ YES: Agent receives goal "figure out Notion"                │   │
│   │         Agent researches Notion API, MCP, best practices        │   │
│   │         Agent does POCs to test approaches                       │   │
│   │         Agent builds working solution                            │   │
│   │         Agent documents patterns for future use                  │   │
│   │         Agent updates own skills with evidence                   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Bootstrap Phases (MVP Only)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      BOOTSTRAP SEQUENCE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   PHASE 0: REPOSITORY SETUP (Human does this)                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  1. mkdir -p ~/dev/continuous-agent                              │   │
│   │  2. mkdir -p ~/dev/agent-outputs                                 │   │
│   │  3. git init both                                                │   │
│   │  4. npm init + install @anthropic-ai/claude-agent-sdk            │   │
│   │  5. Say "proceed with bootstrap"                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   PHASE 1: WORKSPACE BOOTSTRAP (Agent autonomous)                       │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  • Create workspace/ markdown files                              │   │
│   │  • Create ledgers/ JSONL files                                   │   │
│   │  • Create skills/ YAML files (seeded)                            │   │
│   │  • Create constitution.md                                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   PHASE 2: SKILL SEEDING (Agent autonomous)                             │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  • Create project skills in .claude/skills/                      │   │
│   │  • Seed technical/delivery/functional skills                     │   │
│   │  • All start at Declared maturity, low confidence                │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   PHASE 3: VERIFIER IMPLEMENTATION (Agent autonomous)                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  • git_status_clean, node_install, node_build                    │   │
│   │  • node_test, lint_pass, docs_checklist                          │   │
│   │  • files_exist, reference_integrity                              │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   PHASE 4: CALIBRATION (Agent autonomous)                               │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  • Run calibration-nextjs-hello                                  │   │
│   │  • Update skill confidence from evidence                         │   │
│   │  • Surface blockers                                              │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   PHASE 5: EXECUTIVE LOOP ACTIVATION (Agent autonomous)                 │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  • Start PM2 process                                             │   │
│   │  • Begin force-march loop                                        │   │
│   │  • Select first real task from goals.md                          │   │
│   │  • Continuous operation begins                                   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 7: Initial Agent Tasks (NOT Build Scope)

**These are tasks the agent works on AFTER it's running — not part of MVP build.**

The agent receives these in `goals.md` and figures them out through POCs, research, and experimentation.

### 7.1 Next.js Transactional App (Agent Task)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   P1: NEXT.JS TRANSACTIONAL APP                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   TASK CONTRACT PREVIEW                                                  │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  intent_type: what_only                                          │   │
│   │  priority: P1                                                    │   │
│   │                                                                  │   │
│   │  interpreted_goal:                                               │   │
│   │    Build full-stack CRUD app demonstrating data management      │   │
│   │    patterns with Next.js App Router + API routes + mock DB       │   │
│   │                                                                  │   │
│   │  chosen_approach:                                                │   │
│   │    Next.js 14+ App Router                                        │   │
│   │    API Routes for CRUD operations                                │   │
│   │    JSON file mock database                                       │   │
│   │    Server Actions for form handling                              │   │
│   │    Tailwind CSS for styling                                      │   │
│   │                                                                  │   │
│   │  definition_of_done:                                             │   │
│   │    - App scaffolded with Next.js                                 │   │
│   │    - CRUD API routes implemented                                 │   │
│   │    - Mock database working                                       │   │
│   │    - UI displays data, allows CRUD                               │   │
│   │    - npm run build passes                                        │   │
│   │    - Tests exist and pass                                        │   │
│   │    - README with run instructions                                │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   OUTPUT: agent-outputs/projects/nextjs-todo-transactional/             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Notion Integration (Agent Task — POC/Research)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   P1: NOTION INTEGRATION                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   TASK CONTRACT PREVIEW                                                  │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  intent_type: outcome_only  ← RESEARCH MANDATORY                │   │
│   │  priority: P1                                                    │   │
│   │                                                                  │   │
│   │  raw_input:                                                      │   │
│   │    "Have AI build its own way to write to Notion, using best    │   │
│   │    Notion practices (research), and figure out how to do it     │   │
│   │    with Notion MCP as much as possible"                         │   │
│   │                                                                  │   │
│   │  phases:                                                         │   │
│   │    1. Research (autonomous) - Notion API, MCP, best practices   │   │
│   │    2. MCP Exploration (needs auth) - Test capabilities          │   │
│   │    3. Integration Build (after auth) - Working implementation   │   │
│   │    4. Documentation - Patterns for future use                   │   │
│   │                                                                  │   │
│   │  approvals_needed:                                               │   │
│   │    - Notion API integration token                               │   │
│   │    - Notion workspace access                                    │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   BLOCKER HANDLING:                                                     │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  If Notion auth not available:                                   │   │
│   │    1. Complete all research phases autonomously                  │   │
│   │    2. Build mock/test harness locally                            │   │
│   │    3. Queue auth request in needs-you.md                         │   │
│   │    4. Switch to other P1 work (Next.js app)                     │   │
│   │    5. Resume when auth provided                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   OUTPUT: agent-outputs/projects/notion-integration/                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Self-Enhancement (P2 — Ongoing Agent Task)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   P2: AGENT SELF-ENHANCEMENT                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   NOT A ONE-TIME TASK — This is continuous background work.             │
│                                                                          │
│   AREAS FOR SELF-IMPROVEMENT                                            │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                                                                  │   │
│   │  HUMAN INTERFACE                                                 │   │
│   │    • Is needs-you.md format optimal?                            │   │
│   │    • Should there be a dashboard.html?                          │   │
│   │    • Better ways to communicate status?                         │   │
│   │    • Notification experiments (future)?                         │   │
│   │                                                                  │   │
│   │  CAPABILITY EXPANSION                                           │   │
│   │    • POC new tools/APIs                                         │   │
│   │    • Explore MCP servers                                        │   │
│   │    • Test new frameworks                                        │   │
│   │    • Document what works/doesn't                                │   │
│   │                                                                  │   │
│   │  WORKFLOW OPTIMIZATION                                          │   │
│   │    • Faster task execution?                                     │   │
│   │    • Better verifier coverage?                                  │   │
│   │    • Smarter work selection?                                    │   │
│   │    • Cost/token optimization?                                   │   │
│   │                                                                  │   │
│   │  SDK EXPLORATION                                                │   │
│   │    • What can Codex CLI do that Agent SDK can't?               │   │
│   │    • When to use which SDK?                                     │   │
│   │    • Cost optimization across SDKs?                             │   │
│   │                                                                  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   APPROACH: The agent tries things, validates with evidence,            │
│             documents learnings, and updates its own systems.           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      IMPLEMENTATION ROADMAP                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   WEEK 1: FOUNDATION                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Day 1-2: Repository Setup                                       │   │
│   │  Day 3-4: Workspace Bootstrap                                    │   │
│   │  Day 5-7: Executive Loop (Minimal)                               │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   WEEK 2: SKILLS & VERIFICATION                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Day 1-2: Skills Integration                                     │   │
│   │  Day 3-4: Verifiers                                              │   │
│   │  Day 5-7: Worker Delegation                                      │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   WEEK 3: CALIBRATION & P1 EXECUTION                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Day 1-2: Calibration Projects                                   │   │
│   │  Day 3-7: P1 Execution (Next.js + Notion research)              │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   WEEK 4+: CONTINUOUS OPERATION                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  • Agent runs continuously                                       │   │
│   │  • Human checks needs-you.md periodically                        │   │
│   │  • Agent improves through execution                              │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 9: Success Criteria

| Timeframe | Criteria |
|-----------|----------|
| Week 1 | Both repos created, PM2 starts loop, health checks pass |
| Week 2 | Skills load correctly, 6+ verifiers working, worker spawning functional |
| Week 3 | Calibration complete, Next.js app in progress, Notion research done |
| 1 Month | Next.js app complete, Notion working or blocked on auth, 80%+ skills demonstrated |
| 3 Months | 10+ projects in outputs, agent finds work autonomously, needs-you.md is primary interface |

---

## Part 10: Design Principles (25)

1. **Don't wait, work on it** — execute on best hypothesis
2. **Decide, don't ask** — make implementation choices, explain after
3. **Default to smallest viable** — CLI/TUI unless preferences differ
4. **Research is mandatory** — for underspecified goals
5. **Retries must change strategy** — same approach twice = wasted
6. **Blockers don't block everything** — pivot to other productive work
7. **Learn from feedback** — update preferences on course correction
8. **Transparent reasoning** — log decisions with rationale
9. **Track time and cost** — know where effort goes
10. **Immutable inputs** — never modify the record of what was asked
11. **Priorities are sacred** — explicit priorities trump discovered work
12. **Reversibility by default** — branches, atomic commits, rollbacks
13. **Contract-first execution** — no work without valid task contract
14. **Skills must be proven** — confidence comes from verifier PASS
15. **No verifier = not proven** — self-report does not count
16. **Confidence is a spectrum** — 0-100, not binary yes/no
17. **Scope prevents overclaiming** — explicit includes/excludes
18. **Validator is separate from Executor** — honest assessment
19. **Gaps are valuable** — known unknowns enable targeted improvement
20. **Practice fills gaps** — idle time becomes skill development
21. **Evidence enables learning** — capability ledger provides receipts
22. **Calibration before trust** — run calibration projects first
23. **Harnesses are evidence** — existing successes seed confidence
24. **Safe modification only** — agent changes data/config, not code
25. **Evolution is audited** — all self-modifications logged

---

## Part 11: Immediate Next Steps

### Human Does (one-time setup):

```bash
mkdir -p ~/dev/continuous-agent
mkdir -p ~/dev/agent-outputs
cd ~/dev/continuous-agent && git init
cd ~/dev/agent-outputs && git init
# Create GitHub repos for both
cd ~/dev/continuous-agent && npm init -y
npm install @anthropic-ai/claude-agent-sdk typescript @types/node
# Say "proceed with bootstrap"
```

### Agent Does (autonomous after "proceed"):

1. Create directory structure
2. Create workspace markdown files
3. Create skill registries (seeded)
4. Create verifier definitions
5. Create executive-loop.ts
6. Create PM2 ecosystem.config.js
7. Create initial project skills
8. Run first health check
9. Commit all + push
10. Start PM2 loop
11. Begin calibration-nextjs-hello
12. Begin P1 work

---

**End of PRD**

*This document synthesizes the main specification, unified addendum, reference management addendum, and Agent SDK skills findings into an actionable implementation plan.*

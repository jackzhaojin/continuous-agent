# Continuous Executive Agent

An autonomous AI agent that finds and executes work proactively without waiting for human prompts.

## What It Does

- **Finds work autonomously** from prioritized goal bundles in `workspace/in-progress/P{0-4}/`
- **Executes tasks** by spawning Claude Agent SDK workers
- **Validates outcomes** through deterministic verifiers
- **Learns from results** by updating skill confidence scores
- **Communicates asynchronously** via `workspace/needs-you.md` when blocked

The agent runs continuously in an 8-phase loop: Health Check → Check Inputs → Select Work → Create Contract → Execute → Validate → Update State → Continue/Sleep → repeat.

**Continuous Execution Model:** The agent immediately picks up the next task after completing one. Sleep only occurs when the queue is empty (idle polling) or the system is unhealthy.

## Quick Start

```bash
# Install dependencies
npm install

# Install PM2 globally (if not already installed)
npm install -g pm2

# Configure environment (tiered)
cp .env.executive.example .env.executive
cp .env.worker.example .env.worker
# Optional: app-specific env inside each project directory
# (Apps can also use Docker envs, shell exports, iOS build settings, etc.)
# cp .env.app.example ai-sandbox/projects/<project>/.env.app

# Add CLAUDE_CODE_OAUTH_TOKEN to .env.worker (Claude Pro/Max subscription — OAuth-first, no API key)

# Run in development
npm run dev

# Or build and run in production
npm run build
npm start

# For continuous operation, use PM2 with ecosystem config
pm2 start ecosystem.config.cjs

# PM2 management commands
pm2 list                    # View running processes
pm2 logs executive-loop   # View logs
pm2 stop executive-loop   # Stop the agent
pm2 restart executive-loop # Restart the agent
pm2 delete executive-loop  # Remove from PM2
```

## Architecture

**Two-Repository Setup:**
- `continuous-agent/` (this repo) - Agent infrastructure only
- `ai-sandbox/` (sibling directory) - All worker outputs and project code

The agent NEVER writes code to its own codebase. All outputs go to isolated project directories in `ai-sandbox/`.

**Key Files:**
- `workspace/in-progress/P{0-4}/` - Goal bundles with `PROMPT.md` + `STEPS.json` (primary)
- `workspace/goals.md` - Auto-generated index from goal bundles
- `workspace/needs-you.md` - Human-agent interaction interface
- `workspace/constitution.md` - Immutable hard limits (human-only modification)
- `ledgers/work-ledger.jsonl` - Append-only task event log

## Credential Management (Three-Tier System)

Credentials are isolated into three tiers using separate `.env` files:

| Tier | File | Purpose |
|------|------|---------|
| **1 - Executive** | `.env.executive` | Loop config, Notion reporting, breakdown settings |
| **2 - Worker** | `.env.worker` | Claude SDK auth (OAuth token), model selection |
| **3 - Application** | `.env.app` | App credentials (DB, cache, storage) — platform-agnostic |

- Tier 1 keys **never** reach worker agents (physical file separation)
- Tier 3 uses `APP_` prefix (stripped when injected into projects)
- Tier 3 supports multiple output formats: dotenv, JSON, shell, docker-compose, YAML
- Falls back to legacy `.env` if tiered files don't exist

See `CLAUDE.md` for full details and `src/deterministic/credential-tiers.ts` for format helpers.

## Human Interaction

When the agent blocks after 10 retry attempts, it writes to `workspace/needs-you.md`:

```markdown
| Action | Why Agent Can't Do It | Response | Blocking | Since |
|--------|----------------------|----------|----------|-------|
| Get API token | 401 Unauthorized... | | BLOCKING | 2026-01-25 |
```

**Respond by editing the file:**

```markdown
| Get API token | 401 Unauthorized... | [APPROVED] Token: sk_xyz | BLOCKING | 2026-01-25 |
```

The agent detects responses automatically and unblocks tasks on the next loop iteration (immediate if work is pending, or within ~30s if idle).

## Constitution (Hard Limits)

The agent operates under 8 immutable constraints defined in `workspace/constitution.md`:

1. No spending beyond $20/month per service
2. No permanent deletions
3. No external publishing without approval
4. No credential exposure
5. No access control expansion
6. No output in agent codebase (all output → ai-sandbox/)
7. All activity must be logged
8. 10 retries minimum before blocking

These limits cannot be overridden by prompts or code.

## Reference POCs

Foundational proof-of-concept projects demonstrating Agent SDK patterns are in `references/poc/`, organized by agent platform:

- **`claude/chat-cli/`** - Interactive CLI showing `query()` usage, streaming, message handling
- **`claude/agent-sdk-skills-poc/`** - Skills integration with Agent SDK (`Skill` tool)
- **`claude/agent-sdk-subagents-poc/`** - Subagent delegation via `Task` tool

```bash
# Run a POC
cd references/poc/claude/chat-cli
npm install && npm run build && npm start
```

## Documentation

- **CLAUDE.md** - Detailed guidance for working with this codebase
- **ai-docs/v1/init/** - Product requirements and specifications
- **ai-docs/features/** - Feature documentation
- **.claude/skills/** - Skill documentation for the agent
- **references/poc/claude/** - Working Claude Agent SDK proof-of-concept examples

## Requirements

- Node.js ≥ 18.0.0
- Claude Agent SDK authentication (OAuth token via Claude Pro/Max subscription)
- PM2 recommended for production deployment

## License

Private / Operational

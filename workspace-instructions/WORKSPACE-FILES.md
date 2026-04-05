# Workspace File Reference

Every file in `workspace/` and what it does. `workspace/` is the AI agent's source of truth for goals, state, and human interaction. It is currently **gitignored** until we complete our cloud migration (e.g., Supabase/Notion backend), at which point workspace state will be persisted externally. Their initial structure is documented here so they can be recreated if needed.

## Lifecycle Directories

| Directory | Purpose |
|-----------|---------|
| `drafts/` | Author writes goal bundles here. Not yet prioritized. |
| `ondeck/` | Auto-promoted from drafts by `goal-scanner.ts` based on priority. |
| `in-progress/P{0-4}/` | Active execution. Subdirectories by priority level. |
| `completed/` | Finished and validated goals. Permanent record. |
| `archive/` | Old/deprecated goals moved here manually. |

## Core Files

### `constitution.md` -- IMMUTABLE

Eight hard limits the agent cannot override. **NEVER auto-modify.** Human-only changes.

Key articles:
1. No spending beyond $20/month per service
2. No permanent deletions (archive/soft-delete only)
3. No external publishing without approval
4. No credential exposure
5. No access control expansion
6. No output in agent codebase
7. All activity must be logged
8. 10 retries minimum before blocking

### `needs-you.md` -- Human-Agent Interface

Async communication channel. Agent writes questions/blockers; human responds with tags:

| Tag | Meaning |
|-----|---------|
| `[APPROVED]` | Approve with optional context |
| `[DECISION]` | Provide a decision |
| `[INFO]` | Provide requested information |
| `[SKIP]` | Skip this task entirely |

Agent detects responses within ~30 seconds, unblocks goal, resets retry counter.

Sections: Decisions Needed, Actions Needed, Missing Information, Resolved.

### `queue.md` -- Quick-Add Queue

Simple markdown list for adding work items. `queue-processor.ts` ingests items as P3 draft bundles automatically.

Format:
```markdown
## Ready to Start
- Build a todo app with React and Supabase
- Fix the login page CSS on mobile
```

### `preferences.md` -- Learned Conventions

Tracks patterns learned from human feedback. Sections:
- Code Style
- Communication
- Workflow
- Tools & Technologies
- Terminology
- Anti-Patterns

### `capabilities.md` -- Tool Inventory

Available tools, auth status, and capacity info. Tracks what the agent can currently access (GitHub CLI, Node.js, etc.).

### `progress.md` -- Active Work Status

Tracks currently active work items. Updated by the executive loop during execution.

### `completed.md` -- Completion Log

Records completed work outcomes, milestones, metrics, and learnings.

### `project-registry.yml` -- Reusable Projects

Registry of completed projects available for reuse via the `source_project` frontmatter field. Each entry records slug, title, output path, completion date, category, and capabilities.

### `self-improvement-state.json` -- Practice Tracking

Timestamps for practice loops, retrospectives, and reference refreshes. Used by the self-improvement system to schedule activities.

```json
{
  "last_practice_at": "2026-02-02T01:26:15.349Z",
  "last_retrospective_at": "2026-04-05T01:47:58.058Z",
  "practice_count": 1,
  "retrospective_count": 10,
  "outcomes_since_last_retro": 0
}
```

### `dashboard-data.json` -- Dashboard Runtime Data

Generated data for the monitoring dashboard. Gitignored, regenerated at runtime.

### `goals.md` -- Auto-Generated Index

Legacy fallback. Auto-generated from goal bundles by the executive loop. Prefer reading goal bundles directly.

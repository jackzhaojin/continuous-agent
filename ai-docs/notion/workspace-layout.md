# Notion Workspace Layout

**Last updated:** 2026-02-02
**Workspace:** Jack Jin's Space

This is the living reference for the agent's Notion workspace structure. Update this file when pages, databases, or properties change.

---

## Page Hierarchy

```
Jack Jin's Space (workspace)
└── Continuous Agent                          (private, top-level container)
    └── Agent Dashboard                       (parent for all agent reporting)
        ├── Agent Milestones                  (database — event log)
        └── Agent Summaries — February 2026   (page — daily/weekly summaries)
```

## Page IDs

| Resource | Notion Page ID | Purpose |
|----------|---------------|---------|
| Continuous Agent | `2fa321bd663180c3a5f8d24194225963` | Top-level container for all agent-related Notion content |
| Agent Dashboard | `2fa321bd663180c185e2dd402b1bb3ed` | Parent page for reporting resources |
| Agent Milestones (DB) | `2fa321bd663181fea82fe8dd187f1e06` | Database receiving milestone events |
| Agent Summaries — Feb 2026 | `2fa321bd66318167b71bff7c8425e0d3` | Current month's summary page |

## Environment Variables

```bash
NOTION_API_KEY=<redacted>                              # Internal integration secret
NOTION_DATABASE_ID=2fa321bd663181fea82fe8dd187f1e06    # Agent Milestones database
NOTION_MONTHLY_PAGE_ID=2fa321bd66318167b71bff7c8425e0d3 # Current month summaries page
NOTION_REPORTING_ENABLED=true                           # Kill switch for all Notion writes
```

## Integration

- **Name:** Jack Local AI Agent
- **Type:** Internal integration
- **Capabilities:** Read content, Update content, Insert content
- **Connected to:** Continuous Agent page (inherits to all children)
- **API Version:** `2022-06-28` (setup script), SDK default (notion-reporter.ts)

---

## Agent Milestones Database Schema

Each contract produces exactly ONE row. It is created at start ("Started") and updated in-place when the contract terminates (to "Completed", "Failed", "Blocked", or "Step Completed").

| Property | Type | Values / Format |
|----------|------|----------------|
| Goal | title | Goal name (e.g., "Build Next.js App") |
| Step | rich_text | Step name for step-level events (empty for goal-level events) |
| Event | select | `Started` (blue), `Completed` (green), `Failed` (red), `Blocked` (orange), `Step Completed` (purple) |
| Priority | select | `P0` (red), `P1` (orange), `P2` (yellow), `P3` (blue), `P4` (gray) |
| Timestamp | date | ISO datetime; becomes a date range (start + end) when milestone is closed via `closeMilestone()` |
| Contract ID | rich_text | Worker contract reference (e.g., `contract-b25db16e`) |
| Output Path | rich_text | Absolute path to project output directory |
| Error Summary | rich_text | First 200 chars of error message (empty on success) |

### Database Views

| View | Type | Configuration |
|------|------|--------------|
| Default view | Table | All columns visible, sorted by Timestamp descending |
| Board | Board | Grouped by Event (columns: Started, Completed, Failed, Blocked, Step Completed) |
| Active | Table | Filtered: Event = Started OR Step Completed, sorted by Timestamp descending |

---

## Agent Summaries Page Structure

The monthly summaries page receives two types of content:

- **Daily summaries** — Appended as `## Daily Summary: YYYY-MM-DD` heading blocks with stats paragraphs
- **Weekly summaries** — Created as child pages titled `Weekly Summary: YYYY-MM-DD to YYYY-MM-DD`

A new summaries page should be created each month. Update `NOTION_MONTHLY_PAGE_ID` in `.env` when rotating.

---

## Data Flow

```
Executive Loop
  ├── Phase 5 (Execute):  reportMilestone('Started', ...)               → Creates Milestones DB row (start date only)
  ├── Phase 6 (Success):  closeMilestone(contractId, 'Completed', ...)  → Updates row: Event→Completed, adds end date + output path
  │                        closeMilestone(contractId, 'Step Completed')  → Updates row: Event→Step Completed, adds end date + output path
  ├── Phase 6 (Failure):  closeMilestone(contractId, 'Failed', ...)     → Updates row: Event→Failed, adds end date + error summary
  ├── Phase 6 (Blocked):  closeMilestone(contractId, 'Blocked')         → Updates row: Event→Blocked, adds end date
  ├── Day boundary:        reportDailySummary()                          → Blocks on Monthly Page
  └── Weekly (Sunday):     reportWeeklySummary()                         → Child page under Monthly Page
```

**Single-row lifecycle:** Each contract has exactly one row in the Milestones DB. `reportMilestone('Started', ...)` creates the row at contract start. When the contract terminates, `closeMilestone()` queries for that row by Contract ID and updates it in-place: changes Event status (Started to Completed/Failed/Blocked/Step Completed), extends Timestamp to a date range (start + end), and adds Output Path or Error Summary as applicable. This produces clean one-row-per-contract data, enabling Notion Timeline views and board grouping by final status.

All Notion writes are fire-and-forget. Failures are logged but never block the agent. Local JSONL ledgers remain the source of truth.

---

## API Limitations (Cannot Automate)

| Action | Why | Workaround |
|--------|-----|------------|
| Grant integration access (connections) | No API endpoint | Manual: page "..." menu > Connections |
| Create/configure database views | Not in API | Manual: create views in Notion UI |
| Create top-level workspace pages | Requires OAuth public integration | Create manually, then use page ID |

---

## Related Documentation

- **Setup runbook:** `ai-docs/v1/2026-01-28-v1.2/notion-api-automation.md`
- **Setup steps (manual reference):** `ai-docs/v1/2026-01-28-v1.2/notion-setup-steps.md`
- **Setup script:** `scripts/setup-notion-workspace.ts`
- **Reporter implementation:** `src/deterministic/notion-reporter.ts` (if exists)

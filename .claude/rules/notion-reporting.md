---
paths:
  - "src/deterministic/notion-reporter.ts"
  - "scripts/setup-notion-workspace.ts"
  - "ai-docs/notion/**"
---

# Notion Reporting

Fire-and-forget integration -- failures are logged but never block the agent. Local JSONL ledgers remain the source of truth.

## What Gets Reported

- **Milestone events** -> rows in Agent Milestones database (Started, Completed, Failed, Blocked, Step Completed)
- **Milestone closure** -> `closeMilestone()` updates Started row with end timestamp
- **Daily summaries** -> heading blocks appended to monthly summaries page
- **Weekly summaries** -> child pages under monthly summaries page

## Monthly Rotation

At the start of each month, create a new summaries page in Notion and update `NOTION_MONTHLY_PAGE_ID` in `.env.executive`.

## Setup

```bash
npx tsx scripts/setup-notion-workspace.ts <PARENT_PAGE_ID> --write-env
```

See `ai-docs/notion/workspace-layout.md` for page hierarchy, database schema, and IDs.

## Troubleshooting

- Not reporting -> Check `NOTION_REPORTING_ENABLED` is not `false`
- Missing data -> Verify `NOTION_API_KEY` and `NOTION_DATABASE_ID` are set in `.env.executive`

# Notion API Automation — Research & Approach

**Date:** 2026-02-01
**Context:** Automating the manual setup steps from `notion-setup-steps.md`
**Script:** `scripts/setup-notion-workspace.ts`

---

## What Can Be Automated via Notion API

| Setup Step | API Support | Endpoint |
|------------|-------------|----------|
| Create Milestones database | **Yes** | `POST /v1/databases` |
| Configure database properties (select, date, number, rich_text) | **Yes** | Included in database creation payload |
| Set select option colors | **Yes** | `options[].color` in select property definition |
| Create Summaries page | **Yes** | `POST /v1/pages` |
| Add initial page content (headings, paragraphs, callouts) | **Yes** | `children` array in page creation |
| Insert test milestone row | **Yes** | `POST /v1/pages` (row in database) |
| Verify database schema | **Yes** | `GET /v1/databases/{id}` |
| Update .env with IDs | **Yes** | Script appends to file |

## What CANNOT Be Automated (Notion API Limitations)

| Setup Step | Why Not | Workaround |
|------------|---------|------------|
| Grant integration access (connections) | No API endpoint exists | Must be done in Notion UI: "..." > "Connections" > add integration. **Access inherits from parent pages**, so connecting to the parent page is sufficient. |
| Create database views | Not exposed in API | Must be created manually in Notion UI after database exists |
| Configure view sorts/filters/groups | Not exposed in API | Manual configuration required |
| Create database templates | Not supported | N/A |

### Database Views (Manual)

After the script creates the database, these views should be configured manually:

1. **Default table view** — Sort by `Timestamp` descending, all columns visible
2. **Board view** — Group by `Event` (shows Started, Completed, Failed, etc. as columns)
3. **Filtered "Active" view** — Filter: `Event` is `Started` OR `Step Completed`, sort by `Timestamp` descending

---

## API Version Considerations

### Two Active Versions

| API Version | Database Create Format | SDK Version | Status |
|-------------|----------------------|-------------|--------|
| `2022-06-28` | Properties at top level of request body | SDK v2.x | Legacy, still fully supported |
| `2025-09-03` | Properties nested under `initial_data_source.properties` | SDK v5.0+ | Current default |

### Impact on This Project

- **`@notionhq/client` in package.json:** `^5.8.0` (uses `2025-09-03` by default)
- **Setup script:** Uses raw `fetch` with explicit `Notion-Version: 2022-06-28` header to avoid format ambiguity
- **`notion-reporter.ts`:** Uses `@notionhq/client` SDK — currently uses `parent: { database_id: ... }` format which is `2022-06-28` style. If SDK v5.8.0 enforces `2025-09-03`, this may need updating to use `parent: { data_source_id: ... }`

### Recommendation

The setup script intentionally uses `2022-06-28` via raw `fetch` because:
1. It's a one-time script, not production code
2. The format is simpler and well-documented
3. Avoids coupling to SDK version changes
4. The `2022-06-28` version is still supported and will be for the foreseeable future

If the `notion-reporter.ts` breaks with SDK v5.8.0, the fix would be:
- Change `parent: { database_id: ID }` to `parent: { data_source_id: ID }`
- Or pin the SDK to v2.x

---

## Notion API Reference Summary

### Creating a Database (`POST /v1/databases`)

**Parent:** Must be a page ID (not workspace — workspace parent requires public OAuth integration).

**Property types and configuration:**

```
title:     { title: {} }                    — Every database has exactly one
select:    { select: { options: [...] } }   — Options have name + color
date:      { date: {} }                     — Includes time by default
number:    { number: { format: "number" } } — Also supports "dollar", "percent", etc.
rich_text: { rich_text: {} }                — Free-form text
```

**Available select colors:** `default`, `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`

**Constraints:**
- Option names must be unique (case-insensitive)
- Option names cannot contain commas
- Property names are case-sensitive
- `status` type CANNOT be created via API (use `select` instead)

### Creating a Page (`POST /v1/pages`)

**For regular pages** (child of another page):
- `parent: { page_id: "..." }`
- `properties.title` is the only valid property
- `children` array supports up to 100 blocks

**For database entries** (row in a database):
- `parent: { database_id: "..." }`
- Properties must match the database schema

**Block types for `children`:** heading_1, heading_2, heading_3, paragraph, bulleted_list_item, numbered_list_item, divider, quote, callout, code, toggle, to_do, and more.

### Rate Limits

- ~3 requests per second per integration
- HTTP 429 when exceeded
- The setup script makes ~5 requests total, so rate limits are not a concern

### Integration Requirements

At [notion.so/my-integrations](https://www.notion.so/my-integrations), the integration needs:
- **Read content** — to query/verify the database
- **Update content** — to modify entries
- **Insert content** — to create databases, pages, and entries (HTTP 403 without this)

---

## Script Architecture

```
scripts/setup-notion-workspace.ts
  │
  ├── loadEnv()                    — Reads NOTION_API_KEY from .env
  ├── createMilestonesDatabase()   — POST /v1/databases with full schema
  ├── createSummariesPage()        — POST /v1/pages with initial content blocks
  ├── verifyDatabase()             — GET /v1/databases/{id}, checks all property types
  ├── verifyPage()                 — GET /v1/pages/{id}, confirms accessible
  ├── insertTestRow()              — POST /v1/pages (database entry), mirrors notion-reporter.ts
  └── updateEnvFile()              — Appends NOTION_DATABASE_ID, NOTION_MONTHLY_PAGE_ID to .env
```

**Usage:**
```bash
npx tsx scripts/setup-notion-workspace.ts <PARENT_PAGE_ID> [--write-env] [--skip-test]
```

**Flow:**
1. User creates a parent page in Notion and connects integration to it (manual, one-time)
2. User copies parent page ID from URL
3. Script creates database + page under that parent
4. Script verifies schema and inserts a test row
5. Script outputs env vars (or writes them to .env with `--write-env`)
6. User configures views manually in Notion UI

---

## Future Improvements

1. **Monthly page rotation:** Script could check if a summaries page for the current month already exists (via search API) before creating a new one
2. **SDK migration:** If `notion-reporter.ts` is updated to use `2025-09-03` format, the setup script should be updated to match
3. **View configuration:** If Notion ever adds API support for views, the script should be extended
4. **Idempotency:** Script could search for existing "Agent Milestones" database before creating, to support re-runs without duplicates

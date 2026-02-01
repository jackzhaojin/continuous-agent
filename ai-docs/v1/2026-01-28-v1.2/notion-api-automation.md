# Notion API Automation — Research & Approach

**Date:** 2026-02-01
**Context:** Automating the manual setup steps from `notion-setup-steps.md`
**Script:** `scripts/setup-notion-workspace.ts`

---

## Step-by-Step Setup Runbook

This is the complete walkthrough for setting up Notion reporting for the continuous agent. Each step is tagged as either `[MANUAL]` (requires human in Notion UI) or `[SCRIPTED]` (automated by the setup script). An AI assistant should guide the developer through manual steps and execute scripted steps on their behalf.

### Prerequisites

Before starting, confirm these are in place:

| Prerequisite | How to Check |
|-------------|-------------|
| Node.js 18+ installed | `node --version` |
| Project dependencies installed | `ls node_modules/@notionhq/client` — if missing, run `npm install` |
| A Notion account with workspace access | User confirms |
| `.env` file exists in project root | `ls .env` — if missing, `cp .env.example .env` |

---

### Step 1: Create the Notion Integration `[MANUAL]`

> **Why manual:** Integration creation is a Notion UI operation with no API equivalent.

**Guide the developer through these exact steps:**

1. Open https://www.notion.so/my-integrations in a browser
2. Click **"+ New integration"**
3. Fill in:
   - **Name:** `Continuous Agent` (or any descriptive name)
   - **Associated workspace:** Select the target workspace
   - **Type:** Internal integration
4. Under **Capabilities**, enable all three:
   - [x] Read content
   - [x] Update content
   - [x] Insert content
5. Click **"Save"**
6. Copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`)

**Checkpoint — ask the developer:**
> "Please paste the integration API key. I'll add it to your .env file."

---

### Step 2: Save the API Key to .env `[SCRIPTED]`

Once the developer provides the API key:

```bash
# Verify .env exists
ls .env

# The AI should add/update this line in .env:
# NOTION_API_KEY=<the key the developer provided>
```

**Validation:** Confirm the key is set:
```bash
grep "NOTION_API_KEY=" .env | head -1
# Should show: NOTION_API_KEY=ntn_... (or secret_...)
```

**Important:** Never log or display the full key. Show only the first 8 and last 4 characters.

---

### Step 3: Create a Parent Page in Notion `[MANUAL]`

> **Why manual:** The API cannot create top-level workspace pages with internal integrations (requires OAuth public integration). Even if it could, the user needs to choose where in their workspace this lives.

**Guide the developer:**

1. Open Notion and navigate to the workspace sidebar
2. Create a new page called **"Agent Dashboard"** (or any name they prefer)
   - This page will contain both the milestones database and summaries page as children
   - Suggest placing it in a logical location (e.g., under a "Tools" or "Engineering" section)
3. The page can be left empty — the script populates children

**Checkpoint — ask the developer:**
> "Please share the URL of the page you just created. I need the page ID from it."

**How to extract the page ID from the URL:**
- URL format: `https://www.notion.so/workspace/Page-Name-<32-char-hex-id>`
- The ID is the last 32 hex characters (with or without dashes)
- Example: `https://www.notion.so/myworkspace/Agent-Dashboard-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`
  - Page ID: `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`

---

### Step 4: Connect the Integration to the Parent Page `[MANUAL]`

> **Why manual:** No API endpoint exists for managing integration connections. This is the single most important manual step — without it, all API calls return HTTP 403.

**Guide the developer:**

1. Open the **Agent Dashboard** page in Notion
2. Click the **`...`** menu (top-right corner of the page)
3. Scroll to **"Connections"** (or **"Connect to"**)
4. Search for the integration name from Step 1 (e.g., "Continuous Agent")
5. Click it to add the connection
6. When prompted, confirm: **"Yes, give access to this page and all child pages"**

**Why this matters:** Integration access **inherits downward**. By connecting to the parent page, the database and summaries page created under it will automatically be accessible. No need to connect each child resource individually.

**Checkpoint — ask the developer:**
> "Confirm you've connected the integration to the parent page. I'll now run the setup script."

---

### Step 5: Run the Setup Script `[SCRIPTED]`

This is the main automation step. The script creates both the database and summaries page.

```bash
# Install dependencies if needed
npm install

# Run the setup script (replace <PARENT_PAGE_ID> with the ID from Step 3)
npx tsx scripts/setup-notion-workspace.ts <PARENT_PAGE_ID> --write-env
```

**What the script does (in order):**

| # | Action | API Call | What It Creates |
|---|--------|----------|-----------------|
| 1 | Create Milestones DB | `POST /v1/databases` | Full-page database with 8 properties, select options with colors |
| 2 | Create Summaries Page | `POST /v1/pages` | Page with heading, description, callout, and divider |
| 3 | Verify DB schema | `GET /v1/databases/{id}` | Checks all 8 properties have correct types |
| 4 | Verify page access | `GET /v1/pages/{id}` | Confirms page is readable |
| 5 | Insert test row | `POST /v1/pages` (DB entry) | "[Test] Setup Verification" row in database |
| 6 | Update .env | File append | Adds `NOTION_DATABASE_ID`, `NOTION_MONTHLY_PAGE_ID`, `NOTION_REPORTING_ENABLED=true` |

**Expected output (success):**
```
📦 Creating "Agent Milestones" database...
  Database created: <id>
  URL: https://www.notion.so/<workspace>/<id>

📄 Creating "Agent Summaries — February 2026" page...
  Page created: <id>
  URL: https://www.notion.so/<workspace>/<id>

🔍 Verifying database schema...
  ✓ Title (title)
  ✓ Event (select)
  ✓ Priority (select)
  ✓ Timestamp (date)
  ✓ Duration (number)
  ✓ Contract ID (rich_text)
  ✓ Output Path (rich_text)
  ✓ Error Summary (rich_text)

🔍 Verifying summaries page...
  ✓ Page accessible

🧪 Inserting test milestone row...
  ✓ Test row inserted successfully

═══════════════════════════════════════════════════════
ADD THESE TO YOUR .env FILE:
═══════════════════════════════════════════════════════
NOTION_DATABASE_ID=<id>
NOTION_MONTHLY_PAGE_ID=<id>
NOTION_REPORTING_ENABLED=true
═══════════════════════════════════════════════════════

📝 Appending to .env...
  ✓ Added NOTION_DATABASE_ID, NOTION_MONTHLY_PAGE_ID, NOTION_REPORTING_ENABLED
```

**Troubleshooting — if the script fails:**

| Error | Cause | Fix |
|-------|-------|-----|
| HTTP 403 | Integration not connected to parent page | Redo Step 4 |
| HTTP 401 | Invalid API key | Check `NOTION_API_KEY` in `.env` — re-copy from notion.so/my-integrations |
| HTTP 400 "parent not found" | Wrong page ID | Re-copy from the page URL — must be 32 hex chars |
| HTTP 400 "validation" | API version mismatch | Script uses `2022-06-28` — should work. Check Notion API status |
| `NOTION_API_KEY not found` | Missing from `.env` | Redo Step 2 |

---

### Step 6: Configure Database Views `[MANUAL]`

> **Why manual:** The Notion API has no endpoint for creating or configuring views. This is a confirmed permanent limitation as of 2026.

**Guide the developer through creating 3 views:**

#### View 1: Default Table (sorted by time)
1. Open the **Agent Milestones** database in Notion
2. The default view is already a table — click on it
3. Click **"Sort"** → Add sort → Property: **Timestamp**, Direction: **Descending**
4. Ensure all columns are visible (Title, Event, Priority, Timestamp, Duration, Contract ID, Output Path, Error Summary)

#### View 2: Board by Event
1. Click the **"+"** tab next to the current view name to add a new view
2. Select **"Board"** layout
3. Name it **"By Event"**
4. Group by: **Event** (should be default for board on a select property)
5. This gives columns: Started | Completed | Failed | Blocked | Step Completed

#### View 3: Filtered Active Tasks
1. Click **"+"** to add another new view
2. Select **"Table"** layout
3. Name it **"Active"**
4. Click **"Filter"** → Add filter:
   - **Event** → **is** → **Started**
5. Click **"Add another filter"** (with OR logic):
   - **Event** → **is** → **Step Completed**
6. Add sort: **Timestamp** → **Descending**

**Checkpoint — ask the developer:**
> "Can you confirm you see the 3 views (Table, By Event, Active) as tabs in the database?"

---

### Step 7: Verify End-to-End `[SCRIPTED]`

Verify the `.env` is correctly configured:

```bash
# Check all required Notion vars are present
grep "^NOTION_" .env
```

Expected output:
```
NOTION_API_KEY=ntn_...
NOTION_DATABASE_ID=<32-char-hex>
NOTION_MONTHLY_PAGE_ID=<32-char-hex>
NOTION_REPORTING_ENABLED=true
```

**Ask the developer to check Notion:**
> "Open the Agent Milestones database. You should see a '[Test] Setup Verification' row. If you see it, setup is complete. You can delete that test row."

---

### Step 8: Clean Up Test Data `[MANUAL]`

> **Optional but recommended.**

1. Open **Agent Milestones** database in Notion
2. Find the row titled **"[Test] Setup Verification"**
3. Delete it (right-click → Delete)

---

### Quick Reference — Manual vs Scripted

| Step | Action | Type | Time |
|------|--------|------|------|
| 1 | Create Notion integration | `[MANUAL]` | ~2 min |
| 2 | Save API key to .env | `[SCRIPTED]` | instant |
| 3 | Create parent page in Notion | `[MANUAL]` | ~1 min |
| 4 | Connect integration to parent page | `[MANUAL]` | ~1 min |
| 5 | Run setup script (creates DB + page + test row + .env update) | `[SCRIPTED]` | ~5 sec |
| 6 | Configure 3 database views | `[MANUAL]` | ~3 min |
| 7 | Verify .env and Notion state | `[SCRIPTED]` | instant |
| 8 | Delete test row | `[MANUAL]` | ~30 sec |

**Total: ~4 manual steps requiring human interaction (~7 min), 3 scripted steps (~5 sec).**

---

### Monthly Maintenance

The summaries page is month-specific. At the start of each new month:

1. Run the script again with `--skip-test` to create a new monthly page:
   ```bash
   npx tsx scripts/setup-notion-workspace.ts <PARENT_PAGE_ID> --skip-test
   ```
   - This creates a new "Agent Summaries — {Month} {Year}" page
   - **Caveat:** This also creates a duplicate database. A future improvement would add a `--summaries-only` flag. For now, manually delete the duplicate database in Notion, or just update `NOTION_MONTHLY_PAGE_ID` in `.env` manually after creating the page in Notion.

2. Update `.env` with the new `NOTION_MONTHLY_PAGE_ID`

3. The milestones database persists across months — no changes needed.

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

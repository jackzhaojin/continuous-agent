# Audit Trail & Activity Log

## Overview

Every significant action in PageForge is recorded in an audit trail. This provides accountability, debugging information, and enables an activity feed visible to admins.

## Database Table

```sql
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_log_site ON activity_log(site_id, created_at DESC);
CREATE INDEX idx_activity_log_page ON activity_log(page_id, created_at DESC);
CREATE INDEX idx_activity_log_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_log_action ON activity_log(action);
```

## Actions to Track

### Page Actions
| Action | entity_type | metadata |
|--------|-------------|----------|
| `page.created` | page | `{ title, templateId? }` |
| `page.updated` | page | `{ versionNumber }` |
| `page.published` | page | `{ versionNumber }` |
| `page.unpublished` | page | `{}` |
| `page.archived` | page | `{}` |
| `page.restored` | page | `{ fromStatus }` |
| `page.deleted` | page | `{ title }` |
| `page.submitted_for_review` | page | `{ versionNumber }` |
| `page.review_approved` | page | `{ reviewerNotes? }` |
| `page.review_rejected` | page | `{ reviewerNotes }` |
| `page.scheduled` | page | `{ scheduledAt }` |
| `page.schedule_cancelled` | page | `{}` |
| `page.locked` | page | `{}` |
| `page.unlocked` | page | `{ forcedBy? }` |
| `page.version_restored` | page | `{ fromVersion, toVersion }` |

### Media Actions
| Action | entity_type | metadata |
|--------|-------------|----------|
| `media.uploaded` | media | `{ filename, mimeType, sizeBytes }` |
| `media.deleted` | media | `{ filename }` |

### Fragment Actions
| Action | entity_type | metadata |
|--------|-------------|----------|
| `fragment.created` | fragment | `{ name }` |
| `fragment.updated` | fragment | `{ versionNumber }` |
| `fragment.deleted` | fragment | `{ name }` |

### User & Site Actions
| Action | entity_type | metadata |
|--------|-------------|----------|
| `user.login` | user | `{}` |
| `user.role_changed` | user | `{ oldRole, newRole, changedBy }` |
| `site.created` | site | `{ name }` |
| `site.updated` | site | `{ fields: [...] }` |
| `template.created` | template | `{ name }` |
| `template.updated` | template | `{ name }` |
| `template.deleted` | template | `{ name }` |

## Activity Log Service

Create a server-side utility `lib/activity-log.ts`:

```typescript
interface LogActivityParams {
  siteId?: string;
  pageId?: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

async function logActivity(params: LogActivityParams): Promise<void> {
  // Insert into activity_log table
  // Fire-and-forget — never block the user action
}
```

Call `logActivity()` in every server action and API route that modifies data. It should never throw — wrap in try/catch and silently log errors.

## Activity Feed UI

### Site Activity Page

`/dashboard/[siteId]/activity` — accessible from the site sidebar:

- Infinite-scroll feed of activity entries, newest first
- Each entry shows:
  - User avatar + display name
  - Action description (human-readable, e.g., "John published Home page")
  - Relative timestamp ("2 hours ago")
  - Link to the affected entity (page editor, media item, etc.)
- Filter by:
  - Action type (dropdown: All, Page, Media, User, Fragment)
  - User (dropdown of site members)
  - Date range (last 24h, last 7 days, last 30 days, custom)

### Page Activity Tab

In the page editor, add an "Activity" tab in the version history panel:

- Shows activity entries for this specific page
- Compact list format: "[User] [action] [time]"
- Links to specific versions where applicable

### Dashboard Activity Widget

On the main dashboard, show a "Recent Activity" card:

- Last 10 activity entries across all the user's sites
- Quick glance at what's happening

## Data Retention

- Activity logs are retained indefinitely (no automatic cleanup)
- Admins can export activity logs as CSV from the site settings page
- Export includes all fields in a flat format

## RLS Policies

- SELECT: Users can see activity for sites they have access to
- INSERT: Server-side only (via service role key) — users don't directly write activity logs
- No UPDATE/DELETE — audit trail is immutable

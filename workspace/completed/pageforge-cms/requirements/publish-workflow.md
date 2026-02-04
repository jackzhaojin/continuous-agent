# Publish Workflow & Scheduling

## Overview

PageForge implements a multi-stage content lifecycle: Draft → In Review → Scheduled → Published → Archived. This goes beyond simple draft/published to support editorial workflows with approval chains and scheduled publishing.

## Extended Page Status

Update the `pages.status` column to support more states:

```sql
ALTER TABLE pages DROP CONSTRAINT pages_status_check;
ALTER TABLE pages ADD CONSTRAINT pages_status_check
  CHECK (status IN ('draft', 'in_review', 'scheduled', 'published', 'archived'));
```

### Status Lifecycle

```
draft → in_review → published
  ↓         ↓         ↓
  └─────────┴─── archived
              ↓
          scheduled → published (automatic at scheduled time)
```

| Status | Who Can Set | Meaning |
|--------|-------------|---------|
| `draft` | Author, Admin | Work in progress, not visible to public |
| `in_review` | Author | Author submits for admin review |
| `scheduled` | Admin | Approved, will auto-publish at a future date/time |
| `published` | Admin | Live and publicly visible |
| `archived` | Author, Admin | Removed from public view, retained in system |

## Submit for Review

### Author Flow

1. Author edits a page and clicks **"Submit for Review"** button (replaces direct publish)
2. A confirmation dialog appears: "Submit this page for admin review?"
3. On confirm:
   - Page status changes to `in_review`
   - A `review_requests` entry is created
   - Admin sees the page flagged in their dashboard

### Review Request Table

```sql
CREATE TABLE review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
```

### Admin Review Flow

1. Admin sees pages in `in_review` status highlighted in the pages list (yellow "Review" badge)
2. Admin opens the page editor, reviews the content
3. Admin clicks either:
   - **"Approve & Publish"** → status → `published`, review_request → `approved`
   - **"Approve & Schedule"** → opens scheduling picker, status → `scheduled`
   - **"Reject"** → status → `draft`, review_request → `rejected`, optional notes field
4. The author sees the review result in the pages list (green check or red X badge)

## Scheduled Publishing

### Database Addition

Add scheduling columns to the `pages` table:

```sql
ALTER TABLE pages ADD COLUMN scheduled_at TIMESTAMPTZ;
ALTER TABLE pages ADD COLUMN scheduled_by UUID REFERENCES profiles(id);
```

### Scheduling UI

When an admin clicks "Schedule Publish" (in the publish dropdown or review approval):

1. A date/time picker modal appears
2. Admin selects a future date and time (minimum: 1 hour from now)
3. On confirm:
   - `pages.status` = `scheduled`
   - `pages.scheduled_at` = selected datetime
   - `pages.scheduled_by` = admin user ID
4. The page shows a "Scheduled for Jan 15, 2026 at 3:00 PM" badge in the pages list

### Auto-Publish Mechanism

Implement a server-side function that checks for pages due to publish:

**Option A (Preferred — Supabase Edge Function or cron):**
Create a Supabase Edge Function triggered by `pg_cron` every 5 minutes:
```sql
SELECT cron.schedule('publish-scheduled-pages', '*/5 * * * *', $$
  UPDATE pages
  SET status = 'published',
      published_at = NOW(),
      published_by = scheduled_by
  WHERE status = 'scheduled'
    AND scheduled_at <= NOW();
$$);
```

**Option B (Fallback — API route polled by client):**
Create a Next.js API route `POST /api/cron/publish-scheduled` that:
1. Queries for pages where `status = 'scheduled' AND scheduled_at <= NOW()`
2. Updates them to `published`
3. Called by a Vercel cron or external scheduler

### Cancel Schedule

- Admin can cancel a scheduled publish → page returns to `draft`
- "Cancel Schedule" button appears on scheduled pages in the editor toolbar

## Page Locking (Checkout)

Prevent concurrent editing by implementing page-level locking.

### Database Addition

```sql
ALTER TABLE pages ADD COLUMN locked_by UUID REFERENCES profiles(id);
ALTER TABLE pages ADD COLUMN locked_at TIMESTAMPTZ;
```

### Lock Behavior

1. When a user opens the page editor, the page is automatically locked:
   - `locked_by` = current user ID
   - `locked_at` = NOW()
2. If another user tries to open the same page:
   - Show a warning: "This page is currently being edited by [display_name] since [time]"
   - Option: "Open Read-Only" or "Force Unlock" (admin only)
3. Lock is released when:
   - User navigates away from the editor (`beforeunload` event + API call)
   - User clicks "Save" (lock is re-acquired after save)
   - Lock expires after 30 minutes of inactivity (stale lock cleanup)
   - Admin force-unlocks

### Stale Lock Cleanup

Locks older than 30 minutes are considered stale. Check on page load:
```sql
UPDATE pages
SET locked_by = NULL, locked_at = NULL
WHERE locked_at < NOW() - INTERVAL '30 minutes';
```

## Archiving

### Archive Flow

1. Author or admin clicks "Archive" on a published or draft page
2. Confirmation dialog: "Archive this page? It will be removed from public view."
3. Status → `archived`
4. Archived pages move to an "Archived" tab in the pages list
5. Archived pages retain all version history
6. Admin can "Restore" an archived page → status returns to `draft`

### Bulk Actions

The pages list supports bulk actions via checkboxes:
- **Bulk Archive**: Select multiple pages → "Archive Selected"
- **Bulk Delete**: Select multiple pages → "Delete Selected" (soft delete — sets a `deleted_at` timestamp, not actual deletion per Constitution)

## Status Badges in Pages List

| Status | Badge Color | Icon |
|--------|-------------|------|
| Draft | Gray | `FileEdit` |
| In Review | Yellow | `Clock` |
| Scheduled | Blue | `Calendar` |
| Published | Green | `Globe` |
| Archived | Gray/Dim | `Archive` |

## RLS Updates

- Authors can set status to `draft`, `in_review`, or `archived`
- Only admins can set status to `published` or `scheduled`
- Archived pages are visible to their creator and admins only

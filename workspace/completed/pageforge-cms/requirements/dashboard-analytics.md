# Dashboard & Analytics

## Overview

The PageForge dashboard provides an overview of site activity, content status, and basic analytics. It's the first thing users see after login and serves as the command center for content management.

## Dashboard Layout

`/dashboard/[siteId]` — the main dashboard page:

```
┌─────────────────────────────────────────────────────────────┐
│  PageForge  [Demo Site ▼]  [🔔 3]  [John D. ▼]            │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │                                                  │
│          │  Welcome back, John                              │
│ 📊 Dashboard │                                              │
│ 📄 Pages │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│ 🎨 Templates│ │ 12   │ │  8   │ │  3   │ │  1   │          │
│ 📦 Fragments│ │ Total │ │ Pub. │ │Draft │ │Review│          │
│ 🖼️ Media  │ │ Pages │ │      │ │      │ │      │          │
│ 📋 Forms  │ └──────┘ └──────┘ └──────┘ └──────┘          │
│ 🗺️ Navigation│                                             │
│ 📈 Activity│  ┌─────────────────────┬──────────────────┐   │
│          │  │ Recent Pages         │ Quick Actions     │   │
│ ⚙️ Settings│ │                     │                  │   │
│          │  │ Home (published)     │ [+ New Page]     │   │
│          │  │ About (published)    │ [Upload Media]   │   │
│          │  │ Blog (draft)         │ [View Site]      │   │
│          │  │ Pricing (in review)  │                  │   │
│          │  │                      │                  │   │
│          │  └─────────────────────┴──────────────────┘   │
│          │                                                  │
│          │  ┌─────────────────────┬──────────────────┐   │
│          │  │ Recent Activity      │ Form Submissions │   │
│          │  │                      │                  │   │
│          │  │ John published Home  │ Contact: 5 new   │   │
│          │  │ Jane edited About    │ Newsletter: 12   │   │
│          │  │ John uploaded 3 imgs │ [View All]       │   │
│          │  │ [View All]           │                  │   │
│          │  └─────────────────────┴──────────────────┘   │
└──────────┴──────────────────────────────────────────────────┘
```

## Stats Cards

Top-level stats shown as colored cards:

| Stat | Query | Color |
|------|-------|-------|
| Total Pages | `SELECT COUNT(*) FROM pages WHERE site_id = $1` | Blue |
| Published | `...WHERE status = 'published'` | Green |
| Drafts | `...WHERE status = 'draft'` | Gray |
| In Review | `...WHERE status = 'in_review'` | Yellow |
| Media Files | `SELECT COUNT(*) FROM media` (site-scoped) | Purple |
| Form Submissions (Today) | `...WHERE submitted_at >= today` | Orange |

## Recent Pages Widget

- Shows the last 5 modified pages
- Each row: page title, status badge, last modified time, editor link
- "View All Pages" link → pages list

## Quick Actions

- **+ New Page**: Opens template gallery modal → creates page
- **Upload Media**: Opens upload dialog
- **View Site**: Opens the public site URL in a new tab

## Recent Activity Widget

- Shows the last 8 activity log entries (from `activity_log`)
- Each entry: user avatar, action text, relative time
- "View All" link → activity page

## Form Submissions Widget

- Shows unread submission counts per form
- Click a form name → submissions list for that form
- Badge for unread count

## Notifications

### Notification Bell

The header shows a notification bell with unread count badge.

### Database Table

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,                       -- Internal link to navigate to
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
```

### Notification Types

| Type | Trigger | Recipient |
|------|---------|-----------|
| `review_submitted` | Author submits page for review | All admins |
| `review_approved` | Admin approves a review | Submitting author |
| `review_rejected` | Admin rejects a review | Submitting author |
| `page_published` | Page is published | Page creator |
| `form_submission` | New form submission | Admin |
| `page_unlocked` | Admin force-unlocks a page | Locked-out author |

### Notification Dropdown

Click the bell icon → dropdown showing last 10 notifications:
- Unread notifications have a blue dot
- Click a notification → navigate to the linked page and mark as read
- "Mark all as read" button
- "View All Notifications" link → full notifications page

### Real-Time Notifications (Optional)

Use Supabase Realtime to subscribe to the `notifications` table:
```typescript
supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
  }, (payload) => {
    // Show toast notification
    // Update bell badge count
  })
  .subscribe();
```

## Sidebar Navigation

The sidebar is persistent across all dashboard pages:

| Item | Route | Icon | Who Sees It |
|------|-------|------|-------------|
| Dashboard | `/dashboard/[siteId]` | `LayoutDashboard` | All |
| Pages | `/dashboard/[siteId]/pages` | `FileText` | All |
| Templates | `/dashboard/[siteId]/templates` | `Layout` | Admin |
| Fragments | `/dashboard/[siteId]/fragments` | `Puzzle` | All |
| Media | `/dashboard/[siteId]/media` | `Image` | All |
| Forms | `/dashboard/[siteId]/forms` | `FormInput` | All |
| Navigation | `/dashboard/[siteId]/navigation` | `Menu` | Admin |
| Activity | `/dashboard/[siteId]/activity` | `Activity` | All |
| Settings | `/dashboard/[siteId]/settings` | `Settings` | Admin |

### Sidebar Behavior

- Collapsible: click a toggle to collapse to icons-only mode
- Persist collapsed state in localStorage
- Active route is highlighted
- Mobile: sidebar becomes a slide-out drawer (hamburger toggle)

## Site Switcher

If a user has access to multiple sites, the header shows a site switcher dropdown:
- Current site name + dropdown arrow
- Dropdown lists all accessible sites
- Click to switch → redirects to that site's dashboard
- "Create New Site" option at the bottom (admin only)

## Search (Global)

Add a global search bar in the dashboard header:
- Search across pages, media, fragments by title/name
- Keyboard shortcut: Ctrl+K / Cmd+K opens search
- Command palette style (similar to VS Code / Spotlight):
  - Type to search
  - Results grouped by type (Pages, Media, Fragments)
  - Arrow keys to navigate, Enter to open
  - Shows icons and status badges per result

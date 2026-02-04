# Page Template System

## Overview

Page templates define pre-configured layouts that users select when creating a new page. Templates contain default components in fixed or editable regions, providing consistent page structures while allowing content customization.

## Template Model

### Database Table

Add a `templates` table:

```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  content JSONB NOT NULL DEFAULT '[]',
  locked_regions JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, slug)
);
```

**Fields:**
- `content`: Same JSON structure as `page_versions.content` — array of component blocks
- `locked_regions`: Array of component IDs that cannot be removed or reordered by authors (e.g., a fixed header hero and footer CTA)
- `is_default`: One template per site can be the default (used when "Blank Page" is selected)
- `thumbnail_url`: Preview image shown in the template gallery

### Locked Regions

Locked components are part of the template but cannot be modified by authors:

```json
{
  "locked_regions": ["comp_header_hero", "comp_footer_cta"]
}
```

- Locked components render on the canvas with a lock icon overlay and a gray border
- Locked components cannot be dragged, deleted, or have their props edited
- Admins can edit locked regions (they see an "Unlock" toggle)
- Authors can add/edit/remove components in the unlocked areas between locked components

## Template Gallery

### New Page Flow

When a user clicks "New Page" in the pages list:

1. A modal opens showing the **Template Gallery**
2. Gallery shows template cards in a grid (3 columns):
   - Thumbnail preview image (or auto-generated preview)
   - Template name
   - Description (truncated to 2 lines)
   - Component count badge
3. First card is always "Blank Page" (uses the site's default template or empty canvas)
4. User selects a template → enters page title and slug → creates the page
5. The new page's first version is populated with the template's `content` JSON

### Template Gallery UI

```
┌─────────────────────────────────────────────────────┐
│  Choose a Template                              [X] │
│                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │         │  │         │  │         │            │
│  │ Blank   │  │ Landing │  │ Blog    │            │
│  │ Page    │  │ Page    │  │ Post    │            │
│  │         │  │         │  │         │            │
│  ├─────────┤  ├─────────┤  ├─────────┤            │
│  │ Start   │  │ Hero +  │  │ Header  │            │
│  │ from    │  │ features│  │ + body  │            │
│  │ scratch │  │ + CTA   │  │ + CTA   │            │
│  └─────────┘  └─────────┘  └─────────┘            │
│                                                     │
│  ┌─────────┐  ┌─────────┐                         │
│  │         │  │         │                         │
│  │ About   │  │ Contact │                         │
│  │ Page    │  │ Page    │                         │
│  │         │  │         │                         │
│  ├─────────┤  ├─────────┤                         │
│  │ Bio +   │  │ Form +  │                         │
│  │ team    │  │ map +   │                         │
│  │ + stats │  │ info    │                         │
│  └─────────┘  └─────────┘                         │
└─────────────────────────────────────────────────────┘
```

## Seed Templates

Create these 5 templates for the demo site:

### 1. Blank Page (default)
- Empty canvas, no components
- `is_default: true`

### 2. Landing Page
- Hero (locked) → Text → Two-Column → CTA (locked)
- Locked: hero and CTA ensure brand-consistent top and bottom

### 3. Blog Post
- Hero (locked, smaller variant) → Text → Image → Text → Spacer → CTA (locked)
- Content-focused layout

### 4. About Page
- Hero → Text (company story) → Two-Column (mission/vision) → Testimonial → Testimonial → CTA
- No locked regions

### 5. Contact Page
- Hero (locked) → Text (contact info) → Two-Column (form placeholder + map embed) → Spacer → CTA (locked)

## Template Management (Admin Only)

### Template Editor

Admins access template management from the site settings area:

- List all templates for a site
- Create new template (opens the page editor with template mode):
  - Same three-panel editor layout
  - Additional toggle: "Lock Component" on each component's toolbar
  - Save creates/updates the template (not a page)
- Edit existing template
- Delete template (only if no pages use it — otherwise show warning)
- Set default template for the site

### Template from Page

Add a "Save as Template" option in the page editor toolbar (admin only):
- Copies the current page's component array into a new template
- Prompts for template name and description
- Does not lock any regions by default

## RLS Policies for templates

- SELECT: All authenticated users can view templates for their accessible sites
- INSERT/UPDATE/DELETE: Admin only

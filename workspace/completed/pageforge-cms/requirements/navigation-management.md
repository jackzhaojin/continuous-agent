# Navigation Management

## Overview

PageForge provides a visual navigation (menu) builder so admins can define the site's header navigation, footer links, and breadcrumbs without editing code. Menus are stored as JSON trees and rendered in page templates.

## Data Model

### Database Table

```sql
CREATE TABLE menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'header',
  items JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, slug)
);

CREATE INDEX idx_menus_site ON menus(site_id);
CREATE INDEX idx_menus_location ON menus(site_id, location);
```

### Menu Locations

| Location | Purpose | Max Depth |
|----------|---------|-----------|
| `header` | Primary site navigation | 2 levels (top + dropdown) |
| `footer` | Footer link groups | 2 levels (group + items) |
| `sidebar` | Optional sidebar navigation | 3 levels |

### Menu Item Schema

```typescript
interface MenuItem {
  id: string;           // Unique ID
  label: string;        // Display text
  type: 'page' | 'url' | 'fragment' | 'divider';
  pageId?: string;      // For type='page' — links to internal page
  url?: string;         // For type='url' — external link
  fragmentId?: string;  // For type='fragment' — content fragment
  target?: '_self' | '_blank';
  icon?: string;        // Lucide icon name (optional)
  children?: MenuItem[];
  cssClass?: string;    // Custom CSS class (optional)
}
```

### Example Menu JSON

```json
[
  {
    "id": "nav_1",
    "label": "Home",
    "type": "page",
    "pageId": "uuid-of-home-page",
    "children": []
  },
  {
    "id": "nav_2",
    "label": "Products",
    "type": "url",
    "url": "#",
    "children": [
      {"id": "nav_2a", "label": "Product A", "type": "page", "pageId": "uuid-a"},
      {"id": "nav_2b", "label": "Product B", "type": "page", "pageId": "uuid-b"},
      {"id": "nav_2c", "label": "---", "type": "divider"}
    ]
  },
  {
    "id": "nav_3",
    "label": "Contact",
    "type": "page",
    "pageId": "uuid-of-contact-page"
  }
]
```

## Menu Builder UI

`/dashboard/[siteId]/navigation` — accessible from site sidebar:

### Visual Menu Editor

```
┌─────────────────────────────────────────────────┐
│ Navigation Manager                              │
│                                                 │
│ [Header Menu ▼]  [+ New Menu]                   │
│                                                 │
│ ┌─────────────────────┬───────────────────────┐ │
│ │ Menu Items          │ Item Settings         │ │
│ │                     │                       │ │
│ │ ⋮⋮ Home             │ Label: [Home_______]  │ │
│ │ ⋮⋮ Products    ▶    │ Type:  [Page ▼]       │ │
│ │   ├ ⋮⋮ Product A    │ Page:  [Home Page ▼]  │ │
│ │   ├ ⋮⋮ Product B    │ Target: [Same Tab ▼]  │ │
│ │   └ ⋮⋮ ───────      │ CSS Class: [________] │ │
│ │ ⋮⋮ About            │                       │ │
│ │ ⋮⋮ Contact          │ [Delete Item]         │ │
│ │                     │                       │ │
│ │ [+ Add Item]        │                       │ │
│ └─────────────────────┴───────────────────────┘ │
│                                                 │
│ [Save Menu]                      [Preview]      │
└─────────────────────────────────────────────────┘
```

### Interactions

1. **Add Item**: Click "+ Add Item" → new item added at bottom with "New Link" label
2. **Reorder**: Drag items via the grip handle (⋮⋮) to reorder
3. **Nest**: Drag an item onto another to make it a child (indent)
4. **Un-nest**: Drag a child item to the root level
5. **Edit**: Click an item to show its settings in the right panel
6. **Delete**: Click "Delete Item" with confirmation
7. **Page Picker**: When type="page", show a dropdown of all pages in the site
8. **Preview**: Show a rendered preview of the menu as it would appear on the site

### Validation

- Maximum items per menu: 50
- Maximum nesting depth enforced per menu location
- Warn if a linked page is in draft/archived status (broken link risk)
- Warn if a linked page has been deleted

## Breadcrumbs

### Auto-Generated Breadcrumbs

For pages that are part of a navigation hierarchy, auto-generate breadcrumbs:

```
Home > Products > Product A
```

### Breadcrumb Logic

1. Find the current page in all menus
2. Walk up the parent chain to build the breadcrumb trail
3. Each breadcrumb item links to its page (if type='page') or URL
4. Always starts with "Home" (the site root)

### Breadcrumb Component

Add a `Breadcrumb` component that renders above the page content on public pages:

```typescript
interface BreadcrumbItem {
  label: string;
  href: string;
  isCurrent: boolean;
}
```

Render with proper semantic HTML:
```html
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/products">Products</a></li>
    <li aria-current="page">Product A</li>
  </ol>
</nav>
```

## Menu Rendering Components

### Header Navigation Component

A React component `<SiteNavigation />` that:
- Fetches the `header` menu for the current site
- Renders as a responsive horizontal nav bar
- Desktop: horizontal links with dropdown submenus on hover
- Mobile: hamburger menu toggle with slide-out drawer
- Active page is highlighted (compare current path to menu item page slugs)
- Supports 2 levels (top items + dropdown children)

### Footer Navigation Component

A React component `<SiteFooter />` that:
- Fetches the `footer` menu for the current site
- Renders as grouped link columns (each top-level item = column heading, children = links)
- 3-4 column grid layout on desktop, stacked on mobile

## Seed Data

Create seed menus for the demo site:

**Header menu:**
- Home (→ home page)
- About (→ about page)
- Blog (→ blog draft page)
- Contact (external URL: #)

**Footer menu:**
- Company: About, Careers (#), Press (#)
- Resources: Blog, Documentation (#), Support (#)
- Legal: Privacy (#), Terms (#)

## RLS Policies

- SELECT: All authenticated users can read menus for accessible sites
- INSERT/UPDATE/DELETE: Admin only

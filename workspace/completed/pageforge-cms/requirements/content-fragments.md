# Content Fragments

## Overview

Content fragments are reusable content blocks that can be embedded in multiple pages. When a fragment is updated, all pages referencing it display the latest version. This is inspired by AEM's Content Fragments / Experience Fragments.

## Use Cases

- **Global header/footer**: A navigation bar or footer used across all pages
- **Promotional banner**: A sale announcement embedded in multiple landing pages
- **Team member bios**: Shared across About and Team pages
- **Legal disclaimers**: Footer text reused on every page

## Data Model

### Database Table

```sql
CREATE TABLE content_fragments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  content JSONB NOT NULL DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, slug)
);
```

### Fragment Version History

```sql
CREATE TABLE fragment_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fragment_id UUID NOT NULL REFERENCES content_fragments(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fragment_id, version_number)
);
```

### Content Format

Fragment `content` uses the same JSON component array as page versions:
```json
[
  {"id": "frag_comp_1", "type": "text", "props": {"content": "<p>Shared content</p>"}},
  {"id": "frag_comp_2", "type": "cta", "props": {"heading": "Sign Up", "buttonText": "Join"}}
]
```

## Fragment Reference Component

Add a new component type: **Fragment Reference**

| Component | Props | Description |
|-----------|-------|-------------|
| **Fragment** | fragmentId, displayMode | Embeds a content fragment inline |

### Props

```typescript
interface FragmentRefProps {
  fragmentId: string;   // UUID of the content_fragments row
  displayMode: 'inline' | 'bordered'; // Whether to show a visual boundary
}
```

### Rendering Behavior

- **On the canvas (editor)**: Show a bordered card with fragment name, a "fragment" badge icon, and the rendered fragment content. The fragment content is read-only on the page canvas — clicking it shows a "Edit Fragment" button that opens the fragment editor.
- **On published page**: Render the fragment's components inline as if they were part of the page. No visual boundary.
- **On save**: The page version stores `{"type": "fragment", "props": {"fragmentId": "uuid"}}` — the actual fragment content is resolved at render time.

### Stale Fragment Indicator

If a fragment has been updated since the page was last saved, show a subtle "Updated" badge on the fragment reference in the editor. This is informational only — the page always renders the latest fragment content.

## Fragment Editor

### Fragment List Page

`/dashboard/[siteId]/fragments` — accessible from the site sidebar navigation:

- Grid/list view of all fragments for the site
- Each card shows: name, description, tag pills, last updated date, usage count (how many pages reference this fragment)
- Search by name or tag
- Create new fragment button

### Fragment Editor Page

`/dashboard/[siteId]/fragments/[fragmentId]/edit`

- Same three-panel layout as the page editor
- Component palette on left, canvas in center, property panel on right
- Save creates a new `fragment_versions` entry and updates `content_fragments.content`
- No publish workflow (fragments are always "live" — their latest saved content is what pages display)

### Usage Tracking

Show a "Used on N pages" indicator in the fragment editor toolbar. Clicking it shows a dropdown/panel listing pages that reference this fragment (linked to each page editor).

To compute this:
```sql
SELECT p.id, p.title, p.slug
FROM pages p
JOIN page_versions pv ON pv.page_id = p.id AND pv.version_number = p.current_version
WHERE pv.content::text LIKE '%"fragmentId":"<fragment-uuid>"%';
```

## Seed Data

Create 2 seed fragments for the demo site:

1. **Global CTA Banner**: A CTA component with "Start your free trial" heading
2. **Company Info Footer**: Text block with company address, email, phone number

Reference these fragments in at least one seeded page.

## RLS Policies

- SELECT: Same as site access (admins see all, authors see their sites)
- INSERT/UPDATE: Any authenticated user with site access
- DELETE: Admin only (fragments may be referenced by multiple pages)

# PageForge CMS — Database Schema

## Overview

All tables use Drizzle ORM with the `postgres-js` driver connecting to Supabase. Auth is handled by Supabase Auth natively (not Drizzle) — the `profiles` table extends the Supabase `auth.users` table via a foreign key.

## Tables

### profiles

Extends Supabase Auth users with application-specific fields.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'author' CHECK (role IN ('author', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notes:**
- `id` is the Supabase Auth user UUID — use it as the foreign key everywhere
- The `role` column drives all authorization logic
- Create a trigger or use Supabase Auth hooks to auto-create a profile on user signup

### sites

Multi-site support. Each site has its own pages and settings.

```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### pages

Pages belong to a site. Status controls visibility.

```sql
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  current_version INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES profiles(id),
  published_by UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, slug)
);
```

**Notes:**
- `current_version` tracks the latest version number
- `published_by` and `published_at` are set when an admin publishes
- `slug` is unique within a site (not globally)

### page_versions

Immutable version history. Each save creates a new row.

```sql
CREATE TABLE page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id, version_number)
);
```

**Content format** (JSONB array of component blocks):
```json
[
  {
    "id": "comp_abc123",
    "type": "hero",
    "props": {
      "title": "Welcome",
      "subtitle": "A subtitle",
      "backgroundImage": "https://...",
      "ctaText": "Learn More",
      "ctaLink": "/about",
      "alignment": "center"
    }
  },
  {
    "id": "comp_def456",
    "type": "text",
    "props": {
      "content": "<p>Rich text HTML from Tiptap</p>"
    }
  }
]
```

### media

Tracks uploaded files. Actual files live in Supabase Storage.

```sql
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL,
  width INT,
  height INT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Notes:**
- `storage_path` is the path in Supabase Storage bucket (e.g., `media/abc123.jpg`)
- `public_url` is the full public URL from Supabase Storage
- `width`/`height` are optional, populated for images

### components

Registry of available component types. Seeded on setup, not user-editable.

```sql
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  description TEXT,
  default_props JSONB NOT NULL DEFAULT '{}',
  prop_schema JSONB NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Seed data for components:**

| type | label | icon | default_props |
|------|-------|------|---------------|
| hero | Hero Banner | `Layout` | `{ title: "Heading", subtitle: "Subheading", backgroundImage: "", ctaText: "Learn More", ctaLink: "#", alignment: "center" }` |
| text | Text Block | `Type` | `{ content: "<p>Enter your text here...</p>" }` |
| image | Image | `Image` | `{ src: "", alt: "", caption: "", width: "full" }` |
| two-column | Two Columns | `Columns` | `{ leftContent: "<p>Left column</p>", rightContent: "<p>Right column</p>" }` |
| cta | Call to Action | `MousePointerClick` | `{ heading: "Ready to get started?", description: "Take the next step.", buttonText: "Get Started", buttonLink: "#", variant: "primary" }` |
| testimonial | Testimonial | `Quote` | `{ quote: "This is amazing!", author: "Jane Doe", role: "CEO", avatarUrl: "" }` |
| spacer | Spacer | `Minus` | `{ height: "md" }` |

## Indexes

```sql
CREATE INDEX idx_pages_site_id ON pages(site_id);
CREATE INDEX idx_pages_status ON pages(status);
CREATE INDEX idx_pages_created_by ON pages(created_by);
CREATE INDEX idx_page_versions_page_id ON page_versions(page_id);
CREATE INDEX idx_page_versions_version_number ON page_versions(page_id, version_number);
CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX idx_sites_created_by ON sites(created_by);
CREATE INDEX idx_sites_slug ON sites(slug);
```

## Row Level Security (RLS)

### profiles
- SELECT: Users can read all profiles (needed for displaying author names)
- UPDATE: Users can only update their own profile
- INSERT: Handled by auth trigger

### sites
- SELECT: Admins see all sites. Authors see sites they created.
- INSERT: Any authenticated user can create a site.
- UPDATE/DELETE: Only the creator or admins.

### pages
- SELECT: Admins see all pages. Authors see pages in their sites. Published pages are public.
- INSERT: Any authenticated user can create pages in their sites.
- UPDATE: Creator or admin can update. Only admin can change status to 'published'.
- DELETE: Creator or admin.

### page_versions
- SELECT: Same as parent page access.
- INSERT: Any authenticated user with page access.
- No UPDATE/DELETE (immutable).

### media
- SELECT: All authenticated users can see all media.
- INSERT: Any authenticated user.
- DELETE: Only the uploader or admin.

## Supabase Storage Buckets

Create a `media` bucket:
- Public access (images need public URLs for rendering)
- Max file size: 10MB
- Allowed mime types: image/jpeg, image/png, image/gif, image/webp, image/svg+xml

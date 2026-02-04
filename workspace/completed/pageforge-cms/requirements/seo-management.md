# SEO & Metadata Management

## Overview

Every page in PageForge has configurable SEO metadata: title tags, meta descriptions, Open Graph tags, Twitter cards, and structured data. The system also generates sitemaps and manages canonical URLs.

## Per-Page SEO Fields

### Database Addition

```sql
ALTER TABLE pages ADD COLUMN seo_title TEXT;
ALTER TABLE pages ADD COLUMN seo_description TEXT;
ALTER TABLE pages ADD COLUMN og_title TEXT;
ALTER TABLE pages ADD COLUMN og_description TEXT;
ALTER TABLE pages ADD COLUMN og_image_id UUID REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN canonical_url TEXT;
ALTER TABLE pages ADD COLUMN no_index BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pages ADD COLUMN no_follow BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pages ADD COLUMN structured_data JSONB;
```

### SEO Panel in Editor

Add an "SEO" tab in the page editor's right panel (alongside the property panel):

```
┌─────────────────────────────┐
│ Properties │ SEO │ Settings │
├─────────────────────────────┤
│                             │
│ Page Title Tag              │
│ [_________________________] │
│ 53 / 60 characters          │
│                             │
│ Meta Description            │
│ [_________________________] │
│ [_________________________] │
│ 142 / 160 characters        │
│                             │
│ ─── Open Graph ───          │
│                             │
│ OG Title                    │
│ [_________________________] │
│ (falls back to page title)  │
│                             │
│ OG Description              │
│ [_________________________] │
│ (falls back to meta desc)   │
│                             │
│ OG Image                    │
│ [Choose Image]  [Preview]   │
│                             │
│ ─── Advanced ───            │
│                             │
│ Canonical URL               │
│ [_________________________] │
│                             │
│ [x] No Index                │
│ [ ] No Follow               │
│                             │
│ ─── Preview ───             │
│                             │
│ Google Preview:             │
│ ┌─────────────────────────┐ │
│ │ PageForge - Home        │ │
│ │ https://demo.com/home   │ │
│ │ Welcome to PageForge... │ │
│ └─────────────────────────┘ │
│                             │
│ Social Preview:             │
│ ┌─────────────────────────┐ │
│ │ [OG Image Preview]      │ │
│ │ PageForge - Home        │ │
│ │ Welcome to PageForge... │ │
│ └─────────────────────────┘ │
│                             │
└─────────────────────────────┘
```

### Character Counters

- Title tag: warn at 60+ chars (turns orange), error at 70+ (turns red)
- Meta description: warn at 160+ chars, error at 200+
- Show remaining character count

### SEO Score Indicator

Calculate a simple SEO score (0-100) based on:
- Title tag present and within length: +20
- Meta description present and within length: +20
- OG image set: +15
- OG title set: +10
- OG description set: +10
- No orphan page (has internal links): +10
- Canonical URL set (if needed): +5
- Structured data present: +10

Display as a colored circle in the pages list: Red (<40), Yellow (40-70), Green (70+)

## Site-Level SEO Settings

`/dashboard/[siteId]/settings/seo` — admin only:

### Default Meta Tags

Set fallback values used when pages don't have their own:
- Default title template: `{page_title} | {site_name}` (configurable pattern)
- Default meta description
- Default OG image (site-wide fallback)

### robots.txt

Auto-generated `robots.txt` at the site's public URL:
```
User-agent: *
Allow: /
Sitemap: https://[site-domain]/sitemap.xml

# Disallow admin routes
Disallow: /dashboard/
Disallow: /api/
```

Editable in site settings (raw text field with a preview).

## Sitemap Generation

### sitemap.xml Route

Create a Next.js route handler at `/sitemap.xml`:

```typescript
// app/sitemap.xml/route.ts
export async function GET() {
  // Query all published pages for all public sites
  // Generate XML sitemap
}
```

### Sitemap Content

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://demo.pageforge.dev/</loc>
    <lastmod>2026-01-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://demo.pageforge.dev/about</loc>
    <lastmod>2026-01-10</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

### Sitemap Rules

- Only include pages with `status = 'published'`
- Exclude pages with `no_index = true`
- `lastmod` = `page.updated_at`
- `priority` based on page depth: home = 1.0, top-level = 0.8, nested = 0.6
- Auto-regenerate when pages are published/unpublished (or serve dynamically)

## HTML Head Rendering

In the public page view layout, render all SEO tags:

```html
<head>
  <title>{seo_title || page.title} | {site.name}</title>
  <meta name="description" content="{seo_description || auto-generated}" />
  <link rel="canonical" href="{canonical_url || current_url}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="{og_title || seo_title || page.title}" />
  <meta property="og:description" content="{og_description || seo_description}" />
  <meta property="og:image" content="{og_image.public_url || site.default_og_image}" />
  <meta property="og:url" content="{canonical_url || current_url}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{og_title || seo_title}" />
  <meta name="twitter:description" content="{og_description || seo_description}" />
  <meta name="twitter:image" content="{og_image.public_url}" />

  <!-- Robots -->
  <meta name="robots" content="{no_index ? 'noindex' : 'index'}, {no_follow ? 'nofollow' : 'follow'}" />

  <!-- Structured Data -->
  {structured_data && <script type="application/ld+json">{JSON.stringify(structured_data)}</script>}
</head>
```

## Auto-Generated Descriptions

If a page has no `seo_description`, auto-generate one from the first Text Block component:
- Strip HTML tags
- Take the first 155 characters
- Append "..." if truncated
- Show "(auto-generated)" label in the SEO panel

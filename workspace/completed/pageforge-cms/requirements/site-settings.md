# Site Settings & Configuration

## Overview

Each site in PageForge has a settings page where admins configure branding, analytics, custom code injection, error pages, and general site properties.

## Database Extension

```sql
ALTER TABLE sites ADD COLUMN favicon_media_id UUID REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE sites ADD COLUMN logo_media_id UUID REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE sites ADD COLUMN theme_config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sites ADD COLUMN custom_head_html TEXT;
ALTER TABLE sites ADD COLUMN custom_css TEXT;
ALTER TABLE sites ADD COLUMN analytics_config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sites ADD COLUMN social_links JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sites ADD COLUMN error_pages JSONB NOT NULL DEFAULT '{}';
ALTER TABLE sites ADD COLUMN settings JSONB NOT NULL DEFAULT '{}';
```

## Settings UI

`/dashboard/[siteId]/settings` — admin only, with tabs:

### General Tab

| Field | Type | Description |
|-------|------|-------------|
| Site Name | Text input | Display name (already exists) |
| Site Slug | Text input (readonly after creation) | URL-friendly identifier |
| Description | Textarea | Site description for internal use |
| Favicon | Media picker | 32x32 or SVG favicon |
| Logo | Media picker | Site logo for header/emails |
| Default Language | Dropdown | en, es, fr, de, ja, zh, etc. |
| Timezone | Dropdown | Used for scheduled publishing |

### Branding / Theme Tab

```typescript
interface ThemeConfig {
  primaryColor: string;      // Hex color, e.g., "#3B82F6"
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;        // Google Font name or system font
  headingFontFamily: string;
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
  darkMode: boolean;         // Enable dark mode toggle for visitors
}
```

- Color pickers for primary, secondary, accent colors
- Font selector dropdown (top 20 Google Fonts + system fonts)
- Border radius selector (visual toggle: sharp → rounded → pill)
- Preview panel showing a mini page with the theme applied
- Theme values are injected as CSS custom properties in the public layout:

```css
:root {
  --pf-primary: #3B82F6;
  --pf-secondary: #10B981;
  --pf-accent: #F59E0B;
  --pf-font-body: 'Inter', sans-serif;
  --pf-font-heading: 'Inter', sans-serif;
  --pf-radius: 0.5rem;
}
```

### Analytics Tab

Support multiple analytics integrations:

```typescript
interface AnalyticsConfig {
  googleAnalyticsId?: string;    // GA4 measurement ID (G-XXXXX)
  googleTagManagerId?: string;   // GTM container ID (GTM-XXXXX)
  plausibleDomain?: string;      // Plausible Analytics domain
  customScripts?: string;        // Raw script tags for other analytics
}
```

- Input fields for each analytics platform
- Validation: GA4 IDs start with "G-", GTM with "GTM-"
- Scripts are injected into `<head>` on public pages only (not in the dashboard)
- Custom scripts field with a code editor (monospace textarea)

### Custom Code Tab

| Field | Description |
|-------|-------------|
| Custom Head HTML | Raw HTML injected before `</head>` on public pages |
| Custom CSS | CSS injected as `<style>` in `<head>` on public pages |

- Code editor with syntax highlighting (monospace textarea, ~20 lines)
- Warning: "Custom code is injected directly into your site's HTML. Use with caution."
- Preview button to see the effect

### Social Links Tab

```typescript
interface SocialLinks {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  github?: string;
  tiktok?: string;
  website?: string;
}
```

- Input fields for each social platform URL
- Validation: must be valid URLs
- These links are available to the footer component and social sharing features

### Error Pages Tab

Configure custom error pages:

```typescript
interface ErrorPages {
  notFound?: {         // 404 page
    title: string;
    message: string;
    pageId?: string;   // Or link to a PageForge page as the 404
  };
  serverError?: {      // 500 page
    title: string;
    message: string;
  };
  maintenance?: {
    title: string;
    message: string;
    enabled: boolean;  // When true, all public pages show maintenance page
  };
}
```

- For 404: option to select an existing PageForge page as the 404 page
- For maintenance: toggle to enable/disable site-wide maintenance mode
- Preview each error page

### Danger Zone Tab

- **Delete Site**: Red button with double confirmation ("Type the site name to confirm")
- Deleting a site cascades to all pages, versions, media references, menus, templates, fragments
- This is a soft delete (sets `deleted_at` timestamp) per Constitution — data can be recovered by admin

## Public Layout Integration

The public page rendering layout reads site settings and applies them:

```typescript
// app/(public)/[siteSlug]/layout.tsx
export default async function PublicSiteLayout({ params, children }) {
  const site = await getSiteBySlug(params.siteSlug);

  return (
    <html lang={site.settings.defaultLanguage || 'en'}>
      <head>
        {/* Favicon */}
        {site.favicon && <link rel="icon" href={site.favicon.public_url} />}

        {/* Theme CSS variables */}
        <style>{generateThemeCss(site.theme_config)}</style>

        {/* Custom CSS */}
        {site.custom_css && <style>{site.custom_css}</style>}

        {/* Analytics */}
        {renderAnalyticsScripts(site.analytics_config)}

        {/* Custom head HTML */}
        {site.custom_head_html && <div dangerouslySetInnerHTML={{ __html: site.custom_head_html }} />}
      </head>
      <body>
        <SiteNavigation siteId={site.id} />
        {site.settings.maintenance?.enabled
          ? <MaintenancePage config={site.error_pages.maintenance} />
          : children
        }
        <SiteFooter siteId={site.id} socialLinks={site.social_links} />
      </body>
    </html>
  );
}
```

## Seed Data

Update the demo site seed with:
- Theme: blue primary (#3B82F6), green secondary (#10B981), Inter font, medium border radius
- Social links: twitter, github (placeholder URLs)
- No analytics configured (leave empty for demo)

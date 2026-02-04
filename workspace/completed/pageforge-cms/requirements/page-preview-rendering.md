# Page Preview & Public Rendering

## Overview

PageForge renders pages in two contexts: the editor preview (live preview of work in progress) and the public-facing page view (rendered for site visitors). Both share the same component rendering pipeline but differ in interactivity and data source.

## Public Page Routes

### URL Structure

```
/sites/[siteSlug]/[pageSlug]          → Rendered published page
/sites/[siteSlug]/                     → Home page (slug: "home" or "index")
/preview/[siteSlug]/[pageSlug]         → Preview mode (authenticated users only)
/preview/[siteSlug]/[pageSlug]?v=3     → Preview specific version
```

### Route Implementation

```typescript
// app/(public)/sites/[siteSlug]/[pageSlug]/page.tsx
export default async function PublicPage({ params }) {
  const { siteSlug, pageSlug } = params;

  // Look up site by slug
  const site = await getSiteBySlug(siteSlug);
  if (!site) return notFound();

  // Look up published page
  const page = await getPublishedPage(site.id, pageSlug);
  if (!page) return notFound();

  // Get the published version's content
  const version = await getPageVersion(page.id, page.current_version);

  return (
    <>
      <PageSEOHead page={page} site={site} />
      <ComponentRenderer components={version.content} site={site} />
    </>
  );
}
```

### Static Generation vs SSR

- Published pages use **ISR** (Incremental Static Regeneration) with `revalidate: 60` (1 minute)
- When a page is published, call `revalidatePath()` for immediate cache invalidation
- Preview pages always use SSR (no caching)

## Component Renderer

### Architecture

A single `<ComponentRenderer>` component that takes a JSON array of component blocks and renders them:

```typescript
// lib/components/component-renderer.tsx
interface ComponentRendererProps {
  components: ComponentBlock[];
  site: Site;
  isPreview?: boolean;     // Editor preview mode
  isEditable?: boolean;    // Canvas mode (interactive)
}

export function ComponentRenderer({ components, site, isPreview, isEditable }: ComponentRendererProps) {
  return (
    <main id="main-content">
      {components.map((block) => {
        const Component = componentRegistry[block.type];
        if (!Component) return <UnknownComponent key={block.id} type={block.type} />;

        return (
          <Component
            key={block.id}
            {...block.props}
            site={site}
            isPreview={isPreview}
          />
        );
      })}
    </main>
  );
}
```

### Component Registry

```typescript
// lib/components/registry.ts
const componentRegistry: Record<string, React.ComponentType<any>> = {
  hero: HeroRenderer,
  text: TextBlockRenderer,
  image: ImageRenderer,
  'two-column': TwoColumnRenderer,
  cta: CTARenderer,
  testimonial: TestimonialRenderer,
  spacer: SpacerRenderer,
  accordion: AccordionRenderer,
  tabs: TabsRenderer,
  carousel: CarouselRenderer,
  video: VideoRenderer,
  form: FormRenderer,
  'card-grid': CardGridRenderer,
  embed: EmbedRenderer,
  header: HeaderRenderer,
  footer: FooterRenderer,
  fragment: FragmentRenderer,
};
```

### Unknown Component Fallback

If a component type isn't found in the registry:
- Public view: render nothing (silent skip)
- Preview/editor: render a yellow warning box: "Unknown component type: [type]"

### Fragment Resolution

The `FragmentRenderer` resolves fragment references at render time:

```typescript
function FragmentRenderer({ fragmentId, site, isPreview }) {
  const fragment = await getFragmentById(fragmentId);
  if (!fragment) return <MissingFragment id={fragmentId} />;

  return <ComponentRenderer components={fragment.content} site={site} isPreview={isPreview} />;
}
```

## Editor Preview

### Live Preview Panel

In the page editor, add a "Preview" button in the toolbar that opens a preview in one of two modes:

#### 1. Split Preview (Side-by-Side)
- Editor takes 50% width, preview takes 50%
- Preview updates in real-time as props change
- Toggle between desktop/tablet/mobile viewport widths in the preview panel

#### 2. Full-Screen Preview
- Opens in a new browser tab at `/preview/[siteSlug]/[pageSlug]`
- Shows the page as it would appear to visitors
- A top banner: "Preview Mode — [Close Preview]"
- No editing capabilities — pure visual preview

### Preview Authentication

- Preview routes require authentication (Supabase Auth session)
- Only users with site access can preview
- Preview loads the CURRENT unsaved canvas state (via query parameter or session storage)
- Or loads a specific version with `?v=N`

## Server-Side Rendering of Components

Each component renderer handles its own server/client split:

### Server Components (default)
Most component renderers can be server components since they're pure rendering:
- Hero, Text, Image, Spacer, Testimonial, CTA, Two-Column, Card Grid

### Client Components (interactive)
Components with client-side behavior need `'use client'`:
- Accordion (expand/collapse)
- Tabs (tab switching)
- Carousel (auto-play, navigation)
- Video (play button, poster overlay)
- Form (validation, submission)
- Header (mobile menu toggle, sticky scroll detection)
- Embed (lazy loading)

### Hydration Strategy

For performance, use progressive hydration:
- Above-the-fold components: eager hydration
- Below-the-fold components: lazy hydration via Intersection Observer
- Interactive components: hydrate on first interaction

## Custom 404 Page

If a page slug doesn't match any published page:

1. Check if site has a custom 404 page configured (from `site.error_pages.notFound.pageId`)
2. If yes: render that page's content
3. If no: render a default 404 page with:
   - Site header/footer (from template)
   - "Page not found" message
   - Search bar
   - Link back to home

## Performance Optimizations

### Image Optimization

- Use Next.js `<Image>` component for all image rendering
- Serve appropriate rendition sizes based on viewport (responsive `srcSet`)
- Lazy load images below the fold
- Use WebP/AVIF when supported (Supabase Storage transformation)

### Font Loading

- Load Google Fonts (from theme config) via `next/font`
- Use `font-display: swap` for fast rendering
- Preload primary font weights (400, 600, 700)

### CSS

- Component-level CSS using Tailwind utility classes (no global CSS conflicts)
- Critical CSS inlined for above-the-fold content
- Theme CSS variables injected once in the layout

### Caching Strategy

| Route | Cache | Revalidation |
|-------|-------|-------------|
| Public pages | ISR | 60 seconds + on-demand |
| Preview | No cache | Always fresh |
| API endpoints | Cache-Control headers | Based on content type |
| Media/images | CDN + long cache | Immutable URLs |
| Sitemap | Generated | On publish events |

## Open Graph / Social Sharing

When shared on social media:
1. OG meta tags are rendered server-side (see `seo-management.md`)
2. OG image fallback chain: page OG image → site default OG image → auto-generated
3. Auto-generated OG image (stretch goal): capture a screenshot of the hero section as the OG image using an Edge Function or API route

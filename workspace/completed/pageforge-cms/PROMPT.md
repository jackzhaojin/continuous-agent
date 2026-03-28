---
title: Build PageForge CMS — AEM-Inspired Visual Page Builder
slug: pageforge-cms
status: complete
priority: P2
complexity: high
created: "2026-02-04"
tags:
  - nextjs
  - supabase
  - tailwind
  - cms
  - drag-and-drop
  - full-stack
output_path: /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-02-04/1770180822334
branch: null
---

## Problem

Build **PageForge**, an Adobe Experience Manager-inspired content management system with a visual drag-and-drop page builder. This is a full-stack Next.js application backed by Supabase that demonstrates professional-grade CMS architecture: component-based page editing, publish workflows, version history, media management, and role-based access control.

**What success looks like:**
- A working visual page builder where users drag components (Hero, Text, Image, Grid, CTA, Testimonial) onto a canvas and configure them via a property panel
- Pages can be saved as drafts, previewed, and published by admins
- Content is versioned — every save creates a version, and users can view/restore previous versions
- Media files (images) are uploaded to Supabase Storage and browsable in a media library
- Two roles (Author and Admin) with Supabase Auth and Row Level Security
- Clean, modern UI built with Tailwind CSS v4
- The project builds cleanly, seeds demo data, and runs against Supabase

## Project Context

### Language/Stack

- **Language**: TypeScript
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4 (CSS-first config, `@tailwindcss/postcss`)
- **Database**: Supabase (Postgres + Auth + Storage + Realtime)
- **ORM**: Drizzle ORM with postgres-js driver
- **Drag-and-Drop**: @dnd-kit/core + @dnd-kit/sortable
- **Rich Text**: Tiptap editor (for text block components)
- **Build system**: npm

### Existing Project?

- [x] **New project** - Building from scratch

## Approach

### Architecture Overview

```
PageForge CMS
├── Auth Layer (Supabase Auth + middleware)
│   ├── Login/Register pages
│   └── Role-based route protection (Author vs Admin)
├── Dashboard
│   ├── Sites overview (list of sites)
│   ├── Pages list per site (with status badges)
│   └── Quick stats (total pages, published, drafts)
├── Page Editor (core feature)
│   ├── Left: Component Palette (draggable components)
│   ├── Center: Canvas (drop zone, reorderable components)
│   ├── Right: Property Panel (edit selected component props)
│   └── Toolbar: Save, Preview, Publish, Version History
├── Media Library
│   ├── Upload to Supabase Storage
│   ├── Grid/list view of assets
│   └── Image picker modal (used in editor)
├── Page Preview (public-facing render)
│   └── Server-rendered page from JSON content
└── Admin Area
    ├── User management (list users, assign roles)
    └── Site settings
```

### Database Schema (Drizzle ORM)

See `./requirements/database-schema.md` for full schema. Summary:

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles extending Supabase Auth (role: author/admin, display name, avatar) |
| `sites` | Multi-site support (name, slug, description, created_by) |
| `pages` | Pages belonging to a site (title, slug, status: draft/published, site_id, created_by) |
| `page_versions` | Version history (page_id, version_number, content JSON, created_by, created_at) |
| `media` | Uploaded media files (filename, storage_path, mime_type, size, uploaded_by) |
| `components` | Component type registry (type, label, icon, default_props JSON, prop_schema JSON) |

### Content Model

Page content is stored as a JSON array of component blocks in `page_versions.content`:

```json
[
  {
    "id": "comp_1",
    "type": "hero",
    "props": {
      "title": "Welcome to PageForge",
      "subtitle": "Build beautiful pages visually",
      "backgroundImage": "/media/hero-bg.jpg",
      "ctaText": "Get Started",
      "ctaLink": "/docs"
    }
  },
  {
    "id": "comp_2",
    "type": "text",
    "props": {
      "content": "<p>Rich text content here...</p>"
    }
  }
]
```

### Component Types

Build these 16 component types, each with a renderer and a property editor.

**Core components** (detailed in this file):

| Component | Props | Description |
|-----------|-------|-------------|
| **Hero** | title, subtitle, backgroundImage, ctaText, ctaLink, alignment | Full-width hero banner with CTA |
| **Text Block** | content (HTML via Tiptap) | Rich text with formatting |
| **Image** | src, alt, caption, width | Image with optional caption |
| **Two-Column** | leftContent (JSON), rightContent (JSON) | Side-by-side layout |
| **Call to Action** | heading, description, buttonText, buttonLink, variant | Prominent CTA section |
| **Testimonial** | quote, author, role, avatarUrl | Customer quote card |
| **Spacer** | height (sm/md/lg/xl) | Vertical spacing |

**Extended components** (detailed in `requirements/` files):

| Component | Requirement File | Description |
|-----------|-----------------|-------------|
| **Accordion / FAQ** | `component-accordion.md` | Collapsible sections with titles and rich-text bodies |
| **Tabs** | `component-tabs.md` | Tabbed content panels with switchable views |
| **Carousel / Gallery** | `component-carousel.md` | Image slideshow with auto-play and navigation |
| **Video** | `component-video.md` | YouTube, Vimeo, or self-hosted video embed |
| **Form** | `component-form.md` | Drag-and-drop form builder with submission storage |
| **Card Grid** | `component-card-grid.md` | Responsive grid of cards with images and text |
| **Embed / HTML** | `component-embed.md` | Third-party embeds, maps, social posts, custom HTML |
| **Site Header** | `component-header-footer.md` | Site header with logo, navigation, and CTA |
| **Site Footer** | `component-header-footer.md` | Site footer with nav columns, social links, copyright |

### Visual Page Editor Design

The editor is a three-panel layout:

```
┌──────────────┬──────────────────────────────┬──────────────┐
│  Component   │                              │   Property   │
│  Palette     │       Canvas                 │   Panel      │
│              │                              │              │
│  [Hero]      │  ┌────────────────────────┐  │  Title:      │
│  [Text]      │  │ Hero Component         │  │  [________]  │
│  [Image]     │  │ "Welcome to..."        │  │              │
│  [Grid]      │  └────────────────────────┘  │  Subtitle:   │
│  [CTA]       │  ┌────────────────────────┐  │  [________]  │
│  [Quote]     │  │ Text Block             │  │              │
│  [Spacer]    │  │ "Lorem ipsum..."       │  │  Image:      │
│              │  └────────────────────────┘  │  [Upload]    │
│              │                              │              │
│              │  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ──┐ │              │
│              │    Drop components here      │              │
│              │  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ──┘ │              │
└──────────────┴──────────────────────────────┴──────────────┘
│ Save Draft │ Preview │ Publish (Admin) │ Version History  │
└─────────────────────────────────────────────────────────────┘
```

Key interactions:
1. **Drag from palette** → Drop onto canvas to add a component
2. **Drag on canvas** → Reorder components vertically (sortable)
3. **Click component** → Select it, show its props in the property panel
4. **Edit props** → Changes reflect live on the canvas
5. **Save** → Creates a new version in `page_versions`
6. **Publish** → Sets page status to `published`, copies current version as the live version

### Auth & Roles

- **Supabase Auth** with email/password (not Auth.js — use Supabase native auth for tighter integration)
- **Two roles**: `author` and `admin` stored in `profiles.role`
- **Author can**: Create/edit pages, save drafts, upload media, view published pages
- **Admin can**: Everything author can + publish pages, manage users, manage sites
- **Middleware**: Protect `/dashboard/*` routes, redirect unauthenticated users to login
- **RLS Policies**: Authors see only their sites/pages, admins see all

### Tailwind CSS v4 Setup

Tailwind v4 uses CSS-first configuration:
1. Install: `npm install tailwindcss @tailwindcss/postcss postcss`
2. `postcss.config.mjs`: `{ plugins: { "@tailwindcss/postcss": {} } }`
3. `app/globals.css`: `@import "tailwindcss";` — that's it, no tailwind.config.js needed
4. Custom theme values go in CSS with `@theme { }` blocks

### Supabase Setup

The Supabase project is already provisioned (project ref: `lmbrqiwzowiquebtsfyc`). Connection details are available via env vars:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from workspace `.env`
- Use `@supabase/supabase-js` for client-side auth and realtime
- Use `@supabase/ssr` for server-side Supabase client in Next.js
- Use Drizzle ORM + postgres-js for all database queries (not Supabase JS client for DB)
- Connection string via: `supabase db url --project-ref lmbrqiwzowiquebtsfyc` or construct from env vars

### Seed Data

Create a seed script that populates:
- 2 users: `admin@pageforge.dev` (admin) + `author@pageforge.dev` (author), both password: `password123`
- 1 site: "PageForge Demo" with slug `demo`
- 3 sample pages with real content:
  1. **Home** (published) — Hero + Text + Two-Column + CTA
  2. **About** (published) — Hero + Text + Testimonial + Testimonial + Spacer + CTA
  3. **Blog Draft** (draft) — Hero + Text + Image + Text
- 7 component type definitions in the components table
- 3-5 sample media entries (use placeholder URLs like picsum.photos)

## Detailed Requirements

The following requirement files in `requirements/` expand on each major feature area. All of these are in scope and must be implemented:

| Requirement File | Feature Area |
|-----------------|-------------|
| `database-schema.md` | Full SQL schema, indexes, RLS policies, storage buckets |
| `advanced-editor.md` | Undo/redo, copy/paste, multi-select, responsive preview, keyboard shortcuts |
| `template-system.md` | Page templates with locked regions, template gallery, template editor |
| `content-fragments.md` | Reusable content blocks shared across pages, fragment editor |
| `publish-workflow.md` | Review submissions, scheduled publishing, page locking, archiving |
| `audit-trail.md` | Activity logging, activity feed UI, data export |
| `media-library-advanced.md` | Folders, tagging, search, renditions, drag-and-drop upload |
| `seo-management.md` | Meta tags, OG/Twitter cards, sitemap.xml, SEO score |
| `navigation-management.md` | Visual menu builder, breadcrumbs, header/footer nav |
| `site-settings.md` | Branding/theme, analytics, custom code injection, error pages |
| `headless-api.md` | JSON API with API key auth, webhooks, rate limiting |
| `accessibility.md` | WCAG 2.1 AA compliance, keyboard nav, screen reader support |
| `dashboard-analytics.md` | Dashboard widgets, notifications, sidebar nav, global search |
| `user-management.md` | Extended roles (viewer/author/admin), invite system, profile management |
| `page-preview-rendering.md` | Component renderer pipeline, preview modes, ISR, performance |
| `component-accordion.md` | Accordion/FAQ component with variants |
| `component-tabs.md` | Tabs component with variants |
| `component-carousel.md` | Carousel/gallery with auto-play and navigation |
| `component-video.md` | Video embed (YouTube, Vimeo, self-hosted) |
| `component-form.md` | Form builder with validation and submission storage |
| `component-card-grid.md` | Responsive card grid component |
| `component-embed.md` | Embed/HTML component for third-party content |
| `component-header-footer.md` | Site header and footer components |

## Definition of Done

**Build & Infrastructure**:
- [ ] Project builds without errors (`npm run build`)
- [ ] No TypeScript errors
- [ ] Tailwind CSS v4 compiles correctly
- [ ] Clean project structure with organized components
- [ ] Environment variables documented in `.env.example`
- [ ] Git committed with clean status

**Database**:
- [ ] All tables created in Supabase with correct schema (profiles, sites, pages, page_versions, media, components, templates, content_fragments, fragment_versions, media_folders, menus, activity_log, review_requests, form_submissions, api_keys, webhooks, invitations, notifications, newsletter_subscribers)
- [ ] RLS policies active for role-based access
- [ ] Database triggers (profile auto-creation on signup)
- [ ] Indexes for performance

**Auth & User Management**:
- [ ] Login page works with email/password (Supabase Auth)
- [ ] Register page creates new users with `author` role
- [ ] Protected routes redirect to login when unauthenticated
- [ ] Three roles: viewer, author, admin with correct permissions
- [ ] Invite system for adding team members
- [ ] User profile management (display name, avatar, password change)
- [ ] Admin user management page

**Page Editor (Core)**:
- [ ] Three-panel layout renders (palette, canvas, properties)
- [ ] Components can be dragged from palette to canvas
- [ ] Components can be reordered on canvas via drag
- [ ] Clicking a component shows its properties in the right panel
- [ ] Editing properties updates the component on canvas
- [ ] Save creates a new page version in the database

**Advanced Editor**:
- [ ] Undo/redo with keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
- [ ] Copy/paste/duplicate components (Ctrl+C/V/D)
- [ ] Multi-select components (Shift+click, Ctrl+A)
- [ ] Responsive preview toggle (desktop/tablet/mobile)
- [ ] Full keyboard shortcut support with reference panel
- [ ] Drag handle on each component

**All 16 Components**:
- [ ] Core 7: Hero, Text Block, Image, Two-Column, CTA, Testimonial, Spacer
- [ ] Extended 9: Accordion, Tabs, Carousel, Video, Form, Card Grid, Embed, Header, Footer
- [ ] Each component has a renderer AND a property editor
- [ ] Components render correctly on public pages

**Template System**:
- [ ] Templates table with locked regions support
- [ ] Template gallery modal when creating a new page
- [ ] At least 5 seed templates (Blank, Landing, Blog, About, Contact)
- [ ] Template editor for admins
- [ ] "Save as Template" from page editor

**Content Fragments**:
- [ ] Fragment CRUD with version history
- [ ] Fragment reference component (renders inline)
- [ ] Fragment editor (same three-panel layout as page editor)
- [ ] Usage tracking (which pages reference a fragment)

**Publish Workflow**:
- [ ] Extended status lifecycle: draft → in_review → scheduled → published → archived
- [ ] Submit for review flow (author → admin)
- [ ] Scheduled publishing with date/time picker
- [ ] Page locking (prevent concurrent editing)
- [ ] Bulk actions (archive, delete)

**Media Library**:
- [ ] Folder organization with tree sidebar
- [ ] Tagging system with search
- [ ] Full-text search across media metadata
- [ ] Drag-and-drop upload with progress indicators
- [ ] Image renditions (thumbnail, medium, large)
- [ ] Media detail panel with metadata editing
- [ ] Image picker modal integrated in page editor

**Version History**:
- [ ] Each save creates a new version number
- [ ] Version history panel shows list of versions with timestamps
- [ ] Can view and restore a previous version

**SEO**:
- [ ] Per-page SEO fields (title, description, OG tags, canonical, robots)
- [ ] SEO panel in editor with character counters and previews
- [ ] Sitemap.xml generation from published pages
- [ ] Auto-generated meta descriptions from page content

**Navigation**:
- [ ] Visual menu builder with drag-and-drop reordering
- [ ] Menu locations: header, footer, sidebar
- [ ] Breadcrumb auto-generation
- [ ] Header and footer components pull from menus

**Dashboard**:
- [ ] Stats cards (total pages, published, drafts, in review)
- [ ] Recent pages widget
- [ ] Quick actions (new page, upload media, view site)
- [ ] Activity feed widget
- [ ] Notification bell with real-time updates
- [ ] Collapsible sidebar navigation
- [ ] Global search (Cmd+K)

**Site Settings**:
- [ ] General settings (name, favicon, logo)
- [ ] Theme/branding config (colors, fonts, border radius)
- [ ] Analytics integration (GA4, GTM, Plausible)
- [ ] Custom code injection (head HTML, custom CSS)
- [ ] Social links
- [ ] Error pages (404, maintenance mode)

**Headless API**:
- [ ] REST API with API key authentication
- [ ] Endpoints: pages, media, menus, fragments, site
- [ ] Rate limiting (100 req/min)
- [ ] Webhook system with signing
- [ ] API key management UI
- [ ] CORS headers

**Audit Trail**:
- [ ] Activity log for all major actions
- [ ] Activity feed UI with filtering
- [ ] Per-page activity tab

**Accessibility**:
- [ ] Full keyboard navigation for dashboard and editor
- [ ] Screen reader support (ARIA labels, live regions, semantic HTML)
- [ ] Color contrast WCAG AA (4.5:1 for text)
- [ ] `prefers-reduced-motion` support
- [ ] Skip navigation links on public pages
- [ ] Accessibility audit panel in editor

**Page Rendering**:
- [ ] Component renderer pipeline (JSON → React)
- [ ] Public page routes with ISR caching
- [ ] Preview mode for authenticated users
- [ ] Theme CSS variables applied to public pages
- [ ] Custom 404 page support

**Seed Data**:
- [ ] 3 users (admin, author, viewer) with credentials
- [ ] 1 demo site with theme config
- [ ] 3+ sample pages with real content across multiple components
- [ ] 5 page templates
- [ ] 2 content fragments
- [ ] 16 component type definitions
- [ ] 5+ sample media entries
- [ ] Header and footer menus
- [ ] Seed script runnable via `npm run db:seed`

## Constraints

### What the Agent CAN Do

- Create the full Next.js project from scratch
- Install all npm dependencies
- Create and push Drizzle schema to Supabase
- Use Supabase CLI for project info and connection strings
- Upload seed media to Supabase Storage
- Run the dev server to validate functionality
- Create Supabase Auth users via the admin API (service role key)

### What the Agent CANNOT Do

- Push to remote repository
- Modify Supabase project settings in the dashboard (billing, regions)
- Deploy to Vercel or any hosting platform
- Install system-level dependencies

## Open Questions

- If `@dnd-kit` has compatibility issues with React 19 / Next.js 15, fall back to `react-beautiful-dnd` or a simpler custom drag implementation with HTML5 drag events
- If Tiptap has Next.js SSR issues, wrap it in a dynamic import with `{ ssr: false }`
- If Supabase Storage CORS blocks uploads from localhost, use the service role key for server-side uploads via API routes
- For the Two-Column component, nested drag-and-drop is complex — it's acceptable to use simple text/image props instead of full nested components

## Agent Notes

<!-- Accumulated by agent during execution -->

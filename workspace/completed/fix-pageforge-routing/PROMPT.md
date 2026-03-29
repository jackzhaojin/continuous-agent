---
title: Fix PageForge CMS Routing — Dashboard Redirect Loop
slug: fix-pageforge-routing
status: complete
priority: P2
complexity: medium
created: "2026-03-28"
tags:
  - bugfix
  - routing
  - nextjs
  - pageforge
max_turns: 300
output_path: /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-02-04/1770180822334
branch: null
---

## Problem

PageForge CMS has a **routing bug** that makes the entire dashboard inaccessible after login. The middleware redirects authenticated users to `/dashboard`, but that route doesn't have a direct page — it expects `/dashboard/{siteId}`. This creates an infinite-feeling redirect loop where every protected route ends up at a 404 on `/dashboard`.

**Symptoms:**
- Login succeeds (Supabase auth works, cookie is set)
- Middleware redirects authenticated users from `/login` to `/dashboard`
- `/dashboard` returns 404 because it needs a `[siteId]` parameter
- Navigating to `/sites`, `/pages`, etc. also redirects to `/dashboard` (404)
- The entire app is unusable after login

**Root cause:** Mismatch between the middleware redirect target and the `(dashboard)` route group structure:

```
app/
├── (dashboard)/
│   ├── layout.tsx          # Dashboard layout with sidebar
│   ├── page.tsx            # Maps to / (conflicts with app/page.tsx)
│   ├── sites/page.tsx      # Maps to /sites
│   ├── pages/page.tsx      # Maps to /pages
│   ├── profile/page.tsx    # Maps to /profile
│   └── dashboard/          # Subfolder!
│       └── [siteId]/       # Maps to /dashboard/{siteId}/...
│           ├── page.tsx
│           ├── pages/page.tsx
│           ├── media/page.tsx
│           └── ...
```

The middleware (`lib/supabase/middleware.ts`) redirects to `/dashboard` on auth-route access, but the `(dashboard)` group's top-level routes (`sites`, `pages`, etc.) don't live under `/dashboard/` — they're at the root. Meanwhile `/dashboard` itself requires a `[siteId]`.

**What success looks like:**
- After login, user lands on a working sites list page
- All sidebar navigation links work (sites, pages, templates, media, etc.)
- The dashboard layout (sidebar + content) renders correctly
- No redirect loops or 404s on any protected route
- Use Playwright to verify the full flow: login → dashboard → navigate sidebar → view a site

## Project Context

### Language/Stack

- **Language**: TypeScript
- **Framework**: Next.js 15/16 (App Router, route groups)
- **Auth**: Supabase Auth with SSR middleware
- **Database**: Supabase (Postgres), Drizzle ORM

### Existing Project?

- [x] **Existing project** - Bug fix

Current state:
```
- Auth (login/register): Works
- Supabase connection: Works
- Middleware session refresh: Works
- All 26 page routes exist with code
- Dashboard layout with sidebar: exists but never renders due to redirect bug
- Route group (dashboard) structure conflicts with /dashboard/[siteId] nesting
```

## Key Files to Investigate

- `lib/supabase/middleware.ts` — The redirect logic (line ~50: redirects to `/dashboard`)
- `middleware.ts` — Calls `updateSession()`
- `app/(dashboard)/layout.tsx` — Dashboard layout with sidebar nav links
- `app/(dashboard)/sites/page.tsx` — Sites list (should be the default landing)
- `app/(dashboard)/dashboard/[siteId]/page.tsx` — Site-specific dashboard

## Approach

The fix likely involves one or both of:

1. **Fix the middleware redirect** — Change the post-login redirect from `/dashboard` to `/sites` (or wherever the sites list lives)
2. **Restructure the route groups** — Move routes so the sidebar pages live under `/dashboard/` to match the middleware redirect. Or add a `/dashboard/page.tsx` that lists sites or redirects to the first site.

Verify by running the app and testing the full flow with Playwright.

## Definition of Done

**Build**:
- [ ] `npm run build` passes with zero errors

**Functionality**:
- [ ] Login redirects to a working page (not a 404)
- [ ] Sites list page renders with sidebar layout
- [ ] All sidebar navigation links work
- [ ] Site-specific pages work (`/dashboard/{siteId}/pages`, `/dashboard/{siteId}/media`, etc.)
- [ ] Unauthenticated users are redirected to login
- [ ] No console errors on any dashboard page

**Verification**:
- [ ] Playwright test: login → see dashboard → click sidebar links → no errors
- [ ] Git committed with clean status

## Constraints

- Do NOT rewrite the entire app — this is a focused routing fix
- Preserve all existing page components and functionality
- Keep Supabase auth flow intact
- The seed credentials are: `admin@pageforge.dev` / `password123`

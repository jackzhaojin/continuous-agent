---
title: Migrate Recipe Discovery Platform from local Postgres to Supabase
slug: migrate-recipe-app-supabase
status: complete
priority: P2
complexity: medium
created: "2026-02-03"
tags:
  - supabase
  - migration
  - database
  - recipe-app
output_path: /Users/jackjin/dev/agent-outputs/projects/nextjs/2026-02-04/1770173908713
source_project: "1769685367609"
---

## Problem

The Recipe Discovery Platform currently runs on a local PostgreSQL 16 instance (Homebrew). We need to migrate it to our Supabase project so the app uses a cloud database instead. This eliminates the local Postgres dependency and makes the app deployable.

**What success looks like:**
- App connects to Supabase instead of local Postgres
- All schema (9 tables, 13 indexes) is created in Supabase
- All seed data is migrated (2 users, 30+ ingredients, 5 dietary tags, 3 sample recipes with instructions)
- App runs locally against Supabase and all features work (search, filter, favorites, auth)
- No references to local Postgres remain in the codebase

## Project Context

### Language/Stack

- **Language**: TypeScript
- **Framework**: Next.js (App Router)
- **ORM**: Drizzle ORM 0.45.1 with postgres-js 3.4.8
- **Auth**: Auth.js v5 (Credentials provider, JWT sessions)
- **Build system**: npm

### Existing Project?

- [x] **Existing project** - Enhancing/modifying

Current state:
```
Fully functional recipe discovery app with:
- 9 Drizzle schema tables (users, recipes, ingredients, recipe_ingredients,
  instructions, dietary_tags, recipe_dietary_tags, favorites, reviews)
- 13 performance indexes
- API routes for recipes, ingredients, dietary-tags, favorites
- Auth.js credentials-based authentication
- Seed script with sample data
- Local Postgres connection: postgresql://jackjin@localhost:5432/recipe_discovery
```

## Approach

This is primarily a **connection string migration** — Drizzle ORM queries are already Postgres-compatible and portable. The migration has three phases:

### Phase 1: Connect to Supabase
1. Update `.env.local` to use Supabase connection string from Tier 3 credentials
   - The `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available in the workspace `.env` (Tier 2)
   - The Supabase Postgres connection string format is: `postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.co:6543/postgres`
   - **IMPORTANT**: You may need to retrieve the actual database password from Supabase project settings. If the connection string is not directly constructable from the env vars, use the Supabase CLI: `supabase db url --project-ref lmbrqiwzowiquebtsfyc` to get the full connection URL
   - Add `?sslmode=require` to the connection string for cloud connections
2. Verify `lib/db/index.ts` works with the new connection (it should — postgres-js handles SSL)
3. Update `drizzle.config.ts` if needed for the new connection

### Phase 2: Push Schema & Seed Data
1. Run `npm run db:push` to create all tables in Supabase (Drizzle pushes schema directly)
2. Run `npm run db:seed` to populate with sample data
3. Verify data exists via `npm run db:studio` or Drizzle queries

### Phase 3: Validate & Clean Up
1. Start the dev server (`npm run dev`) and verify:
   - Homepage loads with recipes
   - Search and filtering work
   - User login works (chef@example.com / password123)
   - Favorites toggle works
2. Update `.env.example` to show Supabase as the default connection pattern
3. Remove any local Postgres references from README or docs
4. Commit all changes

## Definition of Done

**Build**:
- [ ] Project builds without errors (`npm run build`)
- [ ] No TypeScript errors

**Database**:
- [ ] All 9 tables exist in Supabase with correct schema
- [ ] All indexes are created
- [ ] Seed data is present (verify with a query: recipes count = 3, users count = 2)

**Functionality**:
- [ ] App starts and connects to Supabase (`npm run dev`)
- [ ] Recipe listing page shows seeded recipes
- [ ] Search by ingredient/cuisine works
- [ ] User authentication works
- [ ] Favorites feature works

**Code Quality**:
- [ ] `.env.local` points to Supabase (no localhost references)
- [ ] `.env.example` updated with Supabase connection pattern
- [ ] Git committed with clean status

## Constraints

### What the Agent CAN Do

- Modify connection strings and env files
- Run Drizzle push/seed/migrate commands
- Run the dev server to validate
- Install additional dependencies if needed (e.g., SSL)
- Use `supabase` CLI for project info

### What the Agent CANNOT Do

- Push to remote repository
- Modify the Supabase project settings (RLS policies, auth config) without explicit need
- Delete the local database

## Open Questions

- If Drizzle `db:push` fails on Supabase due to permissions, try using the `service_role` connection (bypasses RLS). The service role key is available as `SUPABASE_SERVICE_ROLE_KEY` in the workspace env.

## Agent Notes

<!-- Accumulated by agent during execution -->

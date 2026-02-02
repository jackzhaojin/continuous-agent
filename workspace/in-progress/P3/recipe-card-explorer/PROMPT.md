---
title: Full-Stack Recipe Discovery Platform
slug: recipe-card-explorer
status: in-progress
priority: P3
complexity: high
created: 2026-01-28T00:00:00.000Z
tags:
  - react
  - nextjs
  - tailwind
  - frontend
  - ui-ux
  - cards
  - filtering
  - api
  - database
  - authentication
  - full-stack
  - responsive
  - animation
output_path: /Users/jackjin/dev/agent-outputs/projects/nextjs/2026-01-29/1769685367609
branch: null
---

## Problem

Build a full-stack recipe discovery platform with user accounts, a REST API for recipe management, a SQLite database, and a polished card-based browsing UI. Users can browse, search, filter, save favorites, create their own recipes, and leave ratings. This tests the full delivery pipeline — database design, API endpoints, authentication, and rich interactive frontend with instant search, filtering, modals, and responsive layouts.

## Definition of Done

### Authentication & User System
- [ ] Login and registration pages with email/password
- [ ] Session-based authentication with JWT tokens
- [ ] Protected routes for recipe creation, favorites, and profile
- [ ] User profile page showing username, recipes created, favorites count

### Database & Schema
- [ ] SQLite database with better-sqlite3 (or Prisma + SQLite)
- [ ] Schema: Users, Recipes (title, description, category, difficulty, cookTime, servings, imageUrl, createdBy), Ingredients (recipeId, name, amount, unit), Steps (recipeId, stepNumber, instruction), Favorites (userId, recipeId), Ratings (userId, recipeId, score)
- [ ] Seed script populating 20+ recipes across categories with realistic ingredients and step descriptions
- [ ] Migrations or schema initialization script

### API Endpoints
- [ ] POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
- [ ] GET /api/recipes — list recipes with pagination, optional category/difficulty filters
- [ ] GET /api/recipes/:id — full recipe detail with ingredients, steps, average rating
- [ ] POST /api/recipes — create recipe (authenticated)
- [ ] PUT /api/recipes/:id — update recipe (owner only)
- [ ] DELETE /api/recipes/:id — delete recipe (owner only)
- [ ] GET /api/recipes/search?q= — full-text search by title, ingredients, description
- [ ] POST /api/recipes/:id/favorite — toggle favorite
- [ ] GET /api/favorites — user's favorited recipes
- [ ] POST /api/recipes/:id/rate — rate a recipe (1-5 stars)
- [ ] GET /api/users/me/recipes — user's created recipes

### Frontend UI
- [ ] Browse page: responsive grid of recipe cards (image placeholder, title, cook time, difficulty badge, average rating)
- [ ] Search bar with instant client-side filtering (debounced, highlights matches)
- [ ] Category filter bar (Breakfast, Lunch, Dinner, Dessert, Snack, Vegetarian) with multi-select
- [ ] Difficulty badges: Easy (green), Medium (yellow), Hard (red) with Tailwind color coding
- [ ] Sort options: popularity, cook time, newest, rating
- [ ] Card hover effect: subtle lift + shadow transition
- [ ] Recipe detail page: hero image, ingredient list with checkboxes, numbered steps, cook time, servings, nutritional estimate
- [ ] Rating component: clickable star rating (1-5) with average display
- [ ] Favorite heart toggle on cards and detail page
- [ ] Create recipe form: multi-step wizard (basic info → ingredients → steps → review & submit)
- [ ] User profile page with tabs: My Recipes, Favorites
- [ ] Empty states for all pages ("No recipes found", "No favorites yet", etc.)
- [ ] Responsive: 1 col mobile, 2 col tablet, 3-4 col desktop
- [ ] Loading skeletons for all async data fetches

### Integration & Polish
- [ ] All pages fetch from the API (no hardcoded mock in components)
- [ ] Optimistic UI for favorite toggle and rating
- [ ] Error boundaries and toast notifications for failed operations
- [ ] All code compiles, no TypeScript errors
- [ ] Git committed with clean status

## Approach

- Next.js 14 App Router + TypeScript + Tailwind CSS
- Database: SQLite via better-sqlite3
- Auth: Custom JWT with bcrypt
- Images: Gradient placeholders with category-specific colors
- Filtering: Server-side for pagination, client-side instant filter for loaded results
- Forms: React Hook Form with Zod validation for recipe creation
- Animations: Tailwind transition utilities, custom keyframes for modal enter/exit
- Layout: CSS Grid with auto-fill and minmax for responsive card grid

## Agent Notes

Complex full-stack task with CRUD operations, relational data, user-generated content, and rich UI interactions. Expect 7-9 implementation steps.

---
title: Full-Stack Retro Analytics Dashboard
slug: retro-dashboard
status: complete
priority: P2
complexity: high
created: 2026-01-28T00:00:00.000Z
tags:
  - react
  - nextjs
  - tailwind
  - frontend
  - ui-ux
  - dashboard
  - data-visualization
  - analytics
  - api
  - database
  - authentication
  - full-stack
  - responsive
  - animation
output_path: /Users/jackjin/dev/ai-sandbox/projects/nextjs/2026-01-29/1769678844738
branch: null
---

## Problem

Build a full-stack analytics dashboard with a distinctive retro/synthwave visual identity, user authentication, a data API serving analytics metrics from a SQLite database, and multiple dashboard pages. Users can log in, view analytics across different time ranges, manage their dashboard layout preferences, and export reports. This tests the full delivery spectrum: database design, API development, authentication, custom chart rendering (no chart libraries), responsive layout, and execution of a specific visual design language.

## Definition of Done

### Authentication & User System
- [ ] Login and registration pages styled with synthwave aesthetic
- [ ] Session-based authentication with JWT tokens
- [ ] Protected dashboard routes — redirect to login if unauthenticated
- [ ] User profile page: username, email, role, theme preferences, last login
- [ ] Settings page: dashboard layout preference (compact/comfortable), date range default, export format preference

### Database & Schema
- [ ] SQLite database with better-sqlite3 (or Prisma + SQLite)
- [ ] Schema: Users (id, username, email, passwordHash, role, preferences JSON, createdAt), DailyMetrics (date, revenue, users, pageViews, conversions, bounceRate), Events (id, type, description, userId, metadata JSON, timestamp), Reports (id, title, dateRange, generatedBy, format, createdAt)
- [ ] Seed script populating 90 days of realistic daily metrics with trends, 200+ events, 5+ reports
- [ ] Migrations or schema initialization script

### API Endpoints
- [ ] POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout
- [ ] GET /api/metrics/summary — aggregate stats (total revenue, users, conversion rate, etc.)
- [ ] GET /api/metrics/daily?from=&to= — daily metrics for date range
- [ ] GET /api/metrics/trends — week-over-week and month-over-month changes
- [ ] GET /api/events — recent activity feed with pagination
- [ ] GET /api/events/stats — event type breakdown for donut chart
- [ ] GET /api/reports — list generated reports
- [ ] POST /api/reports/generate — generate a new report (date range, format)
- [ ] GET /api/reports/:id/download — download report (CSV/JSON)
- [ ] PUT /api/users/me/preferences — update dashboard preferences
- [ ] GET /api/metrics/search?q= — search events and metrics

### Frontend UI — Dashboard Pages
- [ ] Overview page: stat cards row (4 cards), line chart (30-day trend), bar chart (weekly comparison), donut chart (traffic sources), activity feed
- [ ] Revenue page: detailed revenue line chart with daily/weekly/monthly toggle, top revenue sources table, revenue by category bar chart
- [ ] Users page: user growth line chart, active vs new users comparison, user demographics donut chart
- [ ] Reports page: list of generated reports with download links, generate new report form

### Frontend UI — Layout & Components
- [ ] Synthwave/retro color palette: deep purples (#1a0533), hot pinks (#ff2d95), cyan accents (#00f0ff), dark backgrounds
- [ ] Sidebar navigation with icon + label items, collapsible to icon-only, active state glow
- [ ] Top bar with search input, date range picker, notification bell with badge + dropdown, user avatar menu
- [ ] Stat cards (4) with animated count-up numbers on mount and trend indicator (up/down arrow + percentage)
- [ ] Bar chart component: pure CSS-rendered bars (no chart library), hover tooltips, animated entrance
- [ ] Line chart component: SVG path rendering, animated draw-in on mount, hover crosshair with data point tooltip
- [ ] Donut/ring chart: SVG-based with animated stroke, center label showing total/percentage
- [ ] Activity feed with timestamped entries, status icons, and expandable detail rows
- [ ] Date range picker component: preset ranges (7d, 30d, 90d, custom) with calendar popover
- [ ] Responsive grid layout: 1 col mobile, 2 col tablet, 4 col desktop
- [ ] Subtle grid-line or scanline overlay effect for retro feel
- [ ] Custom scrollbar styling matching the synthwave theme
- [ ] Glow effects on active elements, neon border accents

### Integration & Polish
- [ ] All dashboard data fetched from API (no hardcoded values in components)
- [ ] Date range picker updates all charts and metrics via API refetch
- [ ] Loading skeletons with synthwave-themed pulse animation
- [ ] Error states with retry buttons for failed API calls
- [ ] Google Fonts: "Press Start 2P" for headings, "Inter" for body text
- [ ] CRT scanline overlay (subtle, CSS only)
- [ ] All code compiles, no TypeScript errors
- [ ] Git committed with clean status

## Approach

- Next.js 14 App Router + TypeScript + Tailwind CSS
- Database: SQLite via better-sqlite3
- Auth: Custom JWT with bcrypt
- Custom Tailwind theme extending colors with synthwave palette
- Charts: Pure SVG/CSS (no recharts/chart.js) to demonstrate low-level rendering capability
- Animations: CSS @keyframes for count-up, SVG stroke-dashoffset for line chart draw-in, requestAnimationFrame for smooth transitions
- Layout: CSS Grid for dashboard panels, Flexbox for nav/content split
- Data fetching: SWR with date range as cache key for automatic revalidation
- Report generation: Server-side CSV/JSON serialization, returned as downloadable blob
- Glow effects via Tailwind box-shadow utilities and custom CSS variables

## Agent Notes

This is the most visually demanding task — requires executing a specific design language (synthwave) across all components. The chart rendering without libraries adds significant complexity. Expect 8-9 implementation steps with database, API, auth, multiple dashboard pages, and custom chart components.

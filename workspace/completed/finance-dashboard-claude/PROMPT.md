---
title: Finance Dashboard (Claude)
slug: finance-dashboard-claude
status: complete
priority: P2
complexity: medium
created: "2026-03-31"
tags:
  - react
  - typescript
  - dashboard
  - vendor-comparison
worker_vendor: claude
output_path: /Users/jackjin/dev/ai-sandbox/projects/react/2026-03-31/finance-dashboard-claude
branch: null
---

## Problem

Build a polished personal finance dashboard as a single-page React app. This is part of a 4-way vendor comparison — the same project built by Claude, Codex, Kimi CLI, and Kimi Wire to evaluate output quality.

**What success looks like:**
- A visually impressive, production-quality finance dashboard
- Responsive layout that looks great on desktop and mobile
- Clean component architecture with TypeScript strict mode
- Builds and runs without errors

## Project Context

### Language/Stack

- **Language**: TypeScript
- **Framework**: React (Vite)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Build system**: npm

### Existing Project?

- [x] **New project** - Building from scratch

## Definition of Done

**Build**:
- [ ] Project builds without errors (`npm run build`)
- [ ] Dev server starts (`npm run dev`)
- [ ] No TypeScript errors in strict mode

**Functionality**:
- [ ] Header with user greeting and current date
- [ ] Summary cards row: income, expenses, savings, net worth — with icons and color coding
- [ ] Line chart showing monthly income vs expenses trends (6-12 months of mock data)
- [ ] Donut/pie chart showing expense categories breakdown
- [ ] Recent transactions table — sortable by date/amount, filterable by category
- [ ] Budget progress bars per category with color-coded thresholds (green/yellow/red)
- [ ] Dark/light mode toggle that persists in localStorage
- [ ] Responsive design — clean layout on mobile, tablet, and desktop

**Visual Quality**:
- [ ] Consistent color palette and typography
- [ ] Smooth transitions and hover effects
- [ ] Proper spacing, alignment, and visual hierarchy
- [ ] Cards with subtle shadows and rounded corners
- [ ] Icons for categories and navigation

**Code Quality**:
- [ ] TypeScript strict mode, no errors
- [ ] Clean component structure (separate components per section)
- [ ] Mock data in a dedicated file/module
- [ ] Git committed with clean status

## Approach

- Scaffold with Vite + React + TypeScript
- Install Tailwind CSS for styling and Recharts for data visualization
- Create mock data module with realistic finance data (accounts, transactions, budgets)
- Build component hierarchy:
  - `App` → `Header`, `SummaryCards`, `Charts`, `TransactionsTable`, `BudgetProgress`
  - `Charts` → `TrendChart` (line), `CategoryChart` (donut)
- Use React context or useState for theme toggle
- All data is mock — no backend, no API calls

## Constraints

### What the Agent CAN Do

- Write/modify source code files
- Run build and test commands
- Create new files and directories
- Install dependencies

### What the Agent CANNOT Do

- Push to remote repository
- Deploy to production

## Agent Notes

<!-- Accumulated by agent during execution -->

---
title: "B2B Postal Checkout Flow"
slug: "b2b-postal-checkout"
priority: P2
status: pending
complexity: high
created: "2026-04-05"
tags: [nextjs, supabase, b2b, shipping, fullstack, kimi-test]
execution_pattern: plan-then-execute
max_turns: 500
worker_vendor: kimi
output_path:
branch:
source_project:
---

## Problem

Build a complete B2B postal/shipping checkout flow -- a multi-step web application where business customers can create shipments, get quotes from multiple carriers, select B2B payment methods (PO, BOL, Net Terms, etc.), schedule driver pickups, and receive confirmation with tracking. This is a professional logistics portal, not a consumer shipping tool.

This is a comprehensive test of Kimi K2.5's ability to build a real fullstack application with Supabase persistence, complex business logic, and a multi-step UI flow.

**What success looks like:**
- Complete 6-step shipping flow: Shipment Details -> Pricing -> Payment -> Pickup -> Review -> Confirmation
- Supabase backend with proper schema, RLS, and API routes
- All 5 B2B payment methods functional (PO, BOL, Third-Party, Net Terms, Corporate)
- Pickup scheduling with calendar, time slots, and location management
- Pricing engine with multi-carrier quotes and fee breakdowns
- Responsive, accessible UI with shadcn/ui components
- Each step independently buildable and testable

## Project Context

### Language/Stack

- **Language**: TypeScript (strict mode)
- **Framework**: Next.js 15 with App Router
- **UI**: Tailwind CSS v4 + shadcn/ui + Radix UI
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Forms**: React Hook Form + Zod validation
- **Build system**: npm
- **Testing**: Playwright (E2E)

### Existing Project?

- [x] **New project** - Building from scratch
- [ ] **Existing project** - Enhancing/modifying

This is a fresh build targeting Supabase as the persistence layer. A previous localStorage-only implementation exists as reference (see `./references/`).

## References & Inputs

### Requirements

The requirements are split across multiple focused documents:

- **Overview & User Journey**: `./requirements/01-overview.md`
- **Data Models & Schema**: `./requirements/02-data-models.md`
- **API Endpoints**: `./requirements/03-api-endpoints.md`
- **Business Logic**: `./requirements/04-business-logic.md`
- **UI Components**: `./requirements/05-components.md`
- **Design System**: `./requirements/06-design-system.md`
- **Pickup & Scheduling**: `./requirements/07-pickup-scheduling.md`
- **Payment Methods**: `./requirements/08-payment-methods.md`
- **Validation Rules**: `./requirements/09-validation-rules.md`

### Reference Code

- **Architecture notes**: `./references/architecture.md`
- **Tech stack decisions**: `./references/tech-stack.md`

## Definition of Done

**Build**:
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm run typecheck` passes (TypeScript strict mode)
- [ ] No console errors in browser

**Database**:
- [ ] Supabase schema deployed (all tables, relationships, RLS policies)
- [ ] Seed data loads successfully
- [ ] CRUD operations work for all entities

**Functionality (per step)**:
- [ ] Step 1: Shipment details form with address inputs, package config, special handling
- [ ] Step 2: Multi-carrier pricing grid with fee breakdowns, service comparison
- [ ] Step 3: All 5 payment methods render and validate (PO, BOL, Third-Party, Net Terms, Corporate)
- [ ] Step 4: Pickup calendar with time slots, location type, access requirements
- [ ] Step 5: Review page with all sections, edit capability, terms acknowledgment
- [ ] Step 6: Confirmation page with tracking number, QR code, next steps

**Tests**:
- [ ] Each step has at least one Playwright E2E test
- [ ] Form validation tested (required fields, format validation)
- [ ] Navigation between steps works (forward and back)
- [ ] Data persists across steps via Supabase

**Code Quality**:
- [ ] Git committed with clean status
- [ ] No hardcoded secrets
- [ ] Responsive on mobile and desktop

## Approach

Build incrementally, one step at a time. Each step should produce a working, testable artifact before moving to the next.

**Step 1**: Project scaffold + Supabase schema + Step 1 (Shipment Details)
**Step 2**: Pricing engine + Step 2 (Pricing & Selection)
**Step 3**: Payment forms + Step 3 (Payment & Billing)
**Step 4**: Scheduling logic + Step 4 (Pickup Scheduling)
**Step 5**: Review page + Step 5 (Review & Confirmation)
**Step 6**: Confirmation flow + Step 6 (Confirmation) + E2E tests

## Constraints

### What the Agent CAN Do

- Write/modify source code files
- Run build and test commands
- Create new files and directories
- Install dependencies via npm
- Read all reference and requirements documentation
- Run Supabase CLI commands (if available)

### What the Agent CANNOT Do

- Push to remote repository
- Deploy to production
- Create Supabase projects (must use existing or local)
- Access external carrier APIs (use mock data)
- Delete important files without confirmation

## Open Questions

- Should we use Supabase local (via Docker) or a hosted project?
- Do we need real-time subscriptions for any features in v1?
- Should auth be included in v1 or deferred?

## Steps

<!-- Auto-generated by breakdown system based on complexity: high -->

## Agent Notes

<!-- Accumulated by agent during execution -->

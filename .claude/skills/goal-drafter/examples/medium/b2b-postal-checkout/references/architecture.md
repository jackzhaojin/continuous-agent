# Architecture Reference

## Application Architecture

```
Next.js 15 App Router
├── /app
│   ├── /shipping              (Step 1: Shipment Details)
│   ├── /shipping/pricing      (Step 2: Pricing & Selection)
│   ├── /shipping/payment      (Step 3: Payment & Billing)
│   ├── /shipping/pickup       (Step 4: Pickup Scheduling)
│   ├── /shipping/review       (Step 5: Review)
│   ├── /shipping/confirmation (Step 6: Confirmation)
│   └── /api
│       ├── /health
│       ├── /form-config
│       ├── /quote
│       ├── /quote/select
│       ├── /pickup-availability
│       ├── /address-search
│       ├── /shipments          (CRUD)
│       ├── /shipments/[id]
│       ├── /shipments/[id]/submit
│       ├── /shipments/[id]/packages
│       ├── /shipments/[id]/payment
│       └── /shipments/[id]/pickup
├── /components
│   ├── /ui          (shadcn/ui primitives)
│   ├── /layout      (ShippingLayout, Header, StepIndicator, Nav, Footer)
│   ├── /forms       (AddressInput, PackageTypeSelector, etc.)
│   ├── /pricing     (PricingGrid, PricingCard, PriceBreakdown)
│   ├── /pickup      (PickupCalendar, TimeSlotSelector, etc.)
│   ├── /payment     (PaymentMethodSelector, method-specific forms)
│   ├── /review      (ReviewSection, TermsAndConditions)
│   └── /confirmation (SuccessBanner, ConfirmationSection)
├── /hooks           (useShipment, usePayment, usePickup, etc.)
├── /lib
│   ├── /supabase    (client, server, types)
│   ├── /pricing     (pricing engine, carrier definitions)
│   ├── /validation  (Zod schemas)
│   └── /utils       (formatting, date calculations)
└── /types           (TypeScript interfaces)
```

## Data Flow

```
User fills form → React Hook Form state → Zod validation → Supabase upsert → Navigate next step
                                                                ↑
User navigates back → Load from Supabase → Populate form ──────┘
```

Each step operates independently:
1. Load shipment data from Supabase by ID
2. Populate form with existing data (if resuming)
3. User fills/edits form
4. On "Next": validate → save to Supabase → advance step → navigate

## Supabase Integration Pattern

### Client Setup

```typescript
// lib/supabase/client.ts -- Browser client
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// lib/supabase/server.ts -- Server client (API routes)
import { createServerClient } from '@supabase/ssr'
```

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321  (or hosted URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  (server-side only)
```

### Data Access Pattern

API routes use Supabase server client. No direct Supabase calls from client components -- all data flows through Next.js API routes for consistency.

```
Client Component → fetch('/api/shipments/123') → API Route → Supabase → Response
```

## State Management

- **Server State**: Supabase (source of truth for shipment data)
- **Form State**: React Hook Form (local to each step)
- **URL State**: Shipment ID in URL params (`/shipping?id=xxx` or via cookie/session)
- **No global client state store needed** (no Redux, Zustand, etc.)

## Key Design Decisions

1. **API routes over direct Supabase calls** -- All Supabase operations go through `/api` routes. This centralizes validation, keeps service role key server-side, and makes it easy to swap backends later.

2. **One shipment record, many related tables** -- Rather than a single massive JSONB column, data is normalized into proper tables (packages, quotes, payment, pickup). This enables proper indexing, constraints, and future reporting.

3. **Step-by-step persistence** -- Each step saves independently. Users can close the browser and resume. No "lost cart" scenario.

4. **Mock carriers/pricing** -- All carrier data and pricing calculations are deterministic mocks. The pricing engine uses real formulas but with seed data. Easy to swap for real carrier APIs later.

5. **No auth in v1** -- Shipments are identified by UUID only. Authentication is deferred to v2 to keep v1 scope manageable.

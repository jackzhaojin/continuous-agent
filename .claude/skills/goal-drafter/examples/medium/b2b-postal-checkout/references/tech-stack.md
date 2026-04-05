# Tech Stack Reference

## Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 15.x | React framework with App Router |
| `react` | 19.x | UI library |
| `typescript` | 5.x | Type safety (strict mode) |
| `tailwindcss` | 4.x | Utility-first CSS |
| `@supabase/supabase-js` | 2.x | Supabase client |
| `@supabase/ssr` | latest | Server-side Supabase helpers |

## UI Components

| Package | Purpose |
|---------|---------|
| `shadcn/ui` | Component library (copy-paste, not npm) |
| `@radix-ui/*` | Accessible component primitives |
| `lucide-react` | Icon library |
| `tailwind-merge` | Merge Tailwind classes without conflicts |
| `class-variance-authority` | Component variant management |
| `clsx` | Conditional class names |

## Forms & Validation

| Package | Purpose |
|---------|---------|
| `react-hook-form` | Form state management |
| `@hookform/resolvers` | Zod integration for react-hook-form |
| `zod` | Schema validation |

## Development

| Package | Purpose |
|---------|---------|
| `@playwright/test` | E2E testing |
| `prettier` | Code formatting |
| `eslint` | Linting |

## shadcn/ui Components to Install

Run during project setup:

```bash
npx shadcn@latest init
npx shadcn@latest add button card input label select textarea checkbox radio-group tabs dialog popover separator progress scroll-area toast accordion
```

## Project Initialization

```bash
npx create-next-app@latest b2b-postal-checkout \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd b2b-postal-checkout

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Forms
npm install react-hook-form @hookform/resolvers zod

# UI
npm install lucide-react class-variance-authority clsx tailwind-merge

# Testing
npm install -D @playwright/test
npx playwright install

# shadcn/ui setup
npx shadcn@latest init
```

## Supabase Setup

### Option A: Local (recommended for development)

```bash
npx supabase init
npx supabase start
# Local URL: http://localhost:54321
# Anon key and service role key printed to console
```

### Option B: Hosted

1. Create project at supabase.com
2. Copy URL and anon key to `.env.local`

### Schema Migration

```bash
# Create migration
npx supabase migration new create_shipping_tables

# Apply migration
npx supabase db push

# Seed data
npx supabase db seed
```

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## File Organization Convention

```
src/
  app/           -- Pages and API routes (Next.js App Router)
  components/    -- React components (organized by feature)
  hooks/         -- Custom React hooks
  lib/           -- Business logic, utilities, Supabase clients
  types/         -- TypeScript interfaces and types
```

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

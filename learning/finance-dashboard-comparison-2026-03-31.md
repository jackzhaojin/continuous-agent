# Finance Dashboard: 4-Way AI Code Generator Comparison

**Date:** April 1, 2026  
**Prompt:** Build a personal finance dashboard in React  
**Tools Compared:** Claude, OpenAI Codex, Kimi CLI, Kimi Wire  
**Stack:** Vite + React 19 + TypeScript + Tailwind CSS + Recharts

---

## Quick Summary

| Metric | Claude | Codex | Kimi CLI | Kimi Wire |
|---|---|---|---|---|
| **Source Files** | 14 | 17 | 15 | 16 |
| **Lines of Code** | 575 | 1,233 | 1,079 | 1,116 |
| **Components** | 9 (.tsx) | 9 (.tsx) | 8 (.tsx) | 9 (.tsx) |
| **Bundle Size (JS)** | 561 KB | 571 KB | 575 KB | 1.1 MB |
| **Bundle Size (CSS)** | 17 KB | 28 KB | 25 KB | 15 KB |
| **Total Dist** | 608 KB | 804 KB | 628 KB | 1.2 MB |
| **TypeScript Errors** | 0 | 0 | 0 | 0 |
| **Build Errors** | 0 | 0 | 0 | 0 |
| **Console Errors** | 0 | 0 | 0 | 0 |
| **Dark Mode Works** | No (broken) | Yes (excellent) | No (broken) | Yes (works) |
| **Tests Written** | None | None | None | None |

---

## Visual Comparison

### Light Mode

All four dashboards render successfully and share a similar layout structure: KPI summary cards at top, charts in the middle, and transactions + budget at the bottom.

| Project | Design Quality | Notes |
|---|---|---|
| **Claude** | Clean, minimal | White background, colored text for amounts, simple card borders. Pie chart visible. Functional but vanilla. |
| **Codex** | Premium, branded | "Northstar Finance" branding, custom fonts (Manrope + Space Grotesk), gradient backgrounds, colored KPI cards with contextual insights ("Up from February payroll..."), radial gradient overlays. Most visually distinctive. |
| **Kimi CLI** | Polished, modern | User profile in header with "Premium Member" badge, notification bell with dot indicator, emoji icons in category badges, footer. Most feature-rich header. |
| **Kimi Wire** | Clean, functional | Similar to Claude's approach but with warning triangles on budget items, category icons in transactions. Nearly identical type definitions to Kimi CLI (suggesting shared scaffolding). |

### Dark Mode

| Project | Status | Implementation |
|---|---|---|
| **Claude** | **Broken** | Uses ThemeContext + `dark:` Tailwind classes + `classList.add('dark')`. Icon toggles but dark styles don't apply — likely Tailwind v4 dark mode config issue (uses `@tailwindcss/postcss` plugin which handles dark mode differently). |
| **Codex** | **Excellent** | Uses CSS custom properties (`--bg`, `--text-primary`, etc.) via `data-theme` attribute + `@custom-variant dark`. Fully working, beautiful dark theme with custom colors for both modes. Respects `prefers-color-scheme`. |
| **Kimi CLI** | **Broken** | Same issue as Claude — uses `dark:` Tailwind classes but dark class never applies to DOM. Hook exists but classList never toggled. |
| **Kimi Wire** | **Works** | Uses ThemeContext + `classList.add('dark')`, same approach as Claude, but actually works. Proper dark backgrounds and text colors. |

---

## Architecture & Code Quality

### 1. Claude (575 LOC)

**Structure:**
```
src/
├── App.tsx
├── main.tsx
├── index.css
├── context/ThemeContext.tsx
├── components/ (6 components)
└── data/mockData.ts
```

**Strengths:**
- Most concise codebase (575 lines) — does the job with minimal code
- Clean component separation
- ThemeContext pattern with proper `useContext` error boundary
- Semantic HTML (`<main>`, `<section>`, `<banner>`)
- Good accessibility: proper `<table>` structure with `<th>`, sortable columns

**Weaknesses:**
- Types defined inline in `mockData.ts` rather than in a separate types file — mixes concerns
- No dedicated types directory or file
- Dark mode broken (Tailwind v4 + `tailwind.config.js` using v3 format — config mismatch)
- No search functionality on transactions
- No custom formatting utilities — `Intl.NumberFormat` created on every render in `SummaryCard` instead of hoisted to module scope
- Uses Dec 2024 dates for mock data (stale-looking)
- Unused `isPositive` prop defined in `SummaryCards.tsx` interface but never destructured — dead code
- Repeated card wrapper class string (`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6`) in 5 components — should be a shared `Card` component
- Duplicated Recharts tooltip `contentStyle` in `TrendChart.tsx` and `CategoryChart.tsx`
- Unused `primary` color palette in `tailwind.config.js` — no component uses `primary-*` classes
- No try/catch around `localStorage.getItem` in ThemeContext — can throw in private browsing
- `dist/` directory committed to git
- Sortable `<th>` headers lack `role="button"`, `tabIndex`, `onKeyDown` — not keyboard accessible
- Category filter `<select>` has no associated `<label>`

**Code Pattern (data/types inline):**
```typescript
// mockData.ts — types and data mixed together
export interface Transaction { ... }
export const transactions: Transaction[] = [ ... ]
```

---

### 2. Codex (1,233 LOC)

**Structure:**
```
src/
├── App.tsx
├── main.tsx
├── index.css
├── hooks/useTheme.ts
├── lib/format.ts
├── types/finance.ts
├── components/ (7 components including DashboardCard)
└── data/financeData.ts
```

**Strengths:**
- **Best architecture**: Clean separation — `types/`, `hooks/`, `lib/`, `data/` directories
- **`lib/format.ts`**: Reusable formatters using `Intl.NumberFormat` and `Intl.DateTimeFormat` — professional pattern
- **`DashboardCard.tsx`**: Reusable card wrapper component with `eyebrow`, `action`, `className` props — reduces duplication
- **Type system**: Most sophisticated types — `TransactionCategory` as union type, `SummaryMetricId`, `Exclude<>` utility type for `BudgetItem`
- **Dark mode**: CSS custom properties approach is more maintainable than Tailwind `dark:` classes; respects system preference
- **Custom fonts**: Typography choices (Manrope + Space Grotesk) give it a real product feel
- **Contextual insights**: KPI cards include text like "Spending cooled despite a few discretionary purchases" — shows higher-level product thinking
- **Radial gradient overlays** in background — attention to visual polish
- **SSR-safe**: `typeof window === 'undefined'` check in useTheme

**Weaknesses:**
- Most verbose (1,233 lines) — 2.1x Claude's code
- Custom font files add ~150KB to bundle (10 font files in dist)
- No search on transactions (only category filter + sort)
- **No `useMemo` or `useCallback` anywhere** — `TransactionsTable` re-filters/re-sorts on every render
- Semi-colons consistently omitted (no-semicolon style, which is valid but differs from conventional)
- Hardcoded strings in Header: "Good evening" regardless of time, insight text not derived from data
- Hardcoded values in TrendChart: `"$7.1K"` and `"14.8 mo"` should be computed from actual data
- Duplicated tooltip formatter pattern in `TrendChart.tsx` and `CategoryChart.tsx`
- `dist/` committed to git
- `new Date(transaction.date)` has no validation — invalid date produces `NaN` silently

**Code Pattern (reusable card):**
```typescript
// DashboardCard.tsx — reduces boilerplate across sections
export function DashboardCard({ title, eyebrow, action, children, className }: DashboardCardProps) {
  return (
    <section className="surface-card rounded-[28px] p-5 ...">
      <header> {eyebrow && <p>{eyebrow}</p>} <h2>{title}</h2> </header>
      {children}
    </section>
  )
}
```

**Code Pattern (Intl formatting):**
```typescript
// lib/format.ts — proper i18n-ready formatting
export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
})
export const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
})
```

---

### 3. Kimi CLI (1,079 LOC)

**Structure:**
```
src/
├── App.tsx
├── main.tsx
├── index.css
├── types/index.ts
├── data/mockData.ts
├── components/ (6 components)
└── components/hooks/useTheme.ts
```

**Strengths:**
- Separate `types/index.ts` file — good separation
- Rich header with user profile ("John Doe, Premium Member"), notification bell
- Emoji icons in transaction category badges (e.g., "Food" with fork icon)
- Search input + category filter on transactions — most interactive table
- Budget progress with warning triangle indicators for high-spend categories
- Area chart (filled) instead of line chart — visually richer
- Footer included
- Transaction count displayed ("15 transactions found")

**Weaknesses:**
- Dark mode broken (same issue as Claude — `dark:` classes but no `classList` toggle)
- Hook placed in `components/hooks/` instead of top-level `hooks/` — unconventional directory structure
- Types are generic (category is `string` instead of a union type)
- **`formatCurrency` duplicated 5 times** across 5 different files with slightly different signatures — the worst DRY violation in any of the 4 projects. Should be extracted to `src/utils/format.ts`
- `formatPercent` also duplicated between `SummaryCards.tsx` and `CategoryChart.tsx`
- Global `*` CSS transition rule in `index.css` applies transitions to every DOM element — performance concern
- Unused scaffold assets: `react.svg`, `vite.svg`, `hero.png` are not referenced
- No try/catch around `localStorage.getItem` in useTheme
- Sortable `<th>` headers not keyboard accessible (no `tabIndex`, `onKeyDown`)
- Search input and category filter have no `<label>` elements
- `dist/` committed to git
- Nearly identical type definitions to Kimi Wire — likely shared template/scaffold

**Code Pattern (hook in wrong dir):**
```
src/components/hooks/useTheme.ts  ← unusual, should be src/hooks/
```

---

### 4. Kimi Wire (1,116 LOC)

**Structure:**
```
src/
├── App.tsx
├── App.css          ← extra unused CSS file
├── main.tsx
├── index.css
├── types/index.ts
├── context/ThemeContext.tsx
├── data/mockData.ts
└── components/ (6 components)
```

**Strengths:**
- Dark mode works correctly
- ThemeContext pattern (same as Claude)
- Separate types file
- Budget overview with clear over-budget indicators ("$80 over budget", "120% used")
- Warning/error icons distinguish budget status levels
- Footer included
- Category icons in transaction table

**Weaknesses:**
- **Largest bundle**: 1.1 MB JS (nearly 2x others) — caused partly by `import * as Icons from 'lucide-react'` which defeats tree-shaking and bundles the entire icon library
- `recharts` and `lucide-react` in `devDependencies` instead of `dependencies` — semantically wrong, would break in CI environments that prune devDeps
- Extra `App.css` file (184 lines of Vite scaffold boilerplate) — entirely unused
- Unused CSS custom properties in `index.css` — defines a full design token system (lines 8-51) that no component references
- Tailwind v3 (`tailwindcss: ^3.4.19`) while all others use Tailwind v4 — older version
- `postcss` + `autoprefixer` in devDeps suggest manual PostCSS config
- `formatCurrency` duplicated 4 times across different files (same DRY issue as Kimi CLI)
- Repeated card container class string verbatim in 4 components
- Global `*` transition rule same as Kimi CLI — performance concern
- Recharts tooltip `contentStyle` hardcoded for light mode — looks wrong in dark mode
- Unused scaffold assets: `react.svg`, `vite.svg`, `hero.png`
- `dist/` committed to git
- "All Categori" text truncated in the category filter button (visible UI bug)
- Types nearly identical to Kimi CLI (shared scaffold evident)

**Notable Bug:**
The category filter dropdown button text reads "All Categori" — truncated, visible in the screenshot. A clear UI string bug.

---

## Deep-Dive: DRY Violations & Error Handling

### DRY Violations

| Issue | Claude | Codex | Kimi CLI | Kimi Wire |
|---|---|---|---|---|
| `formatCurrency` duplication | 1x (per render) | 0 (centralized in `lib/format.ts`) | **5x across 5 files** | **4x across 4 files** |
| Card wrapper class duplication | 5 components | 0 (uses `DashboardCard`) | N/A | 4 components |
| Tooltip contentStyle duplication | 2 charts | 2 charts | 2 charts | 2 charts |
| `formatPercent` duplication | N/A | 0 (centralized) | 2 files | N/A |

Codex is the clear winner here — it extracted formatting utilities to `lib/format.ts` and created `DashboardCard` as a reusable wrapper. Both Kimi projects have the worst DRY violations with `formatCurrency` copy-pasted across nearly every component file.

### Error Handling

All four projects have **effectively no error handling**:
- No React Error Boundaries
- No try/catch around `localStorage` access (which throws in Safari private browsing)
- No loading/empty states for data
- `document.getElementById('root')!` non-null assertions in `main.tsx`
- No validation on `new Date()` parsing in transaction tables

This is consistent across all AI generators — none prioritized resilience.

---

## Feature Comparison

| Feature | Claude | Codex | Kimi CLI | Kimi Wire |
|---|---|---|---|---|
| KPI Summary Cards | 4 cards | 4 cards (with insights) | 4 cards (with icons) | 4 cards (with icons) |
| Trend Chart | Line chart (6mo) | Line chart (12mo) | Area chart (12mo) | Line chart (12mo) |
| Expense Breakdown | Pie chart | Donut chart + legend | Donut chart + % | Donut chart + legend |
| Transaction Table | Sort + filter | Sort + filter | Sort + search + filter | Sort + search + filter |
| Budget Progress | Progress bars | Progress bars + notes | Progress bars + warnings | Progress bars + warnings |
| Dark Mode Toggle | Yes (broken) | Yes (working) | Yes (broken) | Yes (working) |
| Header/Branding | Welcome greeting | "Northstar Finance" brand | Profile + notifications | Welcome greeting |
| Footer | No | No | Yes | Yes |
| Custom Fonts | No | Yes (Manrope + Space Grotesk) | No | No |
| Search Transactions | No | No | Yes | Yes |
| Responsive Design | Grid breakpoints | Grid breakpoints | Grid breakpoints | Grid breakpoints |
| System Theme Detect | No | Yes | No | No |

---

## Dependency Choices

| Dependency | Claude | Codex | Kimi CLI | Kimi Wire |
|---|---|---|---|---|
| react | 19.2.4 | 19.2.4 | 19.2.4 | 19.2.4 |
| recharts | 3.8.1 (dep) | 3.8.1 (dep) | 3.8.1 (dep) | 3.8.1 (devDep!) |
| lucide-react | 1.7.0 (dep) | 1.7.0 (dep) | 1.7.0 (dep) | 1.7.0 (devDep!) |
| tailwindcss | 4.2.2 | 4.2.2 | 4.2.2 | **3.4.19** |
| @fontsource/* | No | Yes (Manrope, Space Grotesk) | No | No |
| Tailwind plugin | @tailwindcss/postcss | @tailwindcss/vite | @tailwindcss/vite | manual postcss |

**Note:** Kimi Wire incorrectly places `recharts` and `lucide-react` in `devDependencies`. While Vite still bundles them, this would break in a production `npm install --production` scenario and is semantically incorrect.

---

## Scoring

### Code Quality (out of 10)

| Criterion | Claude | Codex | Kimi CLI | Kimi Wire |
|---|---|---|---|---|
| TypeScript strictness | 7 | 9 | 7 | 7 |
| Type safety | 6 (inline types) | 9 (union types, Exclude<>) | 7 (separate file) | 7 (separate file) |
| Component architecture | 8 | 9 | 7 | 7 |
| Code organization | 7 | 9 | 7 | 6 |
| Reusability | 6 | 9 (DashboardCard, formatters) | 6 | 6 |
| Styling approach | 7 | 9 (CSS vars + Tailwind) | 7 | 6 (Tailwind v3) |
| Accessibility | 8 (semantic HTML) | 8 (aria-labels) | 7 | 7 |
| **Subtotal** | **49/70** | **62/70** | **48/70** | **46/70** |

### Functionality (out of 10)

| Criterion | Claude | Codex | Kimi CLI | Kimi Wire |
|---|---|---|---|---|
| Dark mode | 3 (broken) | 10 | 3 (broken) | 8 |
| Interactivity | 7 (sort + filter) | 8 (sort + filter + theme) | 9 (sort + search + filter) | 8 (sort + search + filter) |
| Visual polish | 6 | 10 | 8 | 7 |
| Data richness | 6 (6mo, 15 txns) | 9 (12mo, insights, status) | 8 (12mo, 15 txns, emojis) | 8 (12mo, 20 txns, icons) |
| Bundle efficiency | 9 (608KB) | 7 (804KB, fonts) | 8 (628KB) | 4 (1.2MB) |
| Bug-free | 8 | 9 | 8 | 6 ("All Categori" bug) |
| **Subtotal** | **39/60** | **53/60** | **44/60** | **41/60** |

### Overall Scores

| Project | Code Quality | Functionality | **Total** | **Rank** |
|---|---|---|---|---|
| **Codex** | 62/70 | 53/60 | **115/130** | **1st** |
| **Kimi CLI** | 48/70 | 44/60 | **92/130** | **2nd** |
| **Claude** | 49/70 | 39/60 | **88/130** | **3rd** |
| **Kimi Wire** | 46/70 | 41/60 | **87/130** | **4th** |

---

## Key Takeaways

### Codex Wins Overall
Codex produced the most production-ready code with the best architecture (separated types, hooks, lib, data), the most polished visual design (custom fonts, gradients, branded identity), a fully working dark mode using CSS custom properties, and reusable components (`DashboardCard`). The only downside is verbosity (2.1x Claude's LOC) and slightly larger bundle from custom fonts.

### Claude is Most Efficient
Claude delivered a working dashboard in just 575 lines — the most concise by far. Good separation of concerns and semantic HTML, but dark mode is broken and the types-in-data-file approach is a code smell. Best LOC-to-feature ratio.

### Kimi CLI & Wire Share DNA
The two Kimi projects have nearly identical type definitions and similar approaches, suggesting a shared scaffold. Kimi CLI has the richest interactive features (search, emojis, user profile), while Kimi Wire has a working dark mode but the largest bundle and a visible text truncation bug.

### Dark Mode is the Differentiator
Only Codex and Kimi Wire ship working dark modes. Codex's approach (CSS custom properties + `data-theme`) is architecturally superior to Tailwind's `dark:` class approach, as it provides more granular control and works reliably with Tailwind v4.

### Nobody Wrote Tests
None of the four tools generated any tests, which is notable for a project comparison. All four rely entirely on TypeScript for correctness guarantees.

---

## Category Rankings (Winner in Each)

| Category | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| **Overall** | Codex | Kimi CLI | Claude | Kimi Wire |
| **Code Architecture** | Codex | Claude | Kimi CLI | Kimi Wire |
| **TypeScript Quality** | Codex | Claude | Kimi CLI = Kimi Wire | — |
| **Visual Design** | Codex | Kimi CLI | Kimi Wire | Claude |
| **Dark Mode** | Codex | Kimi Wire | Claude = Kimi CLI (broken) | — |
| **Interactivity** | Kimi CLI | Kimi Wire | Codex | Claude |
| **Bundle Efficiency** | Claude (608K) | Kimi CLI (628K) | Codex (804K) | Kimi Wire (1.2M) |
| **Code Conciseness** | Claude (575 LOC) | Kimi CLI (1,079) | Kimi Wire (1,116) | Codex (1,233) |
| **DRY Compliance** | Codex | Claude | Kimi Wire | Kimi CLI |
| **Accessibility** | Claude = Codex | — | Kimi CLI = Kimi Wire | — |
| **Dependency Hygiene** | Codex | Claude = Kimi CLI | — | Kimi Wire |
| **Production Readiness** | Codex | Kimi Wire | Kimi CLI | Claude |

### What Each Tool Does Best
- **Codex**: Architecture, design system, reusability, polish — produces the most "senior engineer" output
- **Claude**: Efficiency and conciseness — delivers maximum value per line of code
- **Kimi CLI**: Feature richness and interactivity — most user-facing features (search, profile, notifications)
- **Kimi Wire**: Completeness — working dark mode, footer, budget warnings, but rough edges

---

*Analysis performed April 1, 2026. Tested with 4 parallel static analysis agents + Playwright MCP (headful browser) for visual/interactive testing + TypeScript compiler + Vite production builds.*

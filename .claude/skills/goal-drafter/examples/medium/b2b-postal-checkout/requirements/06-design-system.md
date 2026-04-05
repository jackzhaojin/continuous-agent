# B2B Postal Checkout Flow -- Design System

## Overview

Professional B2B aesthetic emphasizing trust, clarity, and efficiency. Mobile-first responsive design with WCAG 2.1 AA compliance throughout.

## Technology

- **Tailwind CSS v4** (with PostCSS)
- **shadcn/ui** component library (Radix UI primitives)
- **Lucide React** icons
- **Class Variance Authority** for component variants
- **tailwind-merge** for class deduplication

## Color Palette

### Primary (Blue-based -- trust/reliability)

| Token | Use |
|-------|-----|
| `primary-50` | Lightest background, hover states |
| `primary-100` | Light background fills |
| `primary-200` | Borders, light accents |
| `primary-500` | Default interactive elements |
| `primary-600` | Buttons, links |
| `primary-700` | Hover states on primary elements |
| `primary-900` | Darkest text on light backgrounds |

### Semantic Colors

| Category | Token | Use |
|----------|-------|-----|
| Success | `green-50` bg, `green-600` text | Completed steps, confirmations, available slots |
| Warning | `amber-50` bg, `amber-600` text | Fees, limits approaching, limited availability |
| Error | `red-50` bg, `red-600` text | Validation errors, required fields, unavailable |
| Info | `blue-50` bg, `blue-600` text | Help text, contextual info, tips |

### Neutral Grays

10-step scale from `gray-50` (lightest background) to `gray-950` (darkest text). Use `gray-100` for card backgrounds, `gray-200` for borders, `gray-500` for placeholder text, `gray-900` for body text.

## Typography

### Font Stack

- **Primary**: `Geist Sans` (clean, modern sans-serif)
- **Monospace**: `Geist Mono` (confirmation numbers, tracking codes, prices)
- **Fallback**: `system-ui, -apple-system, sans-serif`

### Type Scale

| Size | Pixel | Use |
|------|-------|-----|
| `text-xs` | 12px | Labels, badges, help text |
| `text-sm` | 14px | Secondary text, form labels |
| `text-base` | 16px | Body text, inputs |
| `text-lg` | 18px | Section headers |
| `text-xl` | 20px | Step titles |
| `text-2xl` | 24px | Page titles |
| `text-3xl` | 30px | Prices, confirmation numbers |

### Font Weights

- `font-normal` (400): Body text
- `font-medium` (500): Labels, navigation
- `font-semibold` (600): Section headers, buttons
- `font-bold` (700): Prices, totals, confirmation numbers

## Spacing & Layout

### Container

```
max-width: 1200px
padding: 1rem (mobile), 2rem (tablet), 3rem (desktop)
```

### Card Styling

- Background: `white` (light) / `gray-900` (dark)
- Border: `1px solid gray-200`
- Border radius: `rounded-xl` (12px) for cards, `rounded-lg` (8px) for inputs
- Shadow: `shadow-sm` default, `shadow-md` on hover/selected
- Padding: `p-4` (mobile), `p-6` (desktop)

### Bento Grid System

Responsive asymmetric grids:
- Mobile: 1 column
- Tablet (768px+): 2 columns
- Desktop (1024px+): 3 columns
- Gap: `gap-4` (16px)

## Component Styling

### Buttons

| Variant | Style | Use |
|---------|-------|-----|
| Primary | Blue bg, white text, `rounded-lg` | Main actions (Next, Submit) |
| Secondary | White bg, gray border, dark text | Back, Cancel, Edit |
| Ghost | Transparent, text only | Tertiary actions |
| Destructive | Red bg, white text | Start Over, Clear |

Size: `h-10 px-4` default, `h-12 px-6` for primary CTAs.
Min touch target: 44px on mobile.

### Form Inputs

```css
height: 40px (44px mobile)
padding: 0 12px
border: 1px solid gray-300
border-radius: 8px (rounded-lg)
font-size: 16px (prevents iOS zoom)

/* Focus */
border-color: primary-500
ring: 2px primary-500/20

/* Error */
border-color: red-500
ring: 2px red-500/20

/* Disabled */
background: gray-100
opacity: 0.6
cursor: not-allowed
```

### Select Dropdowns

shadcn/ui `Select` component with Radix primitives. Same sizing as inputs. Custom trigger with chevron icon.

### Checkboxes & Radio

shadcn/ui primitives. 20px box size (expanded to 44px touch target via padding). Custom checked styling with primary color.

### Cards (Selectable)

Used for package types, pricing options, payment methods:

```css
/* Default */
border: 1px solid gray-200
background: white
cursor: pointer

/* Hover */
border-color: primary-200
shadow: shadow-md

/* Selected */
border-color: primary-500
border-width: 2px
background: primary-50
shadow: shadow-md
```

### Status Indicators

| Status | Style |
|--------|-------|
| Available | Green dot + "Available" text |
| Limited | Yellow dot + "Limited" text |
| Unavailable | Gray dot + "Unavailable" text, disabled |
| Selected | Blue checkmark + "Selected" text |
| Complete | Green checkmark + "Complete" text |

### Fee Badges

Inline badges showing fees:
```
+$15  -> bg-amber-100, text-amber-700, rounded-full, text-xs, px-2, py-0.5
Free  -> bg-green-100, text-green-700
```

## Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Mobile | < 768px | Single column, compact step indicator, sticky nav, stacked cards |
| Tablet | 768-1023px | 2-column forms, side-by-side pricing cards |
| Desktop | 1024px+ | 3-column pricing grid, sidebar summaries, full step indicator |

### Mobile-Specific

- Sticky bottom navigation bar
- Compact step indicator (number + label only)
- Full-width cards (no side-by-side)
- Collapsible sections default closed
- Sheet/drawer for filters and help
- 16px minimum font (prevent iOS zoom)
- 44px minimum touch targets

## Accessibility

### WCAG 2.1 AA Requirements

- Color contrast: 4.5:1 for text, 3:1 for large text and UI components
- Keyboard navigation: all interactive elements focusable, logical tab order
- Screen reader: proper ARIA labels, live regions for dynamic content
- Focus indicators: visible focus ring on all interactive elements
- Error identification: errors described in text (not color alone)
- Form labels: every input has associated label

### Keyboard Navigation

- Tab through form fields in logical order
- Enter to submit forms / select options
- Escape to close modals/drawers
- Arrow keys for radio groups and select dropdowns
- Space to toggle checkboxes

## Animation

Keep minimal for professional B2B feel:

- Page transitions: none (instant navigation)
- Form feedback: subtle border color transitions (150ms)
- Card hover: smooth shadow transition (200ms)
- Success checkmark: simple scale-in animation (300ms)
- Loading spinner: continuous rotation
- Skeleton loading: pulse animation for async content

## Dark Mode

Not required for v1. Design with light mode only. Use CSS custom properties for easy future dark mode addition.

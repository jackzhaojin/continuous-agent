# Header & Footer Components

## Overview

Dedicated header and footer components that integrate with the navigation management system. These are typically used in page templates as locked regions to ensure consistent site-wide branding.

---

## Header Component

### Component Definition

| Field | Value |
|-------|-------|
| type | `header` |
| label | Site Header |
| icon | `PanelTop` |
| description | Site header with logo, navigation, and optional CTA |

### Props Schema

```typescript
interface HeaderProps {
  variant: 'default' | 'centered' | 'transparent' | 'minimal';
  showLogo: boolean;
  showNavigation: boolean;      // Pull from site's header menu
  showCta: boolean;
  ctaText?: string;
  ctaLink?: string;
  ctaVariant?: 'primary' | 'secondary' | 'outline';
  sticky: boolean;              // Stick to top on scroll
  backgroundColor?: string;     // Override theme color
  textColor?: 'light' | 'dark' | 'auto';
}
```

### Default Props

```json
{
  "variant": "default",
  "showLogo": true,
  "showNavigation": true,
  "showCta": true,
  "ctaText": "Get Started",
  "ctaLink": "#",
  "ctaVariant": "primary",
  "sticky": true,
  "textColor": "auto"
}
```

### Variants

#### Default
- Logo on left, horizontal nav links in center, CTA button on right
- Full-width with max-width container
- Bottom border (1px, subtle gray)
- On scroll (if sticky): add shadow, slightly reduce padding

#### Centered
- Logo centered above navigation
- Nav links centered below logo
- CTA below nav or omitted
- Good for portfolio/creative sites

#### Transparent
- No background color (transparent over page content)
- Text color: white (for use over hero images)
- On scroll (if sticky): background fades in (white or theme color)
- Logo switches from white to colored version on scroll

#### Minimal
- Logo on left, hamburger menu icon on right (always — even on desktop)
- Clicking hamburger opens a full-screen overlay menu
- Ultra-clean look

### Mobile Behavior

All variants collapse to mobile layout at < 768px:
- Logo on left, hamburger icon on right
- Menu opens as a slide-in drawer from the right
- CTA button moves into the mobile menu
- Mobile menu has close button (X)
- Body scroll is locked when menu is open

### Navigation Integration

The header component reads the site's `header` menu:
```typescript
const menu = await getMenuBySiteAndLocation(siteId, 'header');
// Render menu.items as nav links
```

If no menu exists, show placeholder text in the editor: "No navigation menu configured. Go to Navigation settings to create one."

---

## Footer Component

### Component Definition

| Field | Value |
|-------|-------|
| type | `footer` |
| label | Site Footer |
| icon | `PanelBottom` |
| description | Site footer with navigation columns, social links, and copyright |

### Props Schema

```typescript
interface FooterProps {
  variant: 'columns' | 'simple' | 'centered';
  showNavigation: boolean;       // Pull from site's footer menu
  showSocialLinks: boolean;      // Pull from site settings
  showNewsletter: boolean;       // Email signup form
  newsletterHeading?: string;
  newsletterDescription?: string;
  copyrightText: string;
  bottomLinks?: { label: string; url: string }[];  // e.g., Privacy, Terms
  backgroundColor?: string;
  textColor?: 'light' | 'dark';
}
```

### Default Props

```json
{
  "variant": "columns",
  "showNavigation": true,
  "showSocialLinks": true,
  "showNewsletter": false,
  "copyrightText": "2026 PageForge. All rights reserved.",
  "bottomLinks": [
    {"label": "Privacy Policy", "url": "/privacy"},
    {"label": "Terms of Service", "url": "/terms"}
  ],
  "backgroundColor": "",
  "textColor": "light"
}
```

### Variants

#### Columns
```
┌─────────────────────────────────────────────────────────┐
│  [Logo]                                                 │
│                                                         │
│  Company        Resources       Legal       Newsletter  │
│  About          Blog            Privacy     [email   ]  │
│  Careers        Docs            Terms       [Subscribe] │
│  Press          Support         Cookies                 │
│                                                         │
│  [Twitter] [GitHub] [LinkedIn]                          │
│                                                         │
│  ───────────────────────────────────────────────────    │
│  © 2026 PageForge. All rights reserved.                 │
│  Privacy Policy · Terms of Service                      │
└─────────────────────────────────────────────────────────┘
```

- Navigation menu items rendered as columns (top-level = column heading, children = links)
- Social icons from site settings
- Optional newsletter signup
- Bottom bar with copyright and legal links

#### Simple
- Single row: copyright text on left, legal links on right
- Social icons above (centered)
- No navigation columns

#### Centered
- Everything centered vertically
- Logo → social icons → nav links (horizontal) → copyright
- Compact, modern look

### Newsletter Integration

If `showNewsletter: true`:
- Renders an email input + subscribe button
- Submits to `POST /api/newsletter/subscribe`
- Stores email in a simple `newsletter_subscribers` table:

```sql
CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, email)
);
```

### Social Links Integration

Reads from site settings `social_links`:
```typescript
const site = await getSiteById(siteId);
const socialLinks = site.social_links;
// Render icon links for each non-empty platform
```

Social icons use Lucide or simple SVG icons for each platform.

---

## Usage in Templates

Header and footer components are typically placed as **locked regions** in page templates:

```json
{
  "content": [
    {"id": "comp_header", "type": "header", "props": {"variant": "default", "sticky": true}},
    {"id": "comp_content_area", "type": "spacer", "props": {"height": "md"}},
    {"id": "comp_footer", "type": "footer", "props": {"variant": "columns"}}
  ],
  "locked_regions": ["comp_header", "comp_footer"]
}
```

Authors add components between the header and footer but cannot modify the header/footer themselves (unless admin).

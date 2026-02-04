# Headless CMS API

## Overview

PageForge exposes a read-only JSON API that allows external applications (mobile apps, static site generators, marketing tools) to fetch page content, media, and site data. This enables headless CMS usage alongside the visual editor.

## API Routes

All API routes are under `/api/v1/` and require an API key for authentication.

### Authentication

#### API Keys Table

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,         -- SHA-256 hash of the actual key
  key_prefix TEXT NOT NULL,       -- First 8 chars for identification (e.g., "pf_live_a1b2")
  permissions TEXT[] NOT NULL DEFAULT '{read}',  -- 'read', 'write' (future)
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_api_keys_site ON api_keys(site_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
```

#### Key Format

`pf_live_` + 32 random alphanumeric characters
Example: `pf_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

#### Authentication Flow

1. Client sends API key in `Authorization: Bearer pf_live_...` header
2. Server hashes the key with SHA-256 and looks up `key_hash` in `api_keys`
3. Check `is_active` and `expires_at`
4. Extract `site_id` from the matched key — all queries are scoped to this site
5. Update `last_used_at`

#### Rate Limiting

- 100 requests per minute per API key
- 1000 requests per hour per API key
- Return `429 Too Many Requests` with `Retry-After` header when exceeded

### Endpoints

#### GET /api/v1/pages

List all published pages for the site.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `slug` | string | Filter by page slug |
| `status` | string | Filter by status (default: `published`) |
| `limit` | number | Max results (default: 20, max: 100) |
| `offset` | number | Pagination offset |
| `fields` | string | Comma-separated field list (sparse fieldset) |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Home",
      "slug": "home",
      "status": "published",
      "seo": {
        "title": "Home | PageForge Demo",
        "description": "Welcome to PageForge...",
        "ogImage": "https://..."
      },
      "publishedAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

#### GET /api/v1/pages/:slug

Get a single page by slug with full content.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "title": "Home",
    "slug": "home",
    "status": "published",
    "content": [
      {
        "id": "comp_1",
        "type": "hero",
        "props": {
          "title": "Welcome to PageForge",
          "subtitle": "Build beautiful pages visually",
          "backgroundImage": "https://...",
          "ctaText": "Get Started",
          "ctaLink": "/about"
        }
      },
      {
        "id": "comp_2",
        "type": "text",
        "props": {
          "content": "<p>Rich text content...</p>"
        }
      }
    ],
    "seo": {
      "title": "Home | PageForge Demo",
      "description": "Welcome to PageForge...",
      "ogImage": "https://...",
      "canonicalUrl": null,
      "noIndex": false
    },
    "publishedAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-01-15T10:00:00Z",
    "version": 5
  }
}
```

#### GET /api/v1/pages/:slug/versions

List all versions of a page.

**Response:**
```json
{
  "data": [
    {
      "versionNumber": 5,
      "createdAt": "2026-01-15T10:00:00Z",
      "createdBy": "John Doe"
    },
    {
      "versionNumber": 4,
      "createdAt": "2026-01-14T15:30:00Z",
      "createdBy": "Jane Smith"
    }
  ]
}
```

#### GET /api/v1/media

List media assets.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `folder` | string | Filter by folder slug |
| `tag` | string | Filter by tag |
| `type` | string | Filter by mime type prefix (e.g., `image`, `video`) |
| `search` | string | Full-text search |
| `limit` | number | Max results (default: 20, max: 100) |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "filename": "hero-bg.jpg",
      "url": "https://...",
      "renditions": {
        "thumbnail": "https://...?width=200",
        "medium": "https://...?width=800",
        "large": "https://...?width=1600"
      },
      "mimeType": "image/jpeg",
      "size": 245000,
      "width": 1920,
      "height": 1080,
      "alt": "Hero background",
      "tags": ["banner", "hero"]
    }
  ],
  "pagination": {...}
}
```

#### GET /api/v1/menus/:location

Get navigation menu by location.

**Response:**
```json
{
  "data": {
    "name": "Header Menu",
    "location": "header",
    "items": [
      {"label": "Home", "url": "/", "children": []},
      {"label": "About", "url": "/about", "children": []},
      {"label": "Products", "url": "#", "children": [
        {"label": "Product A", "url": "/products/a"},
        {"label": "Product B", "url": "/products/b"}
      ]}
    ]
  }
}
```

#### GET /api/v1/fragments/:slug

Get a content fragment by slug.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "name": "Global CTA Banner",
    "slug": "global-cta",
    "content": [
      {"id": "frag_1", "type": "cta", "props": {...}}
    ],
    "updatedAt": "2026-01-15T10:00:00Z"
  }
}
```

#### GET /api/v1/site

Get site metadata and settings.

**Response:**
```json
{
  "data": {
    "name": "PageForge Demo",
    "slug": "demo",
    "description": "A demo site for PageForge CMS",
    "theme": {
      "primaryColor": "#3B82F6",
      "secondaryColor": "#10B981",
      "fontFamily": "Inter"
    },
    "socialLinks": {
      "twitter": "https://twitter.com/pageforge",
      "github": "https://github.com/pageforge"
    }
  }
}
```

## Webhooks

### Webhook Configuration

Admin can configure webhooks in site settings:

```sql
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,            -- Events to trigger on
  secret TEXT NOT NULL,              -- Signing secret for HMAC
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_response_code INT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Supported Events

| Event | Triggered When |
|-------|---------------|
| `page.published` | A page is published |
| `page.unpublished` | A page is archived/unpublished |
| `page.updated` | A published page's content is updated |
| `media.uploaded` | New media is uploaded |
| `media.deleted` | Media is deleted |
| `fragment.updated` | A content fragment is updated |

### Webhook Payload

```json
{
  "event": "page.published",
  "timestamp": "2026-01-15T10:00:00Z",
  "site": {
    "id": "uuid",
    "slug": "demo"
  },
  "data": {
    "pageId": "uuid",
    "slug": "home",
    "title": "Home"
  }
}
```

### Security

- Sign webhook payloads with HMAC-SHA256 using the webhook's `secret`
- Include signature in `X-PageForge-Signature` header
- Recipients can verify: `HMAC(secret, JSON.stringify(payload)) === signature`

### Delivery

- Webhooks are fire-and-forget (non-blocking)
- Retry failed deliveries 3 times with exponential backoff (1s, 10s, 60s)
- Log delivery status to `last_response_code`
- Deactivate webhook after 10 consecutive failures

## API Key Management UI

`/dashboard/[siteId]/settings/api` — admin only:

- List active API keys (showing key_prefix, name, last used, permissions)
- Create new key:
  - Name field (e.g., "Mobile App", "Marketing Site")
  - Permissions checkboxes (read only for now)
  - Optional expiration date
  - On create: show the full key ONCE (masked after page leave)
- Revoke key (set `is_active = false`)
- No key modification (create new + revoke old pattern)

## Webhook Management UI

`/dashboard/[siteId]/settings/webhooks` — admin only:

- List webhooks with URL, events, status, last triggered
- Create/edit webhook: URL, event checkboxes, active toggle
- Test webhook: send a test payload to the URL
- View delivery log (last 20 deliveries with response codes)

## CORS

API routes include CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```

For write endpoints (future), restrict origins to configured domains.

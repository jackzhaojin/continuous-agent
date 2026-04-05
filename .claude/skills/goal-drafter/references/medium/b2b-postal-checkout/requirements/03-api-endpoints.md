# B2B Postal Checkout Flow -- API Endpoints

## Overview

All API routes are Next.js App Router API routes (`/app/api/`). They interact with Supabase for persistence and return consistent JSON responses.

### Response Format (Standard)

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

---

## Endpoint Reference

### 1. `GET /api/health`

Service health check for monitoring.

**Response (200)**:
```json
{
  "status": "healthy",
  "timestamp": "2026-04-05T12:00:00Z",
  "service": "b2b-postal-checkout",
  "version": "1.0.0",
  "uptime": 3600,
  "environment": "development",
  "checks": {
    "database": { "status": "connected", "latency_ms": 12 },
    "memory": { "used_mb": 128, "total_mb": 512 }
  }
}
```

**Status Codes**: 200 (healthy), 503 (unhealthy)

---

### 2. `GET /api/form-config`

Returns form configuration data: dropdown options, validation rules, limits. Heavily cached.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sections` | string | all | Comma-separated: `packageTypes,specialHandling,countries,industries` |
| `locale` | string | `en-US` | Locale for labels |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "packageTypes": [
      {
        "value": "envelope",
        "label": "Envelope / Document",
        "weightLimit": 5,
        "dimensionLimits": { "maxLength": 15, "maxWidth": 12, "maxHeight": 1 }
      },
      {
        "value": "small",
        "label": "Small Package",
        "weightLimit": 25,
        "dimensionLimits": { "maxLength": 24, "maxWidth": 18, "maxHeight": 12 }
      },
      {
        "value": "medium",
        "label": "Medium Package",
        "weightLimit": 70,
        "dimensionLimits": { "maxLength": 36, "maxWidth": 24, "maxHeight": 24 }
      },
      {
        "value": "large",
        "label": "Large Package",
        "weightLimit": 150,
        "dimensionLimits": { "maxLength": 60, "maxWidth": 36, "maxHeight": 36 }
      },
      {
        "value": "pallet",
        "label": "Pallet",
        "weightLimit": 2000,
        "dimensionLimits": { "maxLength": 96, "maxWidth": 48, "maxHeight": 72 }
      },
      {
        "value": "crate",
        "label": "Crate",
        "weightLimit": 2000,
        "dimensionLimits": { "maxLength": 120, "maxWidth": 60, "maxHeight": 60 }
      },
      {
        "value": "multiple",
        "label": "Multiple Pieces",
        "weightLimit": null,
        "dimensionLimits": null
      }
    ],
    "specialHandling": [
      { "value": "fragile", "label": "Fragile", "description": "Extra padding and careful handling", "fee": 15.00 },
      { "value": "this-side-up", "label": "This Side Up", "description": "Orientation-sensitive package", "fee": 5.00 },
      { "value": "temperature-controlled", "label": "Temperature Controlled", "description": "Climate-controlled transport", "fee": 75.00 },
      { "value": "hazmat", "label": "Hazardous Materials", "description": "Requires hazmat certification", "fee": 50.00 },
      { "value": "white-glove", "label": "White Glove", "description": "Premium handling and placement", "fee": 125.00 },
      { "value": "inside-delivery", "label": "Inside Delivery", "description": "Delivered inside the building", "fee": 45.00 },
      { "value": "liftgate-pickup", "label": "Liftgate Pickup", "description": "Hydraulic liftgate at origin", "fee": 35.00 },
      { "value": "liftgate-delivery", "label": "Liftgate Delivery", "description": "Hydraulic liftgate at destination", "fee": 35.00 }
    ],
    "deliveryPreferences": [
      { "value": "signature", "label": "Signature Required", "fee": 8.00 },
      { "value": "adult-signature", "label": "Adult Signature", "fee": 12.00 },
      { "value": "sms-confirmation", "label": "SMS Confirmation", "fee": 2.00 },
      { "value": "photo-proof", "label": "Photo Proof of Delivery", "fee": 3.00 },
      { "value": "saturday-delivery", "label": "Saturday Delivery", "fee": 25.00 },
      { "value": "hold-at-location", "label": "Hold at Location", "fee": 0.00 }
    ],
    "contentsCategories": [
      "Electronics", "Documents", "Clothing/Textiles", "Food/Perishable",
      "Medical/Pharmaceutical", "Industrial Parts", "Chemicals",
      "Fragile/Glass", "Furniture", "Machinery", "Other"
    ],
    "countries": [
      { "code": "US", "name": "United States", "states": [
        { "code": "AL", "name": "Alabama" },
        { "code": "AK", "name": "Alaska" }
      ]},
      { "code": "CA", "name": "Canada", "states": [...] },
      { "code": "MX", "name": "Mexico", "states": [...] }
    ],
    "industries": [
      "Aerospace & Defense", "Agriculture", "Automotive", "Banking & Finance",
      "Biotechnology", "Chemical Manufacturing", "Construction", "Consulting",
      "Consumer Electronics", "E-Commerce", "Education", "Energy & Utilities",
      "Entertainment", "Environmental Services", "Fashion & Apparel",
      "Food & Beverage", "Government", "Healthcare", "Hospitality",
      "Information Technology", "Insurance", "Legal Services", "Logistics",
      "Manufacturing", "Marketing & Advertising", "Media & Publishing",
      "Mining", "Non-Profit", "Oil & Gas", "Pharmaceutical",
      "Real Estate", "Retail", "Shipping & Distribution", "Software",
      "Telecommunications", "Textile", "Transportation", "Warehousing",
      "Wholesale Trade", "Other"
    ],
    "businessTypes": [
      "Sole Proprietorship", "LLC", "S-Corporation", "C-Corporation",
      "Partnership", "Non-Profit", "Government", "Other"
    ],
    "currencyOptions": [
      { "code": "USD", "symbol": "$", "name": "US Dollar" },
      { "code": "CAD", "symbol": "C$", "name": "Canadian Dollar" },
      { "code": "MXN", "symbol": "MX$", "name": "Mexican Peso" }
    ],
    "serviceLevelPreferences": [
      { "value": "economical", "label": "Most Economical" },
      { "value": "fastest", "label": "Fastest Transit" },
      { "value": "reliable", "label": "Most Reliable" },
      { "value": "carbon-neutral", "label": "Carbon Neutral" }
    ]
  }
}
```

**Caching**: `Cache-Control: public, max-age=86400` (24 hours), ETag-based conditional requests.

---

### 3. `POST /api/quote`

Calculate shipping quotes from all active carriers based on shipment details.

**Request Body**:
```json
{
  "shipment_id": "uuid",
  "origin": {
    "zip": "43215",
    "state": "OH",
    "country": "US"
  },
  "destination": {
    "zip": "30301",
    "state": "GA",
    "country": "US"
  },
  "packages": [
    {
      "type": "medium",
      "length": 18,
      "width": 14,
      "height": 12,
      "weight": 25,
      "weight_unit": "lbs",
      "declared_value": 2500
    }
  ],
  "special_handling": ["fragile"],
  "delivery_preferences": ["signature"],
  "service_preference": "economical"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "quotes": {
      "ground": [
        {
          "id": "quote-uuid",
          "carrier": { "code": "VC", "name": "Value Carrier", "rating": 4.2 },
          "service": { "name": "Standard Ground", "code": "ground-standard" },
          "pricing": {
            "base_rate": 38.68,
            "fuel_surcharge": 3.87,
            "fuel_surcharge_pct": 10.0,
            "insurance": 12.50,
            "insurance_pct": 0.5,
            "special_handling": 15.00,
            "delivery_confirmation": 8.00,
            "taxes": 3.62,
            "tax_pct": 8.5,
            "total": 81.67,
            "calculation_basis": {
              "distance_miles": 562,
              "actual_weight": 25,
              "dimensional_weight": 18.3,
              "billable_weight": 25,
              "zone": "4"
            }
          },
          "transit_days": 5,
          "estimated_delivery": "2026-04-12",
          "features": ["Standard tracking", "Business day delivery", "Proof of delivery"],
          "carbon_footprint_kg": 4.2
        }
      ],
      "air": [...],
      "freight": [...]
    },
    "request_id": "req-uuid",
    "expires_at": "2026-04-05T13:00:00Z",
    "calculated_at": "2026-04-05T12:00:00Z"
  }
}
```

Quotes are also persisted to the `quotes` table for the given `shipment_id`.

**Status Codes**: 200 (success), 400 (validation error), 422 (business rule violation)

---

### 4. `POST /api/quote/select`

Select a specific quote for a shipment.

**Request Body**:
```json
{
  "shipment_id": "uuid",
  "quote_id": "uuid"
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "shipment_id": "uuid",
    "selected_quote_id": "uuid",
    "status": "pricing"
  }
}
```

Updates `quotes.is_selected` and advances `shipments.status` to `pricing`.

---

### 5. `GET /api/pickup-availability`

Get available pickup dates and time slots.

**Query Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `zip_code` | string | yes | Pickup ZIP code |
| `date` | string | no | Specific date to check (ISO format) |
| `service_level` | string | no | Affects lead times |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "available_dates": [
      {
        "date": "2026-04-09",
        "day_of_week": "Thursday",
        "is_business_day": true,
        "time_slots": [
          { "id": "morning", "display": "8:00 AM - 12:00 PM", "start": "08:00", "end": "12:00", "availability": "available", "fee": 0 },
          { "id": "afternoon", "display": "12:00 PM - 5:00 PM", "start": "12:00", "end": "17:00", "availability": "available", "fee": 0 },
          { "id": "evening", "display": "5:00 PM - 7:00 PM", "start": "17:00", "end": "19:00", "availability": "limited", "fee": 25.00 }
        ],
        "notes": [],
        "restrictions": []
      }
    ],
    "service_area": {
      "zone": "metropolitan",
      "coverage": "full",
      "description": "Full service area - all time slots and equipment available"
    },
    "weekend_options": {
      "available": true,
      "fee": 50.00,
      "conditions": ["Saturday only", "Morning slot only"]
    },
    "metadata": {
      "minimum_lead_days": 3,
      "max_advance_days": 90,
      "same_day_cutoff": "15:00",
      "generated_at": "2026-04-05T12:00:00Z"
    }
  }
}
```

**Business Rules**:
- Minimum 3 business days lead time
- Maximum 90 days advance booking
- Same-day cutoff at 3:00 PM
- Weekend/holiday pickups: +$50, Saturday only, Morning slot only
- Evening time slots: +$25

---

### 6. `GET /api/address-search`

Address autocomplete and validation (mock implementation).

**Query Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Partial address or ZIP code |
| `limit` | integer | no | Max results (default: 10) |

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "address": "123 Main Street",
        "suite": "Suite 100",
        "city": "Columbus",
        "state": "OH",
        "zip": "43215",
        "country": "US",
        "is_residential": false,
        "location_type": "commercial",
        "confidence": 0.95
      }
    ]
  }
}
```

---

### 7. `POST /api/shipments`

Create a new shipment (initializes draft).

**Request Body**:
```json
{
  "origin_address": { ... },
  "origin_contact": { ... },
  "destination_address": { ... },
  "destination_contact": { ... },
  "service_preference": "economical"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "draft",
    "current_step": 1,
    "created_at": "2026-04-05T12:00:00Z"
  }
}
```

---

### 8. `PATCH /api/shipments/:id`

Update shipment details (used by each step to save progress).

**Request Body** (partial update):
```json
{
  "status": "payment",
  "current_step": 3
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "payment",
    "current_step": 3,
    "updated_at": "2026-04-05T12:05:00Z"
  }
}
```

---

### 9. `GET /api/shipments/:id`

Get full shipment with all related data.

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "confirmation_number": null,
    "status": "pickup",
    "current_step": 4,
    "origin_address": { ... },
    "origin_contact": { ... },
    "destination_address": { ... },
    "destination_contact": { ... },
    "packages": [...],
    "special_handling": [...],
    "delivery_preferences": [...],
    "hazmat_details": null,
    "selected_quote": { ... },
    "payment_info": { ... },
    "pickup_details": null,
    "events": [...]
  }
}
```

---

### 10. `POST /api/shipments/:id/submit`

Submit the finalized shipment. Generates confirmation number and tracking info.

**Request Body**:
```json
{
  "terms_accepted": true,
  "acknowledgments": [
    "declared_value_accurate",
    "insurance_understood",
    "contents_compliant",
    "carrier_authorized"
  ]
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "confirmation_number": "SHP-2026-074829",
    "tracking_number": null,
    "tracking_available_at": "2026-04-05T16:00:00Z",
    "estimated_delivery": "2026-04-12T17:00:00Z",
    "status": "confirmed",
    "submitted_at": "2026-04-05T12:10:00Z",
    "carrier": {
      "name": "Value Carrier",
      "tracking_url_template": "https://track.valuecarrier.com/{tracking_number}"
    },
    "total_cost": 81.67
  }
}
```

**Side Effects**:
- Generates `SHP-YYYY-XXXXXX` confirmation number
- Sets `shipments.status` to `confirmed`
- Sets `shipments.submitted_at`
- Creates `submitted` event in `shipment_events`

---

### 11. `POST /api/shipments/:id/packages`

Add packages to a shipment.

**Request Body**:
```json
{
  "packages": [
    {
      "package_type": "medium",
      "length": 18,
      "width": 14,
      "height": 12,
      "dimension_unit": "in",
      "weight": 25,
      "weight_unit": "lbs",
      "declared_value": 2500,
      "currency": "USD",
      "contents_category": "Electronics",
      "contents_description": "Server equipment"
    }
  ]
}
```

---

### 12. `POST /api/shipments/:id/payment`

Set payment information for a shipment.

**Request Body** (example: Purchase Order):
```json
{
  "method": "po",
  "billing_address": { ... },
  "billing_contact": { ... },
  "company_legal_name": "Acme Corp",
  "tax_id": "12-3456789",
  "gl_code": "4500-001",
  "invoice_delivery": "email",
  "invoice_format": "itemized",
  "invoice_frequency": "per-shipment",
  "purchase_order": {
    "po_number": "PO-2026-001234",
    "po_amount": 5000.00,
    "expiration_date": "2026-12-31",
    "approval_contact": "Jane Smith",
    "department": "IT Operations"
  }
}
```

---

### 13. `POST /api/shipments/:id/pickup`

Set pickup scheduling details.

**Request Body**:
```json
{
  "pickup_date": "2026-04-09",
  "time_slot": "morning",
  "location_type": "loading-dock",
  "dock_number": "Bay 3",
  "gate_code": "4521",
  "parking_instructions": "Use visitor parking lot B",
  "package_location": "Shipping department, first floor",
  "driver_instructions": "Call upon arrival, ask for Mike",
  "loading_assistance": "customer",
  "ready_time": "07:30",
  "access_requirements": ["call-upon-arrival", "security-checkin"],
  "equipment_needs": ["standard-dolly"],
  "primary_contact": {
    "name": "Mike Johnson",
    "mobile_phone": "614-555-0123",
    "email": "mike@acme.com",
    "preferred_contact_method": "phone"
  },
  "backup_contact": {
    "name": "Sarah Lee",
    "mobile_phone": "614-555-0456",
    "email": "sarah@acme.com"
  },
  "authorized_personnel": ["Mike Johnson", "Sarah Lee"],
  "notifications": [
    "email-reminder-24h",
    "sms-reminder-2h",
    "driver-enroute",
    "pickup-completion"
  ]
}
```

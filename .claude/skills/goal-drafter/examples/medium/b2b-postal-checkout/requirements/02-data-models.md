# B2B Postal Checkout Flow -- Data Models & Supabase Schema

## Overview

All data is persisted in Supabase (PostgreSQL). The schema supports the full shipping transaction lifecycle with proper relationships, constraints, and RLS policies.

## Entity Relationship Diagram (Conceptual)

```
shipments (1) ---- (1) shipment_details
    |
    |---- (1) selected_quote
    |---- (1) payment_info
    |---- (1) pickup_details
    |---- (*) shipment_packages
    |---- (*) shipment_events (audit log)
    |
carriers (*) ---- (*) service_types
    |
    |---- (*) quotes
```

## Core Tables

### `shipments` (Main Transaction)

The root entity for each shipping transaction.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `confirmation_number` | text | yes | null | Format: `SHP-YYYY-XXXXXX`, generated on submission |
| `status` | text | no | `'draft'` | `draft`, `pricing`, `payment`, `pickup`, `review`, `confirmed`, `cancelled` |
| `current_step` | integer | no | `1` | Current step in the flow (1-6) |
| `origin_address` | jsonb | no | `'{}'` | Origin address object |
| `origin_contact` | jsonb | no | `'{}'` | Origin contact info |
| `destination_address` | jsonb | no | `'{}'` | Destination address object |
| `destination_contact` | jsonb | no | `'{}'` | Destination contact info |
| `service_preference` | text | yes | null | `economical`, `fastest`, `reliable`, `carbon-neutral` |
| `created_at` | timestamptz | no | `now()` | Creation timestamp |
| `updated_at` | timestamptz | no | `now()` | Last update timestamp |
| `submitted_at` | timestamptz | yes | null | Submission timestamp |

**Indexes**: `status`, `confirmation_number` (unique), `created_at`

### `shipment_packages`

One or more packages per shipment (supports multiple pieces).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `shipment_id` | uuid | no | | FK -> `shipments.id` |
| `package_type` | text | no | | `envelope`, `small`, `medium`, `large`, `pallet`, `crate` |
| `length` | numeric(8,2) | no | | Length in inches |
| `width` | numeric(8,2) | no | | Width in inches |
| `height` | numeric(8,2) | no | | Height in inches |
| `dimension_unit` | text | no | `'in'` | `in` or `cm` |
| `weight` | numeric(8,2) | no | | Weight value |
| `weight_unit` | text | no | `'lbs'` | `lbs` or `kg` |
| `dimensional_weight` | numeric(8,2) | yes | null | Calculated: LxWxH/166 |
| `declared_value` | numeric(10,2) | no | `0` | Declared value for insurance |
| `currency` | text | no | `'USD'` | `USD`, `CAD`, `MXN` |
| `contents_category` | text | yes | null | Electronics, Documents, etc. |
| `contents_description` | text | yes | null | Free-text description |
| `is_primary` | boolean | no | `true` | Primary package (for single-piece shipments) |
| `sequence_number` | integer | no | `1` | Order for multi-piece |

**Indexes**: `shipment_id`

### `shipment_special_handling`

Special handling requirements per package.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `shipment_id` | uuid | no | | FK -> `shipments.id` |
| `package_id` | uuid | yes | null | FK -> `shipment_packages.id` (null = applies to all) |
| `handling_type` | text | no | | `fragile`, `this-side-up`, `temperature-controlled`, `hazmat`, `white-glove`, `inside-delivery`, `liftgate-pickup`, `liftgate-delivery` |
| `fee` | numeric(8,2) | no | `0` | Associated fee |

### `shipment_delivery_preferences`

Delivery preference selections per shipment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `shipment_id` | uuid | no | | FK -> `shipments.id` |
| `preference_type` | text | no | | `signature`, `adult-signature`, `sms-confirmation`, `photo-proof`, `saturday-delivery`, `hold-at-location` |
| `fee` | numeric(8,2) | no | `0` | Associated fee |

### `hazmat_details`

Hazardous materials declarations (conditional on special handling).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `shipment_id` | uuid | no | | FK -> `shipments.id` |
| `un_number` | text | no | | UN identification number |
| `proper_shipping_name` | text | no | | Official shipping name |
| `hazard_class` | text | no | | Hazard classification |
| `packing_group` | text | yes | | I, II, or III |
| `quantity` | text | no | | Amount and unit |
| `emergency_contact_name` | text | no | | Emergency contact |
| `emergency_contact_phone` | text | no | | Emergency phone |

---

## Pricing Tables

### `carriers`

Mock carrier definitions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `code` | text | no | | Unique code: `PEX`, `VC`, `EFL`, `FS` |
| `name` | text | no | | Display name |
| `description` | text | yes | null | Carrier description |
| `logo_url` | text | yes | null | Logo image URL |
| `base_price_multiplier` | numeric(4,2) | no | `1.0` | Price multiplier vs baseline |
| `fuel_surcharge_min` | numeric(4,2) | no | | Min fuel surcharge % |
| `fuel_surcharge_max` | numeric(4,2) | no | | Max fuel surcharge % |
| `carbon_multiplier` | numeric(4,2) | no | `1.0` | Carbon footprint multiplier |
| `reliability_rating` | numeric(3,1) | no | | 1.0 - 5.0 rating |
| `is_active` | boolean | no | `true` | Whether carrier is available |

**Seed data**: 4 carriers
1. **Premium Express (PEX)**: multiplier 1.15, fuel 12-18%, reliability 4.8
2. **Value Carrier (VC)**: multiplier 0.85, fuel 8-12%, reliability 4.2
3. **Eco-Friendly Logistics (EFL)**: multiplier 0.95, fuel 10-14%, carbon 0.8, reliability 4.5
4. **Freight Solutions (FS)**: multiplier 1.05, fuel 10-15%, reliability 4.6

### `service_types`

Services offered by each carrier.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `carrier_id` | uuid | no | | FK -> `carriers.id` |
| `category` | text | no | | `ground`, `air`, `freight` |
| `name` | text | no | | Service display name |
| `code` | text | no | | Machine-readable code |
| `transit_days_min` | integer | no | | Minimum transit days |
| `transit_days_max` | integer | no | | Maximum transit days |
| `price_multiplier` | numeric(4,2) | no | `1.0` | Multiplier on carrier base |
| `max_weight` | numeric(8,2) | yes | null | Weight limit (lbs) |
| `features` | jsonb | no | `'[]'` | Feature list (array of strings) |
| `is_active` | boolean | no | `true` | Available for quoting |

### `quotes`

Generated quotes per shipment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `shipment_id` | uuid | no | | FK -> `shipments.id` |
| `carrier_id` | uuid | no | | FK -> `carriers.id` |
| `service_type_id` | uuid | no | | FK -> `service_types.id` |
| `base_rate` | numeric(10,2) | no | | Base shipping rate |
| `fuel_surcharge` | numeric(10,2) | no | | Fuel surcharge amount |
| `fuel_surcharge_pct` | numeric(4,2) | no | | Fuel surcharge percentage |
| `insurance` | numeric(10,2) | no | | Insurance cost |
| `insurance_pct` | numeric(4,2) | no | | Insurance percentage |
| `special_handling_fee` | numeric(10,2) | no | `0` | Total special handling |
| `delivery_confirmation_fee` | numeric(10,2) | no | `0` | Delivery preference fees |
| `taxes` | numeric(10,2) | no | | Tax amount |
| `tax_pct` | numeric(4,2) | no | | Tax percentage |
| `total` | numeric(10,2) | no | | Grand total |
| `estimated_delivery` | date | no | | Estimated delivery date |
| `transit_days` | integer | no | | Estimated transit days |
| `carbon_footprint` | numeric(6,2) | yes | null | CO2 estimate (kg) |
| `distance_miles` | numeric(8,1) | yes | null | Calculated distance |
| `zone` | text | yes | null | Shipping zone |
| `is_selected` | boolean | no | `false` | Customer's selection |
| `expires_at` | timestamptz | no | | Quote expiration |
| `created_at` | timestamptz | no | `now()` | |

**Indexes**: `shipment_id`, `is_selected`

---

## Payment Tables

### `payment_info`

Payment method selection and billing info per shipment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `shipment_id` | uuid | no | | FK -> `shipments.id` (unique) |
| `method` | text | no | | `po`, `bol`, `thirdparty`, `net`, `corporate` |
| `billing_address` | jsonb | no | `'{}'` | Billing address object |
| `billing_contact` | jsonb | no | `'{}'` | Billing contact (name, title, phone, email) |
| `company_legal_name` | text | yes | | Legal entity name |
| `company_dba` | text | yes | | Doing business as |
| `business_type` | text | yes | | LLC, Corporation, etc. |
| `industry` | text | yes | | Industry category |
| `annual_shipping_volume` | text | yes | | Volume range |
| `tax_id` | text | yes | | EIN / Tax ID |
| `gl_code` | text | yes | | General ledger code |
| `cost_center` | text | yes | | Cost center code |
| `invoice_delivery` | text | yes | `'email'` | `email`, `mail`, `edi`, `portal` |
| `invoice_format` | text | yes | `'standard'` | `standard`, `itemized`, `summary`, `custom` |
| `invoice_frequency` | text | yes | `'per-shipment'` | `per-shipment`, `weekly`, `monthly` |
| `method_fee_pct` | numeric(4,2) | no | `0` | Fee percentage for this method |

### `payment_purchase_orders`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `payment_id` | uuid | no | | FK -> `payment_info.id` (unique) |
| `po_number` | text | no | | Purchase order number |
| `po_amount` | numeric(10,2) | no | | Authorized amount |
| `expiration_date` | date | no | | PO expiration |
| `approval_contact` | text | no | | Approver name |
| `department` | text | yes | | Department / cost center |

### `payment_bills_of_lading`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `payment_id` | uuid | no | | FK -> `payment_info.id` (unique) |
| `bol_number` | text | no | | Format: `BOL-YYYY-XXXXXX` |
| `bol_date` | date | no | | BOL issue date |
| `shipper_reference` | text | no | | Shipper reference ID |
| `freight_terms` | text | no | | `prepaid`, `collect`, `prepaid-add` |

### `payment_third_party`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `payment_id` | uuid | no | | FK -> `payment_info.id` (unique) |
| `account_number` | text | no | | Third-party account |
| `company_name` | text | no | | Company name |
| `contact_name` | text | no | | Contact person |
| `contact_phone` | text | no | | Contact phone |
| `contact_email` | text | no | | Contact email |
| `authorization_code` | text | yes | | Auth code (optional) |

### `payment_net_terms`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `payment_id` | uuid | no | | FK -> `payment_info.id` (unique) |
| `period_days` | integer | no | | 15, 30, 45, or 60 |
| `annual_revenue` | text | yes | | Revenue range |
| `credit_application_url` | text | yes | | Uploaded PDF URL (Supabase Storage) |

### `payment_net_terms_references`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `net_terms_id` | uuid | no | | FK -> `payment_net_terms.id` |
| `company_name` | text | no | | Reference company |
| `contact_name` | text | no | | Contact person |
| `contact_phone` | text | no | | Phone |
| `contact_email` | text | no | | Email |
| `account_number` | text | yes | | Account reference |

### `payment_corporate_accounts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `payment_id` | uuid | no | | FK -> `payment_info.id` (unique) |
| `account_number` | text | no | | Corporate account # |
| `account_pin` | text | no | | 4-6 digit PIN |

---

## Pickup Tables

### `pickup_details`

Pickup scheduling and location info per shipment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `shipment_id` | uuid | no | | FK -> `shipments.id` (unique) |
| `pickup_date` | date | no | | Scheduled pickup date |
| `time_slot` | text | no | | `morning`, `afternoon`, `evening` |
| `time_slot_display` | text | no | | "8:00 AM - 12:00 PM" etc. |
| `time_slot_fee` | numeric(8,2) | no | `0` | Fee for premium time slots |
| `location_type` | text | no | | `loading-dock`, `ground-level`, `residential`, `storage-facility`, `construction-site`, `other` |
| `dock_number` | text | yes | | Loading dock number |
| `gate_code` | text | yes | | Gate/access code |
| `parking_instructions` | text | yes | | Max 200 chars |
| `package_location` | text | yes | | Max 100 chars |
| `driver_instructions` | text | yes | | Max 300 chars |
| `loading_assistance` | text | no | `'customer'` | `customer`, `driver` (+$25), `fullservice` (+$65) |
| `loading_assistance_fee` | numeric(8,2) | no | `0` | |
| `ready_time` | time | no | | Package ready time (30+ min before slot) |
| `weekend_pickup` | boolean | no | `false` | Saturday/holiday (+$50) |
| `weekend_fee` | numeric(8,2) | no | `0` | |

### `pickup_contacts`

Primary and backup contacts for pickup.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `pickup_id` | uuid | no | | FK -> `pickup_details.id` |
| `role` | text | no | | `primary`, `backup` |
| `name` | text | no | | Full name |
| `job_title` | text | yes | | Job title |
| `mobile_phone` | text | no | | Mobile number |
| `alternative_phone` | text | yes | | Alt number |
| `email` | text | no | | Email |
| `preferred_contact_method` | text | no | `'phone'` | `phone`, `email`, `text` |

### `pickup_access_requirements`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `pickup_id` | uuid | no | | FK -> `pickup_details.id` |
| `requirement_type` | text | no | | `call-upon-arrival`, `security-checkin`, `gate-code`, `appointment-required`, `limited-parking`, `forklift-available`, `liftgate-service` |
| `fee` | numeric(8,2) | no | `0` | Additional fee if applicable |

### `pickup_equipment_needs`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `pickup_id` | uuid | no | | FK -> `pickup_details.id` |
| `equipment_type` | text | no | | `standard-dolly`, `appliance-dolly`, `furniture-pads`, `straps`, `pallet-jack`, `two-person-team` |
| `fee` | numeric(8,2) | no | `0` | e.g., two-person-team: +$45 |

### `pickup_authorized_personnel`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `pickup_id` | uuid | no | | FK -> `pickup_details.id` |
| `name` | text | no | | Person's full name |
| `authorization_level` | text | no | `'full'` | `full`, `limited`, `notification-only` |

### `pickup_notifications`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `pickup_id` | uuid | no | | FK -> `pickup_details.id` |
| `notification_type` | text | no | | `email-reminder-24h`, `sms-reminder-2h`, `call-reminder-30m`, `driver-enroute`, `pickup-completion`, `transit-updates` |
| `enabled` | boolean | no | `true` | |

---

## Audit Table

### `shipment_events`

Append-only audit log of all state changes.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `shipment_id` | uuid | no | | FK -> `shipments.id` |
| `event_type` | text | no | | `created`, `step_completed`, `quote_selected`, `payment_set`, `pickup_scheduled`, `submitted`, `cancelled` |
| `step_number` | integer | yes | | Which step triggered this |
| `payload` | jsonb | yes | null | Event-specific data |
| `created_at` | timestamptz | no | `now()` | |

**Index**: `shipment_id`, `created_at`

---

## JSONB Object Schemas

### Address Object (used in `origin_address`, `destination_address`, `billing_address`)

```json
{
  "address": "string (required)",
  "suite": "string (optional)",
  "city": "string (required)",
  "state": "string (required, 2-letter code)",
  "zip": "string (required, 5 or 9 digit)",
  "country": "string (required, ISO 2-letter, default US)",
  "location_type": "commercial | residential | industrial | warehouse | storage | construction | other"
}
```

### Contact Object (used in `origin_contact`, `destination_contact`, `billing_contact`)

```json
{
  "name": "string (required)",
  "company": "string (optional)",
  "phone": "string (required)",
  "email": "string (required)",
  "extension": "string (optional)"
}
```

---

## RLS Policies (v1 -- permissive for development)

For v1, use permissive policies. In production, these would be scoped to authenticated users:

```sql
-- Allow all operations for now (tighten with auth in v2)
CREATE POLICY "Allow all" ON shipments FOR ALL USING (true);
CREATE POLICY "Allow all" ON shipment_packages FOR ALL USING (true);
-- ... repeat for all tables
```

---

## Seed Data

### Carriers (4 records)

See `carriers` table above for the 4 mock carriers with their pricing multipliers, surcharge ranges, and ratings.

### Service Types (~20 records)

Each carrier offers 3-6 services across ground, air, and freight categories. See `04-business-logic.md` for complete service definitions.

### Sample Shipment (for testing)

A complete test shipment from Columbus, OH to Atlanta, GA:
- Medium package, 25 lbs, 18x14x12, $2,500 declared value
- Fragile + Signature Required
- Standard Ground selected (~$67.50 total)
- Purchase Order payment (PO-2026-001234)
- Pickup: 3 business days out, Morning slot, Loading Dock

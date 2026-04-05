# B2B Postal Checkout Flow -- Business Logic

## Pricing Engine

### Overview

The pricing engine calculates quotes from all active carriers for a given shipment. Quotes are generated server-side and persisted to Supabase for audit and comparison.

### Pricing Formula

```
baseRate = distanceFactor × zoneMult × weightFactor × carrierMult × serviceMult

fuelSurcharge = baseRate × fuelPct (randomized within carrier range)

insurance = declaredValue × insuranceRate × riskFactor
  - insuranceRate: 0.003 - 0.005 (0.3-0.5%)
  - riskFactor: varies by contents category (electronics=1.5, documents=0.5, hazmat=2.0)
  - minimum $5.00

specialHandlingFees = sum of all selected handling fees (fixed amounts per type)

deliveryConfirmationFees = sum of all selected delivery preferences

subtotal = baseRate + fuelSurcharge + insurance + specialHandlingFees + deliveryConfirmationFees

taxes = (baseRate + fuelSurcharge) × taxRate
  - taxRate: 8.5% (on base + fuel only, not on insurance/fees)

total = subtotal + taxes
```

### Distance & Zone Calculation

For mock purposes, use ZIP-code prefix distance estimation:

| Zone | Distance (miles) | Multiplier | Example |
|------|-----------------|------------|---------|
| 1 (Local) | 0-50 | 1.0 | Same metro area |
| 2 | 51-150 | 1.15 | Same state |
| 3 | 151-300 | 1.30 | Adjacent states |
| 4 | 301-600 | 1.50 | Regional |
| 5 | 601-1000 | 1.75 | Cross-country partial |
| 6 | 1001-1500 | 2.00 | Cross-country |
| 7 | 1501-2000 | 2.25 | Coast to coast |
| 8 | 2001+ | 2.50 | Extended (Hawaii, Alaska, international) |

**Distance estimation** (mock): Use absolute difference of first 3 ZIP digits × a scaling factor. Real implementation would use a distance API.

### Weight Factor

```
actualWeight = package weight in lbs
dimensionalWeight = (L × W × H) / 166  (for inches)
billableWeight = max(actualWeight, dimensionalWeight)

weightFactor:
  0-5 lbs:    baseFactor = 1.0  (minimum ~$15 base)
  6-25 lbs:   baseFactor = 1.0 + (weight - 5) × 0.08
  26-70 lbs:  baseFactor = 2.6 + (weight - 25) × 0.06
  71-150 lbs: baseFactor = 5.3 + (weight - 70) × 0.05
  150+ lbs:   baseFactor = 9.3 + (weight - 150) × 0.04
```

### Carrier-Specific Pricing

**Premium Express (PEX)**
- Base multiplier: 1.15
- Fuel surcharge: 12-18%
- Services: Overnight Express (4.0x), Overnight Standard (3.5x), Air Express (3.0x), Air Saver (2.0x), Premium Ground (1.2x)
- Features: Real-time tracking, Guaranteed delivery times, Priority handling

**Value Carrier (VC)**
- Base multiplier: 0.85
- Fuel surcharge: 8-12%
- Services: Standard Ground (1.0x), Ground Select (1.25x), Economy Air (1.8x)
- Features: Standard tracking, Business day delivery, Proof of delivery

**Eco-Friendly Logistics (EFL)**
- Base multiplier: 0.95
- Fuel surcharge: 10-14%
- Carbon multiplier: 0.8
- Services: Green Ground (1.0x), Green Express (2.5x), Carbon Neutral Air (2.8x)
- Features: Carbon offset included, Sustainable packaging, Electric vehicle fleet

**Freight Solutions (FS)**
- Base multiplier: 1.05
- Fuel surcharge: 10-15%
- Services: LTL Standard (0.8x per CWT), LTL Expedited (1.1x per CWT), FTL (flat rate by zone)
- Available only for shipments 150+ lbs
- Features: Tailgate service, Inside delivery available, Pallet tracking

### Carbon Footprint Calculation

```
carbonKg = billableWeight × distanceMiles × 0.0001 × carrierCarbonMult × serviceMult

Service multipliers:
  Ground: 1.0
  Air: 2.0
  Freight: 0.8 (more efficient per unit weight)

Carrier carbon multipliers:
  PEX: 1.0, VC: 1.1, EFL: 0.8, FS: 0.9
```

---

## Payment Method Fees

| Method | Fee | Notes |
|--------|-----|-------|
| Purchase Order | 0% | Standard B2B |
| Bill of Lading | 0% | Standard freight |
| Third-Party Billing | 2.5% | Processing fee |
| Net Terms | 1.5% | Cost of capital |
| Corporate Account | 0% | Pre-negotiated rates |

---

## Pickup Scheduling Logic

### Availability Rules

1. **Minimum lead time**: 3 business days from today
2. **Maximum advance**: 90 calendar days
3. **Same-day cutoff**: If before 3:00 PM local time, next business day available (still 3-day minimum for regular)
4. **Business days**: Monday-Friday, excluding federal holidays
5. **Weekend availability**: Saturday only, Morning slot only, +$50

### Federal Holidays (US)

```
New Year's Day (Jan 1)
Martin Luther King Jr. Day (3rd Monday, Jan)
Presidents' Day (3rd Monday, Feb)
Memorial Day (Last Monday, May)
Independence Day (Jul 4)
Labor Day (1st Monday, Sep)
Columbus Day (2nd Monday, Oct)
Veterans Day (Nov 11)
Thanksgiving (4th Thursday, Nov)
Christmas Day (Dec 25)
```

If a holiday falls on Saturday, observed Friday. If Sunday, observed Monday.

### Time Slot Fees

| Slot | Hours | Fee | Notes |
|------|-------|-----|-------|
| Morning | 8:00 AM - 12:00 PM | $0 | Standard |
| Afternoon | 12:00 PM - 5:00 PM | $0 | Standard |
| Evening | 5:00 PM - 7:00 PM | +$25 | Extended hours |

### Service Area Zones

Determine by ZIP code prefix:

| Zone | Coverage | Lead Time | Slots | Equipment |
|------|----------|-----------|-------|-----------|
| Metropolitan | Full | 3 days | All | All |
| Standard | Full | 3 days | All | Standard |
| Limited | Reduced | 5 days | Morning only | Basic |
| Remote | Limited | 7 days | Morning only | Limited |

Mock implementation: Major metro ZIP prefixes (100, 200, 300, 400, 432, 606, 900, etc.) = Metropolitan. Others scale based on population density heuristic.

### Equipment & Loading Fees

| Service | Fee |
|---------|-----|
| Standard Dolly | $0 |
| Appliance Dolly | $0 |
| Furniture Pads | $0 |
| Straps/Tie-downs | $0 |
| Pallet Jack | $0 |
| Two-Person Team | +$45 |
| Driver Loading Assistance | +$25 |
| Full Service Loading | +$65 |

### Location Type Surcharges

| Type | Surcharge | Notes |
|------|-----------|-------|
| Loading Dock | $0 | Standard commercial |
| Ground Level | $0 | No equipment surcharge |
| Residential | +$15 | Limited access, often no dock |
| Storage Facility | $0 | May need appointment |
| Construction Site | +$25 | Safety equipment, limited access |
| Other | Quote | Custom assessment |

---

## Confirmation Number Generation

Format: `SHP-YYYY-XXXXXX`

- `YYYY`: Current year
- `XXXXXX`: Zero-padded sequential number (or random 6-digit)
- Generated server-side on submission
- Stored in `shipments.confirmation_number`

### Tracking Number

- Not immediately available (simulated delay: 2-4 hours after pickup)
- Format depends on carrier (mock: `TRK-{carrier_code}-{random_12}`)
- Stored in shipment events when "generated"

---

## Delivery Estimation

```
estimatedDeliveryDate = pickupDate + transitDays + weekendAdjustment

transitDays: from selected service type (e.g., Standard Ground = 3-5 days)
weekendAdjustment: skip Saturdays/Sundays/holidays in transit count

Display as: "Estimated Delivery: Thursday, April 12, 2026 by end of day"
```

For express services with time guarantees:
- Overnight Express: "by 10:30 AM"
- Overnight Standard: "by end of day (7:00 PM)"
- Air Express: "by 12:00 PM"

---

## Draft/Resume Logic

Shipments auto-save on each step transition. Users can:

1. **Save as Draft**: Explicitly save current state, remain on page
2. **Start Over**: Clear all data, return to Step 1
3. **Resume**: Load shipment by ID from Supabase, navigate to `current_step`
4. **Recent Shipments**: List last 10 shipments on confirmation page

Each step save:
1. Validates current step data
2. Persists to Supabase (upsert pattern)
3. Updates `shipments.status` and `shipments.current_step`
4. Creates `step_completed` event in `shipment_events`
5. Navigates to next step

Back navigation loads saved data from Supabase without re-validating.

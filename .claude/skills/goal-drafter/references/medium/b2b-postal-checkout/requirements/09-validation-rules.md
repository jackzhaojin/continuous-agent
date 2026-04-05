# B2B Postal Checkout Flow -- Validation Rules

## Overview

All validation uses **Zod schemas** integrated with **React Hook Form**. Validation runs client-side in real-time (on blur + on submit). Server-side validation mirrors client rules for API endpoints.

## General Rules

- Required fields show red border + error message on blur if empty
- Error messages appear below the field, not in alerts/toasts
- Form cannot advance to next step until all required fields validate
- "Required" indicator: red asterisk (*) next to label
- Error text color: `red-600`
- Successful validation: no visual indicator (clean state)

---

## Step 1: Shipment Details Validation

### Address Fields (Origin & Destination)

| Field | Rules |
|-------|-------|
| Street Address | Required, min 5 chars, max 200 chars |
| Suite/Unit | Optional, max 50 chars |
| City | Required, min 2 chars, max 100 chars, letters/spaces/hyphens only |
| State | Required, must be valid state code for selected country |
| ZIP Code | Required. US: `/^\d{5}(-\d{4})?$/`. CA: `/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i`. MX: `/^\d{5}$/` |
| Country | Required, must be US, CA, or MX |

### Cross-Field Validation

| Rule | Error Message |
|------|---------------|
| Origin address == Destination address | "Origin and destination cannot be the same address" |
| Origin ZIP matches origin state | "ZIP code does not match the selected state" |
| Destination ZIP matches destination state | "ZIP code does not match the selected state" |

### Contact Fields

| Field | Rules |
|-------|-------|
| Name | Required, min 2 chars, max 100 chars |
| Company | Optional, max 200 chars |
| Phone | Required, valid phone format: `/^\+?[\d\s\-\(\)]{10,15}$/` |
| Email | Required, valid email format (Zod `.email()`) |
| Extension | Optional, digits only, max 10 chars |

### Package Fields

| Field | Rules |
|-------|-------|
| Package Type | Required, must be one of the 7 valid types |
| Length | Required, positive number, max per package type |
| Width | Required, positive number, max per package type |
| Height | Required, positive number, max per package type |
| Weight | Required, 0.5 - 2000 (lbs) or 0.23 - 907 (kg) |
| Declared Value | Required, 1 - 100,000 |
| Contents Category | Required if declared value > $500 |

### Package Type Dimension Limits

| Type | Max L (in) | Max W (in) | Max H (in) | Max Weight (lbs) |
|------|-----------|-----------|-----------|-----------------|
| Envelope | 15 | 12 | 1 | 5 |
| Small | 24 | 18 | 12 | 25 |
| Medium | 36 | 24 | 24 | 70 |
| Large | 60 | 36 | 36 | 150 |
| Pallet | 96 | 48 | 72 | 2000 |
| Crate | 120 | 60 | 60 | 2000 |

### Package Warnings (non-blocking)

| Condition | Warning Message |
|-----------|----------------|
| DIM weight > actual weight | "Dimensional weight (X lbs) exceeds actual weight. You will be billed for dimensional weight." |
| Declared value > $2,500 | "Consider adding additional insurance coverage for high-value shipments." |
| Declared value > $5,000 | "Additional insurance is strongly recommended. Special authorization may be required at pickup." |
| Weight > 150 lbs | "This shipment qualifies for freight services. Freight options will be shown on the pricing page." |

### Hazmat Validation (conditional)

Only when "Hazardous Materials" special handling is selected:

| Field | Rules |
|-------|-------|
| UN Number | Required, format: `/^UN\d{4}$/` |
| Proper Shipping Name | Required, min 5 chars |
| Hazard Class | Required |
| Packing Group | Optional (not all hazmat has packing group) |
| Quantity | Required, non-empty |
| Emergency Contact Name | Required |
| Emergency Contact Phone | Required, valid phone |

### Multiple Pieces Validation (conditional)

| Rule | Error Message |
|------|---------------|
| At least 2 pieces | "Multiple pieces requires 2 or more packages" |
| Max 20 pieces | "Maximum 20 pieces per shipment" |
| Each piece has type | "Package type is required for each piece" |
| Each piece has weight | "Weight is required for each piece" |
| Each piece has dimensions | "Dimensions are required for each piece" |
| Total weight <= 2000 lbs | "Total shipment weight cannot exceed 2000 lbs" |

---

## Step 2: Pricing Validation

| Rule | Error Message |
|------|---------------|
| Quote selected | "Please select a shipping option to continue" |
| Quote not expired | "This quote has expired. Please recalculate." |

---

## Step 3: Payment Validation

### All Methods (Common)

| Field | Rules |
|-------|-------|
| Payment method selected | Required |
| Billing Contact Name | Required |
| Billing Contact Phone | Required, valid phone |
| Billing Contact Email | Required, valid email |
| Company Legal Name | Required, min 2 chars |
| Business Type | Required |

### Purchase Order

| Field | Rules | Error |
|-------|-------|-------|
| PO Number | Required, non-empty | "PO number is required" |
| PO Amount | Required, >= shipment total | "PO amount must cover the shipment cost of $X.XX" |
| Expiration Date | Required, must be future | "PO has expired or expires today" |
| Approval Contact | Required | "Approval contact is required" |

### Bill of Lading

| Field | Rules | Error |
|-------|-------|-------|
| BOL Number | Required | "BOL number is required" |
| BOL Date | Required, <= today | "BOL date cannot be in the future" |
| Shipper Reference | Required | "Shipper reference is required" |
| Freight Terms | Required | "Select freight terms" |

### Third-Party Billing

| Field | Rules | Error |
|-------|-------|-------|
| Account Number | Required | "Third-party account number is required" |
| Company Name | Required | "Third-party company name is required" |
| Contact Name | Required | "Contact name is required" |
| Contact Phone | Required, valid phone | "Valid phone number required" |
| Contact Email | Required, valid email | "Valid email address required" |

### Net Terms

| Field | Rules | Error |
|-------|-------|-------|
| Payment Period | Required | "Select a payment period" |
| Trade References | Min 3 required | "At least 3 trade references required (X of 3 provided)" |
| Per Reference: Company | Required | "Company name required" |
| Per Reference: Contact | Required | "Contact name required" |
| Per Reference: Phone | Required, valid | "Valid phone required" |
| Per Reference: Email | Required, valid | "Valid email required" |

### Corporate Account

| Field | Rules | Error |
|-------|-------|-------|
| Account Number | Required | "Account number is required" |
| Account PIN | Required, 4-6 digits | "PIN must be 4-6 digits" |

### Billing Address (when not "Same as Origin")

Same validation rules as Step 1 address fields.

---

## Step 4: Pickup Validation

| Field | Rules | Error |
|-------|-------|-------|
| Pickup Date | Required, 3+ business days from today, <= 90 days | "Select a valid pickup date" |
| Time Slot | Required, must be available for selected date | "Select an available time slot" |
| Location Type | Required | "Select a location type" |
| Ready Time | Required, 30+ min before slot start | "Ready time must be at least 30 minutes before pickup window" |
| Primary Contact Name | Required | "Primary contact name is required" |
| Primary Contact Phone | Required, valid | "Valid mobile phone required" |
| Primary Contact Email | Required, valid | "Valid email required" |
| Backup Contact Name | Required | "Backup contact is required" |
| Backup Contact Phone | Required, valid | "Valid phone required" |

### Conditional Pickup Validation

| Condition | Field | Rules |
|-----------|-------|-------|
| Location = Loading Dock | Dock Number | Optional (recommended) |
| Access = Gate Code | Gate Code | Required, max 20 chars |
| Access = Security Check-in | Security Contact | Name + Phone required |
| Loading = Driver or Full Service | (none) | Fee displayed, no extra validation |
| Declared Value > $5,000 | Special Authorization | At least one auth option required |

### Pickup Warnings (non-blocking)

| Condition | Warning |
|-----------|---------|
| Evening time slot | "Evening pickup (5-7 PM) has a $25 surcharge" |
| Weekend pickup | "Saturday pickup has a $50 surcharge. Morning slot only." |
| Construction site | "Construction site pickups require additional safety measures" |
| No equipment selected + package > 70 lbs | "Consider requesting equipment for packages over 70 lbs" |

---

## Step 5: Review / Submission Validation

### Terms & Conditions (all required)

| Acknowledgment | Required |
|----------------|----------|
| Declared value is accurate | yes |
| Insurance understanding for $2,500+ | yes (conditional) |
| Contents comply with regulations | yes |
| Carrier authorized for pickup/transport | yes |
| Hazmat certification accurate | yes (conditional, only if hazmat selected) |

### Pre-Submission Validation

Run complete validation across all steps before allowing submission:

| Check | Error |
|-------|-------|
| Step 1 complete | "Shipment details incomplete. Please review." |
| Step 2 complete (quote selected) | "No shipping option selected." |
| Step 3 complete (payment set) | "Payment information incomplete." |
| Step 4 complete (pickup scheduled) | "Pickup not scheduled." |
| All terms accepted | "Please accept all required terms." |
| Quote not expired | "Your quote has expired. Please go back to pricing and recalculate." |
| PO not expired (if PO method) | "The purchase order has expired." |

Display all errors in a `ValidationErrors` component at the top of the review page with links to the relevant step.

---

## Error Message Format

```
Field-level:  "PO amount must cover the shipment cost of $81.67"
              (specific, includes actual values)

Section-level: "3 errors in Payment Information"
               (summary, expandable to see individual errors)

Page-level:    "Please fix 5 errors before submitting"
               (top banner with scroll-to links)
```

## Real-Time vs On-Submit

| Timing | What Validates |
|--------|---------------|
| On change (debounced 300ms) | Format validation (email, phone, ZIP) |
| On blur | Required fields, range checks |
| On next step | Full step validation |
| On submit | Cross-step validation, terms, quote expiry |

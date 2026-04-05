# B2B Postal Checkout Flow -- Payment Methods

## Overview

Step 3 of the shipping flow. Five B2B-specific payment methods -- no credit cards, no consumer payment processors. All methods involve business ledgers, purchase authorization, and invoicing.

## Payment Method Selection

Display 5 selectable cards. Each card shows:
- Icon/illustration
- Method name
- One-line description
- Fee indicator (if any)
- "Most Popular" badge on Purchase Order

Selecting a card reveals the method-specific form below it.

---

## Method 1: Purchase Order (PO)

**Description**: Pay using an authorized company purchase order. Most common B2B payment method.

**Fee**: 0% (standard)

**Form Fields**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| PO Number | text | yes | Non-empty, alphanumeric + hyphens |
| PO Amount | currency | yes | Must be >= shipment total |
| Expiration Date | date | yes | Must be in the future |
| Approval Contact | text | yes | Name of PO approver |
| Department | text | no | Department or cost center name |

**Business Rules**:
- PO amount must cover the full shipment cost (including estimated pickup fees)
- If PO is expiring within 7 days, show warning: "This PO expires soon. Ensure shipment completes before expiration."
- PO number format is flexible (each company has their own format)

**Display**:
```
Payment Method: Purchase Order
PO Number: PO-2026-001234
Authorized Amount: $5,000.00
Expires: December 31, 2026
Approved By: Jane Smith
Department: IT Operations
```

---

## Method 2: Bill of Lading (BOL)

**Description**: Standard freight payment document. The BOL serves as both a receipt and a contract for carrier services.

**Fee**: 0% (standard freight)

**Form Fields**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| BOL Number | text | yes | Format: `BOL-YYYY-XXXXXX` (auto-suggest format) |
| BOL Date | date | yes | Must be <= today |
| Shipper Reference | text | yes | Reference ID from shipper |
| Freight Terms | select | yes | See options below |

**Freight Terms Options**:
| Value | Label | Description |
|-------|-------|-------------|
| `prepaid` | Prepaid | Shipper pays all freight charges |
| `collect` | Collect | Receiver pays all freight charges |
| `prepaid-add` | Prepaid & Add | Shipper pays, adds to receiver's invoice |

**Business Rules**:
- BOL date cannot be in the future
- BOL number format is suggested but not strictly enforced (companies vary)
- Freight terms affect who receives the invoice

**Display**:
```
Payment Method: Bill of Lading
BOL Number: BOL-2026-045678
Issue Date: April 5, 2026
Reference: SR-789012
Freight Terms: Prepaid
```

---

## Method 3: Third-Party Billing

**Description**: Charge shipping costs to a third-party account. Common when a customer arranges shipping on behalf of another business.

**Fee**: 2.5% processing fee

**Form Fields**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Account Number | text | yes | Non-empty |
| Company Name | text | yes | Third-party company name |
| Contact Name | text | yes | Contact at third-party |
| Contact Phone | phone | yes | Valid phone format |
| Contact Email | email | yes | Valid email format |
| Authorization Code | text | no | Optional auth code from third party |

**Business Rules**:
- 2.5% fee is shown clearly in the cost summary
- Authorization code is optional but recommended for faster processing
- Third-party company must be a valid business entity (informational note only, not validated in v1)
- Warning: "A 2.5% processing fee applies to third-party billing"

**Display**:
```
Payment Method: Third-Party Billing
Account: 4567890123
Company: Acme Logistics Inc.
Contact: Bob Wilson (bob@acme-logistics.com)
Authorization: AUTH-2026-789
Processing Fee: 2.5% (+$2.04)
```

---

## Method 4: Net Terms (Credit)

**Description**: Pay on credit terms (15-60 days). Requires credit application and trade references for new accounts.

**Fee**: 1.5% cost of capital

**Form Fields**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Payment Period | select | yes | See options below |
| Credit Application | file upload | conditional | PDF only, max 10MB |
| Trade References | repeater | yes | Minimum 3 references |
| Annual Revenue | select | no | Revenue range |

**Payment Period Options**:
| Value | Label | Description |
|-------|-------|-------------|
| `15` | Net 15 | Payment due in 15 days |
| `30` | Net 30 | Payment due in 30 days |
| `45` | Net 45 | Payment due in 45 days |
| `60` | Net 60 | Payment due in 60 days |

**Trade Reference Fields** (minimum 3):

| Field | Type | Required |
|-------|------|----------|
| Company Name | text | yes |
| Contact Name | text | yes |
| Contact Phone | phone | yes |
| Contact Email | email | yes |
| Account Number | text | no |

**Annual Revenue Ranges**:
- Under $1M
- $1M - $5M
- $5M - $25M
- $25M - $100M
- $100M - $500M
- Over $500M
- Prefer not to disclose

**Credit Application Upload**:
- Accept: PDF only
- Max size: 10MB
- Upload to Supabase Storage
- Required for first-time net terms customers
- Note: "Upload your company's credit application or financial statement"

**Business Rules**:
- 1.5% fee shown clearly: "A 1.5% cost-of-capital fee applies to net terms billing"
- Longer terms may have additional risk assessment (informational only in v1)
- 3 trade references required -- "Add Reference" button, "Remove" per reference
- Credit application upload conditional: show note "Required for new net terms accounts"

**Display**:
```
Payment Method: Net 30 Terms
Payment Due: May 5, 2026
References: 3 provided
Revenue Range: $5M - $25M
Credit Application: Uploaded
Cost of Capital Fee: 1.5% (+$1.23)
```

---

## Method 5: Corporate Account

**Description**: Charge to a pre-established corporate shipping account with negotiated rates.

**Fee**: 0% (pre-negotiated)

**Form Fields**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Account Number | text | yes | Non-empty |
| Account PIN | password | yes | 4-6 digits |
| Billing Contact | display | yes | Pre-filled, editable |

**Business Rules**:
- PIN is masked (password input)
- PIN must be 4-6 numeric digits
- Account verification is simulated (always passes in v1)
- Billing contact pre-fills from company info section
- Note: "Corporate accounts may have pre-negotiated rates. Final pricing will reflect your account terms."

**Display**:
```
Payment Method: Corporate Account
Account: ****7890
Verified: Yes
Billing Contact: John Smith (john@company.com)
Fee: $0.00 (pre-negotiated rates)
```

---

## Common Billing Information

Shared across all payment methods (displayed below the method-specific form):

### Billing Address Section

- "Same as Origin Address" checkbox (default unchecked)
- If checked: auto-fill from origin address, fields disabled
- If unchecked: full address form (reuses AddressInput component)

### Billing Contact Section

| Field | Type | Required |
|-------|------|----------|
| Full Name | text | yes |
| Title | text | no |
| Phone | phone | yes |
| Email | email | yes |
| Department | text | no |
| GL Code | text | no |
| Tax ID / EIN | text | no |

### Company Information Section

| Field | Type | Required |
|-------|------|----------|
| Legal Company Name | text | yes |
| DBA (Doing Business As) | text | no |
| Business Type | select | yes |
| Industry | select | no |
| Annual Shipping Volume | select | no |

**Business Type Options**: Sole Proprietorship, LLC, S-Corporation, C-Corporation, Partnership, Non-Profit, Government, Other

**Annual Shipping Volume Ranges**:
- Under 100 shipments/year
- 100-500
- 500-2,000
- 2,000-10,000
- 10,000-50,000
- Over 50,000

### Invoice Preferences Section

| Field | Options | Default |
|-------|---------|---------|
| Delivery Method | Email, Mail, EDI, Online Portal | Email |
| Format | Standard, Itemized, Summary, Custom | Standard |
| Frequency | Per Shipment, Weekly Batch, Monthly Batch | Per Shipment |

---

## Cost Summary Sidebar

Always visible on the right side (desktop) or bottom (mobile) of the payment page:

```
Shipment Cost Breakdown
─────────────────────────
Base Rate:              $38.68
Fuel Surcharge (10%):    $3.87
Insurance (0.5%):       $12.50
Special Handling:       $15.00
Delivery Preferences:    $8.00
Taxes (8.5%):            $3.62
─────────────────────────
Subtotal:              $81.67

Payment Method Fee:
  Third-Party (2.5%):   +$2.04
─────────────────────────
Total:                 $83.71
```

The payment method fee line updates dynamically when the user switches between methods. Methods with 0% fee show "No additional fee" in green.

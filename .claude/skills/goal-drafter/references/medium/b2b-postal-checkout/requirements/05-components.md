# B2B Postal Checkout Flow -- UI Components

## Component Architecture

All components use shadcn/ui primitives with Tailwind CSS v4 styling. The component hierarchy follows the 6-step user journey.

## Layout Components

### `ShippingLayout`

Master layout wrapper for the entire shipping flow.

- Renders Header, StepIndicator, content area, Navigation, Footer
- Handles responsive switching (mobile vs desktop step indicator)
- Manages step state and navigation callbacks

### `Header`

Top bar with branding and actions.

- Logo and portal title ("B2B Shipping Portal")
- Back button (when not on Step 1)
- Action buttons (Save Draft, Help)
- Responsive: collapses to hamburger on mobile

### `StepIndicator`

Visual progress through the 6 steps.

- **Desktop**: Full horizontal stepper with labels, connecting lines, status icons (completed checkmark, current dot, upcoming circle)
- **Mobile**: Compact progress bar with step number and label ("Step 3 of 6: Payment")
- Clickable steps for completed stages (navigate back)

### `Navigation`

Step-to-step navigation buttons.

- Previous button (disabled on Step 1)
- Next/Submit button with loading state
- Sticky positioning on mobile
- Button labels change per step ("Get Quotes", "Continue to Payment", "Submit Shipment")

### `Footer`

Professional B2B footer.

- Multi-column: Company, Support, Legal, Resources
- Contact info: phone, email
- Copyright and version

---

## Step 1: Shipment Details Components

### `PresetSelector`

Quick-start templates for common shipment types.

- 5 preset cards in a horizontal scrollable row
- Each card: icon, title, brief description
- Click fills the entire form with preset values
- "Custom Shipment" option clears to blank

### `AddressInput`

Complete address form (reused for origin and destination).

- Street address (autocomplete integration with `/api/address-search`)
- Suite/Unit
- City
- State (dropdown, filtered by country)
- ZIP code (format validation: 5-digit or ZIP+4)
- Country (US, CA, MX)
- Location type radio: Commercial, Residential, Industrial
- Contact sub-form: Name, Company, Phone, Email, Extension

### `PackageTypeSelector`

Package type selection with visual cards.

- 7 selectable cards: Envelope, Small, Medium, Large, Pallet, Crate, Multiple
- Each card: icon, label, weight limit, dimension limits
- Single selection (radio behavior)
- Selection triggers dimension/weight limit updates

### `DimensionsInput`

Package dimensions with unit toggle.

- Length, Width, Height number inputs
- Unit toggle: inches / cm
- Enforces max dimensions per package type
- Shows dimensional weight calculation in real-time

### `WeightInput`

Package weight with billing weight display.

- Weight number input
- Unit toggle: lbs / kg
- Shows: Actual Weight, Dimensional Weight, Billable Weight (max of two)
- Warning when DIM weight exceeds actual weight

### `DeclaredValueInput`

Declared value with currency selector.

- Numeric input with currency formatting
- Currency dropdown: USD, CAD, MXN
- Range: $1 - $100,000
- Warning at $2,500+ (insurance recommendation)
- Warning at $5,000+ (insurance required)

### `SpecialHandlingSelector`

Multi-select checkboxes for special handling.

- 8 options, each with: checkbox, label, fee badge (+$15, +$75, etc.)
- Selecting "Hazardous Materials" reveals `HazmatForm` sub-component
- Running total of special handling fees

### `HazmatForm`

Conditional form for hazardous materials.

- UN Number input
- Proper Shipping Name
- Hazard Class dropdown
- Packing Group (I, II, III)
- Quantity input
- Emergency Contact (name + phone)

### `MultiPieceForm`

Conditional form for multiple pieces.

- Add/remove piece buttons
- Per-piece: type, dimensions, weight, description
- Total weight and piece count summary
- Max 20 pieces

### `PackageSummary`

Summary card showing current package configuration.

- Package type, dimensions, weight
- Declared value
- Special handling list with fees
- Delivery preferences with fees
- Estimated fee subtotal
- Optimization suggestions (e.g., "Switch to Pallet for 150+ lbs")

---

## Step 2: Pricing Components

### `PricingGrid`

Main pricing display and selection interface.

- Category tabs: Ground, Air, Freight (with count badges)
- Sort controls: Price (low-high), Transit Time, Reliability
- Filter toggles: show/hide by category
- Grid of `PricingCard` components

### `PricingCard`

Individual carrier/service quote card.

- Selectable (radio behavior across all cards)
- Carrier logo, name, reliability rating (stars)
- Service name and transit time
- Estimated delivery date
- **Total price** (large, prominent)
- Feature list (3-4 bullet points)
- Carbon footprint badge
- Expandable `PriceBreakdown` section

### `PriceBreakdown`

Detailed cost breakdown (expandable within PricingCard).

- Line items: Base Rate, Fuel Surcharge (%), Insurance (%), Special Handling, Delivery Preferences, Taxes (%)
- Calculation basis: distance, weight, DIM weight, zone
- Subtotal and total

### `ShipmentSummaryBar`

Compact summary of shipment details (shown above pricing grid).

- Route: "Columbus, OH -> Atlanta, GA"
- Package: "Medium Package, 25 lbs"
- Special: "Fragile, Signature Required"
- Edit button -> back to Step 1

---

## Step 3: Payment Components

### `PaymentMethodSelector`

Payment method selection interface.

- 5 selectable cards (radio behavior)
- Each card: icon, method name, brief description, fee indicator
- Selected card expands to reveal method-specific form

### `PurchaseOrderForm`

- PO Number (text input, required)
- PO Amount (currency input, must be >= shipment total)
- Expiration Date (date picker, must be future)
- Approval Contact (text input)
- Department / Cost Center (text input)

### `BillOfLadingForm`

- BOL Number (text input, format: BOL-YYYY-XXXXXX)
- BOL Date (date picker, must be <= today)
- Shipper Reference (text input)
- Freight Terms (select: Prepaid, Collect, Prepaid & Add)

### `ThirdPartyBillingForm`

- Account Number (text input)
- Company Name (text input)
- Contact Name (text input)
- Contact Phone (phone input)
- Contact Email (email input)
- Authorization Code (text input, optional)

### `NetTermsForm`

- Payment Period (select: Net 15 / Net 30 / Net 45 / Net 60)
- Credit Application (file upload, PDF only, Supabase Storage)
- Trade References (3 minimum, add/remove)
  - Per reference: Company Name, Contact Name, Phone, Email, Account #
- Annual Revenue (select range)

### `CorporateAccountForm`

- Account Number (text input)
- Account PIN (password input, 4-6 digits)
- Billing Contact confirmation (pre-filled from company info)

### `BillingAddressSection`

- "Same as Origin" checkbox (auto-fills)
- Full address form (reuses `AddressInput` component)

### `BillingContactSection`

- Name, Title, Phone, Email
- Department, GL Code, Tax ID

### `CompanyInfoSection`

- Legal Name, DBA
- Business Type (dropdown)
- Industry (dropdown, 40+ options)
- Annual Shipping Volume (select range)

### `InvoicePreferencesSection`

- Delivery Method: Email, Mail, EDI, Portal
- Format: Standard, Itemized, Summary, Custom
- Frequency: Per Shipment, Weekly, Monthly

### `CostSummary`

Sidebar showing running total with payment method fee impact.

---

## Step 4: Pickup Components

### `PickupCalendar`

Interactive date picker for scheduling.

- Calendar grid (current month + navigation)
- Visual indicators: available (green), limited (yellow), unavailable (gray)
- Blackout dates: weekends (unless premium), holidays, past dates, beyond 90 days
- Minimum 3 business days from today highlighted
- Click date -> reveals time slots

### `TimeSlotSelector`

Time window selection for chosen date.

- 3 slots: Morning, Afternoon, Evening
- Each shows: time range, availability status, fee (if any)
- Unavailable slots are disabled with reason tooltip
- Single selection

### `PickupLocationForm`

Location type and access details.

- Location type radio: Loading Dock, Ground Level, Residential, Storage, Construction, Other
- Dock number (conditional on Loading Dock)
- Access requirements checkboxes: Call Upon Arrival, Security Check-in, Gate Code Required, Appointment Required, Limited Parking, Forklift Available, Liftgate Service (+$35)
- Gate code input (conditional)
- Special instructions text areas: Parking (200 chars), Package Location (100 chars), Driver Instructions (300 chars)

### `PickupEquipmentSelector`

Equipment needs and loading assistance.

- Equipment checkboxes: Standard Dolly, Appliance Dolly, Furniture Pads, Straps, Pallet Jack, Two-Person Team (+$45)
- Loading assistance radio: Customer Will Load, Driver Assistance (+$25), Full Service (+$65)

### `PickupContactForm`

Primary and backup contacts.

- Primary: Name, Job Title, Mobile Phone, Alt Phone, Email, Preferred Contact Method
- Backup: Name, Phone (simpler form)
- Authorized Personnel list (add/remove names)

### `NotificationPreferences`

Pickup notification settings.

- Checkboxes: Email reminder 24h, SMS reminder 2h, Call reminder 30m, Driver en route, Pickup completion, Transit updates

### `PickupGuidelinesSidebar`

Informational sidebar with pickup rules.

- Minimum lead time notice
- Same-day cutoff info
- Service area description
- Premium time slot fees
- Equipment availability

---

## Step 5: Review Components

### `ShipmentSummaryCard`

Top-level summary always visible.

- Route visualization (origin -> destination with distance)
- Service selected (carrier + service name)
- Total cost (large)
- Pickup date and time
- Estimated delivery

### `ReviewSection`

Collapsible section for each data category.

- Chevron expand/collapse toggle
- Section title and status badge
- "Edit" button linking to the relevant step
- Content area with key-value pairs

6 sections: Origin, Destination, Package, Pricing, Payment, Pickup

### `TermsAndConditions`

Legal acknowledgments.

- 4-5 checkboxes (all required)
- Link to full terms document
- Conditional hazmat acknowledgment

### `ValidationErrors`

Error display component.

- Red alert banner
- Bulleted list of validation issues
- Each error links to the relevant section/step

---

## Step 6: Confirmation Components

### `SuccessBanner`

Animated success indicator.

- Green checkmark animation (CSS)
- "Shipment Confirmed!" heading
- Confirmation number with copy button
- QR code (generate from confirmation number)

### `ConfirmationSection`

Reusable collapsible section (same pattern as ReviewSection).

Used for: Shipment Reference, Pickup Confirmation, Delivery Info, Tracking, Documentation, Contact, Next Steps, Additional Services, Record Keeping

### `CopyButton`

Copy-to-clipboard utility.

- Click to copy text
- Tooltip feedback: "Copied!"
- Used for confirmation number, tracking number

### `RecentShipments`

List of last 3 completed shipments.

- Confirmation number, date, route, status
- Click to view full confirmation

---

## Shared Components

### `ContextualHelp`

Field-level help tooltip.

- Info icon next to field labels
- Hover/click reveals help text
- Dismissible

### `FormField`

Generic form field wrapper.

- Label (with optional required indicator)
- Input slot
- Help text (below input)
- Error message (red, below help text)
- Uses React Hook Form + Zod integration

### `ProgressIndicator`

Form completion percentage.

- Circular or linear progress bar
- "X of Y required fields complete"
- Updates in real-time as user fills form

### `LoadingSpinner`

Loading state indicator for async operations.

### `ErrorBoundary`

Error handling wrapper for graceful degradation.

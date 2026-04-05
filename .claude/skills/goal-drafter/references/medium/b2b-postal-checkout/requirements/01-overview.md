# B2B Postal Checkout Flow -- Overview & User Journey

## Product Overview

A professional B2B shipping portal that guides business customers through a complete shipment creation workflow. Unlike consumer shipping (FedEx.com, UPS.com), this is designed for business-to-business logistics with:

- **No credit cards** -- B2B payment methods only (Purchase Orders, Bills of Lading, Net Terms, Corporate Accounts, Third-Party Billing)
- **Ledger-based billing** -- Invoicing, cost centers, department codes, GL codes
- **Driver scheduling** -- Pickup coordination with access requirements, equipment needs, authorized personnel
- **Multi-carrier quotes** -- Side-by-side comparison of ground, air, and freight options with transparent fee breakdowns

## User Journey (6 Steps)

### Step 1: Shipment Details Entry

The customer provides complete shipment information:

**Origin & Destination Addresses**
- Street address, suite/unit, city, state, ZIP, country
- Location type: commercial, residential, industrial, warehouse, storage, construction
- Contact info for both: name, company, phone, email, extension

**Quick-Start Presets** (5 common B2B scenarios)
Pre-fill forms with typical shipment configurations:
1. Standard Office Documents (envelope, 2 lbs, no special handling)
2. Electronics Equipment (medium package, fragile, insured)
3. Industrial Parts (large package, heavy, pallet)
4. Medical Supplies (temperature controlled, hazmat certified)
5. Trade Show Materials (multiple pieces, white glove)

**Package Configuration**
- Package type: Envelope/Document, Small Package, Medium Package, Large Package, Pallet, Crate, Multiple Pieces
- Dimensions: length x width x height (inches or cm)
- Weight: actual weight (lbs or kg), system calculates dimensional weight
- Declared value: $1 - $100,000 with currency selector (USD, CAD, MXN)
- Contents category dropdown (10+ categories): Electronics, Documents, Clothing/Textiles, Food/Perishable, Medical/Pharmaceutical, Industrial Parts, Chemicals, Fragile/Glass, Furniture, Machinery, Other
- Description field for customs/insurance

**Special Handling Options** (each with fee indicator)
| Option | Fee |
|--------|-----|
| Fragile | +$15 |
| This Side Up | +$5 |
| Temperature Controlled | +$75 |
| Hazardous Materials | +$50 |
| White Glove | +$125 |
| Inside Delivery | +$45 |
| Liftgate Pickup | +$35 |
| Liftgate Delivery | +$35 |

**Delivery Preferences**
| Preference | Fee |
|------------|-----|
| Signature Required | +$8 |
| Adult Signature | +$12 |
| SMS Confirmation | +$2 |
| Photo Proof | +$3 |
| Saturday Delivery | +$25 |
| Hold at Location | Free |

**Service Level Preference** (guides pricing sort order)
- Most Economical
- Fastest Transit
- Most Reliable
- Carbon Neutral

**Conditional Sub-Forms**
- Hazardous Materials: UN Number, Proper Shipping Name, Hazard Class, Packing Group, Quantity, Emergency Contact
- Multiple Pieces: Per-piece details (type, dimensions, weight, description) with add/remove

**Navigation**: "Start Over" (clears form), "Get Quotes" (proceeds to Step 2)

---

### Step 2: Pricing & Options Selection

Display shipping quotes from multiple carriers, organized by service category.

**Service Categories**

*Ground Services*
| Service | Transit | Base Price |
|---------|---------|-----------|
| Standard Ground | 3-7 days | ~$45.50 |
| Ground Select | 2-4 days | ~25% premium |
| Ground Express | 1-3 days | ~50% premium |

*Air Services*
| Service | Transit | Base Price |
|---------|---------|-----------|
| Air Saver | 2-3 days | ~2x ground |
| Air Express | 1-2 days | ~3x ground |
| Overnight Express | Next day by 10:30am | ~4x ground |
| Overnight Standard | Next day EOD | ~3.5x ground |

*Freight Services* (for 150+ lbs)
| Service | Transit | Pricing |
|---------|---------|---------|
| LTL Standard | 3-8 days | Per cubic foot |
| LTL Expedited | 2-5 days | ~40% premium |
| FTL | 1-4 days | Flat rate |

**Per-Quote Display**
- Carrier name and logo
- Service type and transit time
- Estimated delivery date (calendar)
- Total price (prominently displayed)
- Expandable price breakdown: Base Rate, Fuel Surcharge (8-15%), Insurance (0.5-2% of declared value), Special Handling Fees, Delivery Options, Taxes (8.5% on base+fuel)
- CO2 emissions estimate
- Carrier reliability rating
- Service features list

**Interactive Features**
- Selectable cards (radio-style, single selection)
- Filter by category (ground/air/freight)
- Sort by price, transit time, or reliability
- Side-by-side comparison mode
- Auto-save selection to database
- "Recalculate" button if details change

**Navigation**: "Back to Details" (Step 1), "Continue to Payment" (Step 3)

---

### Step 3: Payment & Billing Information

Five B2B payment methods with method-specific forms. See `08-payment-methods.md` for detailed specifications.

**Payment Methods**
1. Purchase Order (PO)
2. Bill of Lading (BOL)
3. Third-Party Billing
4. Net Terms (Credit)
5. Corporate Account

**Billing Information** (common to all methods)
- Billing address (with "Same as Origin" checkbox)
- Billing contact: Name, Title, Phone, Email
- Company information: Legal Name, DBA, Business Type, Industry (50+ options), Annual Shipping Volume
- Tax ID / EIN
- GL Code / Cost Center
- Invoice preferences: Delivery Method (Email/Mail/EDI/Portal), Format (Standard/Itemized/Summary/Custom), Frequency (Per Shipment/Weekly/Monthly)

**Navigation**: "Back to Pricing" (Step 2), "Continue to Pickup" (Step 4)

---

### Step 4: Pickup Scheduling

Schedule a driver to pick up the shipment. See `07-pickup-scheduling.md` for detailed specifications.

**Core Elements**
- Interactive calendar (3+ business days forward, up to 3 weeks)
- Time slot selection: Morning (8am-12pm), Afternoon (12pm-5pm), End of Day (5pm-7pm +$25)
- Location type and access requirements
- Primary and backup contact
- Equipment needs and loading assistance
- Special instructions (gate code, parking, package location, driver notes)
- Notification preferences

**Navigation**: "Back to Payment" (Step 3), "Continue to Review" (Step 5)

---

### Step 5: Review & Confirmation

Full review of all shipment details before submission.

**Expandable Sections** (each with "Edit" button linking to respective step)
1. Origin Details (address, contact, pickup instructions)
2. Destination Details (address, contact)
3. Package Details (type, dimensions, weight, DIM weight, declared value, contents, special handling)
4. Pricing Breakdown (detailed cost analysis with all line items)
5. Payment Information (method, PO/BOL details, billing contact, billing address)
6. Pickup Schedule (date, time window, ready time, contacts, special instructions)

**Shipment Summary Card** (always visible)
- Route: Origin City, ST -> Destination City, ST (with distance)
- Service: Carrier name + service type (transit time)
- Total Cost (prominent)
- Pickup: Date + time window
- Estimated Delivery: Date

**Terms & Conditions** (required acknowledgments)
- [ ] Declared value is accurate
- [ ] Understand additional insurance may be required for $2,500+
- [ ] Package contents comply with all applicable regulations
- [ ] Authorize carrier to pick up and transport shipment
- [ ] Hazmat certification accurate (if applicable)

**Action Buttons**: Edit Shipment, Save as Draft, Print Summary, Submit Shipment, Start Over

**Navigation**: "Back to Pickup" (Step 4), "Submit Shipment" (final)

---

### Step 6: Confirmation Page

Post-submission confirmation with all reference information.

**Success Banner**
- Green checkmark animation
- Confirmation number: `SHP-YYYY-XXXXXX` format (copyable)
- QR code linking to tracking page

**Shipment Reference**
- Customer Reference number
- Carrier assignment
- Service level selected
- Total cost charged

**Pickup Confirmation**
- Scheduled date and time window
- Status: "Confirmed"
- What to expect (driver will call, bring shipping label, etc.)

**Delivery Information**
- Estimated delivery date/time
- Delivery address
- Contact person
- Special instructions

**Tracking Information**
- Tracking number (available 2-4 hours after pickup)
- Link to carrier tracking page
- SMS/email update preferences

**Package Documentation**
- Shipping label status (generated/pending)
- Required documents checklist (commercial invoice, hazmat forms, etc.)
- Download options (PDF, CSV, .ics calendar event)

**Contact Information**
- 24/7 Customer Service (phone, email, live chat)
- Account Manager (for large accounts)
- Claims Department
- Emergency contact

**Next Steps Checklist**
- Before pickup: Ensure package ready, label attached, access confirmed
- After pickup: Track shipment, confirm delivery, file claims if needed

**Additional Actions**
- Add Insurance (within 24 hours)
- Change Delivery Address
- Hold at Location
- Schedule Another Shipment
- Repeat This Shipment (copy details to new order)

**Recent Shipments** (last 3)
- Quick links to past confirmations

# B2B Postal Checkout Flow -- Pickup & Scheduling

## Overview

Step 4 of the shipping flow. Scheduling a driver to pick up the shipment is a complex, multi-faceted process involving date/time selection, location configuration, access instructions, equipment needs, contacts, and notifications.

## Pickup Calendar Interface

### Date Selection

**Calendar Grid**
- Displays current month with forward/back navigation
- Cannot navigate before today
- Cannot navigate beyond 90 days from today

**Date States**
| State | Visual | Behavior |
|-------|--------|----------|
| Available | Green background, cursor pointer | Selectable, shows time slots |
| Limited | Yellow/amber background, cursor pointer | Selectable, some slots unavailable |
| Unavailable | Gray background, cursor not-allowed | Not selectable, shows reason on hover |
| Selected | Primary color ring/border | Currently chosen date |
| Today | Subtle dot indicator | Visual reference only |
| Past | Dimmed, strikethrough | Not selectable |

**Unavailability Reasons**
- Past date
- Weekend (unless premium enabled)
- Federal holiday
- Within minimum lead time (3 business days)
- Beyond maximum advance (90 days)
- Capacity restriction (simulated)

### Time Slot Selection

After a date is selected, display available time slots:

| Slot ID | Display | Hours | Standard Fee |
|---------|---------|-------|-------------|
| `morning` | 8:00 AM - 12:00 PM | 4 hours | $0 |
| `afternoon` | 12:00 PM - 5:00 PM | 5 hours | $0 |
| `evening` | 5:00 PM - 7:00 PM | 2 hours | +$25 |

**Weekend/Holiday Slots** (when available):
| Slot ID | Display | Hours | Fee |
|---------|---------|-------|-----|
| `saturday-morning` | 9:00 AM - 12:00 PM | 3 hours | +$50 |

**Slot States**
- Available: selectable, shows fee
- Limited: selectable, shows "Limited availability" + fee
- Unavailable: disabled, shows reason (e.g., "Booked", "Outside service hours")

### Package Ready Time

- Time picker (30-minute increments)
- Must be at least 30 minutes before selected time slot start
- Example: Morning slot (8:00 AM) -> Ready time must be by 7:30 AM
- Default: 30 minutes before slot start

---

## Location Configuration

### Location Type

Radio button selection:

| Type | ID | Surcharge | Notes |
|------|-----|-----------|-------|
| Loading Dock | `loading-dock` | $0 | Shows dock number field |
| Ground Level | `ground-level` | $0 | Standard ground pickup |
| Residential | `residential` | +$15 | Limited access warning |
| Storage Facility | `storage-facility` | $0 | May show appointment note |
| Construction Site | `construction-site` | +$25 | Safety notice shown |
| Other | `other` | TBD | Shows description field |

### Conditional Fields by Location Type

**Loading Dock**:
- Dock Number (text, e.g., "Bay 3", "Dock 12-A")

**Residential**:
- Warning banner: "Residential pickups may require additional time and have a $15 surcharge"

**Construction Site**:
- Warning banner: "Construction site pickups require safety equipment and have a $25 surcharge"
- Description field for specific directions

**Other**:
- Description field (required): describe the location type

### Access Requirements

Multi-select checkboxes:

| Requirement | ID | Fee | Shows |
|-------------|-----|-----|-------|
| Call Upon Arrival | `call-upon-arrival` | $0 | Contact preference note |
| Security Check-in | `security-checkin` | $0 | Security contact field |
| Gate Code Required | `gate-code` | $0 | Gate code input field |
| Appointment Required | `appointment-required` | $0 | Appointment scheduling note |
| Limited Parking | `limited-parking` | $0 | Parking instructions field |
| Forklift Available | `forklift-available` | $0 | Equipment note |
| Liftgate Service | `liftgate-service` | +$35 | Fee notice |

### Conditional Fields by Access Requirement

**Gate Code Required**:
- Gate Code input (text, max 20 chars, masked display option)

**Security Check-in**:
- Security Contact: Name + Phone

**Limited Parking**:
- Parking instructions (textarea, max 200 chars)

---

## Special Instructions

Four text areas for driver guidance:

| Field | Max Length | Placeholder |
|-------|-----------|-------------|
| Gate Code / Access | 200 chars | "Enter gate code, buzzer instructions, or access card info..." |
| Parking / Loading | 200 chars | "Describe where the driver should park and load the shipment..." |
| Package Location | 100 chars | "Where exactly is the package? (e.g., reception desk, warehouse bay 3)" |
| Driver Instructions | 300 chars | "Any additional instructions for the driver..." |

---

## Equipment & Loading

### Equipment Needs

Multi-select checkboxes:

| Equipment | ID | Fee |
|-----------|-----|-----|
| Standard Dolly | `standard-dolly` | $0 |
| Appliance Dolly | `appliance-dolly` | $0 |
| Furniture Pads | `furniture-pads` | $0 |
| Straps / Tie-downs | `straps` | $0 |
| Pallet Jack | `pallet-jack` | $0 |
| Two-Person Team | `two-person-team` | +$45 |

### Loading Assistance

Radio selection (single choice):

| Option | ID | Fee | Description |
|--------|-----|-----|-------------|
| Customer Will Load | `customer` | $0 | Default. Customer places package on vehicle. |
| Driver Assistance | `driver` | +$25 | Driver helps load with available equipment. |
| Full Service Loading | `fullservice` | +$65 | Driver handles entire loading process. |

---

## Contact Management

### Primary Contact (Required)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Full Name | text | yes | Auto-filled from origin contact |
| Job Title | text | no | |
| Mobile Phone | phone | yes | For same-day communication |
| Alternative Phone | phone | no | Office/landline |
| Email | email | yes | For notifications |
| Preferred Contact Method | radio | yes | Phone / Email / Text |

### Backup Contact (Required)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Full Name | text | yes | Different from primary |
| Phone | phone | yes | |
| Email | email | no | |

### Authorized Personnel

List of people authorized to release the shipment to the driver:

- Primary contact auto-added
- Add additional names (free text list, add/remove)
- "Anyone at Location" toggle (bypasses list)
- Authorization level per person: Full, Limited, Notification-Only

### Special Authorization (for high-value shipments)

Conditional section shown when declared value > $5,000:

| Requirement | Description |
|-------------|-------------|
| ID Verification | Driver must verify photo ID of authorized person |
| Signature Required | Written signature on release form |
| Photo ID Matching | Driver photographs ID and matches to name |

---

## Notification Preferences

Checkboxes for automated notifications:

| Notification | ID | Default | Channel |
|-------------|-----|---------|---------|
| Email reminder (24 hours before) | `email-reminder-24h` | ON | Email |
| SMS reminder (2 hours before) | `sms-reminder-2h` | ON | SMS |
| Call reminder (30 min before) | `call-reminder-30m` | OFF | Phone |
| Driver en route | `driver-enroute` | ON | SMS + Email |
| Pickup completed | `pickup-completion` | ON | SMS + Email |
| Transit updates | `transit-updates` | ON | Email |

---

## Premium/Weekend Options

### Saturday Pickup

- Fee: +$50
- Available: Morning only (9:00 AM - 12:00 PM)
- Requirements: Must be booked 5+ business days in advance
- Limited to Metropolitan and Standard service zones

### Holiday Pickup

- Fee: +$75
- Availability: Case-by-case (most holidays unavailable)
- Requires manual confirmation

### After-Hours Pickup

- Evening slot (5-7 PM): +$25 (standard)
- Late evening (7-9 PM): Not available in v1

---

## Pickup Fee Summary

The pickup step calculates a running total of all pickup-related fees:

```
Pickup Fees:
  Time slot fee:           $0.00  (or +$25 evening, +$50 weekend)
  Location surcharge:      $0.00  (or +$15 residential, +$25 construction)
  Equipment fees:          $0.00  (or +$45 two-person team)
  Loading assistance:      $0.00  (or +$25 driver, +$65 full service)
  Access requirements:     $0.00  (or +$35 liftgate)
  ─────────────────────────────
  Total Pickup Fees:       $0.00
```

This total is added to the shipment total shown on the Review page.

---

## Service Area Impact

The ZIP code from the origin address determines service area, which affects:

| Factor | Metropolitan | Standard | Limited | Remote |
|--------|-------------|----------|---------|--------|
| Min Lead Days | 3 | 3 | 5 | 7 |
| Time Slots | All 3 | All 3 | Morning only | Morning only |
| Weekend | Available | Available | Not available | Not available |
| Equipment | All | Standard | Basic | Limited |
| Two-Person | Available | Available | Not available | Not available |
| Full Service | Available | Available | Driver only | Not available |

Display service area info in the `PickupGuidelinesSidebar` component.

# Form Builder Component

## Overview

A drag-and-drop form builder component that lets authors create contact forms, lead generation forms, surveys, and other data collection forms. Form submissions are stored in Supabase and optionally forwarded via email.

## Component Definition

Add to the `components` table seed:

| Field | Value |
|-------|-------|
| type | `form` |
| label | Form |
| icon | `FormInput` |
| description | Build custom forms with validation and submission handling |

## Props Schema

```typescript
interface FormProps {
  formId: string;                   // Reference to a form definition
  title?: string;
  description?: string;
  fields: FormField[];
  submitButtonText: string;
  successMessage: string;
  variant: 'default' | 'card' | 'inline';
  notifyEmail?: string;            // Email to notify on submission
}

interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'number' | 'date' | 'file';
  label: string;
  placeholder?: string;
  required: boolean;
  helpText?: string;
  validation?: FormValidation;
  options?: string[];              // For select, radio, checkbox
  defaultValue?: string;
  width: 'full' | 'half';         // Layout: full width or half (side by side)
}

interface FormValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;               // Regex pattern
  min?: number;                   // For number type
  max?: number;
  customMessage?: string;         // Error message
}
```

## Default Props

```json
{
  "formId": "",
  "title": "Contact Us",
  "description": "Fill out the form below and we'll get back to you.",
  "fields": [
    {"id": "f1", "type": "text", "label": "Full Name", "placeholder": "John Doe", "required": true, "width": "half"},
    {"id": "f2", "type": "email", "label": "Email", "placeholder": "john@example.com", "required": true, "width": "half"},
    {"id": "f3", "type": "select", "label": "Subject", "required": true, "options": ["General Inquiry", "Support", "Sales", "Other"], "width": "full"},
    {"id": "f4", "type": "textarea", "label": "Message", "placeholder": "How can we help?", "required": true, "width": "full"}
  ],
  "submitButtonText": "Send Message",
  "successMessage": "Thank you! We'll be in touch soon.",
  "variant": "default"
}
```

## Form Submissions Storage

### Database Table

```sql
CREATE TABLE form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  form_id TEXT NOT NULL,
  data JSONB NOT NULL,
  submitted_by_ip TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_spam BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_form_submissions_site ON form_submissions(site_id, submitted_at DESC);
CREATE INDEX idx_form_submissions_form ON form_submissions(form_id, submitted_at DESC);
CREATE INDEX idx_form_submissions_read ON form_submissions(site_id, is_read);
```

### Submission Data Format

```json
{
  "Full Name": "John Doe",
  "Email": "john@example.com",
  "Subject": "General Inquiry",
  "Message": "I'd like to learn more about PageForge."
}
```

## Submission API Route

`POST /api/forms/submit`

```typescript
interface SubmitFormRequest {
  siteId: string;
  pageId?: string;
  formId: string;
  data: Record<string, string>;
}
```

### Server-Side Validation

1. Validate required fields are present
2. Validate email format for email fields
3. Validate against field-level validation rules (minLength, pattern, etc.)
4. Basic spam detection:
   - Honeypot field (hidden field that should be empty)
   - Rate limiting (max 5 submissions per IP per minute)
5. Store submission in `form_submissions` table
6. If `notifyEmail` is set, send notification (see below)

### Email Notification

When a form has a `notifyEmail` configured:
- Use Supabase Edge Functions or a Next.js API route to send email
- Email contains: form title, all field values, timestamp, page URL
- Use a transactional email service if available (Resend, SendGrid) or Supabase's built-in email (limited)
- Email sending is fire-and-forget — don't block the submission response

## Submissions Dashboard

`/dashboard/[siteId]/forms` — accessible from site sidebar:

### Submissions List

- Table view of all form submissions, newest first
- Columns: Form Name, Key Fields (first 2-3 field values), Submitted At, Status (Read/Unread)
- Filter by form, date range, read/unread
- Click a row to view full submission details
- Bulk actions: Mark as Read, Mark as Spam, Delete

### Submission Detail

- Full display of all submitted fields
- Mark as read/unread toggle
- Mark as spam toggle
- Delete submission (soft delete)
- Reply link (opens email client with submitter's email)

### Export

- "Export CSV" button exports filtered submissions as a CSV file
- Columns: all form fields flattened + metadata (submitted_at, page, IP)

## Property Editor

The form property editor needs a field builder interface:

```
┌─────────────────────────────────┐
│ Form Settings                   │
│                                 │
│ Title: [Contact Us__________]   │
│ Description: [Fill out the...] │
│ Submit Button: [Send Message]   │
│ Success Message: [Thank you!]   │
│ Notify Email: [admin@site.com]  │
│ Variant: [Default ▼]           │
│                                 │
│ ─── Form Fields ───             │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ Full Name [text] (req) [x]│ │
│ │    Width: [Half ▼]          │ │
│ │    [Edit Validation]        │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ Email [email] (req)  [x] │ │
│ │    Width: [Half ▼]          │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ Subject [select] (req)[x]│ │
│ │    Options: General, Support│ │
│ │    Width: [Full ▼]          │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⋮⋮ Message [textarea] (req)[x]│
│ │    Width: [Full ▼]          │ │
│ └─────────────────────────────┘ │
│                                 │
│ [+ Add Field]                   │
└─────────────────────────────────┘
```

### Add Field Dialog

When clicking "+ Add Field", show a type selector:
- Text, Email, Phone, Number, Date
- Textarea (multi-line)
- Select (dropdown), Radio (single choice), Checkbox (multi-choice)
- File Upload

After selecting type, the field is added to the list with default settings.

## Renderer Variants

### Default
- Standard stacked form with labels above inputs
- Fields marked as `width: "half"` sit side by side in a 2-column grid

### Card
- Form wrapped in a card with shadow and rounded corners
- Padded interior, centered on the page

### Inline
- Compact single-row layout for simple forms (e.g., email newsletter signup)
- Fields and submit button on the same line
- Only works well for 1-2 fields

## Client-Side Validation

- Real-time validation as user types (after first blur)
- Error messages below each field in red
- Submit button disabled when form has validation errors
- Focus first invalid field on submit attempt
- HTML5 validation attributes as baseline (`required`, `type="email"`, `minlength`, etc.)
- Custom validation via the `validation.pattern` regex

## Accessibility

- All fields have associated `<label>` elements
- Error messages linked via `aria-describedby`
- `aria-invalid="true"` on invalid fields
- `aria-required="true"` on required fields
- Form submission feedback announced via `aria-live="polite"` region
- Tab order follows visual order

## RLS Policies

### form_submissions
- SELECT: Admins can see all submissions for their sites. Authors can see submissions for pages they created.
- INSERT: Public (unauthenticated) — forms are submitted by site visitors
- UPDATE: Admin only (marking read/spam)
- DELETE: Admin only

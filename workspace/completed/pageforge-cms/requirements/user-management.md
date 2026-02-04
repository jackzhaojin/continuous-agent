# User Management

## Overview

Admin users can manage team members, assign roles, invite new users, and control access to sites. This extends beyond the basic auth in the main PROMPT.md to cover the full user management experience.

## User Roles (Extended)

Expand from 2 roles to 3:

| Role | Description |
|------|-------------|
| `viewer` | Can view published pages and dashboard (read-only). Cannot edit content. |
| `author` | Can create/edit pages, upload media, submit for review. Cannot publish. |
| `admin` | Full access: publish, manage users, manage site settings, manage templates. |

### Database Update

```sql
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('viewer', 'admin', 'author'));
```

## User Management Page

`/dashboard/[siteId]/settings/team` — admin only:

### User List

```
┌──────────────────────────────────────────────────────────┐
│ Team Members                              [+ Invite User]│
│                                                          │
│ ┌────────────────────────────────────────────────────┐   │
│ │ [Avatar] John Doe          admin@pageforge.dev     │   │
│ │          Admin             Joined: Jan 1, 2026     │   │
│ │          Last active: 2 hours ago   [Edit] [···]  │   │
│ ├────────────────────────────────────────────────────┤   │
│ │ [Avatar] Jane Smith        author@pageforge.dev    │   │
│ │          Author            Joined: Jan 5, 2026     │   │
│ │          Last active: 1 day ago     [Edit] [···]  │   │
│ ├────────────────────────────────────────────────────┤   │
│ │ [Avatar] Bob Wilson        bob@pageforge.dev       │   │
│ │          Viewer            Joined: Jan 10, 2026    │   │
│ │          Last active: 5 days ago    [Edit] [···]  │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ─── Pending Invitations ───                              │
│                                                          │
│ ┌────────────────────────────────────────────────────┐   │
│ │ new@example.com   Author   Invited: Jan 12, 2026  │   │
│ │                            [Resend] [Revoke]       │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### User Actions

| Action | Who Can Do | Description |
|--------|-----------|-------------|
| Change role | Admin | Dropdown to switch between viewer/author/admin |
| Remove from site | Admin | Remove user's access (doesn't delete account) |
| View activity | Admin | Link to activity log filtered by this user |
| Disable account | Admin | Set user as inactive (can't login) |

### Self-Protection

- Admins cannot demote themselves (prevent lockout)
- At least one admin must exist per site (prevent orphan sites)
- Removing the last admin shows error: "Cannot remove the last admin"

## Invite System

### Invitations Table

```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'author' CHECK (role IN ('viewer', 'author', 'admin')),
  invited_by UUID NOT NULL REFERENCES profiles(id),
  token TEXT NOT NULL UNIQUE,      -- Secure random token for invite link
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, email, status)   -- One pending invite per email per site
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_site ON invitations(site_id, status);
```

### Invite Flow

1. Admin clicks "Invite User" → modal with email input and role selector
2. System creates an invitation record with:
   - Secure random token (32 bytes, URL-safe base64)
   - Expiration: 7 days from now
3. Send invite email to the address (or display invite link if email not configured)
4. Invite link format: `https://[app-url]/invite/[token]`
5. When invitee clicks the link:
   - If they have an account: redirect to login → on success, add to site with role
   - If no account: redirect to register → on success, create account + add to site
6. Invitation status → `accepted`, `accepted_at` set
7. Show success: "You've been added to [site name] as [role]"

### Invite Link Page

`/invite/[token]`:

- Validate token: exists, not expired, not revoked
- Show: "You've been invited to join [site name] as [role]"
- Two buttons: "Sign in to accept" / "Create account to accept"
- If token is invalid/expired: "This invitation has expired or been revoked"

### Invitation Expiry

- Default expiry: 7 days
- Admin can resend invitation (creates new token, resets expiry)
- Expired invitations show "Expired" status in the team page
- Admin can revoke pending invitations

## User Profile

### Profile Page

`/dashboard/profile` — accessible from user dropdown in header:

| Field | Type | Editable |
|-------|------|----------|
| Display Name | Text input | Yes |
| Email | Text (read-only, from Supabase Auth) | No (change via Supabase Auth) |
| Avatar | Image upload (media library) | Yes |
| Role | Badge (read-only) | No (admin changes it) |
| Joined | Date (read-only) | No |

### Password Change

- "Change Password" button → form with:
  - Current password
  - New password (min 8 chars)
  - Confirm new password
- Uses Supabase Auth `updateUser({ password })` API
- Success: "Password updated successfully"

### Active Sessions

Show a list of active sessions (from Supabase Auth):
- Device/browser info
- IP address (approximate location)
- Last active timestamp
- "Sign out other sessions" button

## Profile Auto-Creation

When a new user signs up via Supabase Auth:

### Database Trigger

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'author'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## RLS Policies

### profiles (updated)
- SELECT: All authenticated users can view all profiles
- UPDATE: Users can update their own profile (display_name, avatar_url)
- Role changes: Only admins (checked in application layer, not RLS — since role column update needs elevated permissions)

### invitations
- SELECT: Admins can view all invitations for their sites. Invitees can view their own (by token).
- INSERT: Admin only
- UPDATE: Admin (revoke) or system (accept)
- DELETE: None (keep audit trail)

# ADR-001: Unified Login and Vendor Account Deletion

## Status
Accepted

## Date
2026-05-16

## Context
The site had two separate login pages: `admin-login.html` for super admins and `vendor-login.html` for vendors. The nav "Sign In" button pointed to the vendor login, making the admin login inaccessible from the UI — an admin had to know the URL directly. This caused confusion.

Additionally, there was no way for vendors to delete their own accounts or for admins to remove vendor accounts from the system, leaving orphaned data.

Key requirements:
- One login page for everyone — role detection determines the redirect
- Vendors can self-delete their account
- Admin can delete any vendor account (removes the Auth user + cascades profile delete)
- Backward compatibility: existing bookmarks to old login pages still work
- No Edge Functions or build step changes

## Decision

### 1. Unified Login (`login.html`)
Created a single `login.html` that handles both admin and vendor sign-in. After Supabase Auth login, the JWT `app_metadata.role` is checked:
- `admin_role` → `admin.html`
- `vendor_role` → `vendor-dashboard.html`
- Unrecognized role → error message

The optional service key field (for admin photo management) remains as a collapsed `<details>` section — harmless for vendors to see.

Old `admin-login.html` and `vendor-login.html` now redirect to `login.html` via `window.location.replace()`, preserving bookmark compatibility.

### 2. Nav Change
All `href="vendor-login.html" class="nav-cta">Sign In` links across all 17 pages changed to `href="login.html"`. Footer/bottom-tab vendor links remain unchanged.

### 3. Vendor Self-Delete
- New RLS policy `vendor_delete_own_profile` on `vendor_profiles` — allows `DELETE WHERE auth.uid() = auth_user_id`
- `deleteVendorAccount(profileId)` in `vendor-auth.js` — DELETE via REST API with vendor JWT, then clears session
- "Delete Account" button in vendor dashboard with two-step confirmation

Note: The Supabase Auth user becomes orphaned (no service key available client-side). The profile deletion is sufficient to revoke access since `vendor-login` checks for an existing profile.

### 4. Admin Delete Vendor
- New RLS policy `admin_delete_profiles` on `vendor_profiles` — allows `DELETE WHERE app_metadata.role = 'admin_role'`
- `adminDeleteVendor(authUserId)` in `vendor-auth.js` — DELETE Supabase Auth user via admin API with service key
- `ON DELETE CASCADE` on `vendor_profiles.auth_user_id` automatically removes the profile when the Auth user is deleted
- "Manage Vendors" section in admin dashboard showing all registered vendors with a Delete button (two-step confirmation)

## Alternatives Considered

### Keep two separate login pages
- Pros: Minimal change
- Cons: Confusing nav, admin login hidden from users
- Rejected: Unified login is simpler and more discoverable

### Edge Function for vendor self-delete
- Pros: Could cleanly delete both profile and Auth user
- Cons: Requires deploying/maintaining an Edge Function, more complex
- Rejected: Profile deletion is sufficient to revoke access; no Edge Function needed

### Soft-delete (status = 'deleted') instead of actual DELETE
- Pros: Data recovery possible
- Cons: Orphaned data accumulates, more complex UI
- Rejected: Hard delete is simpler and matches the "permanent" UX promise

## Consequences
- One URL for all sign-ins: `https://walkingfish.gm/login`
- Nav is no longer confusing — one "Sign In" button for everyone
- Existing bookmarks to `/admin-login` and `/vendor-login` still work (redirect)
- Vendors can permanently remove their accounts
- Admins can clean up vendor accounts from the dashboard (requires service key, already in sessionStorage for photo management)
- Migration must be applied to Supabase before delete features work

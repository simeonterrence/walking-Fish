# Spec: Supabase Auth & Vendor Admin Migration

## Objective

Replace the current localStorage-based vendor/admin system with Supabase Auth + database tables. The public vendor application form, admin approval workflow, invite-based vendor registration, and vendor login/dashboard should all persist in Supabase with proper Row Level Security.

**Users:**
- **Public visitors** — submit vendor applications (no auth required)
- **Super admins** — log in via Supabase Auth, review applications, approve/reject, generate invite links
- **Vendors** — receive invite token, set password via Supabase Auth signup, log in, access vendor dashboard

**Success Criteria:**
- All vendor/admin data lives in Supabase tables (not localStorage)
- Authentication uses Supabase Auth (email/password with JWT), not base64 localStorage
- RLS policies enforce access control on every table
- Existing `vendor-auth.js` is replaced with Supabase REST API calls
- Admin and vendor sessions use Supabase Auth JWT tokens (stored in sessionStorage)
- Existing HTML pages continue to work without a build step

## Tech Stack

- **Auth**: Supabase Auth (built-in email/password, JWT sessions)
- **Database**: PostgreSQL via Supabase (existing `anigcqdquakinlzvyaur` project)
- **API**: Supabase REST API (direct `fetch()` calls with JWT/anonymous tokens — no JS client library, consistent with existing `photos.js` pattern)
- **Frontend**: Existing static HTML + vanilla JS (unchanged architecture)
- **Role claim**: Stored in `raw_app_meta_data` on Auth user (NOT `user_metadata` — that's user-editable)
  - Admin role: `{"role": "admin_role"}`
  - Vendor role: `{"role": "vendor_role"}`

## Supabase Auth Integration

Use **Supabase Auth REST API** directly (no JS client library):

| Operation | Endpoint | Auth |
|-----------|----------|------|
| Admin sign in | `POST /auth/v1/token?grant_type=password` | anon key |
| Vendor sign in | `POST /auth/v1/token?grant_type=password` | anon key |
| Vendor sign up (invite) | `POST /auth/v1/signup` | anon key |
| Sign out | `POST /auth/v1/logout` | user JWT |
| Get current user | `GET /auth/v1/user` | user JWT |
| Create admin user (seed) | `POST /auth/v1/admin/users` | service role key |

## Session Strategy

Replace current `sessionStorage.wf_session` with direct JWT storage:

- **On login**: Store `access_token`, `refresh_token`, and decoded JWT payload in sessionStorage
- **Auth check**: Decode JWT's `app_metadata.role` to determine `admin_role` vs `vendor_role`
- **Token refresh**: When API returns 401, use `refresh_token` to get a new `access_token`
- **On logout**: POST to `/auth/v1/logout` + clear sessionStorage

## Database Tables

### 1. `vendor_applications`

Public submission form → admin review queue.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_name` | `text` | NOT NULL | |
| `contact_name` | `text` | NOT NULL | |
| `email` | `text` | NOT NULL | |
| `phone` | `text` | | Optional |
| `category` | `text` | NOT NULL | food & beverage, merchandise, games & activities, sponsor |
| `message` | `text` | NOT NULL | |
| `status` | `text` | NOT NULL, default `'pending'` | pending, approved, rejected |
| `created_at` | `timestamptz` | default `now()` | |
| `updated_at` | `timestamptz` | default `now()` | |

**RLS:**
- `anon` can INSERT (public form submission)
- `authenticated` with `admin_role` can SELECT all, UPDATE status
- All others: no access

### 2. `vendor_profiles`

Linked to Supabase Auth users — one profile per approved vendor.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `auth_user_id` | `uuid` | UNIQUE, NOT NULL, FK → `auth.users.id` | Links to Supabase Auth |
| `business_name` | `text` | NOT NULL | |
| `contact_name` | `text` | NOT NULL | |
| `email` | `text` | NOT NULL | |
| `phone` | `text` | | |
| `category` | `text` | NOT NULL | |
| `status` | `text` | NOT NULL, default `'active'` | active, suspended |
| `application_id` | `uuid` | FK → `vendor_applications.id` | Which application created this |
| `created_at` | `timestamptz` | default `now()` | |
| `updated_at` | `timestamptz` | default `now()` | |

**RLS:**
- `authenticated` with matching `auth_user_id = auth.uid()` can SELECT own profile
- `authenticated` with `admin_role` can SELECT all, UPDATE status
- `authenticated` can INSERT their own profile (`auth_user_id = auth.uid()`) — used during vendor setup

### 3. `invite_tokens`

Admin generates these when approving an application. Vendor uses one to sign up.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `application_id` | `uuid` | FK → `vendor_applications.id` | |
| `email` | `text` | NOT NULL | Must match application email |
| `token` | `text` | UNIQUE, NOT NULL | Crypto-random token string |
| `used` | `boolean` | NOT NULL, default `false` | |
| `expires_at` | `timestamptz` | NOT NULL | 7 days from creation |
| `created_at` | `timestamptz` | default `now()` | |

**RLS:**
- `anon` can SELECT unexpired, unused tokens (for validation on vendor-setup page) — limited to `token` and `email` fields
- `authenticated` with `admin_role` can SELECT all, INSERT, UPDATE
- `authenticated` can mark own token as used (WHERE `email = auth.jwt() ->> 'email'` AND `used = false`)
- All others: no access

## RLS Policy Summary

| Table | anon (public) | authenticated (vendor) | authenticated (admin) |
|-------|--------------|----------------------|----------------------|
| `vendor_applications` | INSERT only | nothing | SELECT + UPDATE |
| `vendor_profiles` | nothing | SELECT/UPDATE own | SELECT all + UPDATE status |
| `invite_tokens` | SELECT (by token+email, unused only) | UPDATE used flag on own | SELECT + INSERT + UPDATE |

## Admin Seeding

- Initial admin account created via SQL migration (runs once):
  ```sql
  -- Uses supabase.auth.admin_create_user() or direct auth.users insert
  -- Sets app_metadata: {"role": "admin_role"}
  ```
- Additional admins can be created via Supabase Dashboard → Authentication → Users
- No separate `admin_users` table needed — role is in Auth `app_metadata`

## Auth Flows

### Admin Login
1. `POST /auth/v1/token?grant_type=password` with email + password
2. Decode JWT, check `app_metadata.role === 'admin_role'`
3. Store access_token + user info in sessionStorage
4. Redirect to `admin.html`

### Vendor Application (Public)
1. Fill form on `vendors.html`
2. `POST /rest/v1/vendor_applications` with anon key (RLS allows INSERT)
3. Show gift modal with confirmation

### Admin Approval + Invite Generation
1. Admin sees pending applications on `admin.html`
2. Click "Approve" → `PATCH /rest/v1/vendor_applications?id=eq.{id}` with status='approved'
3. Auto-generate invite token → `POST /rest/v1/invite_tokens` (admin RLS allows INSERT)
4. Show invite link modal (existing UX)

### Vendor Setup (Invite Redemption)
1. Vendor visits `vendor-setup.html?token={id}`  
2. `GET /rest/v1/invite_tokens?token=eq.{token}&used=eq.false` (anon can SELECT)
3. Show business name, prompt for password
4. `POST /auth/v1/signup` with email + password (creates Auth user)
5. `POST /rest/v1/vendor_profiles` with JWT (creates profile linked to auth user)
6. `PATCH /rest/v1/invite_tokens?id=eq.{id}` with `used=true` (vendor's RLS allows)
7. Show success → link to vendor-login.html

### Vendor Login
1. `POST /auth/v1/token?grant_type=password` with email + password
2. Decode JWT, check `app_metadata.role === 'vendor_role'`
3. Fetch profile from `vendor_profiles` via REST (JWT auth)
4. Store access_token + profile in sessionStorage
5. Redirect to `vendor-dashboard.html`

### Vendor Dashboard
1. Read session from sessionStorage (JWT + profile data)
2. Display business name, category, status from stored profile
3. "Sign Out" → `POST /auth/v1/logout` + clear sessionStorage

## Project Structure (Files to Touch)

```
/ (root)
├── supabase/
│   └── migrations/          → New migration: create tables + RLS
├── vendor-auth.js           → REWRITTEN: localStorage → Supabase REST + Auth API
├── admin-login.html         → UPDATED: calls Supabase Auth REST API
├── admin.html               → UPDATED: Supabase REST for CRUD + invite generation
├── vendor-setup.html        → UPDATED: Supabase Auth signup + REST profile creation
├── vendor-login.html        → UPDATED: Supabase Auth REST API
├── vendor-dashboard.html    → UPDATED: reads from sessionStorage JWT
├── vendors.html             → UPDATED: POST to Supabase REST instead of localStorage
├── supabase-config.js       → UNCHANGED (already has URL + anon key)
├── docs/
│   └── spec-supabase-auth-migration.md  → This spec
```

## Migration Plan

1. **Create migration SQL** — `supabase/migrations/` file with:
   - CREATE TABLE statements for `vendor_applications`, `vendor_profiles`, `invite_tokens`
   - Enable RLS on all tables
   - CREATE POLICY statements for each access pattern
   - CREATE INDEX on frequently queried columns
   - Admin seeding (optional, commented)

2. **Rewrite `vendor-auth.js`** — Replace all localStorage CRUD with REST API calls:
   - `setSession`/`getSession`/`clearSession` → JWT-based
   - `submitApplication` → POST to Supabase REST
   - `getApplications`/`updateApplicationStatus` → GET/PATCH with admin JWT
   - `generateInviteToken`/`validateInviteToken`/`markTokenUsed` → REST
   - `authenticateAdmin`/`authenticateVendor` → Supabase Auth
   - `registerVendor` → Auth signup + profile creation
   - `getApplicationStats` → REST query with count

3. **Update each HTML page** — Wire up the new vendor-auth.js functions

## Boundaries

- **Always:** Enable RLS on every table; verify RLS policies before deploying; use `app_metadata` (not `user_metadata`) for role claims; test auth flows end-to-end
- **Ask first:** Adding new tables beyond the three listed; using Edge Functions; changing session storage strategy
- **Never:** Expose `service_role` key on any public page; store plaintext passwords; skip RLS on any table in `public` schema; use `user_metadata` for authorization decisions

## Open Questions

1. **Admin seeding** — I'll write the migration to create tables + RLS. For the initial admin account, would you like me to create it via Supabase Dashboard after the migration, or include a SQL script that seeds it?

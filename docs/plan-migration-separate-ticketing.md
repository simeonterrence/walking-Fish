# Migration Plan: Separate Ticketing System

**Status:** Draft — for review
**Date:** 2026-06-04
**Scope:** Extract just the ticketing system from the Walking-Fish monolith into its own Supabase project, GitHub repo, and hosting.

---

## 1. Migration Overview

### What We're Doing

Move the Piroake Fest 2026 ticketing system out of the Walking-Fish monorepo into its own standalone setup:

| Component | Current | New |
|-----------|---------|-----|
| **Supabase** | Shared project `anigcqdquakinlzvyaur` | New dedicated Supabase project |
| **GitHub** | `github.com/simeonterrence/walking-Fish.git` | New repo (e.g., `walking-fish-ticketing`) |
| **Hosting** | Vercel — `walkingfish.gm` (whole site) | New Vercel project — new domain |
| **Database** | 31 migrations (ticketing + vendor + photos + contact) | ~15 ticketing-only migrations |
| **Edge Functions** | `ticketing` + `verify-turnstile` (shared) | `ticketing` only (standalone) |

### End-User Experience

1. Customer on the Walking-Fish site clicks "Tickets" → redirected to `new-domain.com`
2. All ticketing pages (shop, top-up, scan, dashboard, admin) live on the new domain
3. Existing ticket data (orders, tickets, balances) moves to the new Supabase
4. The old site keeps everything else (vendor management, photos, contact, early access)

---

## 2. File Inventory

### Files That Move to New Repo (Ticketing-Only)

**Frontend Pages (8 files):**
| File | Description |
|------|-------------|
| `tickets.html` | Ticket shop + customer dashboard |
| `tickets.js` | Cart, checkout, dashboard logic |
| `top-up.html` | Self-service top-up page |
| `top-up.js` | Top-up logic, ticket lookup, payment flow |
| `scan.html` | Staff QR scanner (gate/debit/top-up modes) |
| `scan.js` | Scanner logic, staff auth, ticket actions |
| `t.html` | QR lookup redirector |
| `view-tickets.html` | Magic link ticket lookup (JS is inline in HTML) |
| `claim-ticket.html` | Ticket transfer claim page |
| `claim-ticket.js` | Claim ticket logic |
| `admin-tickets.html` | Admin ticketing dashboard |
| `admin-tickets.js` | Admin CRUD for tickets, orders, types, bundles |

**Edge Function (3 files):**
| File | Description |
|------|-------------|
| `supabase/functions/ticketing/index.ts` | Main ticketing Edge Function |
| `supabase/functions/ticketing/deno.json` | Deno config |
| `supabase/functions/ticketing/.npmrc` | npm config |

**Database Migrations (15+ files):**
These are the migrations that relate to ticketing tables. See Section 4 for the full list.

**Documentation (5 files):**
| File | Description |
|------|-------------|
| `docs/PRD-ticketing-system.md` | Product requirements |
| `docs/decisions/ADR-002-ticketing-system.md` | Architecture decision record |
| `docs/plan-ticketing-implementation.md` | Implementation plan |
| `docs/patent-application-ticketing-system.md` | Patent docs |
| `docs/terms-of-service-ticketing.md` | Terms of service |

**Testing (if any):**
- TBD — check for `test_ticketing.py` or similar

### Shared Files That Need New Versions (Not Copied — Recreated)

| File | Action |
|------|--------|
| `supabase-config.js` | Create new version with new Supabase URL + anon key |
| `vercel.json` | Create new version with new domain, new CSP pointing to new Supabase URL |
| `style.css` | Extract only the ticketing-related CSS rules |
| `gift.js` | Copy (shared component used by ticketing for success modals) |
| `.gitignore` | Copy (standard pattern) |

### Files That Stay in Old Repo (NOT Moved)

| File | Why It Stays |
|------|-------------|
| `index.html` and all other brochure pages | Not ticketing-specific |
| `vendor-auth.js` | Vendor management, stays in old repo |
| `admin-photos.js` | Photo management, stays in old repo |
| `photos.js` | Photo gallery, stays in old repo |
| `nav.js` | Navigation, stays in old repo (ticketing gets its own) |
| `login.html` | Auth login, stays in old repo |
| `admin.html` | Main admin (vendor/photos), stays in old repo |
| `supabase/functions/verify-turnstile/index.ts` | Shared form handler, stays in old repo |
| All non-ticketing migrations | Vendor, photos, contact, early access tables |

---

## 3. Migration Steps

### Phase 1: Setup New Supabase Project

**Steps:**
1. Create a new Supabase project via dashboard (e.g., `walking-fish-ticketing`)
2. Note the new `SUPABASE_URL` and `SUPABASE_ANON_KEY`
3. Link the Supabase CLI to the new project:
   ```bash
   supabase link --project-ref <new-project-ref>
   ```

**What I can do:**
- Generate the SQL to run in the new project's SQL editor
- If you give me Supabase CLI access, I can run the full migration chain

**What I need from you:**
- Create the new Supabase project
- Provide the project URL and anon key
- Decide on the project plan tier (need Edge Functions → at minimum Pro plan, or use the new Supabase free tier which now includes Edge Functions)

### Phase 2: Extract and Adjust Migrations

Many existing migrations are **interleaved** — ticketing tables mixed with vendor/photo tables in the same migration files. Each migration needs to be reviewed and potentially split.

**Migrations that are purely ticketing (can be copied as-is):**
| File | Tables | 
|------|--------|
| `20260523000001_create_ticketing_tables.sql` | ticket_types, orders, tickets, top_up_bundles, balance_transactions, payment_proofs, staff_scanner_codes, system_config, webhook_events |
| `20260523000002_fix_generate_ticket_code.sql` | generate_ticket_code() function |
| `20260525000001_add_ticketing_role_rls.sql` | has_admin_or_ticketing_role(), RLS policies |
| `20260526000005_fix_mark_ticket_used_rpc.sql` | mark_ticket_used() RPC |
| `20260531000001_create_magic_link_logs.sql` | magic_link_logs |
| `20260601000002_create_processed_webhooks_table.sql` | processed_webhooks |
| `20260601000003_guard_mark_ticket_used_balance_types.sql` | mark_ticket_used() guards |
| `20260602000002_backfill_ticket_access_codes.sql` | Backfill access codes |
| `20260605000001_add_uses_remaining.sql` | uses_remaining column |
| `20260606000001_create_ticket_delete_audit.sql` | ticket_delete_audit, delete_ticket_with_audit() |
| `20260609000001_create_ticket_transfers.sql` | ticket_transfers |
| `20260604011126_create_referral_codes_table.sql` | referral_codes |
| `20260604100000_add_referral_discounts.sql` | Referral discounts |
| `20260608000001_add_superadmin_fee.sql` | Superadmin fee |
| `20260527000001_add_kids_ticket_types.sql` | Kids ticket types (modifies ticket_types) |
| `20260526000002_add_food_drinks_ticket_types.sql` | Food/drinks types (modifies ticket_types) |
| `20260526000004_add_cash_payment_method.sql` | Cash payment in ticketing |
| `20260503000000_add_staff_code_tracking.sql` | Staff scanner code tracking |
| `20260502000000_add_scanner_permissions.sql` | Scanner permissions |
| `20260522000006_set_otp_expiry_22_days.sql` | OTP expiry for auth |
| `20260607000001_add_super_admin_role.sql` | Super admin role (modifies has_admin_or_ticketing_role) |

**Important:** Migration `20260607000001_add_super_admin_role.sql` modifies the `has_admin_or_ticketing_role()` function. In the new project, this function only needs to reference `admin_role`, `super_admin_role`, and `ticketing_role` — NOT vendor roles. The function body needs a slight adjustment.

**What I can do:**
- Build the complete set of adjusted migrations for the new project
- Apply them via Supabase SQL editor or Supabase CLI

### Phase 3: Set Up New GitHub Repo

**New repo structure:**
```
walking-fish-ticketing/
├── tickets.html
├── tickets.js
├── top-up.html
├── top-up.js
├── scan.html
├── scan.js
├── t.html
├── view-tickets.html
├── claim-ticket.html
├── claim-ticket.js
├── admin-tickets.html
├── admin-tickets.js
├── supabase-config.js       ← new URL + anon key
├── gift.js
├── vercel.json              ← new domain, new CSP
├── style.css                ← ticketing-only CSS rules
├── nav.js                   ← simplified nav for ticketing-only
├── .gitignore
├── README.md
├── supabase/
│   ├── config.toml          ← new project config
│   └── functions/
│       └── ticketing/
│           ├── index.ts
│           ├── deno.json
│           └── .npmrc
└── docs/
    ├── PRD-ticketing-system.md
    ├── ADR-002-ticketing-system.md
    └── plan-ticketing-implementation.md
```

**What I need from you:**
- Create the repo on GitHub (public or private?)
- Grant me access or provide a token to push

### Phase 4: Set Up New Hosting (Vercel)

**New `vercel.json` will include:**
- Clean URL rewrites for all ticketing routes (`/tickets`, `/top-up`, `/scan`, `/t`, `/view-tickets`, `/admin-tickets`, `/claim-ticket`)
- CSP headers pointing to the **new** Supabase URL
- Cache-control for static assets

**Environment variables to set:**
| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | From new Supabase project |
| `SUPABASE_ANON_KEY` | From new Supabase project |
| `SITE_URL` | New domain |
| ModemPay keys | Re-use existing or new |
| Resend API key | Re-use existing |
| Turnstile keys | New keys for new domain |

**New domain setup:**
- New domain (TBD — you mentioned a new domain)
- DNS: Point to Vercel's nameservers
- Old site redirects `/tickets`, `/scan`, etc. → new domain

**What I can do:**
- Create the `vercel.json` with all routes, headers, CSP
- Wire up the environment variables
- Write redirect instructions for the old site

**What I need from you:**
- New domain name
- DNS access to point it to Vercel

### Phase 5: Redirect Setup on Old Site

When someone clicks any ticketing link on the old Walking-Fish site, they get redirected to the new domain.

**Changes needed on the old repo's `vercel.json`:**
Add redirect rules like:
```json
{ "source": "/tickets(.*)", "destination": "https://new-domain.com/tickets$1", "type": "redirect" },
{ "source": "/top-up(.*)", "destination": "https://new-domain.com/top-up$1", "type": "redirect" },
{ "source": "/scan(.*)", "destination": "https://new-domain.com/scan$1", "type": "redirect" },
{ "source": "/t(.*)", "destination": "https://new-domain.com/t$1", "type": "redirect" },
{ "source": "/view-tickets(.*)", "destination": "https://new-domain.com/view-tickets$1", "type": "redirect" },
{ "source": "/admin-tickets(.*)", "destination": "https://new-domain.com/admin-tickets$1", "type": "redirect" },
{ "source": "/claim-ticket(.*)", "destination": "https://new-domain.com/claim-ticket$1", "type": "redirect" },
```

Also update all HTML nav links to point to the new domain.

**What I can do:**
- Write all the redirect rules
- Update nav links in the old site HTML
- Update `login.html` redirect for `ticketing_role` → new admin-tickets domain

### Phase 6: Data Migration

**Export from old Supabase:**
Tables to export:
- `ticket_types`
- `orders`
- `tickets`
- `top_up_bundles`
- `balance_transactions`
- `payment_proofs`
- `staff_scanner_codes`
- `system_config`
- `webhook_events`
- `processed_webhooks`
- `magic_link_logs`
- `ticket_transfers`
- `referral_codes`
- `ticket_delete_audit`

**Approach:**
1. Export via Supabase dashboard (CSV) or SQL (COPY commands)
2. Transform data as needed (e.g., reset sequences, handle any schema differences)
3. Import into new Supabase via SQL INSERT or dashboard import
4. Run validation queries to verify counts match

**What I need from you:**
- Timing: ideally done just before the event to minimize delta
- Service role key for the old project (to export data)

### Phase 7: Cleanup Old Repo

After migration is complete:
1. Remove ticketing files from old repo
2. Remove ticketing routes from old `vercel.json`
3. Add redirect rules to old `vercel.json` (Phase 5)
4. Update nav links in old site HTML to point to new domain
5. Update `sitemap.xml` to remove ticketing URLs
6. Remove ticketing migrations from old `supabase/migrations/` (careful — some may be shared)
7. Update `admin.html` to remove link to `/admin-tickets`
8. Update `login.html` to redirect `ticketing_role` to new domain

---

## 4. Key Decisions Made

| Decision | Value |
|----------|-------|
| Scope | Just ticketing (not vendors/photos) |
| Repo strategy | Split — remove ticketing from old repo after extraction |
| Hosting | New domain (TBD) |
| Data migration | Migrate existing data |
| Approach | Start with a plan, then execute |

## 5. Pending Decisions Needed

| Question | Options |
|----------|---------|
| **New domain name?** | TBD — you mentioned a new domain |
| **New GitHub repo name?** | e.g., `walking-fish-ticketing`, `piroake-tickets` |
| **Supabase plan?** | Need at minimum Pro for Edge Functions |
| **ModemPay keys?** | Re-use existing or get new ones for the new domain |
| **Timing for data migration?** | Before the event — need to minimize data loss window |
| **Old repo: remove migrations or keep?** | Ticketing-only migrations can be removed; shared migrations must stay |

---

## 6. What I Need From You to Start

Here's the checklist of things I'd need to get moving:

1. **New Supabase project URL + anon key** — create one at supabase.com
2. **New domain name** — what domain will the ticketing system live on?
3. **New GitHub repo** — create an empty repo, give me the URL
4. **Vercel access** — so I can set up the new project + environment variables
5. **Service role key** for the old Supabase project — needed for data export
6. **ModemPay account credentials** — or confirmation to re-use existing ones
7. **When to do the data migration** — date/time window

Even without all of these, I can start:
- ✅ Building the adjusted migrations
- ✅ Writing the new `vercel.json`
- ✅ Creating the new repo structure (locally)
- ✅ Writing the redirect rules for the old site
- ✅ Drafting the cleanup changes for the old repo

## 7. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| **Shared migrations break old site** | Carefully split migrations before removal. Test old site migrations after removal. |
| **Data export/import corruption** | Export to CSV first, validate row counts, then import. Keep a backup. |
| **Edge Function downtime during switch** | Run old and new in parallel during transition. Old site still works for other features. |
| **Customers use old bookmarks/tickets** | Redirect old `/t` and `/tickets` URLs to new domain. Old QR codes still work via redirect. |
| **Email deliverability for new domain** | Verify new domain in Resend (DKIM/SPF setup) before launch. |

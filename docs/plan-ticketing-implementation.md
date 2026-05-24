# Implementation Plan: Piroake Fest Ticketing System

## Overview

Build a complete ticketing system on the existing static HTML + Supabase stack from the decisions in ADR-002. The system covers: ticket shop (entry passes + activity credits), dual payment (ModemPay + Wave Transfer), self-service top-up, staff scanner (gate/debit/top-up modes), customer dashboard, and admin management.

**Total: 5 phases, ~26 tasks, 3 checkpoints.**

## Architecture Decisions

- **New Edge Function, not extended verify-turnstile** — The existing `verify-turnstile` function is purpose-built for form submissions. A new `ticketing` Edge Function handles payment webhooks, QR generation, and ticket creation.
- **Static pages, no build step** — All new pages (`/tickets`, `/top-up`, `/scan`, `/t`) are plain `.html` files with client-side JS, matching the existing pattern. Vercel rewrites handle clean URLs.
- **Server-side balance state** — QR codes encode lookup URLs, never balance values. Balance is always fetched server-side from `balance_transactions`.
- **Supabase Auth magic link** — Customer dashboard uses email magic link auth. Staff scanner uses passcode table with no auth dependency.
- **No offline queue** — Paper log sheets + Bulk Top-Up catch-up instead of browser-based offline storage (per #16).

---

## Phase 1: Foundation — Database & Server Infrastructure

*Builds the backend that everything else depends on.*

### Task 1.1: Create database migration for ticketing tables

**Description:** Create `supabase/migrations/20260523000001_create_ticketing_tables.sql` with all core tables: `orders`, `tickets`, `ticket_types`, `top_up_bundles`, `balance_transactions`, `payment_proofs`, `staff_scanner_codes`, `system_config`. Each with RLS policies, foreign keys, and indexes.

**Resolves:** #1 (ticket_types table), #5 (staff_scanner_codes), #8 (top_up_bundles), #12 (balance_transactions), #13 (system_config)

**Acceptance criteria:**
- [ ] Migration file exists with all 8 tables and their relationships
- [ ] Tables match the schemas from ADR-002 (#12 for `balance_transactions`, #13 for `system_config`, etc.)
- [ ] RLS policies allow anon insert where appropriate (order creation, payment proof submission)
- [ ] RLS policies restrict read/update to authenticated users with correct roles

**Verification:**
- [ ] `supabase migration up` applies cleanly without errors
- [ ] All 8 tables created with correct columns, types, defaults, and constraints

**Files touched:**
- `supabase/migrations/20260523000001_create_ticketing_tables.sql`

**Size:** M

---

### Task 1.2: Create the ticketing Edge Function

**Description:** Create `supabase/functions/ticketing/` handling:
- ModemPay webhook reception (`POST /charge.succeeded`, `POST /charge.cancelled`)
- Ticket generation + QR code creation using `npm qrcode`
- Order confirmation emails via Resend
- Balance updates for top-ups triggered by webhooks

**Resolves:** #1 (ModemPay webhook), #3 (QR + email), #11 (receipt emails via webhook)

**Acceptance criteria:**
- [ ] Edge Function deploys with `supabase functions deploy ticketing`
- [ ] Webhook handler validates ModemPay signature
- [ ] On `charge.succeeded`: creates tickets, generates QR codes, sends confirmation email
- [ ] On `charge.cancelled`: updates order status to `cancelled`
- [ ] Idempotency key handling prevents duplicate processing
- [ ] Top-up webhook handler increases balance atomically

**Verification:**
- [ ] Deploy succeeds with `supabase functions deploy ticketing`
- [ ] Can invoke with mock payload and observe expected behavior

**Edge Function endpoints:**
- `POST /create-intent` — Called from frontend (ticket shop checktout, self-service top-up, booth ModemPay) to initiate a payment. Returns a payment URL for redirect or a payment QR code.
- `POST /webhook` — ModemPay callback endpoint. Receives `charge.succeeded` / `charge.cancelled`. Validates signature, processes idempotently, triggers ticket generation or balance update.

**CSP note:** If ModemPay's API domain differs from Supabase's, the `connect-src` in `vercel.json` needs updating. Add the ModemPay domain to the CSP when implementing.

**Files touched:**
- `supabase/functions/ticketing/index.ts`
- `supabase/functions/ticketing/deno.json`
- `supabase/functions/ticketing/.npmrc`

**Size:** M

---

### Task 1.3: Create Wave Transfer admin verification UI

**Description:** Add a section to the existing admin dashboard (`admin.html`) for viewing and verifying manual Wave Transfer payments. Shows pending `payment_proofs` with confirm/reject buttons. Confirming triggers ticket generation. Rejecting updates order status.

**Resolves:** #1 (Wave Transfer admin workflow), #4 (Wave number display)

**Acceptance criteria:**
- [ ] Admin can view a list of pending Wave Transfer payments
- [ ] Admin can see the proof screenshot and reference number
- [ ] Admin can click "Confirm" to release tickets, or "Reject" with a reason
- [ ] Confirmation triggers ticket email delivery via Edge Function

**Verification:**
- [ ] Submit Wave Transfer → see it in admin → confirm → tickets delivered
- [ ] Rejected payment shows appropriate status

**Files touched:**
- `admin.html` (add verification section)
- `admin-tickets.js` (new — verification logic)

**Size:** M

---

### ✅ Checkpoint: Phase 1 Complete

- [ ] Migration applied successfully to local Supabase
- [ ] Edge Function deploys and responds to mock webhook
- [ ] Admin verification UI loads and can confirm/reject payments

---

## Phase 2: Ticket Shop & Purchase Flow

*The customer-facing purchase experience.*

### Task 2.1: Create the ticket shop page (`/tickets`)

**Description:** Create `tickets.html` served at `/tickets`. Lists available ticket types (entry passes: Regular D300, VIP D800, Group D1,300; parking D100; activity credits: D500/D1,000/D2,000). Customer selects quantities and proceeds to checkout. Follows existing page patterns (CSP, nav, bottom-tabs, JSON-LD).

**Resolves:** #2 (pricing display), class split from #2, #17 (self-service path)

**Acceptance criteria:**
- [ ] Page loads at `/tickets` via Vercel rewrite
- [ ] Shows all ticket types with prices from `ticket_types` table
- [ ] Customer can select quantities for each type
- [ ] Cart/order summary section shows total
- [ ] "Proceed to Checkout" button transitions to payment
- [ ] Nav link in `<nav>`, `<footer>`, and bottom-tabs
- [ ] Sitemap updated

**Verification:**
- [ ] Open `/tickets` locally → page renders with ticket types
- [ ] Select quantities → cart updates correctly

**Files touched:**
- `tickets.html` (new)
- `vercel.json` (add rewrite: `"/tickets" → "/tickets.html"`)
- `style.css` (add `[data-page="tickets"]`)
- `sitemap.xml`
- `tickets.js` (new — shop logic)

**Size:** M

---

### Task 2.2: Implement ModemPay checkout flow (self-service)

**Description:** Add ModemPay checkout to `/tickets`. On "Proceed to Checkout": create order in DB → create ModemPay payment intent → redirect customer → on webhook success, generate tickets + send email.

**Resolves:** #1 (ModemPay primary path for ticket shop)

**Acceptance criteria:**
- [ ] Customer enters email at checkout
- [ ] Order created with `status = 'unpaid'`
- [ ] ModemPay intent created via Edge Function
- [ ] Customer redirected to ModemPay to complete payment
- [ ] On webhook success: confirmation page with ticket codes
- [ ] On webhook failure/cancel: failure message

**Verification:**
- [ ] End-to-end flow: select tickets → checkout → pay → confirmation
- [ ] Order appears in database after checkout

**Files touched:**
- `tickets.html` (add checkout flow JS)
- `supabase/functions/ticketing/index.ts` (payment intent + order creation)
- `tickets.js`

**Size:** M

---

### Task 2.3: Implement Wave Transfer checkout flow (self-service)

**Description:** Add Wave Transfer option alongside ModemPay. Customer selects Wave → sees Wave number (+220 696 3419) and exact amount → submits proof (reference number + optional screenshot) → order shows "pending verification."

**Resolves:** #1 (Wave Transfer secondary), #4 (Wave number +220 696 3419)

**Acceptance criteria:**
- [ ] Customer can select Wave Transfer as payment method
- [ ] Wave number and exact amount shown clearly
- [ ] Customer submits reference number and optional screenshot
- [ ] `payment_proofs` record created
- [ ] Order status is `pending_verification`

**Verification:**
- [ ] Select Wave → see details → submit proof → record in DB → admin can verify

**Files touched:**
- `tickets.html` (add Wave Transfer option)
- `tickets.js`

**Size:** S

---

### Task 2.4: Create ticket dashboard (logged-in view at `/tickets`)

**Description:** Add a logged-in dashboard section to `/tickets`. Customer logs in via Supabase Auth magic link. Shows all tickets with QR codes, balances, and transaction history. "Top up" button links to `/top-up?t=TKT-XXXXXX`.

**Resolves:** #9 (tertiary identity — dashboard), #12 (transaction history display)

**Acceptance criteria:**
- [ ] Magic link auth on the tickets page
- [ ] Logged-in view shows all tickets for that email
- [ ] QR code displayed for each ticket
- [ ] Balance shown for activity credits
- [ ] Transaction history listed with date, change, source, running balance
- [ ] "Top up" button for activity credits → links to `/top-up?t=...`
- [ ] Logout button

**Verification:**
- [ ] Open /tickets → login prompt → magic link → see tickets
- [ ] Transaction history scrollable and correctly formatted

**Files touched:**
- `tickets.html` (add dashboard section)
- `tickets.js` (auth + dashboard logic)

**Size:** M

---

### ✅ Checkpoint: Phase 2 Complete

- [ ] Customer can browse ticket types and proceed to checkout
- [ ] ModemPay flow creates orders and generates tickets on success
- [ ] Wave Transfer flow creates pending orders with proof submission
- [ ] Admin can verify Wave payments and release tickets
- [ ] Customer can log in to dashboard and see tickets + QR codes

---

## Phase 3: Self-Service Top-Up

*Customers add credits to existing tickets on their own phone.*

### Task 3.1: Create `/top-up` page

**Description:** Create `top-up.html` served at `/top-up`. Landing page shows: (1) Hero CTA explaining link/QR identity path, (2) text input for manual ticket code, (3) link to dashboard. Handles `?t=TKT-XXXXXX` query param to pre-load ticket.

**Resolves:** #18 (self-service top-up page URL and structure)

**Acceptance criteria:**
- [ ] Page loads at `/top-up` via Vercel rewrite
- [ ] Handles `?t=TKT-XXXXXX` query param — loads ticket info directly
- [ ] Without query param: shows landing screen with code input
- [ ] Code input validates 6-8 character format
- [ ] Small link to `/tickets` for dashboard login
- [ ] Nav link + bottom-tab + sitemap

**Verification:**
- [ ] Visit `/top-up` → landing screen
- [ ] Visit `/top-up?t=TKT-7F3A2B` → ticket loads directly
- [ ] Enter invalid code → error

**Files touched:**
- `top-up.html` (new)
- `vercel.json` (add rewrite: `"/top-up" → "/top-up.html"`)
- `style.css` (add `[data-page="top-up"]`)
- `sitemap.xml`
- `top-up.js` (new — top-up logic)

**Size:** M

---

### Task 3.2: Implement top-up form with bundle selection + balance cap

**Description:** Add top-up form component to `/top-up` (reused by dashboard). Shows: current balance, bundle buttons (D100, D200, D500, D1,000 from `top_up_bundles`), custom amount input (min D50, max = `balance_cap - current_balance`), balance cap enforcement.

**Resolves:** #3 (min D50), #7 (additive), #8 (bundles + custom), #13 (balance cap)

**Acceptance criteria:**
- [ ] Bundle buttons load from `top_up_bundles` table
- [ ] Clicking a bundle selects and highlights it
- [ ] Custom amount input allows values between D50 and cap
- [ ] Submitting enforces: `current_balance + amount ≤ balance_cap`
- [ ] Error shown if cap would be exceeded

**Verification:**
- [ ] Select D200 bundle → proceeds to payment
- [ ] Custom amount D30 → rejected (< D50)
- [ ] Custom amount above cap → rejected

**Files touched:**
- `top-up.js` (form logic + validation)
- `top-up.html` (form HTML)

**Size:** M

---

### Task 3.3: Implement self-service top-up ModemPay flow

**Description:** When customer confirms top-up amount, initiate ModemPay payment. On webhook success, increase balance atomically + send receipt email.

**Resolves:** #6 (self-service ModemPay top-up), #11 (receipt email)

**Acceptance criteria:**
- [ ] Customer selects amount → confirms → redirected to ModemPay
- [ ] On webhook success: `balance_transactions` created with `source = 'modempay'`
- [ ] Receipt email sent with new balance
- [ ] Confirmation screen: "Top-up successful! New balance: DXXX"

**Verification:**
- [ ] End-to-end: select amount → pay → balance updated
- [ ] Receipt email received with correct format
- [ ] Balance correctly additive (D500 + D200 = D700)

**Files touched:**
- `top-up.js` (add ModemPay checkout)
- `supabase/functions/ticketing/index.ts` (top-up webhook)

**Size:** M

---

### Task 3.4: Create `/t` ticket lookup page

**Description:** Create minimal `t.html` at `/t` — the QR code destination. Detects customer vs. staff scanner context and redirects accordingly. Since `/scan` (Phase 4) doesn't exist yet, the scanner redirect is a graceful forward-reference: the page checks for a scanner session token, and if found, redirects to `/scan?t=...` (which will work once Phase 4 builds `/scan`). If no scanner session, redirects to `/top-up?t=TKT-XXXXXX`.

**Resolves:** #15 (QR encodes lookup URL), #18 (link/QR identity tier infrastructure)

**Acceptance criteria:**
- [ ] Page loads at `/t?t=TKT-XXXXXX`
- [ ] Detects customer context (no scanner session) → redirects to `/top-up?t=TKT-XXXXXX`
- [ ] Detects staff scanner context (has passcode in session) → redirects to `/scan?t=TKT-XXXXXX`
- [ ] No ticket ID provided → error: "Invalid ticket link"

**Verification:**
- [ ] Visit `/t?t=TKT-7F3A2B` → redirects to `/top-up?t=TKT-7F3A2B`
- [ ] With scanner session → redirects to `/scan?t=TKT-7F3A2B` (after Phase 4)

**Files touched:**
- `t.html` (new)
- `t.js` (detection + redirect logic)
- `vercel.json` (add rewrite: `"/t" → "/t.html"`)

**Size:** S

---

## Phase 4: Staff Scanner Pages

*The most complex phase — the `/scan` page with all three operating modes.*

### Task 4.1: Create `/scan` page with staff passcode auth

**Description:** Create `scan.html` at `/scan`. Gated by staff passcode — validates against `staff_scanner_codes` table, stores session token. After auth, shows mode selection: [Gate] [Debit] [Top-up].

**Resolves:** #5 (scanner page access via staff passcodes)

**Acceptance criteria:**
- [ ] Page loads at `/scan` via Vercel rewrite
- [ ] Staff sees passcode input before any scanner UI
- [ ] Passcode validated against `staff_scanner_codes` table
- [ ] Valid code stores session in sessionStorage
- [ ] Invalid code shows error
- [ ] After auth, shows mode selection: [Gate] [Debit] [Top-up]

**Verification:**
- [ ] Open `/scan` without code → see passcode prompt
- [ ] Enter invalid code → error
- [ ] Enter valid code → mode selection screen

**Files touched:**
- `scan.html` (new)
- `vercel.json` (add rewrite: `"/scan" → "/scan.html"`)
- `style.css` (add `[data-page="scan"]`)
- `scan.js` (auth + mode switching)

**Size:** M

---

### Task 4.2: Implement QR scanning on the scanner page

**Description:** Integrate a browser-based QR scanner library (e.g., `html5-qrcode`). Camera activates on mode selection. Scanning a QR parses ticket ID, fetches ticket info, and displays it. Manual ticket code input also available alongside camera.

**Resolves:** #10 (primary booth identification — QR scan)

**Acceptance criteria:**
- [ ] Camera activates when mode is selected
- [ ] Scanning QR parses ticket ID from the URL
- [ ] Ticket info displayed (name, balance, type)
- [ ] Manual ticket code input works alongside camera
- [ ] Camera can be toggled on/off

**Verification:**
- [ ] Scan test QR → ticket info loads
- [ ] Type ticket code manually → same result

**Files touched:**
- `scan.html` (camera container + code input)
- `scan.js` (scanner logic)

**Size:** M

---

### Task 4.3: Implement Gate mode

**Description:** Gate mode — staff scans entry/parking pass → ticket info shown → staff confirms → ticket marked `used`. Rejects if already used.

**Resolves:** #2 (gate scan for entry/parking)

**Acceptance criteria:**
- [ ] Scanning entry/parking pass loads ticket info
- [ ] "Mark as entered" button appears
- [ ] Confirming updates `status = 'used'` atomically
- [ ] Already-used ticket shows "Ticket already used" with timestamp

**Verification:**
- [ ] Scan entry pass → mark entered → status changes in DB
- [ ] Scan same pass again → "already used"

**Files touched:**
- `scan.js` (gate mode logic)

**Size:** S

---

### Task 4.4: Implement Debit mode

**Description:** Scanner in Debit mode — staff scans activity credit → enters amount to debit → confirms → balance decreases atomically with `UPDATE ... SET balance = balance - amount WHERE balance >= amount`. Shows remaining balance.

**Resolves:** #2 (activity debit at booths), #1 (per-session debit pricing)

**Acceptance criteria:**
- [ ] Scanning activity credit loads ticket info with balance
- [ ] Staff enters debit amount and selects activity type
- [ ] Confirming atomically decrements balance
- [ ] Insufficient balance → error
- [ ] Shows remaining balance after debit
- [ ] `balance_transactions` record created with `type = 'debit'`

**Verification:**
- [ ] Debit D50 from D500 → D450 remaining
- [ ] Debit D600 from D500 → "Insufficient balance"

**Files touched:**
- `scan.js` (debit mode logic)

**Size:** S

---
### Task 4.5a: Implement Top-up mode — booth identification + amount selection

**Description:** Scanner in Top-up mode — three-tier identification (QR scan → ticket code → email lookup), amount selection with bundle buttons + custom input. Shows ticket info (name, balance, type) after identification.

**Resolves:** #10 (booth identification, three tiers), #7 (additive)

**Acceptance criteria:**
- [ ] Three identity paths: QR scan, ticket code input, email lookup (in that priority order)
- [ ] Scanning QR or entering code loads ticket info (name, balance, type)
- [ ] Email lookup shows matching tickets and staff selects one
- [ ] Amount selection with bundle buttons from `top_up_bundles` table
- [ ] Custom amount input (min D50, max = `balance_cap - current_balance`)
- [ ] Balance cap enforcement with error message

**Verification:**
- [ ] Scan QR → ticket info loads → select D200 bundle
- [ ] Email lookup → select ticket → custom amount → proceeds

**Files touched:**
- `scan.js` (top-up identification + amount selection)

**Size:** M

---

### Task 4.5b: Implement Top-up mode — payment methods

**Description:** Payment method selection in Top-up mode — three buttons: [ModemPay] [Wave] [Cash]. Staff selects after identification + amount. ModemPay auto-confirms via webhook. Wave and Cash require staff to tap "Received."

**Resolves:** #14 (booth payment methods), #11 (receipt emails for booth top-ups)

**Acceptance criteria:**
- [ ] Three payment method buttons appear after amount selection: [ModemPay] [Wave] [Cash]
- [ ] **ModemPay**: generates payment QR on screen → customer scans with their phone → scanner polls for webhook → on success, shows "Payment received!" and updates balance automatically
- [ ] **Wave**: shows booth number + amount → staff checks Wave app → taps "Received" → balance updates
- [ ] **Cash**: staff taps "Received (Cash)" → balance updates
- [ ] All methods produce a `balance_transactions` record with correct `source`
- [ ] Receipt email sent for all methods
- [ ] Scanner polls ~30s for ModemPay webhook, then offers manual override

**Verification:**
- [ ] ModemPay → QR generated → customer pays → webhook → balance updates
- [ ] Wave → staff taps "Received" → balance updates
- [ ] Cash → staff taps "Received (Cash)" → balance updates
- [ ] Receipt email received for each method

**Files touched:**
- `scan.js` (payment method flow)

**Size:** M

---

### Task 4.6: Implement cross-type purchase toggle in Top-up mode

**Description:** Add "New activity credit ticket" toggle at top of Top-up mode. Creates standalone activity credit from scratch: selects type, enters name+email, takes payment, generates new ticket.

**Resolves:** #17

**Acceptance criteria:**
- [ ] Toggle appears: [Scan existing] [New activity credit]
- [ ] "New activity credit" shows: ticket type dropdown, name input, email input
- [ ] Payment buttons appear after ticket type selected
- [ ] Confirmation creates new `type = 'activity_credit'` ticket
- [ ] Receipt email sent to provided email
- [ ] Paper slip with ticket code shown

**Verification:**
- [ ] Create new D500 activity credit → ticket in DB → receipt emailed
- [ ] Customer logs into dashboard with the email → sees new ticket

**Files touched:**
- `scan.js` (toggle + new ticket flow)

**Size:** M

---

### Task 4.7: Implement offline resilience features

**Description:** Add Bulk Top-Up mode to scanner (appears when internet is restored). Add manual override button for ModemPay webhook delays. Digital catch-up form matching the paper log sheet format.

**Resolves:** #16

**Acceptance criteria:**
- [ ] Bulk Top-Up form accessible from scanner
- [ ] Form accepts: ticket code, amount, method (Wave/Cash), optional note
- [ ] "Add another row" allows batching multiple entries
- [ ] "Submit all" atomically creates all records with `notes = "Booth — offline catch-up"`
- [ ] Receipt emails sent for each entry
- [ ] Manual override button in Top-up mode — creates `source = 'modempay'` + notes
- [ ] Idempotency: if webhook arrives later, duplicate ignored

**Verification:**
- [ ] Enter 3 pending transactions → submit → 3 receipts → balances correct
- [ ] Manual override → balance updated → webhook arrives later → no duplicate

**Files touched:**
- `scan.js` (Bulk Top-Up form + manual override)

**Size:** M

---

### ✅ Checkpoint: Phase 4 Complete

- [ ] Staff can log into scanner with passcode
- [ ] Gate mode: scan → mark used → reject duplicates
- [ ] Debit mode: scan → debit → balance decreases atomically
- [ ] Top-up mode: identify → select amount → accept payment → balance increases
- [ ] Cross-type: create new activity credit ticket at booth
- [ ] Bulk Top-Up catch-up works after offline recording
- [ ] Manual override handles delayed webhooks

---

## Phase 5: Admin Dashboard & Polish

*Admin tools and final integration.*

### Task 5.1: Add ticket management to admin dashboard

**Description:** Extend `admin.html` with: inventory overview (capacity vs sold), order management (filter by status), ticket types editor, top-up bundles manager, balance cap setting, scanner code manager (issue/revoke).

**Resolves:** #1 (activity pricing admin), #8 (bundles admin), #13 (balance cap config), #5 (scanner code management)

**Acceptance criteria:**
- [ ] Inventory overview (capacity vs sold per ticket type)
- [ ] Add/remove/edit ticket types
- [ ] Add/remove top-up bundle amounts
- [ ] Set `balance_cap` value
- [ ] Issue new staff scanner codes
- [ ] Revoke staff scanner codes
- [ ] View and filter orders by status

**Verification:**
- [ ] Change ticket type price → reflects in ticket shop
- [ ] Revoke scanner code → staff can't log in
- [ ] Change balance cap → enforced on next top-up

**Files touched:**
- `admin.html` (add management sections)
- `admin-tickets.js` (ticket admin logic)

**Size:** L — consider splitting into:
- 5.1a: Inventory + order management
- 5.1b: Ticket types + top-up bundles + balance cap editors
- 5.1c: Scanner code manager

---

### Task 5.2: Finalize nav links, bottom-tabs, and sitemap

**Description:** Update nav links, footer, bottom-tabs, and sitemap for all new pages. Verify all pages have CSP, canonical URLs, and standard script loading order. (Note: Vercel rewrites for each page are added at page creation time — this task just handles nav/SEO integration.)

**Maps to:** #18 (infrastructure), Section 3 (QR destination)

**Acceptance criteria:**
- [ ] `/tickets` in nav dropdown, footer, and bottom-tabs
- [ ] `/top-up` in bottom-tabs (or nav)
- [ ] `sitemap.xml` includes all new pages
- [ ] All pages have CSP meta tags and canonical URLs
- [ ] Standard script loading order from CLAUDE.md

**Verification:**
- [ ] Nav dropdown shows /tickets
- [ ] Bottom-tabs show new entries
- [ ] CSP doesn't block resources

**Files touched:**
- `vercel.json` (final check)
- `sitemap.xml` (add entries)
- All new HTML pages (verify standard tags)

**Size:** S

---

### Task 5.3: Integration tests

**Description:** Create `test_ticketing.py` following patterns from `test_all_flows.py`. Tests for: ticket purchase (ModemPay + Wave), self-service top-up, booth top-up, gate scan, activity debit, cross-type purchase, offline catch-up, balance cap enforcement, duplicate webhook handling.

**Maps to:** All resolved questions — end-to-end validation

**Acceptance criteria:**
- [ ] Integration test file exists
- [ ] Tests for all critical paths pass consistently
- [ ] Edge cases: balance cap, insufficient balance, duplicate webhook, expired ticket
- [ ] Tests run against local Supabase

**Verification:**
- [ ] `python3 test_ticketing.py` runs and passes

**Files touched:**
- `test_ticketing.py` (new)

**Size:** M

---

## Task Summary

| Phase | Tasks | Total Size |
|---|---|---|
| **1: Foundation** | 3 (migration, Edge Function, admin verification) | M + M + M |
| **2: Ticket Shop** | 4 (shop page, ModemPay, Wave, dashboard) | M + M + S + M |
| **3: Self-Service Top-Up** | 4 (/top-up page, form, ModemPay flow, /t page) | M + M + M + S |
| **4: Staff Scanner** | 8 (scan page, QR scan, gate, debit, top-up identification, top-up payment, cross-type, offline) | M + M + S + S + M + M + M + M |
| **5: Admin & Polish** | 3 (admin management, page config, integration tests) | L + S + M |

**Total: ~27 tasks, 5 phases, 3 checkpoints.**

---

## Risks & Open Questions

| Risk | Impact | Mitigation |
|---|---|---|
| ModemPay API details unknown | High | Need ModemPay API docs/sandbox before Phase 2 implementation. Also need to add ModemPay domains to CSP `connect-src` |
| QR scanner library compatibility on target phones | Medium | Test `html5-qrcode` on target devices early in Phase 4 |
| Static site limits for redirect/query handling | Low | Client-side JS handles all redirect and param parsing |
| Staff training for paper log + Bulk Top-Up | Low | Printed forms + brief ops guide, part of event plan |
| Magic link email deliverability | Medium | Resend already verified — test magic link flow early (Task 2.4) |

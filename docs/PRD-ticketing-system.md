# Walking-Fish Ticketing System — Product Requirements Document

## 1. Executive Summary

### Product Name
Walking-Fish Ticketing System (Piroake Fest 2026)

### Version
1.0.0

### Last Updated
2026-06-02

### One-Line Description
A complete ticketing platform for Piroake Fest 2026 enabling customers to purchase entry passes and activity credits, self-serve top-ups, venue staff QR scanning for gate/debit/booth operations, and admin management — all on a static HTML + Supabase stack.

### Problem Statement
Piroake Fest 2026 (June 2026) has no ticket purchasing system. Customers currently can only sign up for early access. The festival needs a full ticketing solution that handles: online ticket sales with dual payment methods (ModemPay instant + Wave Transfer manual), on-site rechargeable activity credits (games, karaoke), venue entry gate scanning, activity booth debit scanning, on-site top-ups at a dedicated booth, self-service top-ups via mobile, and administrative inventory/order/verification management. The solution must work within the existing static HTML website architecture (no build framework, plain `.html` files served via Vercel) and integrate with the existing Supabase project.

### Success Metrics
- Customer can purchase tickets in under 3 minutes (ModemPay flow)
- Order-to-QR-email delivery in under 30 seconds after payment confirmation
- Staff can scan and verify a gate entry in under 2 seconds
- Activity debit reduces balance atomically with zero double-spend incidents
- Balance cap (D5,000 default) prevents financial over-exposure
- Zero critical bugs in ticket creation, payment verification, or balance updates

---

## 2. User Personas

### Persona 1: Festival Customer
- **Description:** Gambian festival-goer attending Piroake Fest 2026. Uses mobile money (Wave, QMoney) regularly. Comfortable scanning QR codes on their phone.
- **Goals:** Buy entry tickets quickly, add game credits before/at the event, check remaining balance, top up when running low.
- **Pain Points:** Doesn't want to carry cash, wants instant ticket delivery, worried about network coverage at the venue.
- **Tech Comfort:** Medium — comfortable with WhatsApp, mobile money apps, QR scanning.

### Persona 2: Venue Staff / Gate Attendant
- **Description:** Festival staff member stationed at venue entry or activity booth. Uses a personal smartphone for scanning. Works long shifts.
- **Goals:** Scan tickets fast at entry, debit activity credits at game booths, top up customer activity credits at the top-up booth, handle offline scenarios gracefully.
- **Pain Points:** Phone battery anxiety, network congestion at peak times, needs simple error-proof UI, must handle cash payments.
- **Tech Comfort:** Medium — comfortable with basic mobile apps and scanning.

### Persona 3: Ticketing Administrator
- **Description:** Walking-Fish team member managing ticket inventory, verifying manual payments, configuring prices, and issuing scanner codes to staff.
- **Goals:** Set ticket prices and capacities, verify Wave Transfer payments, issue/revoke staff scanner codes, view sales data, manage top-up bundles and balance cap.
- **Pain Points:** Needs a clear dashboard to spot unpaid orders, wants to avoid fraud from duplicated manual verifications.
- **Tech Comfort:** High — comfortable with Supabase admin and web dashboard.

### Persona 4: Ticketing Staff (ticketing_role)
- **Description:** A dedicated ticketing operator with access limited to ticketing tables only (no vendor or photo management). Uses the shared `/login` page.
- **Goals:** Same as Administrator for ticketing operations — view inventory, manage orders, configure types/bundles.
- **Pain Points:** Does not need access to vendor management or photo systems — requires a scoped role.
- **Tech Comfort:** High.

---

## 3. Technical Specifications

### Tech Stack
| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | Plain HTML + Vanilla JS | Existing static site pattern — no build step, no framework, all `.html` files served by Vercel |
| Styling | `style.css` (OKLCH color space) | Existing design system with CSS custom properties, coral accent |
| Backend | Supabase Edge Functions (Deno) | Server-side logic for payment webhooks, QR generation, ticket creation |
| Database | Supabase PostgreSQL | Existing project (`anigcqdquakinlzvyaur`), RLS policies, real-time |
| Auth | Supabase Auth (JWT) | Unified login at `/login`, role-based redirect (`admin_role`, `vendor_role`, `ticketing_role`) |
| Email | Resend | Already integrated (DKIM + SPF verified for `noreply@walkingfish.gm`) |
| Payment | ModemPay API + Wave Transfer (manual) | Dual payment model — instant 1.5% fee or manual no-fee |
| QR Scanning | `html5-qrcode` (browser-based) | No native app needed — works on personal phones |
| QR Generation | `qrcode` npm package in Edge Function | Server-side QR generation embedded in emails |
| Hosting | Vercel (static site) | Existing deployment — auto-deploys from `main` branch |
| CAPTCHA | Cloudflare Turnstile | Already integrated in existing form pattern |

### Architecture Overview
```
Customer Browser (/.html pages)
    │
    ├──→ Vercel (static file serving + rewrites)
    │       │
    │       ├──→ tickets.html (shop + dashboard)
    │       ├──→ top-up.html (self-service top-up)
    │       ├──→ scan.html (staff QR scanner)
    │       ├──→ t.html (QR lookup redirector)
    │       ├──→ admin-tickets.html (admin management)
    │       └──→ view-tickets.html (magic link lookup)
    │
    ├──→ Supabase REST API (anon key, public read)
    │       ├──→ ticket_types, top_up_bundles
    │       └──→ orders, tickets (via RLS)
    │
    └──→ Supabase Edge Function (ticketing)
            ├──→ POST /create-intent (ModemPay payment initiation)
            ├──→ POST /webhook (ModemPay charge confirmation)
            ├──→ POST /create-order (order creation)
            ├──→ POST /confirm-payment (admin Wave verification)
            ├──→ POST /lookup-ticket (ticket lookup by code)
            ├──→ POST /mark-used (gate scan)
            ├──→ POST /debit (activity balance debit)
            ├──→ POST /lookup-by-email (booth email identification)
            ├──→ POST /staff-auth (scanner passcode auth)
            ├──→ POST /staff-activity (staff activity log)
            ├──→ POST /bulk-topup (offline catch-up batch)
            ├──→ POST /unmark-used (admin undo scan)
            └──→ POST /reverse-debit (reverse incorrect debit)
```

### Third-Party Integrations
| Service | Purpose | API Type | Auth Method |
|---------|---------|----------|-------------|
| Supabase | Database + Auth | REST | Anon key / Service role key |
| ModemPay | Payment gateway | REST + Webhook | Secret key + HMAC signature |
| Resend | Transactional emails | REST | API Key |
| Cloudflare Turnstile | CAPTCHA verification | Widget + API | Site key + Secret key |

### Environment Variables Required
| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Yes |
| `RESEND_API_KEY` | Resend API key for transactional emails | Yes |
| `MODEMPAY_SECRET_KEY` | ModemPay API secret key | Yes |
| `MODEMPAY_WEBHOOK_SECRET` | ModemPay webhook signature secret | Yes |
| `SITE_URL` | Canonical site URL (`https://www.walkingfish.gm`) | Yes |

---

## 4. Data Model

### Entity: `ticket_types`
Admin-configurable ticket type definitions for both entry passes and activity credit bundles.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | Primary key, default `gen_random_uuid()` | Unique identifier |
| name | text | Yes | — | Display name (e.g., "Regular Entry") |
| slug | text | Yes | Unique | URL-safe identifier (e.g., "regular-entry") |
| type | text | Yes | CHECK IN (`entry`, `activity_credit`, `parking`, `food`, `drinks`, `kids_zone`) | Category |
| price | integer | Yes | CHECK >= 0 | Price in GMD dalasis |
| capacity | integer | Yes | CHECK >= 0 | Maximum available for sale |
| sold | integer | Yes | Default 0, CHECK >= 0 | Current count sold |
| is_active | boolean | Yes | Default true | Whether visible in shop |
| sort_order | integer | Yes | Default 0 | Display ordering |
| metadata | jsonb | No | Default `{}` | Flexible extra fields |
| created_at | timestamptz | Yes | Default `now()` | — |
| updated_at | timestamptz | Yes | Default `now()` | — |

### Entity: `orders`
Customer purchase records. Contains one or more tickets.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | Primary key, default `gen_random_uuid()` | Unique identifier |
| email | text | Yes | — | Customer email |
| total | integer | Yes | CHECK >= 0 | Total order amount in GMD |
| status | text | Yes | CHECK IN (`unpaid`, `paid`, `pending_verification`, `cancelled`, `refunded`) | Order lifecycle state |
| payment_method | text | No | CHECK IN (`modempay`, `wave_transfer`, `cash`, `admin`, `free`) | How payment was made |
| metadata | jsonb | No | Default `{}` | Items list, customer name, ModemPay intent IDs |
| created_at | timestamptz | Yes | Default `now()` | — |
| updated_at | timestamptz | Yes | Default `now()` | — |

### Entity: `tickets`
Individual ticket within an order. Can be entry pass, parking pass, or activity credit.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | Primary key, default `gen_random_uuid()` | Unique identifier |
| order_id | UUID | Yes | FK → orders.id | Parent order |
| ticket_type_id | UUID | Yes | FK → ticket_types.id | Ticket type reference |
| code | text | Yes | Unique, 12 chars | Human-readable code (e.g., `TKT-7F3A2B`) |
| type | text | Yes | CHECK IN (`entry`, `activity_credit`, `parking`) | Ticket class |
| status | text | Yes | Default `active` | `active`, `used`, `exhausted` |
| balance | integer | No | Default NULL, CHECK >= 0 | Remaining activity credits (NULL for non-rechargeable) |
| uses_remaining | integer | No | Default NULL | Physical entry uses (for group passes) |
| customer_email | text | No | — | Email of ticket holder (may differ from order email) |
| customer_name | text | No | — | Name of ticket holder |
| access_code | text | No | — | 4-6 char PIN for dashboard access |
| qr_url | text | No | — | Stored QR image URL in Supabase storage |
| metadata | jsonb | No | Default `{}` | QR data URI, access code, etc. |
| created_at | timestamptz | Yes | Default `now()` | — |

### Entity: `top_up_bundles`
Predefined top-up amounts for self-service and booth-assisted top-ups.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | Primary key | — |
| amount | integer | Yes | CHECK > 0 | Amount in GMD |
| is_active | boolean | Yes | Default true | — |
| sort_order | integer | Yes | Default 0 | Display order |
| created_at | timestamptz | Yes | Default `now()` | — |

### Entity: `balance_transactions`
Chronological log of all activity credit balance changes.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | Primary key | — |
| ticket_id | UUID | Yes | FK → tickets.id | — |
| type | text | Yes | CHECK IN (`top_up`, `debit`, `initial_purchase`) | Transaction type |
| amount_delta | integer | Yes | — | Positive = credits added, negative = spent |
| balance_after | integer | Yes | — | Running balance after transaction |
| source | text | Yes | — | `modempay`, `wave`, `cash`, `booth_debit`, `initial`, `admin` |
| staff_code | text | No | — | Staff scanner code (if booth-initiated) |
| notes | text | No | — | Free text (e.g., "Side Games — 5min") |
| created_at | timestamptz | Yes | Default `now()` | — |

### Entity: `payment_proofs`
Wave Transfer payment proof submissions for admin verification.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | Primary key | — |
| order_id | UUID | Yes | FK → orders.id | — |
| reference_number | text | Yes | — | Customer's Wave reference |
| screenshot_url | text | No | — | Optional proof screenshot |
| status | text | Yes | Default `pending` | `pending`, `verified`, `rejected` |
| verified_by | UUID | No | — | Admin user ID |
| notes | text | No | — | Admin notes |
| created_at | timestamptz | Yes | Default `now()` | — |

### Entity: `staff_scanner_codes`
Unique per-staff access codes for the `/scan` QR scanner page.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | Primary key | — |
| code | text | Yes | Unique | 6-8 character passcode |
| name | text | Yes | — | Staff member's name (for display) |
| permissions | jsonb | No | Default `{"modes":["gate","debit","topup"]}` | What modes this staff can access |
| is_active | boolean | Yes | Default true | Can be revoked by admin |
| last_used_at | timestamptz | No | — | — |
| created_at | timestamptz | Yes | Default `now()` | — |

### Entity: `system_config`
Key-value configuration store for admin-configurable settings.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| key | text | Yes | Primary key | Config key (e.g., `balance_cap`) |
| value | jsonb | Yes | — | Config value |
| updated_at | timestamptz | Yes | Default `now()` | — |

### Entity: `webhook_events`
Idempotency tracking for ModemPay webhooks.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | Primary key | — |
| event_id | text | Yes | Unique | ModemPay webhook event ID |
| event_type | text | Yes | — | `charge.succeeded`, `charge.cancelled` |
| processed_at | timestamptz | Yes | Default `now()` | — |

### Entity Relationships
```
ticket_types (1) ----< (many) tickets
orders (1) ----< (many) tickets
tickets (1) ----< (many) balance_transactions
orders (1) ----< (many) payment_proofs
```

### Database Indexes
- `tickets.code` — Unique index for QR/ticket code lookup (most frequent operation)
- `tickets.order_id` — For loading tickets by order
- `orders.email` — For customer dashboard lookup
- `orders.status` — For admin order filtering
- `balance_transactions.ticket_id` — For transaction history
- `balance_transactions.created_at` — For chronological ordering
- `payment_proofs.order_id` — For admin verification
- `webhook_events.event_id` — Unique for idempotency

---

## 5. Feature Specifications

### Feature 1: Ticket Shop & Purchase Flow

#### Description
Public ticket purchasing page at `/tickets` where customers browse available ticket types (entry passes, parking, activity credits), select quantities, and checkout via ModemPay (instant) or Wave Transfer (manual).

#### User Stories
- As a festival customer, I want to browse ticket types and prices so I can decide what to buy
- As a customer, I want to pay with ModemPay (mobile money) and receive my QR tickets instantly via email
- As a customer, I want to pay via Wave Transfer (manual) and upload proof so I can avoid the ModemPay fee
- As a customer, I want to see my order status after checkout so I know it's being processed

#### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| F1.1 | List all active ticket types from `ticket_types` table with prices | Must Have |
| F1.2 | Customer selects quantities for each type with cart total | Must Have |
| F1.3 | Customer enters email at checkout | Must Have |
| F1.4 | ModemPay flow: create order → create payment intent → redirect customer → webhook confirms → generate tickets + email QR codes | Must Have |
| F1.5 | Wave Transfer flow: create order → show Wave number + amount → submit proof → `pending_verification` status | Must Have |
| F1.6 | Capacity enforcement: reject purchase if `sold + quantity > capacity` | Must Have |
| F1.7 | Order status page showing `paid`, `unpaid`, or `pending_verification` | Nice to Have |

#### UI Components
- **Ticket type cards**: Each type shown as a card with name, price, description, quantity selector
- **Cart summary**: Running total with itemized list
- **Checkout form**: Email input + payment method selection (ModemPay/Wave)
- **Order confirmation**: Success screen with ticket codes after payment
- **Wave proof form**: Reference number input + optional screenshot upload

#### API Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/functions/v1/ticketing/create-order` | Create order from cart items | Anon |
| POST | `/functions/v1/ticketing/create-intent` | Initiate ModemPay payment | Anon |
| POST | `/functions/v1/ticketing/webhook` | ModemPay charge webhook | Signature |
| POST | `/functions/v1/ticketing/check-order` | Poll order status | Anon |
| POST | `/functions/v1/ticketing/confirm-payment` | Admin confirm Wave payment | Admin |

#### Validation Rules
- Email: Valid email format, required
- Quantities: Must be >= 1, must be <= available capacity
- Wave reference: Required, minimum 3 characters
- Items array: Must contain valid ticket_type_ids

#### Error Handling
| Error Condition | User Message | System Action |
|----------------|--------------|---------------|
| Sold out | "Sorry, [type] is sold out" | Block quantity selection |
| Insufficient capacity | "Only [X] tickets available for [type]" | Cap quantity selector |
| Payment failed | "Payment was not completed. Please try again." | Log failure, keep order as unpaid |
| Webhook timeout | "Payment received, generating tickets..." | Poll `/check-order` for status |

---

### Feature 2: Self-Service Top-Up

#### Description
Standalone page at `/top-up` where customers add activity credits to existing tickets. Accessed via QR link, ticket code entry, or dashboard login.

#### User Stories
- As a customer, I want to tap the link in my confirmation email and top up instantly
- As a customer, I want to enter my ticket code if I can't find the email link
- As a customer, I want to choose from predefined bundles (D100, D200, D500, D1,000) or enter a custom amount
- As a customer, I want to know my current balance before I top up

#### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| F2.1 | Handle `?t=TKT-XXXXXX` query param to pre-load ticket info | Must Have |
| F2.2 | Show current balance, ticket type, bundle buttons, custom amount input | Must Have |
| F2.3 | Custom amount: min D50, max = `balance_cap - current_balance` | Must Have |
| F2.4 | Balance cap enforcement: reject if `current_balance + amount > D5,000` | Must Have |
| F2.5 | ModemPay checkout for top-up → webhook increases balance atomically | Must Have |
| F2.6 | Receipt email sent after successful top-up | Must Have |
| F2.7 | Landing screen with code input when no `?t=` param | Must Have |

#### UI Components
- **QR/Link hero CTA**: "Tap your link or scan your QR" with instructions
- **Ticket code input**: Text field for 6-8 character code
- **Balance display**: Current balance bar showing spent/remaining
- **Bundle buttons**: Grid of predefined amounts from `top_up_bundles` table
- **Custom amount input**: Text field with min/max enforcement
- **Dashboard link**: Small tertiary link to `/tickets`

#### API Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/functions/v1/ticketing/lookup-ticket` | Look up ticket by code | Anon (rate-limited) |
| POST | `/functions/v1/ticketing/create-intent` | Initiate top-up payment | Anon |

#### Validation Rules
- Ticket code: 6-8 characters, alphanumeric
- Top-up amount: >= D50, <= (`balance_cap - current_balance`)
- Bundle or custom: exactly one must be selected

#### Error Handling
| Error Condition | User Message |
|----------------|--------------|
| Invalid ticket code | "Ticket not found. Check your code and try again." |
| Balance cap reached | "Maximum balance of D5,000 reached." |
| Below minimum | "Minimum top-up is D50." |

---

### Feature 3: Staff QR Scanner

#### Description
Browser-based QR scanner page at `/scan` used by venue staff. Gated by unique staff passcodes. Three modes: Gate, Debit, Top-up.

#### User Stories
- As a gate attendant, I want to scan entry passes and mark them as used quickly
- As a booth operator, I want to scan activity credits, enter the debit amount, and reduce the balance
- As a top-up booth operator, I want to find a customer's ticket (scan/code/email), select amount, accept payment, and increase balance
- As a staff member, I want to handle payments via ModemPay QR, Wave (manual confirm), or Cash

#### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| F3.1 | Passcode gating: validate against `staff_scanner_codes` table | Must Have |
| F3.2 | Three modes: Gate, Debit, Top-up | Must Have |
| F3.3 | Browser-based QR scanning via `html5-qrcode` library | Must Have |
| F3.4 | Manual ticket code entry alongside camera | Must Have |
| F3.5 | **Gate mode**: Scan → show ticket info → "Mark as entered" → atomic status update | Must Have |
| F3.6 | **Gate mode**: Reject if ticket already used | Must Have |
| F3.7 | **Debit mode**: Scan → show balance → enter debit amount → atomic deduction | Must Have |
| F3.8 | **Debit mode**: Insufficient balance → error | Must Have |
| F3.9 | **Top-up mode**: Three-tier identification (QR scan → code input → email lookup) | Must Have |
| F3.10 | **Top-up mode**: Bundle buttons + custom amount + balance cap enforcement | Must Have |
| F3.11 | **Top-up mode**: Three payment methods — ModemPay (QR + webhook), Wave (manual confirm), Cash | Must Have |
| F3.12 | **Top-up mode**: "New activity credit ticket" toggle for cross-type on-site purchase | Must Have |
| F3.13 | ModemPay manual override: staff can confirm when webhook is delayed | Must Have |
| F3.14 | Bulk Top-Up mode for offline catch-up from paper log sheets | Must Have |
| F3.15 | Receipt email sent for all top-ups and debits | Must Have |
| F3.16 | Staff activity log showing their total debits and top-ups | Nice to Have |

#### UI Components
- **Passcode screen**: Code input with keyboard-friendly layout
- **Mode selector**: Three large buttons [Gate] [Debit] [Top-up]
- **Camera view**: QR scanner viewfinder with torch toggle
- **Manual code input**: Text field alongside camera
- **Ticket info panel**: Customer name, ticket type, current balance, last transactions
- **Debit amount input**: Numeric keypad with activity type selector
- **Top-up bundle grid**: Amount buttons + custom field
- **Payment method buttons**: [ModemPay] [Wave] [Cash]
- **Bulk Top-Up form**: Multi-row input matching paper log sheet format

#### API Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/functions/v1/ticketing/staff-auth` | Validate scanner passcode | Anon (rate-limited) |
| POST | `/functions/v1/ticketing/lookup-ticket` | Look up ticket by code/QR | Anon |
| POST | `/functions/v1/ticketing/lookup-by-email` | Look up tickets by email | Anon |
| POST | `/functions/v1/ticketing/mark-used` | Gate scan — mark entry pass as used | Anon |
| POST | `/functions/v1/ticketing/debit` | Debit activity credits | Anon |
| POST | `/functions/v1/ticketing/create-intent` | Initiate booth ModemPay payment | Anon |
| POST | `/functions/v1/ticketing/confirm-payment` | Manual payment confirmation (Wave/Cash) | Anon |
| POST | `/functions/v1/ticketing/bulk-topup` | Bulk offline catch-up | Anon |
| POST | `/functions/v1/ticketing/staff-activity` | Get staff activity log | Anon |
| POST | `/functions/v1/ticketing/unmark-used` | Undo accidental gate scan | Anon |
| POST | `/functions/v1/ticketing/reverse-debit` | Reverse incorrect debit | Anon |
| POST | `/functions/v1/ticketing/view-tickets` | View tickets by email or code (magic link) | Rate-limited |

#### Validation Rules
- Staff code: 6-8 characters, validated against DB
- Debit amount: Must be > 0, must be <= current balance
- Top-up amount: >= D50, <= (`balance_cap - current_balance`)
- Entry pass: Only `type = 'entry'` or `type = 'parking'` tickets in Gate mode
- Activity credit: Only `type = 'activity_credit'` tickets in Debit/Top-up mode

#### Error Handling
| Error Condition | User Message |
|----------------|--------------|
| Invalid passcode | "Invalid staff code. Please try again." |
| Already used (gate) | "This ticket was already used at [timestamp]." |
| Insufficient balance | "Insufficient balance. Current balance: D[X]" |
| Exhausted ticket | "This activity credit ticket is exhausted (balance = D0)." |
| Network outage | "Can't connect. Record this on the paper log sheet and use Bulk Top-Up when internet returns." |
| Duplicate webhook | "Payment already processed. No action needed." |

---

### Feature 4: QR Ticket Lookup & Context Detection

#### Description
Minimal page at `/t` serving as the QR code destination URL. Detects customer vs. staff scanner context and redirects appropriately.

#### User Stories
- As a customer scanning my email QR, I want to be taken to the top-up page
- As a staff member scanning a ticket QR, I want to be taken to the scanner page in the correct mode

#### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| F4.1 | Read `?t=TKT-XXXXXX` query param | Must Have |
| F4.2 | Detect staff scanner session → redirect to `/scan?t=TKT-XXXXXX` | Must Have |
| F4.3 | No scanner session → redirect to `/top-up?t=TKT-XXXXXX` | Must Have |
| F4.4 | No ticket ID → show "Invalid ticket link" error | Must Have |

#### UI Components
- Minimal page — just detection and redirect. Shows a loading spinner or brief message.

#### API Endpoints
None — pure client-side redirect based on sessionStorage.

---

### Feature 5: Customer Ticket Dashboard

#### Description
Logged-in section of `/tickets` where customers view all their tickets with QR codes, check activity credit balances, and see transaction history.

#### User Stories
- As a customer, I want to log in with my email (magic link) and see all my tickets
- As a customer, I want to see my activity credit balance and transaction history
- As a customer, I want to scan my QR code from the dashboard at the gate

#### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| F5.1 | Magic link authentication via Supabase Auth | Must Have |
| F5.2 | Display all tickets associated with the customer's email | Must Have |
| F5.3 | Show QR code for each ticket (scanable at gate/booth) | Must Have |
| F5.4 | Show current balance for activity credit tickets | Must Have |
| F5.5 | Transaction history: chronological list with date, change, source, running balance | Must Have |
| F5.6 | "Top up" button for activity credits → links to `/top-up?t=TKT-XXXXXX` | Must Have |
| F5.7 | Dashboard access code: 4-6 character PIN for security | Must Have |
| F5.8 | Resend access code via email if customer forgets it | Nice to Have |

#### UI Components
- **Login prompt**: Magic link email input
- **Ticket list**: Cards for each ticket with QR code, type, status, balance
- **Transaction history**: Scrollable table with date/change/source/balance columns
- **Top-up button**: Links to self-service top-up with ticket pre-loaded

#### API Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/functions/v1/ticketing/view-tickets` | Fetch tickets by email + access code | Rate-limited |
| POST | `/functions/v1/ticketing/resend-access-code` | Email new access code | Rate-limited |

#### Validation Rules
- Access code: 4-6 characters, alphanumeric
- Rate limit: 5 attempts per IP per minute for ticket lookup

---

### Feature 6: Admin Ticketing Dashboard

#### Description
Admin page at `/admin-tickets` for ticketing management. Requires `admin_role` or `ticketing_role` auth.

#### User Stories
- As an admin, I want to see inventory overview (capacity vs sold) at a glance
- As an admin, I want to view and filter orders by status and manually mark Wave payments as paid
- As an admin, I want to configure ticket types, top-up bundles, and the balance cap
- As an admin, I want to issue and revoke staff scanner codes
- As an admin, I want to regenerate tickets for a paid order if email delivery failed

#### Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| F6.1 | Inventory overview: 4 stat cards (sold, capacity, remaining, fill rate) + per-type table | Must Have |
| F6.2 | Detailed breakdown by category with sales and revenue | Must Have |
| F6.3 | Redemption stats: total redeemed, debit transactions, avg per debit | Must Have |
| F6.4 | Order management: filterable list (all/unpaid/paid/pending_verification/cancelled) | Must Have |
| F6.5 | "Mark Paid" button for unpaid orders: triggers ticket generation + email | Must Have |
| F6.6 | "Regenerate Tickets" button for paid orders with missing tickets | Must Have |
| F6.7 | Ticket types editor: add/edit/remove ticket types with prices, capacities, active status | Must Have |
| F6.8 | Top-up bundles editor: add/remove bundle amounts | Must Have |
| F6.9 | Balance cap setting: update `balance_cap` in `system_config` | Must Have |
| F6.10 | Scanner codes manager: issue new codes, revoke existing, view last used timestamps | Must Have |
| F6.11 | Access restricted to `admin_role` or `ticketing_role` JWT | Must Have |

#### UI Components
- **Stat cards**: 4-grid overview (Total Sold, Total Capacity, Remaining, Fill Rate)
- **Category breakdown**: Sales table grouped by category with progress bars and revenue
- **Order table**: Scrollable table with status badges, filter buttons, action buttons
- **Ticket type form**: Inline editor for each type with name/slug/type/price/capacity/active
- **Bundle list**: Simple list with add/remove buttons
- **Balance cap input**: Single field with save button
- **Scanner code list**: Table with code/name/modes/status/actions
- **Password change form**: Embedded in Account Settings section

#### API Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/rest/v1/ticket_types` | Fetch all ticket types via admin query | Service key |
| GET | `/rest/v1/orders` | Fetch orders with filters via admin query | Service key |
| GET | `/rest/v1/top_up_bundles` | Fetch top-up bundles | Service key |
| GET/PATCH | `/rest/v1/system_config` | Read/update balance cap | Service key |
| GET/POST/PATCH | `/rest/v1/staff_scanner_codes` | Manage scanner codes | Service key |
| POST | `/functions/v1/ticketing/admin-query` | Proxy for admin REST queries | Service key |
| POST | `/functions/v1/ticketing/confirm-payment` | Mark order as paid | Service key |
| POST | `/functions/v1/ticketing/regenerate-tickets` | Regenerate missing tickets | Service key |

#### Validation Rules
- Service role key: Required for all admin operations (stored in `sessionStorage` as `wf_service_key`)
- Scanner code: Auto-generated 8-character alphanumeric on creation
- Price: Must be >= 0
- Capacity: Must be >= 0

#### Error Handling
| Error Condition | User Message |
|----------------|--------------|
| No service key | "Please enter the service role key to access ticketing management." |
| Order already has tickets | "This order already has tickets. Use Regenerate if they were not delivered." |
| Scanner code already exists | "That code is already in use. Generate a different one." |

---

## 6. UI/UX Specifications

### Design System
- **Primary Color:** `oklch(62% 0.16 35)` (coral/accent)
- **Secondary Color:** `var(--accent-dim)` (lighter variant)
- **Background:** `var(--bg)` (light) / `var(--surface)` (card backgrounds)
- **Text:** `var(--fg)` (foreground) / `var(--muted)` (secondary)
- **Border:** `var(--border)`
- **Font Family:** `var(--font-display)` (headings) / `var(--font-body)` (body)
- **Border Radius:** 6px (buttons), 10px (cards), 12px (stat cards), 100px (badges)
- **Max Width:** `--max-w: 1200px`, `--gutter: 24px`

### Page Layouts

#### Page: Ticket Shop
- **Route:** `/tickets`
- **Layout:** Single column `.w` container with ticket type cards in responsive grid
- **Components:** Ticket cards, cart sidebar, checkout form, confirmation screen, dashboard (logged-in)
- **State:** Cart items, selected payment method, order ID, ticket list (after login)

#### Page: Self-Service Top-Up
- **Route:** `/top-up`
- **Layout:** Single column with hero CTA section, code input section, balance display, bundle grid
- **Components:** Hero CTA, ticket code input, balance bar, bundle buttons, custom amount, payment flow
- **State:** Ticket lookup (param/code), balance, selected amount, payment intent

#### Page: Staff Scanner
- **Route:** `/scan`
- **Layout:** Full-screen with mode selector at top, camera viewfinder, info panel at bottom
- **Components:** Passcode screen, mode buttons, camera view, manual input, ticket info panel, action buttons
- **State:** Passcode session, selected mode, scanned ticket, pending action, payment flow

#### Page: QR Lookup
- **Route:** `/t`
- **Layout:** Minimal — detection and redirect only
- **Components:** Loading spinner
- **State:** Scanner session detection

#### Page: Admin Ticketing Dashboard
- **Route:** `/admin-tickets`
- **Layout:** Single column with collapsible sections
- **Components:** Stat cards, tables, filter buttons, action buttons, editors
- **State:** Auth session, loaded data for each section

### Navigation Structure
```
Home (/)
├── Tickets (/tickets) — shop + dashboard
├── Top Up (/top-up) — self-service top-up
├── Scan (/scan) — staff QR scanner
├── QR Lookup (/t) — QR destination redirector
├── View Tickets (/view-tickets) — magic link ticket lookup
├── Ticketing Admin (/admin-tickets) — admin management
├── Login (/login) — unified auth
└── Admin (/admin) — existing admin dashboard
```

### Responsive Breakpoints
| Breakpoint | Width | Layout Changes |
|------------|-------|----------------|
| Mobile | < 768px | Grid collapses to single column, bottom-tabs replace nav, tables scroll horizontally |
| Tablet | 768-1024px | 2-column grids, side-by-side sections |
| Desktop | > 1024px | Full layout with multi-column grids, stat cards in 4-column rows |

---

## 7. User Flows

### Flow 1: Ticket Purchase (ModemPay)
```
Start → Browse /tickets → Select quantities → Enter email →
Choose "ModemPay" → Order created (unpaid) →
Redirect to ModemPay → Pay via mobile money →
Webhook received → Tickets created → QR generated →
Email sent to customer → Customer sees confirmation with codes
    │
    └── Failure: Webhook cancelled → Order status = cancelled →
        Customer shown failure message → Can retry
```

**Detailed Steps:**
1. Customer browses ticket types on `/tickets`
2. Selects quantities via +/- buttons → cart updates total
3. Enters email address
4. Selects ModemPay payment → "Pay with ModemPay" button
5. System creates order (`status = 'unpaid'`) via Edge Function
6. System creates ModemPay payment intent → redirects to ModemPay
7. Customer completes payment on ModemPay (Wave/QMoney/AfriMoney)
8. ModemPay sends webhook (`charge.succeeded`) to Edge Function
9. Edge Function validates signature, checks idempotency
10. Creates tickets in DB with generated QR codes
11. Uploads QR images to Supabase Storage
12. Sends confirmation email via Resend with QR codes + ticket codes
13. Customer sees success page with ticket codes and "Check email" message

### Flow 2: Ticket Purchase (Wave Transfer)
```
Start → Browse /tickets → Select quantities → Enter email →
Choose "Wave Transfer" → See Wave number + amount →
Pay via Wave app → Submit reference number + screenshot →
Order = pending_verification → Admin verifies →
    │                              │
    ├── Verified → Tickets created → Email sent → Customer notified
    └── Rejected → Order cancelled → Customer notified
```

### Flow 3: Self-Service Top-Up
```
Start → Open email link (or enter ticket code on /top-up) →
Ticket loaded → See current balance → Select bundle D200 →
Confirm → ModemPay initiated → Pay → Webhook →
Balance increased atomically → Receipt email sent →
"Top-up successful! New balance: D700"
    │
    └── Balance would exceed D5,000 → "Maximum balance reached"
```

### Flow 4: Gate Scan
```
Start → Staff opens /scan → Enters passcode →
Selects "Gate Mode" → Camera activates →
Scans customer's entry pass QR → Ticket info loads →
"Mark as entered" button → Confirms →
Ticket status = 'used' → "Entry confirmed"
    │
    └── Already used → "This ticket was already used at 14:32"
```

### Flow 5: Activity Debit
```
Start → Staff opens /scan in Debit mode →
Scans activity credit QR → Shows name + D500 balance →
Enters "D50" for Side Games → Confirms →
Atomically: balance = D500 - D50 = D450 →
Shows "D50 debited. Remaining: D450"
    │
    └── Insufficient balance → "Only D30 remaining. Debit of D50 not possible."
```

### Flow 6: Booth Top-Up (Cash)
```
Start → Staff in Top-up mode → Scans customer's QR →
Shows customer info + D200 balance →
Selects D200 bundle → Staff selects "Cash" method →
Customer pays D200 cash → Staff taps "Received (Cash)" →
Balance = D200 + D200 = D400 → Receipt email sent →
"Top-up successful! New balance: D400"
```

### Flow 7: Offline Catch-Up
```
Start → Internet drops → Staff records on paper log sheet →
Internet restored → Staff navigates to Bulk Top-Up mode →
Enters 3 rows from paper → "Submit all" →
Atomically processes all 3 → receipts sent →
"3 transactions processed. 0 errors."
```

---

## 8. Non-Functional Requirements

### Performance
- Page load time: < 2 seconds (static HTML with deferred scripts)
- API response time: < 500ms for ticket lookup, < 200ms for balance reads
- QR scanning: < 1 second to detect and decode
- Email delivery: < 30 seconds from payment confirmation
- Support concurrent scans from up to 20 staff devices simultaneously

### Security
- [x] Input sanitization on all forms (existing `escapeHtml` utility)
- [x] HTTPS only (Vercel default)
- [x] SQL injection prevention (parameterized queries via Supabase REST + Edge Function)
- [x] XSS prevention (escape HTML in all admin display)
- [x] ModemPay webhook HMAC signature validation
- [ ] Rate limiting on ticket lookup, staff auth, and email endpoints
- [ ] Service role key never hardcoded — stored in `sessionStorage` after admin login
- [ ] RLS policies on all tables — anon read-only for public, email-match for own tickets
- [ ] Idempotency keys on webhook processing
- [ ] Balance cap (D5,000) enforced at application level
- [ ] Atomic balance updates: `UPDATE ... SET balance = balance + delta WHERE id = X AND balance + delta >= 0 AND balance + delta <= balance_cap`

### Accessibility
- [ ] Keyboard navigable (existing patterns)
- [ ] Screen reader compatible (ARIA labels on interactive elements)
- [ ] Color contrast ratio 4.5:1 minimum (existing OKLCH design system)
- [ ] Touch targets: min-height 44px (existing pattern)
- [ ] `prefers-reduced-motion`: disables all animations (existing)

### Browser Support
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions) — iOS Safari is primary mobile target
- Samsung Internet — common in Gambia

---

## 9. Scope Boundaries

### In Scope (MVP)
- Public ticket shop at `/tickets` with ModemPay and Wave Transfer payment
- Self-service top-up at `/top-up` with QR link and ticket code identity
- Staff QR scanner at `/scan` with Gate, Debit, and Top-up modes
- QR ticket lookup page at `/t` with context detection
- Customer ticket dashboard with magic link auth, balance display, transaction history
- Admin ticketing dashboard at `/admin-tickets` with inventory, orders, types, bundles, scanner codes
- Wave Transfer admin verification (manual confirm/reject)
- Offline resilience: paper log sheets + Bulk Top-Up catch-up
- ModemPay manual override for delayed webhooks
- Cross-type on-site purchase (new activity credit ticket at booth)
- Email notifications: order confirmation with QR codes, top-up receipts, debit receipts
- Access code system for dashboard login
- Balance cap (D5,000 default, admin-configurable)
- `ticketing_role` JWT support in auth system

### Out of Scope (Future)
- Native mobile app for scanning — Reason: browser-based scanning works on personal phones without app store friction
- Offline-first architecture with local cache — Reason: paper log sheets with Bulk Top-Up catch-up are more reliable for a one-day festival
- Real-time dashboard updates via WebSocket — Reason: polling from admin dashboard is sufficient for event scale
- Automated refund processing — Reason: refunds handled out-of-band; admin marks order as refunded
- Multi-event support — Reason: Piroake Fest 2026 is the only event; generic multi-event support would add complexity without current need

### Explicit Non-Goals
- This system will NOT support free/comp ticket creation without an order
- This system will NOT support group ticket splitting (one Group pass = one ticket, single scan)
- This system will NOT support ticket transfer between customers
- This system will NOT support partial order refunds
- This system will NOT replace the existing vendor/photos admin systems — ticketing admin is separate at `/admin-tickets`

---

## 10. Acceptance Criteria

### Feature 1: Ticket Shop & Purchase Flow
- [ ] Customer can browse active ticket types with prices on `/tickets`
- [ ] Customer can select quantities for multiple types and see running total
- [ ] Capacity enforcement prevents over-selling (error if quantity > remaining capacity)
- [ ] ModemPay flow: order created → payment intent → webhook → tickets generated → email sent
- [ ] Wave Transfer flow: order created → payment proof submitted → order shows `pending_verification`
- [ ] Sold counter increments atomically only on confirmed payment
- [ ] Email contains QR codes for each ticket and ticket codes

### Feature 2: Self-Service Top-Up
- [ ] `/top-up?t=TKT-XXXXXX` loads ticket info (balance, type, name)
- [ ] Bundle buttons display amounts from `top_up_bundles` table
- [ ] Custom amount input enforces min D50 and max (`balance_cap - current_balance`)
- [ ] Balance cap enforced: error if `current_balance + amount > balance_cap`
- [ ] ModemPay top-up: webhook increases balance atomically
- [ ] Receipt email sent after successful top-up

### Feature 3: Staff QR Scanner
- [ ] Invalid passcode → error, valid passcode → mode selection
- [ ] Camera activates in all three modes
- [ ] Manual ticket code input works alongside camera scanning
- [ ] Gate mode: entry pass marked `used`, rejects already-used tickets
- [ ] Debit mode: balance decreases atomically, insufficient balance → error
- [ ] Top-up mode: three identification tiers (QR → code → email)
- [ ] Top-up mode: balance increases atomically after payment
- [ ] All three payment methods (ModemPay QR, Wave, Cash) work
- [ ] Bulk Top-Up: batch processing from paper log sheet → receipts for each entry

### Feature 4: QR Ticket Lookup
- [ ] `/t?t=TKT-XXXXXX` redirects to `/top-up?t=TKT-XXXXXX` (customer context)
- [ ] With scanner session → redirects to `/scan?t=TKT-XXXXXX`
- [ ] No ticket ID → shows error message

### Feature 5: Customer Ticket Dashboard
- [ ] Magic link login works for customer email
- [ ] All tickets for that email displayed with QR codes
- [ ] Activity credit balance shown for rechargeable tickets
- [ ] Transaction history shows chronological list with dates, deltas, running balance
- [ ] "Top up" button links to `/top-up?t=TKT-XXXXXX`

### Feature 6: Admin Ticketing Dashboard
- [ ] Inventory overview loads with correct sold/capacity/fill stats
- [ ] Order list filters by status (all/unpaid/paid/pending_verification/cancelled)
- [ ] "Mark Paid" creates tickets and sends email for unpaid Wave orders
- [ ] "Regenerate" creates tickets for paid orders that have none
- [ ] Ticket type editor saves changes (name, price, capacity, active status)
- [ ] Top-up bundle editor adds/removes amounts
- [ ] Balance cap setting changes take effect immediately
- [ ] Scanner codes can be issued and revoked
- [ ] Role check: `admin_role` or `ticketing_role` can access; others redirected

### Overall Application
- [ ] All pages load without JS errors
- [ ] All forms validate required fields before submission
- [ ] All API endpoints return expected response structure
- [ ] Mobile layout is functional on iOS Safari and Chrome
- [ ] CSP headers do not block Supabase, ModemPay, or Turnstile connections
- [ ] Vercel rewrites resolve all new routes correctly

---

## 11. Development Phases

### Phase 1: Foundation (Checkpoint 1)
**Goal:** Database schema, Edge Function, admin verification UI
- [ ] Database migration: all 8 tables + RLS policies + indexes + functions
- [ ] Ticketing Edge Function: webhook handling, QR generation, ticket creation, email via Resend
- [ ] Admin Wave Transfer verification UI (in `admin-tickets.js`)

### Phase 2: Ticket Shop & Purchase Flow (Checkpoint 2)
**Goal:** Customer-facing purchase experience
- [ ] `/tickets` page with ticket type display and quantity selection
- [ ] ModemPay checkout flow (create-intent → webhook → tickets → email)
- [ ] Wave Transfer checkout flow (proof submission → pending verification)
- [ ] Customer ticket dashboard with magic link auth, balance display, transaction history

### Phase 3: Self-Service Top-Up (Checkpoint 3)
**Goal:** Customers top up credits on their own
- [ ] `/top-up` page with QR link identity and ticket code entry
- [ ] Top-up form with bundles and custom amount + balance cap enforcement
- [ ] Self-service ModemPay top-up flow
- [ ] `/t` QR ticket lookup page with context detection

### Phase 4: Staff Scanner Pages (Checkpoint 4)
**Goal:** Venue operations — gate, booth debit, booth top-up
- [ ] `/scan` page with staff passcode gating
- [ ] Browser QR scanning integration (`html5-qrcode`)
- [ ] Gate mode: mark entry/parking passes as used
- [ ] Debit mode: atomic balance deduction
- [ ] Top-up mode: three-tier identification + amount selection
- [ ] Top-up mode: three payment methods (ModemPay QR, Wave, Cash)
- [ ] Cross-type on-site purchase toggle
- [ ] Offline resilience: Bulk Top-Up + manual override

### Phase 5: Admin Dashboard & Polish (Checkpoint 5)
**Goal:** Admin management tools and final integration
- [ ] Admin ticketing dashboard: inventory, orders, ticket types, bundles, balance cap, scanner codes
- [ ] Nav links, bottom-tabs, sitemap for all new pages
- [ ] Integration tests in `test_ticketing.py`

---

## 12. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| ModemPay API details unavailable or change | High | Medium | Need ModemPay API docs/sandbox before Phase 2. Add ModemPay domains to CSP `connect-src` |
| QR scanner library (`html5-qrcode`) incompatible on target phones | High | Low | Test on target devices (Samsung Internet, iOS Safari) early in Phase 4. Have manual code input as fallback |
| Network congestion at venue overloads Edge Function | Medium | Medium | Rate limiting on staff-auth and lookup endpoints. Offline paper log sheets for worst case |
| Staff mistrain on paper log sheets | Medium | Low | Printed forms with clear columns + brief ops guide laminated at each booth |
| Magic link email deliverability issues | Medium | Low | Resend already DKIM/SPF verified for `noreply@walkingfish.gm`. Test magic link flow early in Phase 2 |
| Concurrent debit attempts cause race conditions | High | Low | Atomic SQL update (`balance = balance - amount WHERE balance >= amount`) prevents double-spend. RLS policies enforce row-level security |
| Balance cap bypass attempt | Medium | Low | Cap enforced at application level AND database level in RPC functions |

---

## 13. Key Decisions & Trade-offs

| Decision | Chosen Approach | Alternative Rejected | Rationale |
|----------|----------------|---------------------|-----------|
| Payment model | ModemPay + Wave Transfer | ModemPay-only or Wave-only | Covers both instant (90% case) and no-fee (cost-sensitive) customers |
| Ticket split | Entry/parking separate from activity credits | Single ticket class with type flag | Two fundamentally different lifecycles — cleaner scan logic |
| QR content | URL (`/t?t=TKT-XXXXXX`) | Raw ticket ID or balance value | Same QR works for customer (→ top-up) and staff (→ scan). Balance always loaded server-side |
| Delivery | Email (QR inline) + Dashboard | Email-only | Covers "I deleted the email" case |
| Scanner | Browser-based web app | Native app (iOS/Android) | No app store submission, works on staff's personal phones |
| Offline | Paper log + Bulk Top-Up | Local storage/offline queue | More reliable for financial transactions at a one-day festival |
| Auth (customers) | Magic link + access code | Phone number + OTP | Works without SMS delivery issues. Access code adds security without friction |
| Auth (staff) | Passcode table (`staff_scanner_codes`) | Supabase Auth users | No email/setup needed — admin generates codes instantly |

---

## 14. Appendix

### Reference Files
- **ADR-002**: `docs/decisions/ADR-002-ticketing-system.md` — Full decision record with all resolved questions
- **Implementation Plan**: `docs/plan-ticketing-implementation.md` — Detailed 5-phase implementation plan with 27 tasks
- **CONTEXT.md**: `CONTEXT.md` — Glossary and architecture reference for the ticketing system
- **Existing Migration**: `supabase/migrations/20260523000001_create_ticketing_tables.sql` — Database schema
- **Admin Tickets JS**: `admin-tickets.js` — 2,500+ lines of admin ticketing logic already implemented

### API Documentation Links
- Supabase REST API: `https://anigcqdquakinlzvyaur.supabase.co/rest/v1/`
- Supabase Edge Functions: `https://anigcqdquakinlzvyaur.supabase.co/functions/v1/ticketing`
- Resend Email API: Reference in existing codebase (`supabase/functions/ticketing/index.ts`)
- ModemPay API: Custom integration in Edge Function

### Glossary
| Term | Definition |
|------|-----------|
| Activity Credit | Stored-value balance on a ticket, debited per use at activity booths |
| Balance Cap | Maximum balance an activity credit ticket can hold (default D5,000) |
| Bulk Top-Up | Batch processing of pending transactions recorded during network outage |
| Debit Mode | Scanner mode for game/karaoke booths — deducts session costs |
| Entry Pass | One-time gate ticket scanned at venue entry |
| Gate Mode | Scanner mode for venue entry — marks tickets as `used` |
| ModemPay | Primary payment gateway — instant mobile money (Wave, QMoney, AfriMoney) |
| Top-Up Mode | Scanner mode for top-up booth — increases activity credit balance |
| Ticket Code | Human-readable 12-character code (e.g., `TKT-7F3A2B`) |
| Wave Transfer | Manual payment method — customer sends money to a Wave number |
| `ticketing_role` | Supabase Auth JWT role for ticketing staff — scoped to ticketing tables only |
| Scanner Passcode | Unique staff code for `/scan` page access |

---

> **This PRD covers the complete ticketing system for Walking-Fish Group's Piroake Fest 2026. The system is built on the existing static HTML + Supabase stack with 5 phases, 27+ implementation tasks, and 6 major features spanning customer purchase, self-service top-up, staff venue operations, and admin management.**

>> **Source:** Based on codebase scan of existing ticketing implementation including `admin-tickets.html`, `admin-tickets.js`, `tickets.js`, `scan.js`, `top-up.js`, the ticketing Edge Function (`supabase/functions/ticketing/index.ts`), database migrations, ADR-002, and the implementation plan at `docs/plan-ticketing-implementation.md`.

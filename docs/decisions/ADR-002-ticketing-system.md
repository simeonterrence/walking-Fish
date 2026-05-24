# ADR-002: Ticketing System — Dual Payment & Entry/Activity Ticket Split

## Status
Accepted

## Date
2026-05-21

## Context

Piroake Fest 2026 is Walking-Fish Group's flagship festival (June 2026). The website currently has an early-access signup form but no ticket purchasing system. We need to build one.

Key constraints:
- **Static site**: All pages are plain `.html` files served via Vercel — no build step, no framework, no `package.json`.
- **Supabase backend**: Existing Supabase project (`anigcqdquakinlzvyaur`) with RLS, auth, and Edge Functions.
- **No international payment gateway**: Many global processors are hard to set up from The Gambia. Customers primarily use mobile money (Wave, QMoney, AfriMoney).
- **Simple existing form pattern**: All form submissions go through a `verify-turnstile` Edge Function that emails admins and sends auto-responders via Resend.

Two distinct ticket behaviours emerged during discovery:

1. **Entry/Parking passes** — One-time use, scanned at the gate, then consumed.
2. **Activity credits** — Rechargeable stored-value balance, debited per session at games/karaoke booths. Customers can top up on-site.

## Decision

### 1. Dual Payment Model (ModemPay + Wave Transfer)

Two parallel payment methods with different trust models:

**Primary: ModemPay (instant, 1.5% fee)**
- Custom API integration via a Supabase Edge Function
- Supports Wave, QMoney, AfriMoney mobile money
- Webhook (`charge.succeeded` / `charge.cancelled`) confirms payment server-side — never trust the browser redirect alone
- Customer receives QR tickets immediately after webhook confirmation
- 1.5% processor fee absorbed by the customer (added to checkout total or shown as fee line)

**Secondary: Wave Transfer (manual, no fee)**
- Customer sends exact amount to a Wave number displayed on the order page
- Uploads proof of payment (screenshot or reference number) via a simple form
- Admin verifies in a dedicated dashboard page
- Tickets released upon admin confirmation (target: ~2 hours)
- No platform fee, paid by Walking-Fish (not passed to customer)

**Rationale:**
- ModemPay covers the 90% case — customers who want instant tickets and accept the fee
- Wave Transfer covers customers who want to avoid the fee or cannot use ModemPay
- Manual verification is operationally acceptable (small event, staffed by the team)
- Both flows share the same ticket generation and delivery pipeline — only the payment verification step differs

**Alternatives considered:**
- *Stripe/Paystack* — Not regionally optimised for Gambian mobile money; ModemPay is purpose-built for this market
- *ModemPay only* — Excludes cost-sensitive customers; Wave Transfer is a well-understood local pattern
- *Wave Transfer only* — Creates a bottleneck and delays for every customer; ModemPay solves the instant-need case

### 2. Entry/Activity Ticket Split

Tickets are divided into two classes with different lifecycles:

**Entry Passes (and Parking)**:
- Purchased as part of an order
- Generate a unique QR code upon payment confirmation
- Scanned once at the gate — status changes from `active` to `used`
- No balance tracking needed
- Types: Regular (D300/D400), VIP (D800/D1,000), Group 5-pax (D1,300), Parking (TBD)

**Activity Credits**:
- Purchased as credit bundles with a starting balance (e.g., D500 Games Pass)
- Each ticket has a `balance` field (integer, in GMD centavos or whole dalasis)
- Scanned at each activity booth — booth staff enters the amount to debit
- Balance decreases atomically on each debit
- Rechargeable via on-site top-up (ModemPay instantly or Wave at a top-up booth)
- Activity types: Side Games (D50/5min), Karaoke (TBD)

**Rationale:**
- A single "ticket" concept would conflate two fundamentally different lifecycle patterns
- Separate classes keep the scan logic simple for venue staff
- The rechargeable model matches how festival wristband top-ups work globally
- Deleting from a balance rather than tracking individual "tokens" is simpler and more flexible for pricing changes

**Alternatives considered:**
- *Token-based model* — Sell packs of 10 tokens, deduct one per use. Less flexible for variable pricing and partial top-ups.
- *Single ticket class with a type flag* — Would require conditionals in every scan operation. Separate tables/classes are clearer.

### 3. Dual Delivery: Email QR + Dashboard Lookup

Every ticket (both entry passes and activity credits) is delivered two ways:
1. **Email**: Automated via Resend (same infrastructure as existing forms) with QR code inline as an embedded image or attachment
2. **Dashboard**: Buyer can log in to a simple ticket dashboard to view/scan their QR codes

**QR encodes a URL:** The QR code encodes `https://walkingfish.gm/t?t=TKT-XXXXXX` — a short lookup URL that works for both staff and customers:
- **Customer tap**: Opens the ticket lookup page → detects non-staff context → redirects to top-up or ticket view
- **Staff scan**: Scanner app reads the ticket ID from the URL for gate/booth operations
- **Same QR, two contexts**: No need for separate QRs — the receiving system determines the behavior based on session/auth context

**Rationale:**
- Email is the most reliable push channel — works even if the customer has no data at the venue
- Dashboard covers the "I deleted the email" case and lets customers check their activity balance
- The URL-based QR enables self-service top-up identity (D) by encoding a clickable link, not just a machine-readable ID

### 4. Web-Based QR Scanner

Staff scan tickets using a browser-based QR scanner page (no native app). Works on any phone with a camera and modern browser.

Three scan modes:
- **Gate mode**: Scan entry/parking pass QR → mark as `used`. Reject if already used.
- **Debit mode**: Scan activity credit QR → enter debit amount → confirm → reduce balance. Show remaining balance. (Used at game/karaoke booths.)
- **Top-up mode**: Scan activity credit QR → select top-up amount → accept payment (ModemPay, Wave, or Cash) → confirm → increase balance. (Used at top-up booth.)

All three modes use the same ticket lookup mechanism (QR scan or manual ticket code entry). The mode only determines what action is performed after the ticket is identified.

**Rationale:**
- No app store submission, no installation friction
- Works on staff's personal phones
- Can be deployed as a hidden page linked from the admin dashboard

## Consequences

- **Two payment flows to maintain** — ModemPay webhook vs. manual admin verification. The ticket generation pipeline is shared, but verification is separate.
- **Admin verification workload** — Staff must monitor the manual Wave transfer queue during business hours (~2 hour SLA).
- **Activity balance atomicity** — The booth scan endpoint must handle concurrent debit attempts correctly (Supabase RLS with atomic `UPDATE ... SET balance = balance - amount WHERE balance >= amount`).
- **QR code generation** — Requires a server-side Edge Function (or a library like `qrcode` in the Edge Function). Cannot generate QR codes client-side for email delivery.
- **New Edge Function needed** — A dedicated `ticketing` Edge Function (or extended `verify-turnstile`) to handle ModemPay webhooks, ticket generation, and QR creation. The existing `verify-turnstile` function is purpose-built for form submissions and should not be overloaded.
- **Inventory tracking** — Each ticket type has a `capacity` and `sold` counter. Sold count increments only on confirmed payment.
- **Supabase migrations required** — New tables for `orders`, `tickets`, `payment_proofs`, `top_up_bundles`, and `balance_transactions`.- **/tickets page** — New static HTML page at `/tickets` with rewrites in `vercel.json`, nav links, and bottom-tab entry.
- **/top-up page** — New static HTML page at `/top-up` with rewrite in `vercel.json`. Handles `?t=TKT-XXXXXX` query param for link/QR identity path. Nav link and bottom-tab entry for direct access.
- **/t lookup page** — Minimal page at `/t` (no rewrite needed — existing `/t` will work) that detects customer vs. staff scanner context and redirects to `/top-up` or `/scan` respectively. Serves as the single QR destination from Section 3.

## Resolved Questions

1. **Activity pricing** — Admin-configurable in the dashboard. Prices stored in a `ticket_types` database table rather than hardcoded. Current default: D50/session for Side Games.
2. **Parking ticket pricing** — D100.
3. **Activity credit minimum purchase** — D50 minimum top-up.
4. **Wave number for manual transfers** — +220 696 3419.
5. **QR scanner page access** — The scanner page lives at `/scan`. Access is gated by unique per-staff passcodes issued by an admin. Each staff member gets their own code, stored in a `staff_scanner_codes` table. The scanner page prompts for a code before activating the camera/scanner.
6. **Top-up flows** — Two parallel paths: **self-service** (customer on their phone) and **booth-assisted** (staff at a top-up booth handles it). Both are needed.
7. **Top-up is additive** — Customer adds credits to an existing activity credit ticket (the same ticket in their order). They do not buy a new ticket; the balance on their existing ticket increases.
8. **Top-up bundles** — Admin-configurable set of predefined amounts stored in a database table (`top_up_bundles`), with sensible defaults that work out of the box:

   **Default top-up bundles** (on-site self-service and booth): D100, D200, D500, D1,000
   - **D100** = 2 games at D50/session — lowest practical entry point
   - **D200** = 4 games — the default "just enough to have fun" option
   - **D500** = 10 games — for people who plan to spend the afternoon
   - **D1,000** = 20 games — heavy user tier

   **Custom amount**: A text input for amounts between D50 (minimum) and the balance cap (D5,000 default, admin-configurable), so customers aren't forced into a bundle size.

   **Distinct from initial purchase bundles**: Top-up bundles (D100–D1,000) are different from initial activity credit bundles at the ticket shop (e.g., D500, D1,000, D2,000). Initial purchase amounts are set separately in the `ticket_types` table.

   **Admin dashboard**: Simple list UI to add/remove top-up bundle amounts. Changes take effect immediately for all subsequent top-ups.

9. **Self-service top-up identity** — Three-tier identity mechanism on the top-up page, ordered by UX priority:

   **Primary (D — Link/QR)**: The confirmation email contains a link encoding the ticket lookup URL (`https://walkingfish.gm/t?t=TKT-XXXXXX`). Customer taps the link → server detects customer context → redirects to `/top-up?t=TKT-XXXXXX` with ticket pre-loaded → confirm → top up. Zero typing, 3 steps. The same URL is encoded in the QR code for scanning from another device (e.g., email open on a laptop → scan with phone). Staff scanners also read this same QR — the `/t` route detects their scanner session and redirects to `/scan` instead.

   **Secondary (C — Ticket code)**: Customer enters their human-readable 6-8 character ticket code (e.g., `TKT-7F3A2B`). No email dependency. Works if the link wasn't opened beforehand, or if the customer only remembers the code.

   **Tertiary (B — Dashboard login)**: Link to the ticket dashboard at `/tickets` where customers log in via magic link to see all their tickets and top up. Built primarily as a full ticket dashboard (balance checking, top-up history, ticket list), not just for top-up identity.

   **Rejected (A — Order ref + OTP)**: Order reference is too long to type on a phone at a festival. The ticket code already covers the typed fallback case with fewer characters and no email dependency. The booth handles the "lost everything" edge case in person.

   **Top-up page UX**: Landing page at `/top-up` shows two clear paths:
   - (1) Large hero CTA: "Tap your link or scan your QR" — explains how to use the link from the email
   - (2) Secondary text input: "Enter your ticket code" — simple field for the 6-8 char code
   - Small tertiary link: "Sign in to your ticket dashboard →"

   **Rationale**:
   - Link/QR is the ideal path — already in every confirmation email, zero friction
   - Ticket code is a reliable fallback — short enough to text to yourself or write on your hand
   - Dashboard login exists for its own value (balance checking, history) — top-up is a bonus use case
   - Reject A because the order reference is too long to type comfortably on a phone, and the email OTP adds latency at the venue when networks are congested
   - A single URL (`/t`) for both customer and staff contexts means one QR on the ticket serves both use cases — the `/t` route redirects based on session context (customer browser vs. staff scanner session)
   - The three tiers cover every realistic scenario without overwhelming the user with choices

10. **Booth identification (top-up)** — Three-tier identity mechanism for booth staff to find a customer's ticket, ordered by efficiency:

    **Primary — Scan QR**: Customer shows their confirmation email QR on their phone → staff scans it using the `/scan` page in Top-up mode → ticket info loads (name, current balance, ticket type) → staff selects top-up amount → process payment → confirm. Uses the same QR as gate scanning (`/t?t=TKT-XXXXXX`). Zero typing for either party.

    **Secondary — Enter ticket code**: Customer reads aloud their 6-8 character ticket code → staff types it into the scanner page → same flow. Useful when: phone battery dead, customer bought tickets on a friend's device, or code was written down on paper.

    **Tertiary — Email lookup**: Customer gives their email address → staff searches in the system → shows all tickets for that email → staff selects the correct one. The "lost everything" fallback.

    **Scanner page mode**: The `/scan` page gains a third mode called **Top-up** alongside Gate and Debit. In Top-up mode:
    - Scanning a QR or entering a ticket code loads the ticket info
    - Staff sees: customer name, ticket type, current balance
    - Staff selects top-up amount from predefined bundles (D100, D200, D500, D1,000) or enters a custom amount (min D50)
    - Staff selects payment method: **ModemPay** (customer scans a payment QR → pays → webhook auto-confirms), **Wave** (customer sends to booth Wave number → staff checks their Wave app → taps "Received"), or **Cash** (customer pays cash → staff gives change → taps "Received (Cash)")
    - Staff confirms → balance increases atomically

    **Rationale:**
    - QR scan is the fastest path — both parties have phones with cameras, zero typing
    - Ticket code is a reliable fallback — short enough to read aloud or write on a wristband
    - Email lookup is intentionally the slowest path, so staff naturally guide people toward QR or code
    - A dedicated Top-up mode keeps the scanner UI focused (different fields needed vs. Debit mode)

11. **Top-up receipt emails** — All top-ups (regardless of payment method) send a minimal confirmation email via Resend from `noreply@walkingfish.gm`. The email is lightweight — no QR codes, no attachments — and serves as a proof-of-purchase record.

    **Email content:**
    ```
    Subject: Top-up Confirmed — Games Pass

    Amount: +D200
    New balance: D700
    Ticket: TKT-7F3A2B
    Time: 21 May 2026, 14:32

    View your tickets -> https://walkingfish.gm/tickets
    ```

    **When it sends:**
    - **Self-service ModemPay**: Immediately after the ModemPay webhook confirms the charge
    - **Booth ModemPay**: Immediately after payment + staff confirms the top-up
    - **Booth Wave transfer**: After staff manually verifies and confirms the transfer
    - **Booth Cash**: Immediately after staff confirms receipt of cash and marks the top-up as paid

    **Rationale:**
    - Serves as proof-of-purchase for the customer's records
    - Provides evidence for dispute resolution if balance isn't updated correctly
    - Consistency with the initial purchase email pattern
    - Minimal content avoids inbox clutter while still providing essential info

12. **Balance transaction history** — Customers can see a complete chronological log of all balance changes (both top-ups and debits) in the ticket dashboard. Each transaction shows:

    - **Date/time** — When the transaction occurred
    - **Change** — `+D200` for top-ups, `−D50` for debits
    - **Source** — Where/why it happened (e.g., "Top-up — ModemPay", "Side Games — 5min", "Initial purchase")
    - **Balance after** — Running balance after this transaction

    **Data model**: A single `balance_transactions` table:
    ```
    id            UUID (PK)
    ticket_id     FK → tickets.id
    type          'top_up' | 'debit' | 'initial_purchase'
    amount_delta  integer (positive for top-ups/initial, negative for debits)
    balance_after integer
    source        'modempay' | 'wave' | 'cash' | 'booth_debit' | 'initial'
    notes         text (optional, e.g. "Side Games — 5min")
    created_at    timestamptz
    ```

    **Where it's visible:**
    - **Ticket dashboard** (`/tickets`) — full scrollable history for the logged-in customer
    - **Staff scanner page** (`/scan`) — staff can view the transaction log for a ticket when resolving disputes

    **Not shown on:** The confirmation screen after a top-up (only shows the new balance). The receipt email (only shows the single transaction).

    **Rationale:**
    - Serves customer trust — answers "where did my credits go?"
    - Doubles as an audit trail for staff dispute resolution
    - Single table records all balance changes, simplifying both customer-facing history and backend reconciliation
    - Not shown on the confirmation screen to keep it focused on the immediate result

13. **Balance cap** — A configurable maximum balance per activity credit ticket. Default: D5,000 (100 sessions at D50/session). Admin-configurable via a `balance_cap` setting in a system_config table or environment variable.

    **Default cap: D5,000**
    - Equivalent to 100 game sessions at D50/session — far more than any customer plays in a single day
    - High enough that no regular customer notices it
    - Low enough that a single exploit has a clear ceiling on financial exposure

    **Enforcement points:**
    - **Initial purchase**: `initial_balance + (existing balance, if any) ≤ D5,000`
    - **Self-service top-up**: `current_balance + top_up_amount ≤ D5,000`
    - **Booth top-up**: same check on the staff scanner page
    - All rejected with: *"Maximum balance of D5,000 reached. Visit the top-up booth if you need assistance."*

    **Also serves as custom amount max**: The custom amount input on the top-up page (see #8) has a dynamic maximum of `balance_cap - current_balance`, so it naturally enforces the cap.

    **Admin-configurable**: Stored in a `system_config` table (key: `balance_cap`, value: `5000` by default). Admin dashboard has a simple setting. Changes take effect immediately for all subsequent operations — no historical adjustment needed for existing tickets that already exceed a lowered cap (they can't top up further until their balance is below the cap).

    **Rationale:**
    - Limits financial exposure from payment reversals, staff errors, or API exploits
    - D5,000 is a generous ceiling — 100 sessions is genuinely beyond any realistic single-day use
    - Admin-configurable so the cap can be raised (or lowered) without a code change
    - Current enforcement (check at top-up/initial-purchase time) is simpler than retroactive enforcement against existing balances

14. **Payment at top-up booth** — Three payment methods accepted at the top-up booth, ordered by operational preference:

    **Primary — ModemPay (staff-initiated, automatic confirmation)**
    - Staff selects top-up amount in the scanner → system creates a ModemPay payment intent → scanner shows a payment QR code on screen
    - Customer scans the QR with their own phone and pays via ModemPay (supports Wave, QMoney, AfriMoney)
    - ModemPay webhook fires → balance updates **automatically** (same infra as self-service)
    - Scanner page polls for the webhook → shows success: *"Payment received! New balance: D700"*
    - Staff sees the result and moves to the next customer — no manual confirmation needed
    - Best for: customers with mobile data on their phone

    **Secondary — Wave transfer (staff-verified)**
    - Staff selects amount → scanner shows the booth's dedicated Wave number and the amount
    - Customer sends the exact amount via Wave to the booth number
    - Staff checks their personal Wave app for the incoming notification
    - Staff taps **"Received"** in the scanner → balance updates
    - Best for: customers who prefer Wave or have no data (Wave SMS/USSD works without internet)

    **Tertiary — Cash (staff-verified)**
    - Customer hands cash to staff → staff gives change if needed
    - Staff taps **"Received (Cash)"** in the scanner → balance updates
    - Best for: customers without mobile money, low battery, or who simply prefer cash

    **Scanner UI**: After staff selects the top-up amount and confirms the ticket, the scanner shows a row of payment method buttons:
    ```
    Payment method:
    [ModemPay] [Wave] [Cash]
    ```

    - **ModemPay** → Scanner generates a payment QR for the customer to scan with their phone
    - **Wave** → Scanner shows the booth's Wave number and amount; staff taps "Received" after checking their Wave app
    - **Cash** → Scanner shows "Received D200? [Yes]"; staff taps after accepting cash and giving change

    **Operational considerations for cash:**
    - **Float**: The booth starts each day with a cash float of ~D2,000 in small denominations to make change
    - **Lockbox**: Cash is secured in a lockbox, not left loose on the counter
    - **Cash drops**: Regular drops to a central safe if the float grows beyond a threshold
    - **Reconciliation**: At end of day, cash box total is reconciled against the sum of all cash top-ups recorded in the system via `balance_transactions` where source = `'cash'`
    - **No digital notification**: Unlike ModemPay (webhook) and Wave (Wave app notification), cash has no digital confirmation — staff's tap is the single source of truth. This means staff must be trusted and the reconciliation step catches discrepancies.

    **Dedicated booth Wave number**: The top-up booth uses a dedicated Wave number on a separate SIM/phone — not the general business number (+220 696 3419 from #4). This avoids co-mingling booth transactions with general business transfers and simplifies reconciliation.

    **Rationale:**
    - ModemPay is the fastest path — staff stays in the scanner app, confirmation is automatic via webhook, no manual steps
    - Wave covers customers without data (Wave works over basic SMS/USSD without internet)
    - Cash is the universal fallback — no phone needed at all, zero technical barriers
    - Three methods cover every realistic customer scenario without overcomplicating the scanner UI
    - A dedicated booth Wave number keeps reconciliation clean — every incoming transfer to that number is a booth top-up

15. **QR code after top-up** — The QR code **does not change** after a top-up or any other balance change. The same QR works for the entire ticket lifetime.

    **Why**: The QR encodes a ticket lookup URL (`https://walkingfish.gm/t?t=TKT-XXXXXX`), not the balance itself. Every scan looks up the ticket by ID and fetches the current balance from the database in real time. Balance changes are purely a server-side update — the QR is just a reference to the ticket.

    **Lifetime immutability**:
    - **After top-up**: Same QR, balance now higher in DB
    - **After debit**: Same QR, balance now lower in DB
    - **When exhausted (balance = 0)**: Same QR, scanner shows "Exhausted"
    - **After refund/reversal**: Same QR, balance updated server-side

    **Exception — admin fraud trigger**: If a ticket is suspected of fraud (e.g., shared QR, compromised), an admin can regenerate the QR. The ticket ID stays the same — the admin action simply marks the old QR as invalid and issues a new one via email/dashboard. This is a separate admin operation, not part of the normal top-up flow.

    **Consistency with existing decisions:**
    - Section 3 already specifies the QR encodes a URL (not a balance value)
    - The `balance_transactions` table (see #12) already stores all balance server-side — the QR just references the ticket
    - Self-service link identity (see #9) uses the same URL — it never changes after top-up either

    **Rationale:**
    - No QR regeneration means no extra Edge Function call, no new email, no confusion for customers who saved their QR
    - Server-side balance lookup is the correct architecture — the QR is a reference, not a data container
    - Simpler implementation, fewer failure modes, better UX

16. **Offline resilience** — No local cache or offline queue. Instead, a paper-based fallback system with a digital bulk catch-up mode.

    **Rationale against local caching/offline queue:**
    - The static site has no reliable local storage mechanism for financial transactions
    - Browser-based offline queues introduce sync conflicts, data loss risks, and reconciliation headaches
    - A low-tech paper solution is more reliable for a one-day festival than any offline-capable web app

    **Per-scenario response:**

    | Scenario | Response |
    |---|---|
    | **Self-service ModemPay, internet drops before payment** | None — customer can't complete payment, retries later |
    | **Self-service ModemPay, customer paid but webhook delayed** | ModemPay retry logic handles it (3-5 retries). Customer can visit the booth with their ModemPay confirmation as proof |
    | **Booth ModemPay, webhook delayed** | Scanner polls for ~30s. If no webhook arrives, staff can manually confirm if the customer shows payment proof on their phone (screenshot, SMS). Staff uses a manual override — same UI as Wave/Cash confirmation — to credit the balance |
    | **Booth Wave/Cash, internet drops during staff confirmation** | Staff records the transaction on a paper log sheet → Bulk Top-Up when internet returns |
    | **Prolonged outage (hours)** | Staff runs entirely on paper. All rows reconciled at once when internet restores |

    **Paper log sheet:**
    Each booth has a pre-printed paper log sheet with columns:
    ```
    Ticket Code      | Amount | Method | Time       | Staff Initials | Customer Name
    TKT-7F3A2B       | D200   | Cash   | 14:32      | ___            | _________
    TKT-9C1D4E       | D100   | Wave   | 14:45      | ___            | _________
    ```
    - Staff fills in one row per transaction when they can't confirm in the scanner
    - Customer receives a verbal confirmation or a **paper receipt slip** (pre-printed slips with the booth name, staff can write the amount and ticket code)
    - The customer name column is optional but helps with dispute resolution

    **Bulk Top-Up mode (digital catch-up):**
    A feature on the scanner page (or admin dashboard) available only when internet is restored:
    ```
    [Bulk Top-Up — Pending transactions]
    
    Ticket code: ______  Amount: ______  Method: [Wave] [Cash]
    [Add another row] [Submit all]
    ```
    - Each row creates a `balance_transactions` record where `notes = "Booth — offline catch-up"` and `source` matches the actual payment method (`wave` or `cash`)
    - Receipt emails send automatically for each row submitted
    - Submitting is an atomic batch operation — all rows succeed or all fail together

    **ModemPay manual override at booth:**
    If the customer paid via ModemPay but the webhook is delayed, and the staff can see the customer's ModemPay confirmation (screenshot, SMS, or the scanner polling has timed out):
    - Scanner shows a **"Manual confirm"** button alongside the automatic webhook poll
    - Staff taps it → same flow as Wave/Cash confirmation → balance updates
    - The `balance_transactions` record stores `source = 'modempay'` and `notes = "Booth — manual override (webhook delayed)"`
    - If the webhook arrives later, the system detects the transaction already exists and ignores the duplicate (idempotency key on the payment intent)

    **Consequences:**
    - No local storage/offline queue code to build
    - Paper log sheets and receipt slips are consumables — need to be printed before the event
    - Staff needs brief training: "If you can't confirm in the scanner, write it down. Don't try to remember."
    - Bulk Top-Up form is a small addition to the scanner page (one extra screen)
    - The manual override for ModemPay is the same Wave/Cash confirmation UI — no new UI needed

17. **Cross-type purchase (on-site)** — Customers who bought only entry passes can buy activity credits on-site at the top-up booth. The scanner in Top-up mode gets a toggle to create a new activity credit ticket from scratch rather than scanning an existing one.

    **Flow at the booth:**
    1. Staff selects **"New activity credit ticket"** toggle at the top of the Top-up mode screen (alongside the default "Scan existing ticket" option)
    2. Staff selects the ticket type from available initial purchase bundles (D500, D1,000, D2,000 by default — distinct from top-up bundles per #8. Amounts are admin-configurable in the `ticket_types` table)
    3. Staff enters the customer's **name and email** (for receipt delivery and ticket dashboard access)
    4. Payment via ModemPay, Wave, or Cash (same as #14 — the existing payment method buttons appear after the ticket type is selected)
    5. Staff confirms → system creates a new ticket with an initial balance → receipt email sent to the provided email → customer gets a paper slip with their new ticket code

    **Relationship to existing tickets:**
    - The new ticket is a **standalone order** — not linked to the customer's entry pass order
    - Stored in the same `tickets` table with `type = 'activity_credit'`
    - The `balance_transactions` table gets an `initial_purchase` entry with the starting balance
    - Customer can access it later via the ticket dashboard using the email provided at purchase

    **Scanner UI proposal:**
    ```
    [Scan existing ticket] [New activity credit ticket]   ← toggle at top of Top-up mode
    _________________________________________________________
    Ticket type:      [Games Pass D500 ▼]
    Customer name:    [___________________]
    Customer email:   [___________________]
    Amount:           D500  (from ticket type selection above)
    Payment method:   [ModemPay] [Wave] [Cash]
    ```

    **Also available via self-service (ticket shop):**
    Customers can also visit the **ticket shop at `/tickets`** on their own phone to **purchase a new activity credit bundle** (separate from the top-up flow at `/top-up`), provided they have:
    - Mobile data at the venue
    - ModemPay (ticket shop self-service doesn't support Wave or Cash for instant purchase)

    The booth path is the **reliable method** that works for everyone regardless of phone/data situation.

    **Rationale:**
    - Smallest possible addition to the scanner — one toggle, fields that already exist individually (ticket types from the `ticket_types` table, payment methods from #14, email entry from the receipt system)
    - Reuses the existing ticket creation and payment pipeline — no new infrastructure
    - No changes needed to the entry pass system or gate scan flow
    - Ticket shop at `/tickets` (buying new bundles) is distinct from `/top-up` (adding to existing tickets) — booth handles both cases; self-service paths are split accordingly

18. **Self-service top-up page URL** — The self-service top-up page lives at **`/top-up`** as a standalone static HTML page. The ticket dashboard at `/tickets` also offers top-up as a feature, but it's an alternative path (tier 3 of the identity mechanism from #9), not the primary one.

    **How it's used across the three identity tiers:**

    **Tier 1 — Link/QR (primary):**
    Customer taps the link in their confirmation email:
    ```
    /t?t=TKT-XXXXXX (lookup URL — Section 3)
      → Server detects customer context (not staff scanner)
      → Redirects to /top-up?t=TKT-XXXXXX
        → Page pre-loads ticket info from the query param
        → Customer selects amount → pays → done
    ```
    No login, no typing — the ticket is identified by the URL parameter alone.

    **Tier 2 — Ticket code entry (secondary):**
    Customer visits `walkingfish.gm/top-up` directly:
    - Sees a large text input: "Enter your ticket code"
    - Types `TKT-7F3A2B`
    - Ticket info loads → same top-up form → pays → done

    **Tier 3 — Dashboard login (tertiary):**
    Customer visits `walkingfish.gm/tickets`:
    - Logs in via magic link
    - Sees all their tickets with current balances
    - Clicks "Top up" on a ticket
    - Same top-up form, same flow — but pre-authenticated

    **Page structure of `/top-up`:**
    ```
    ┌─────────────────────────────────────┐
    │                                     │
    │   Tap your link or scan your QR     │  ← Hero CTA
    │   →                             ←  │     (explains how to use the email link)
    │                                     │
    │   ─── or enter your ticket code ─── │
    │                                     │
    │   [ TKT-_____________ ] [ Go ]      │  ← Text input for manual code entry
    │                                     │
    │   Sign in to your ticket dashboard  │  ← Small link → /tickets
    │                                     │
    └─────────────────────────────────────┘
    ```

    **What the `?t=` query param does:** When the email link redirects to `/top-up?t=TKT-XXXXXX`, the page:
    1. Reads the ticket ID from the URL
    2. Fetches ticket info from the API (name, current balance, ticket type)
    3. Skips the landing screen entirely — shows the top-up form directly
    4. If the ticket ID is invalid/expired, falls back to the landing screen with a notice

    **Relationship between the two pages:**
    | | `/top-up` | `/tickets` |
    |---|---|---|
    | **Purpose** | Quick top-up — link, QR, or code entry | Full dashboard — view tickets, check balance, transaction history |
    | **Auth required** | No (ticket code or URL param provides identity) | Yes — magic link login |
    | **Top-up** | Primary top-up UI | Feature within dashboard (same form component) |
    | **Email link target** | Yes — `/t?t=...` redirects here | No — too much friction |
    | **Transaction history** | No — just top-up | Yes — full history from #12 |
    | **Visit without email** | Yes — enter ticket code | Yes — log in |

    **Infrastructure needed:**
    - New static page at `/top-up.html`
    - New rewrite in `vercel.json`: `"/top-up" → "/top-up.html"`
    - Existing `/t?t=...` lookup page (already planned in Section 3) — detects context and redirects to `/top-up` or `/scan`
    - Nav link and bottom-tab entry for `/top-up` on the public site

    **Rationale:**
    - A standalone page is necessary for tiers 1 and 2 to work — link/QR and ticket code entry don't require authentication
    - The dashboard is a separate concern (ticket management) — top-up is one feature of it, not its purpose
    - The `?t=` query param keeps the link path zero-friction: no redirects beyond the initial context detection
    - Both pages share the same top-up form component on the backend — not duplicating logic

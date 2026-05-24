# CONTEXT.md — Ticketing System

## Glossary

### Events
- **Event** — A festival or gathering that sells tickets. Current: Piroake Fest 2026.
- **Ticket Shop** — The public purchase page at `/tickets` where customers buy tickets.

### Ticket Types
- **Entry Pass** — A one-time gate ticket scanned at venue entry (Regular, VIP, Group). Non-rechargeable.
- **Parking Pass** — A one-time parking ticket scanned at the parking lot. Non-rechargeable.
- **Activity Credit** — A stored-value balance on a ticket that is debited per use at activity booths (games, karaoke). Rechargeable.
- **Initial Purchase Bundle** — The first activity credit bundle bought at the ticket shop (e.g., D500 Games Pass). Distinct from top-up bundles (#8). Amounts stored in the `ticket_types` table, admin-configurable. Initial purchase bundles are larger (D500, D1,000, D2,000 by default) than top-up bundles (D100–D1,000).

### Ticket Inventory
- **Capacity** — Maximum number of a given ticket type available for sale.
- **Sold Out** — State when all capacity for a ticket type has been purchased.

### Payment
- **ModemPay** — The primary payment gateway (custom API integration). Supports Wave, QMoney, AfriMoney mobile money. 1.5% fee. Instant confirmation via webhook.
- **Wave Transfer** — Manual payment method. Customer sends money to a Wave number (+220 xxx xxxx). No platform fee. ~2 hour verification window.
- **Cash** — Physical cash accepted at the top-up booth. No phone or mobile money required. Staff taps "Received (Cash)" in the scanner to confirm. Reconciled at end of day against `balance_transactions` records.
- **Booth Wave Number** — A dedicated Wave number (separate from the general business number) used exclusively at the top-up booth. Simplifies reconciliation by keeping all booth transfers separate.
- **Cash Float** — Initial cash reserve (~D2,000) in small denominations kept at the top-up booth to make change for cash payments.
- **Pending Verification** — State of a Wave Transfer payment awaiting admin confirmation.
- **Verified** — State when an admin confirms the Wave payment was received.

### Order Lifecycle
- **Order** — A customer's ticket purchase. An order contains one or more Tickets, possibly across different types.
- **Unpaid** — Order created but payment not yet received.
- **Paid** — Payment confirmed (ModemPay webhook or admin verification).
- **Cancelled** — Order voided by admin.
- **Refunded** — Order cancelled and refunded by admin (refund processed out-of-band).
- **`orders` table** — Database table storing order records. Each order contains one or more tickets, possibly across different types (entry pass + activity credit in one purchase).

### Tickets
- **Ticket** — A single entry pass, parking pass, or activity credit bundle within an order.
- **Entry Pass states**: `active` (paid, not yet scanned), `used` (scanned at gate, consumed).
- **Activity Credit states**: `active` (has remaining balance), `exhausted` (balance reached zero).
- **QR Code** — Unique identifier for a ticket, encoded as QR. Scanned at venue. Encodes a lookup URL (`/t?t=TKT-XXXXXX`), not the balance. Does **not** change after top-ups or debits — balance is loaded server-side.
- **Ticket Code** — Human-readable alphanumeric code alongside the QR. Also immutable for the ticket's lifetime.
- **Balance** — Remaining activity credits on a rechargeable ticket. Always fetched from the database, never encoded in the QR.

### Check-in
- **Gate Scan** — Scanning an entry/parking pass QR at venue entry. Marks the ticket as used.
- **Activity Debit** — Scanning an activity credit QR at a booth to deduct a session cost. Reduces balance.
- **Web Scanner** — A browser-based QR scanning page at `/scan` used by venue staff. Supports three modes: Gate, Debit, and Top-up.
- **Gate mode** — Scanner mode for venue entry. Scans entry/parking pass QR → marks ticket as `used`. Rejects if already used.
- **Debit mode** — Scanner mode for game/karaoke booths. Scans activity credit QR → enter session cost → reduces balance atomically.
- **Top-up mode** — Scanner mode for top-up booths. Scans activity credit QR → select top-up amount → accept payment → increases balance atomically.

### Pages
- **Self-Service Top-Up (`/top-up`)** — Standalone static HTML page for self-service top-up. Entry point for the link/QR identity tier (via `?t=TKT-XXXXXX` query param) and the ticket code entry tier. No authentication required. Has a small link to the ticket dashboard as a tertiary path.
- **Ticket Dashboard (`/tickets`)** — Full ticket management page. Requires magic link login. Shows all tickets with balances, transaction history (#12), and has a top-up feature within it. Shares the same top-up form component as `/top-up`.
- **Ticket Lookup (`/t`)** — Minimal page at the QR destination URL from Section 3. Detects customer vs. staff scanner context and redirects to `/top-up` or `/scan` accordingly. No rewrite needed — works as a static page that reads the `?t=` query param.

### Admin
- **Payment Verification** — Admin action to confirm a manual Wave transfer and release tickets.
- **Order Management** — Admin ability to view, cancel, or refund orders.
- **Inventory Management** — Admin ability to set capacity and view sold counts.
- **Activity Pricing** — Per-session debit amounts configured by admin (not hardcoded).
- **Staff Scanner Code** — A unique access code issued by admin to each venue staff member for the QR scanner page at `/scan`.

### On-Site Top-up
- **Top-up** — Adding more activity credits to an existing ticket after initial purchase. Available via ModemPay (instant) or Wave transfer or Cash (both staff-verified at top-up booth).
- **On-Site Purchase** — Creating a new activity credit ticket from scratch at the venue (at the top-up booth or via self-service at `/tickets`). For customers who bought entry passes only and want to add games/karaoke on the day.
- **New Activity Credit Ticket** — A standalone activity credit ticket created at the booth for a customer with no existing activity credits. Uses the scanner's "New activity credit ticket" toggle in Top-up mode. Not linked to any entry pass order.
- **Booth Payment Methods** — Three methods accepted at the top-up booth: **ModemPay** (auto-confirmed via webhook), **Wave** (staff checks Wave app notification → taps "Received"), and **Cash** (staff taps "Received (Cash)" after accepting cash).
- **Offline Fallback** — When internet drops, staff records transactions on a **Paper Log Sheet** and enters them later via **Bulk Top-Up** mode. No local cache or offline queue.
- **Paper Log Sheet** — A pre-printed form at each booth with columns: Ticket Code, Amount, Method, Time, Staff Initials, Customer Name. Used to record transactions when the scanner can't confirm due to network outage.
- **Bulk Top-Up** — A scanner page mode (available when internet is restored) where staff enters multiple pending transactions from the paper log sheet as a batch. Each creates a `balance_transactions` record with `notes = "Booth — offline catch-up"`.
- **Manual Override** — A scanner button that lets staff manually confirm a ModemPay top-up when the webhook is delayed but the customer shows proof of payment (screenshot or SMS). Uses the same confirmation UI as Wave/Cash.
- **Balance Transaction** — A record of any change to an activity credit ticket's balance. Stored in the `balance_transactions` table.
- **Transaction Log** — A chronological history of all balance changes for a ticket, visible in the ticket dashboard. Shows top-ups, debits, and the initial purchase with timestamps and running balance.
- **Balance Transaction types**: `top_up` (credits added), `debit` (credits spent), `initial_purchase` (the first credit bundle bought).
- **Balance Cap** — The maximum balance an activity credit ticket can hold (default D5,000). Admin-configurable via `system_config`. Applies to initial purchases, self-service top-ups, and booth top-ups. Custom amount inputs use `balance_cap - current_balance` as their dynamic maximum.
- **system_config** — A database table for admin-configurable settings like `balance_cap`. Key-value pairs. Changes take effect immediately.
- **Booth Identification** — How booth staff finds a customer's ticket for top-up. Three tiers:
  - **Primary (Scan QR)**: Staff scans the customer's confirmation email QR with the booth phone. Zero typing.
  - **Secondary (Ticket Code)**: Customer reads aloud their 6-8 character ticket code → staff types it in.
  - **Tertiary (Email Lookup)**: Customer gives their email → staff searches → selects the correct ticket. Fallback only.
- **Top-up Identity** — How a customer proves ownership of a ticket at the self-service top-up page. Three-tier mechanism:
  - **Primary (Link/QR)**: Customer taps the link in their confirmation email or scans the QR code → ticket pre-loaded. Zero typing.
  - **Secondary (Ticket Code)**: Customer enters the 6-8 character ticket code manually. No email dependency.
  - **Tertiary (Dashboard Login)**: Customer logs into the ticket dashboard at `/tickets` via magic link to view all tickets and top up.
- **Link Identity** — The primary top-up identity mechanism. The confirmation email contains a clickable URL encoding the ticket ID. No typing required.
- **Ticket Code Identity** — The secondary fallback. The human-readable alphanumeric ticket code (e.g., `TKT-7F3A2B`) is entered manually on the top-up page.
- **Dashboard Identity** — The tertiary path. Customer logs into the ticket dashboard at `/tickets` via magic link to access their tickets.

### Architecture
- **Supabase** — Database for all ticketing data (orders, tickets, payments).
- **Supabase Edge Functions** — Server-side logic for webhooks (ModemPay payment confirmation) and ticket generation.
- **QR Generation** — Server-side generation of QR codes upon payment confirmation, emailed to customer.
- **Email Notification** — Automated emails via **Resend** (same as existing contact/vendor forms) for order confirmation, ticket delivery, and top-up receipts.
- **Resend** — The email delivery service used for all transactional emails (order confirmations, top-up receipts). Sender: `noreply@walkingfish.gm` (DKIM + SPF verified).
- **`ticket_types` table** — Database table storing admin-configurable ticket type definitions including prices, capacity, and sold counts. Used for both entry passes and activity credit bundles.
- **`top_up_bundles` table** — Database table storing the predefined top-up bundle amounts (e.g., D100, D200, D500, D1,000 by default). Admin-configurable via the dashboard. Distinct from `ticket_types`.
- **`payment_proofs` table** — Database table storing Wave transfer payment proof submissions (screenshot URLs, reference numbers) for manual admin verification.
- **`staff_scanner_codes` table** — Database table storing unique per-staff access codes for the QR scanner page at `/scan`. Each code is issued by an admin and can be revoked independently.
- **`balance_transactions` table** — See On-Site Top-up section.

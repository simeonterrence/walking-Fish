# PATENT APPLICATION

## DUAL-MODE TICKETING SYSTEM WITH UNIFIED QR-BASED IDENTITY AND OFFLINE-RESILIENT BALANCE MANAGEMENT FOR EVENT VENUES

---

## FIELD OF THE INVENTION

The present invention relates generally to electronic ticketing systems for live events, and more specifically to a dual-mode ticketing system that integrates instant electronic payment and manual payment verification into a unified ticket generation and delivery pipeline, employs a single QR code with context-dependent redirection for both customer self-service and venue staff operations, and provides an offline-resilient balance management subsystem for rechargeable stored-value tickets using a paper-based fallback with digital bulk catch-up.

---

## BACKGROUND

### Problem Statement

Live event venues, particularly festivals and fairs in emerging markets, face a unique set of challenges that are not adequately addressed by existing electronic ticketing solutions:

**1. Payment Infrastructure Fragmentation.** In many developing economies, the majority of consumers use mobile money services (e.g., Wave, M-Pesa, QMoney, AfriMoney) rather than credit cards or international payment gateways. Global payment processors such as Stripe, PayPal, and Square are often unavailable or impractical in these regions. Existing ticketing platforms require a single payment gateway integration and do not accommodate the reality that customers may need or prefer different payment methods with different trust models—some seeking instant confirmation (via an integrated payment gateway with webhook callbacks) and others preferring a manual, fee-free transfer method.

**2. Dual Ticket Lifecycles.** Event ticketing traditionally treats all tickets as single-use entry passes. However, many events now offer stored-value activity credits—funds loaded onto a ticket that are debited per use at activity booths (games, karaoke, food, drinks). These two ticket types have fundamentally different lifecycles: entry passes are consumed once at the gate, while activity credits require ongoing balance management (top-ups, debits, balance inquiries). Existing systems either ignore the stored-value use case entirely or require separate, disconnected subsystems for entry management and stored-value management.

**3. QR Code Proliferation.** When a ticket serves both as an entry pass and a stored-value instrument, existing systems generate multiple QR codes or require the QR to encode dynamic data such as the current balance. This creates significant problems: QR codes that change after every top-up require re-emailing and confuse customers; multiple QRs per ticket increase scanning complexity for venue staff; and encoding balance information in the QR itself introduces security risks and staleness issues.

**4. Venue Network Reliability.** Large festivals and outdoor events frequently experience network congestion or complete internet outages. Traditional ticketing systems that require constant server connectivity for all operations (gate scanning, balance debits, top-ups) become completely non-functional during such outages. Existing approaches to offline resilience—such as local storage caches or offline-first architectures—introduce synchronization conflicts, data loss risks, and reconciliation complexity that are unacceptable for financial transactions.

**5. Booth Staff Identification Friction.** At activity booths within a venue, staff need to quickly and reliably identify a customer's stored-value ticket to perform balance debits or top-ups. Existing systems typically provide only a single identification method (e.g., scanning a QR code), which fails when the customer's phone battery is dead, the phone is lost, or the QR code is damaged. Booth staff resort to time-consuming manual lookups that create queues and customer frustration.

**6. Self-Service Identity Friction.** Similarly, customers seeking to top up their stored-value tickets through a self-service portal must prove ownership of the ticket. Existing systems typically require a full login (email/password or magic link), which creates friction at the venue when the customer may not remember their credentials or have reliable email access. A tiered identity system that progressively reduces friction is needed.

**7. Administrative Complexity.** Event organizers managing both entry passes and stored-value tickets across multiple ticket types, price tiers, and capacities need a unified administrative interface that provides real-time inventory visibility, order management, payment verification, and configuration of prices, capacities, and system parameters—all while supporting multiple administrative roles with different permission levels.

### Prior Art

Existing ticketing systems and related patents were reviewed, including:

- **U.S. Patent No. 10,515,363** — "Electronic ticketing system" — Discloses a system for purchasing and validating event tickets using QR codes. However, this system uses a single payment model and does not address dual payment with shared ticket generation, stored-value balance management, or offline-resilient operations.

- **U.S. Patent No. 9,646,307** — "Mobile ticket validation system" — Discloses QR code scanning for event entry. Does not address rechargeable stored-value tickets, activity debits, or multi-role scanning modes.

- **U.S. Patent No. 11,042,888** — "System and method for managing event access using facial recognition" — Focuses on biometric access control, not stored-value balance management or offline resilience.

- **U.S. Patent No. 10,977,667** — "Stored-value card system" — Addresses stored-value balances but not in the context of event ticketing, dual payment, or venue scanning operations.

- **U.S. Patent Application No. 2020/0250763** — "Multi-modal event ticketing" — Discloses multiple access methods but does not address dual payment models, offline resilience, or tiered identification.

- **U.S. Patent No. 8,544,772** — "System and method for managing a stored-value card associated with a ticket" — Discloses linking stored value to a ticket but does not address offline fallback mechanisms, tiered identification, or unified QR-based identity.

### Need for Invention

There exists a need for a ticketing system that:

1. Integrates two payment models (instant electronic payment with webhook confirmation and manual transfer with administrative verification) sharing a single ticket generation and delivery pipeline
2. Supports both single-use entry tickets and rechargeable stored-value tickets within a unified data model
3. Uses a single, immutable QR code per ticket that encodes a lookup URL rather than balance data, enabling the same QR to serve both customer self-service and venue staff operations through context-dependent redirection
4. Provides offline resilience through a deliberate paper-based fallback mechanism with digital bulk catch-up, avoiding the synchronization problems of local caching approaches
5. Implements multi-tier identification for both booth staff (QR scan → ticket code → email lookup) and self-service customers (link/QR → ticket code → dashboard login) with automatic progression through tiers
6. Enforces a configurable balance cap at both the application and database levels to limit financial exposure
7. Provides a unified administrative interface supporting multiple roles with granular permissions

---

## SUMMARY

The present invention provides a dual-mode ticketing system for event venues that integrates instant electronic payment and manual payment verification into a unified ticket generation and delivery pipeline. The system employs a single, immutable QR code per ticket that encodes a lookup URL rather than balance data, enabling the same QR code to serve both customer self-service operations and venue staff scanning operations through context-dependent redirection based on session state.

The system supports two fundamentally different ticket classes within a unified data model: single-use entry passes that are scanned once at the venue gate and marked as consumed, and rechargeable stored-value tickets that maintain a running balance debited per use at activity booths and capable of being topped up. Both ticket classes share the same generation pipeline, QR code format, and delivery mechanism.

A key innovation is the offline resilience subsystem, which deliberately eschews local storage caching in favor of a paper-based transaction recording mechanism. During network outages, venue staff record transactions on pre-printed paper log sheets. When network connectivity is restored, staff enter the accumulated transactions through a digital bulk catch-up interface that atomically processes all pending transactions, creates corresponding balance adjustment records, and sends receipt emails. This approach avoids the synchronization conflicts, data loss risks, and reconciliation complexity inherent in browser-based offline queues for financial transactions.

The system further provides multi-tier identification for both booth staff and self-service customers, with automatic progression through progressively lower-friction tiers. For booth staff, the primary identification method is QR code scanning (zero typing), the secondary method is manual ticket code entry (6-8 alphanumeric characters), and the tertiary fallback is email-based lookup (for the "lost everything" edge case). For self-service customers, the primary method is a clickable link or QR scan from the confirmation email (zero typing), the secondary method is manual ticket code entry, and the tertiary method is a full dashboard login via magic link authentication.

A configurable balance cap limits financial exposure by preventing any stored-value ticket from exceeding a maximum balance, enforced at both the application level in the user interface and the database level in atomic update operations. The balance cap is stored in a key-value configuration table and takes effect immediately upon change, with no historical adjustment required for existing tickets.

---

## BRIEF DESCRIPTION OF THE DRAWINGS

FIG. 1 illustrates a block diagram of the overall ticketing system architecture, showing the interaction between customer devices, venue staff devices, the static web server, the database server, the edge function server, the payment gateway, and the email service.

FIG. 2 shows a data flow diagram of the dual payment model, illustrating the parallel paths for instant electronic payment (ModemPay) and manual transfer (Wave) sharing a unified ticket generation pipeline.

FIG. 3 depicts a state diagram of the unified QR code with context-dependent redirection, showing how a single QR code resolves differently based on the presence or absence of a staff scanner session.

FIG. 4 illustrates a flow diagram of the three-tier booth staff identification system, showing the automatic progression from QR scan through ticket code entry to email lookup.

FIG. 5 shows a flow diagram of the three-tier customer self-service identity system, showing the progression from link/QR through ticket code entry to dashboard login.

FIG. 6 depicts a block diagram of the offline resilience subsystem, showing the paper log sheet recording during network outage and the digital bulk catch-up processing upon network restoration.

FIG. 7 illustrates a schematic diagram of the stored-value balance management system, showing the relationship between tickets, balance transactions, and the balance cap enforcement points.

FIG. 8 shows a block diagram of the administrative management system, illustrating the inventory overview, order management, ticket type configuration, top-up bundle management, balance cap configuration, and staff scanner code management subsystems.

---

## DETAILED DESCRIPTION

### Overview of the System Architecture

Referring to FIG. 1, the ticketing system 100 of the present invention operates within a static web serving architecture. The system comprises a plurality of client devices 102 (customer devices) and 104 (venue staff devices) communicatively coupled to a content delivery network 106 (such as Vercel) that serves pre-built static web pages 108 (HTML, CSS, and JavaScript files) without server-side rendering or build-time processing. The static web pages 108 include a ticket shop page 110, a self-service top-up page 112, a staff scanner page 114, a QR lookup page 116, and an administrative dashboard page 118.

The client devices 102, 104 communicate with a database server 120 (such as Supabase PostgreSQL) through a representational state transfer (REST) application programming interface (API) 122 using an anonymous authentication key for public read operations and a service role key stored in browser session storage for administrative write operations.

The system further includes an edge function server 124 executing server-side logic for payment processing, ticket generation, QR code creation, and email delivery. The edge function server 124 communicates with a payment gateway 126 (such as ModemPay) through a webhook callback interface 128 and with an email service 130 (such as Resend) through a transactional email API 132.

### Dual Payment Model with Unified Ticket Generation

Referring to FIG. 2, the system implements a dual payment model 200 comprising a first payment path 202 (instant electronic payment) and a second payment path 204 (manual transfer), both converging on a unified ticket generation pipeline 206.

In the first payment path 202, a customer completes a purchase on the ticket shop page 110 by selecting one or more ticket types 208 and entering an email address 210. The system creates an order record 212 in a database with a status of "unpaid" and initiates a payment intent 214 with the payment gateway 126 through the edge function server 124. The payment gateway 126 returns a payment URL 216 to which the customer's browser is redirected. Upon successful completion of the payment by the customer, the payment gateway 126 sends a webhook callback 218 (such as a `charge.succeeded` event) to the edge function server 124. The edge function server 124 validates the webhook signature 220 using a pre-shared secret key, checks an idempotency key 222 to prevent duplicate processing, and then invokes the unified ticket generation pipeline 206.

In the second payment path 204, the customer selects a manual transfer option during checkout. The system displays a payment account identifier 224 (such as a mobile money phone number) and the exact amount 226 to be transferred. The customer completes the transfer outside the system and submits a proof record 228 comprising a reference number and optionally a screenshot, which is stored in a payment proofs table 230 with a status of "pending." An administrator reviews the proof record 230 through an administrative interface 232 and either confirms or rejects the payment. Upon confirmation, the system invokes the unified ticket generation pipeline 206.

The unified ticket generation pipeline 206 performs the following operations: (a) updates the order status 234 to "paid" and records the payment method; (b) atomically increments a sold counter 236 for each purchased ticket type, subject to a capacity constraint 238 that prevents overselling; (c) generates a unique human-readable ticket code 240 (such as `TKT-7F3A2B`) for each ticket; (d) generates a QR code 242 encoding a lookup URL 244 that includes the ticket code 240; (e) uploads the QR code image 246 to a storage service 248; (f) creates a ticket record 250 in the database associating the ticket with the order, ticket type, customer email, and generated code and QR image URL; (g) for stored-value tickets, records an initial balance transaction 252 with a type of "initial_purchase" and the initial balance amount; and (h) sends a confirmation email 254 through the email service 130 containing the QR code images and ticket codes.

### Unified QR Code with Context-Dependent Redirection

Referring to FIG. 3, the present invention employs a single, immutable QR code 302 per ticket that remains constant for the entire lifetime of the ticket, regardless of balance changes, top-ups, or debits. The QR code 302 encodes a lookup URL 304 having a format of `https://[domain]/t?t=[TICKET_CODE]` where `[TICKET_CODE]` is the unique human-readable ticket code 240 generated during ticket creation.

When a scanner device (such as a smartphone camera) reads the QR code 302 and navigates the browser to the lookup URL 304, a redirector page 306 executes a client-side detection script 308 that checks for the presence of a staff scanner session token 310 in the browser's session storage 312.

If the staff scanner session token 310 is present, the redirector page 306 redirects the browser to a staff scanner page URL 314 having a format of `https://[domain]/scan?t=[TICKET_CODE]`, wherein the staff scanner page 114 operates in a scanning mode determined by the staff member's selection.

If the staff scanner session token 310 is absent, the redirector page 306 redirects the browser to a self-service top-up page URL 316 having a format of `https://[domain]/top-up?t=[TICKET_CODE]`, wherein the self-service top-up page 112 displays the current ticket information such as balance and ticket type.

This context-dependent redirection enables a single QR code to serve two fundamentally different purposes—customer self-service and venue staff operations—without requiring separate QR codes or encoding context information in the QR data itself.

### Three-Tier Booth Staff Identification

Referring to FIG. 4, the present invention provides a three-tier identification system 400 for booth staff to identify a customer's stored-value ticket for purposes of performing balance debits or top-ups.

At a first tier 402 (primary identification), the staff member uses the staff scanner page 114 operating in a debit or top-up mode to scan a QR code 302 displayed on the customer's device. The staff scanner page 114 decodes the lookup URL 304 from the QR code 302, extracts the ticket code 240, and queries the database server 120 to retrieve the ticket record 250 and associated information. This tier requires zero typing from either the staff member or the customer and completes in under two seconds.

If the first tier 402 fails—for example, because the customer's device battery is depleted, the QR code is damaged, or the camera cannot focus—the system automatically falls back to a second tier 404 (secondary identification). At the second tier 404, the staff member manually enters the human-readable ticket code 240 (comprising 6-8 alphanumeric characters) into a text input field on the staff scanner page 114. The ticket code 240 is typically displayed on the customer's confirmation email or written on a physical wristband or receipt.

If both the first tier 402 and second tier 404 fail—for example, because the customer has lost their device and does not remember their ticket code—the system automatically falls back to a third tier 406 (tertiary identification). At the third tier 406, the staff member enters the customer's email address into a lookup field on the staff scanner page 114. The system queries the database server 120 for all ticket records 250 associated with that email address and presents a list to the staff member, who selects the correct ticket. This tier is intentionally the slowest and most cumbersome, creating a natural incentive for staff to guide customers toward the faster primary and secondary tiers.

### Three-Tier Customer Self-Service Identity

Referring to FIG. 5, the present invention provides a three-tier identity system 500 for customers to prove ownership of a stored-value ticket for purposes of performing self-service top-ups through the self-service top-up page 112.

At a first tier 502 (primary identity), the customer taps a link 504 in a confirmation email 254 previously sent to the customer's email address, or scans the QR code 302 from the confirmation email 254 using a separate device. The link 504 or QR code 302 directs the browser to the lookup URL 304 containing the ticket code 240. The redirector page 306 detects the absence of a staff scanner session token 310 and redirects to the self-service top-up page URL 316 with the ticket code 240 pre-loaded. The self-service top-up page 112 immediately displays the current ticket information without requiring any typing from the customer.

If the first tier 502 is unavailable—for example, because the customer cannot locate their confirmation email—the system provides a second tier 506 (secondary identity). At the second tier 506, the customer enters the human-readable ticket code 240 into a text input field 508 on the self-service top-up page 112. The system validates the ticket code 240 against the database server 120 and, upon successful validation, loads the ticket information and proceeds with the top-up flow. This tier requires only the ticket code, which is short enough (6-8 characters) to be texted to oneself, written on a wristband, or memorized.

If both the first tier 502 and second tier 506 are unavailable, the system provides a third tier 510 (tertiary identity). At the third tier 510, the customer clicks a link 512 to a ticket dashboard page 514, where they authenticate using a passwordless email magic link 516 (such as Supabase Auth magic link). Upon successful authentication, the dashboard page 514 displays all tickets associated with the customer's email address, each with its current balance, QR code, and a "Top Up" button that links to the self-service top-up page URL 316 with the corresponding ticket code 240 pre-loaded.

### Offline Resilience Subsystem

Referring to FIG. 6, the present invention provides an offline resilience subsystem 600 that deliberately avoids local storage caching or offline-first architectures in favor of a paper-based transaction recording mechanism with digital bulk catch-up.

During normal operation with network connectivity 602, all venue operations (gate scanning, balance debits, top-ups) are performed in real time through the staff scanner page 114, with each operation updating the database server 120 atomically and sending a confirmation email through the email service 130.

When a network outage 604 occurs, as detected by the inability of the staff scanner page 114 to communicate with the database server 120 and edge function server 124, the system enters an offline recording mode 606. In this mode, staff members record each transaction on a pre-printed paper log sheet 608 having columns for ticket code 610, amount 612, payment method 614, timestamp 616, staff initials 618, and customer name 620. The staff member fills in one row per transaction. The customer receives a verbal confirmation or a paper receipt slip. The system does not attempt to cache transactions locally, as browser-based local storage is unreliable for financial transactions and introduces synchronization conflicts upon network restoration.

When network connectivity is restored 622, as detected by the successful completion of a connectivity check 624 (such as a periodic health check request to the database server 120 or edge function server 124), the system activates a digital bulk catch-up mode 626 accessible through the staff scanner page 114 or administrative interface 232. In the digital bulk catch-up mode 626, staff members enter each pending transaction from the paper log sheet 608 into a batch input form 628. The batch input form 628 allows staff to add multiple rows, each comprising a ticket code 630, an amount 632, and a payment method 634 (selected from a predetermined set of methods such as Wave or Cash). The batch input form 628 optionally includes a notes field 636.

When the staff member submits the batch (by activating a "Submit All" control 638), the edge function server 124 processes all rows in the batch atomically 640. For each row, the edge function server 124: (a) looks up the ticket record 250 by the provided ticket code 630; (b) validates that the ticket is an active stored-value ticket; (c) atomically updates the ticket balance 642 using a database operation of the form `UPDATE tickets SET balance = balance + [amount] WHERE id = [ticket_id] AND balance + [amount] <= [balance_cap]`; (d) creates a balance transaction record 644 with a type of "top_up," the provided amount, a source corresponding to the payment method, and a notes field containing "Booth — offline catch-up"; and (e) sends a confirmation receipt email 646 through the email service 130 for each processed row.

If any individual row in the batch fails, the edge function server 124 records the error 648 and continues processing the remaining rows, returning a summary 650 indicating the total number of rows processed and any errors encountered.

### Stored-Value Balance Management with Balance Cap

Referring to FIG. 7, the present invention provides a stored-value balance management system 700 for stored-value tickets 702 (tickets of type "activity_credit" having a balance field). Each stored-value ticket 702 has a current balance 704 stored in the database and a chronologically ordered set of balance transaction records 706 stored in a balance transactions table 708.

Each balance transaction record 706 comprises a transaction identifier 710, a ticket identifier 712 referencing the associated stored-value ticket 702, a transaction type 714 selected from the set consisting of "initial_purchase," "top_up," and "debit," an amount delta 716 (positive for additions, negative for deductions), a balance after 718 representing the running balance after the transaction, a source 720, a staff code 722 (if initiated by booth staff), and a timestamp 724.

When a top-up operation 726 is initiated (either through the self-service top-up page 112 or the staff scanner page 114 in top-up mode), the system performs a balance cap check 728 before executing the balance update. The balance cap check 728 compares the sum of the current balance 704 and the requested top-up amount 730 against a configurable balance cap value 732 stored in a system configuration table 734 with a key of "balance_cap" and a default value of 5,000 (in local currency units). If the sum exceeds the balance cap value 732, the operation is rejected and an error message 736 is displayed to the user.

The balance cap check 728 is enforced at both an application level 738 (in the user interface, where a custom amount input 740 has a dynamic maximum value 742 of `balance_cap minus current_balance`) and a database level 744 (in the atomic update operation, which includes the condition `balance + amount_delta <= balance_cap` in the WHERE clause).

When a debit operation 746 is initiated through the staff scanner page 114 in debit mode, the system performs a sufficient balance check 748 before executing the balance update. The sufficient balance check 748 compares the debit amount 750 against the current balance 704. If the debit amount 750 exceeds the current balance 704, the operation is rejected and an error message 752 is displayed to the staff member. The atomic update operation includes the condition `balance - amount_delta >= 0` in the WHERE clause, providing database-level enforcement.

### Administrative Management System

Referring to FIG. 8, the present invention provides an administrative management system 800 accessible through the administrative dashboard page 118, which requires authentication through a login system 802 that validates a user's role 804 selected from a set of roles including an "admin_role" 806 having full access to all system functions and a "ticketing_role" 808 having access limited to ticketing functions (orders, tickets, inventory, bundles, scanner codes) without access to vendor management or media management functions.

The administrative management system 800 comprises:

An inventory overview subsystem 810 that queries the ticket_types table and displays a summary of total sold tickets, total capacity, remaining tickets, and fill rate percentage, with per-type breakdowns and a detailed sales breakdown organized by category with progress bars and revenue calculations.

An order management subsystem 812 that queries the orders table and displays a filterable list of orders organized by status (all, unpaid, paid, pending_verification, cancelled), with action controls to mark unpaid manual-transfer orders as paid (triggering the unified ticket generation pipeline 206) and to regenerate tickets for paid orders that lack tickets (triggering a re-execution of ticket generation without payment processing).

A ticket type configuration subsystem 814 that provides controls to add, edit, and remove ticket type records 208 in the ticket_types table, including fields for name, slug, type category, price, capacity, and active status.

A top-up bundle configuration subsystem 816 that provides controls to add and remove top-up bundle records 818 in a top_up_bundles table, each bundle having an amount and a sort order.

A balance cap configuration subsystem 820 that provides a control to set the balance cap value 732 in the system configuration table 734.

A staff scanner code management subsystem 822 that provides controls to generate new staff scanner codes 824 (comprising unique 6-8 character alphanumeric strings), assign a staff member name 826 and permission set 828 (specifying which scanning modes the staff member may access), revoke existing scanner codes by toggling an active status 830, and view the last-used timestamp 832 for each code.

### Dual Ticket Class Data Model

The present invention employs a unified data model 900 supporting two distinct ticket classes within a single tickets table. A type field in the tickets table distinguishes between an entry pass class (type = "entry" or "parking") and a stored-value class (type = "activity_credit").

Entry pass tickets have a status field that transitions from an "active" state to a "used" state upon scanning at a venue gate, and do not have a balance field (set to NULL).

Stored-value tickets have an "active" status that transitions to an "exhausted" state only when the balance reaches zero, and have a balance field that is initialized to a predetermined initial amount upon ticket creation and modified by subsequent top-up and debit operations recorded in the balance transactions table.

Both ticket classes share common fields including a unique ticket code, a QR code image URL, a ticket type reference, an order reference, a customer email, a customer name, and a metadata field for flexible additional data.

### ModemPay Manual Override

The present invention further provides a manual override mechanism for the instant electronic payment path. When a customer has completed payment through the payment gateway 126 but the webhook callback 218 is delayed (due to network latency, payment gateway processing delays, or other transient issues), and the staff member can verify the customer's payment through alternative means (such as viewing a payment confirmation screenshot or SMS on the customer's device), the staff member may activate a manual override control 1000 on the staff scanner page 114.

Activating the manual override control 1000 invokes the same confirmation function used for manual transfer and cash payments, creating a balance transaction record 1002 with a source of "modempay" and a notes field containing "Booth — manual override (webhook delayed)." If the delayed webhook callback 218 subsequently arrives, the edge function server 124 checks the idempotency key 222 and detects that the transaction has already been processed, thereby ignoring the duplicate callback and preventing double-processing.

---

## EXAMPLES

### Example 1: End-to-End Ticket Purchase with Instant Payment

A customer accesses the ticket shop page 110 at a URL of `https://www.example.com/tickets` on their mobile device. The page displays available ticket types: Regular Entry (D300), VIP Entry (D800), Parking (D100), and a Games Pass (D500). The customer selects 2 Regular Entry tickets and 1 Games Pass (D500). The cart displays a total of D1,100.

The customer enters their email address "customer@example.com" and selects the "ModemPay" payment option. The system creates an order record with a status of "unpaid" and a total of D1,100. The edge function server 124 creates a payment intent with the payment gateway 126 for D1,100. The customer's browser is redirected to the payment gateway's hosted payment page. The customer completes payment via Wave mobile money.

The payment gateway 126 sends a `charge.succeeded` webhook callback 218 to the edge function server 124. The edge function server 124 validates the HMAC signature 220, checks the idempotency key 222, and invokes the unified ticket generation pipeline 206. The pipeline creates 3 tickets: two of type "entry" with codes TKT-7F3A2B and TKT-9C1D4E, and one of type "activity_credit" with code TKT-5E8A6C and an initial balance of D500. QR codes are generated for each ticket encoding URLs `https://www.example.com/t?t=TKT-7F3A2B`, `https://www.example.com/t?t=TKT-9C1D4E`, and `https://www.example.com/t?t=TKT-5E8A6C`. A confirmation email is sent to customer@example.com containing all three QR codes and ticket codes.

### Example 2: Booth Top-Up During Network Outage

A customer approaches a top-up booth with a stored-value ticket having code TKT-5E8A6C and a current balance of D200. The network is experiencing an outage. The staff member records the transaction on a paper log sheet 608: ticket code "TKT-5E8A6C," amount "D200," method "Cash," time "14:32," staff initials "JM," and customer name "Alice."

When network connectivity is restored, the staff member accesses the digital bulk catch-up mode 626 on the staff scanner page 114. The staff member enters one row: ticket code "TKT-5E8A6C," amount "200," method "Cash," and submits the batch. The edge function server 124 processes the row: looks up TKT-5E8A6C, validates that it is an active stored-value ticket, atomically updates the balance from D200 to D400 (subject to the balance cap of D5,000), creates a balance transaction record with type "top_up," amount_delta "+200," balance_after "400," source "cash," and notes "Booth — offline catch-up," and sends a confirmation receipt email to the customer's email address.

---

## ADVANTAGES

The present invention provides numerous advantages over existing ticketing systems:

1. **Unified QR code**: A single, immutable QR code per ticket serves both customer self-service and venue staff operations through context-dependent redirection, eliminating the need for multiple QR codes or dynamic QR encoding.

2. **Dual payment integration**: Two payment models with different trust models (instant webhook-confirmed and manual administrator-verified) share a single ticket generation pipeline, reducing development and maintenance overhead while accommodating diverse customer preferences.

3. **Offline resilience without synchronization complexity**: The paper log sheet and digital bulk catch-up mechanism avoids the synchronization conflicts, data loss risks, and reconciliation complexity inherent in browser-based offline queues and local storage caches.

4. **Tiered identification with automatic progression**: Both booth staff and self-service customers benefit from multi-tier identification systems that automatically progress through progressively lower-friction tiers, minimizing typing and maximizing throughput at peak times.

5. **Dual-level balance cap enforcement**: The configurable balance cap is enforced at both the application level (user interface constraints) and the database level (atomic update conditions), providing defense in depth against financial exposure.

6. **Unified data model for dual ticket classes**: A single database table handles both single-use entry passes and rechargeable stored-value tickets, simplifying the codebase and data management while supporting fundamentally different ticket lifecycles.

7. **Role-based administrative access**: Multiple administrative roles with granular permission scopes enable delegating ticketing operations to specialized staff without granting access to unrelated systems.

8. **Server-side balance state**: Balance information is always fetched from the database server rather than encoded in QR codes, ensuring real-time accuracy regardless of the number of intermediate transactions.

---

## CONCLUSION

The embodiments described above are intended to be illustrative and not limiting. Various modifications and variations may be made to the present invention without departing from the scope of the invention as defined by the appended claims. The present invention is not limited to the specific architectures, protocols, or technologies described herein, and equivalents will be apparent to those skilled in the art.

---

## CLAIMS

What is claimed is:

**1. A dual-mode ticketing system for event venues, comprising:**

(a) a static web server configured to serve pre-built hypertext markup language (HTML) pages to client devices without server-side rendering;

(b) a database server configured to store ticket type records, order records, ticket records, and balance transaction records;

(c) an edge function server communicatively coupled to the database server and configured to execute server-side logic for ticket generation, payment processing, and email delivery;

(d) a first payment path comprising an instant electronic payment gateway communicatively coupled to the edge function server through a webhook callback interface, wherein the edge function server is configured to receive a webhook callback from the payment gateway upon successful payment and responsively invoke a unified ticket generation pipeline;

(e) a second payment path comprising a manual transfer verification subsystem, wherein an administrator confirms receipt of a manual transfer and responsively invokes the unified ticket generation pipeline;

(f) the unified ticket generation pipeline configured to, upon invocation, atomically increment a sold counter for each purchased ticket type subject to a capacity constraint, generate a unique human-readable ticket code for each ticket, generate a QR code encoding a lookup URL that includes the ticket code, create a ticket record in the database server, and cause a confirmation email containing the QR code to be sent to a customer email address; and

(g) a redirector page served by the static web server at the lookup URL, the redirector page comprising a client-side detection script configured to detect a presence of a staff scanner session token in browser session storage and, based on said detection, selectively redirect the browser to either a staff scanner page URL or a self-service page URL.

**2. The system of claim 1, further comprising:**

a three-tier booth staff identification subsystem configured to identify a customer's stored-value ticket, comprising:

a first identification tier wherein a staff member scans a QR code displayed on a customer device using a camera interface on a staff scanner page;

a second identification tier, automatically invoked upon failure of the first identification tier, wherein the staff member manually enters the human-readable ticket code into a text input field on the staff scanner page; and

a third identification tier, automatically invoked upon failure of both the first and second identification tiers, wherein the staff member enters a customer email address into a lookup field and selects a correct ticket from a list of tickets associated with said email address.

**3. The system of claim 1, further comprising:**

a three-tier customer self-service identity subsystem configured to prove ownership of a stored-value ticket for performing self-service top-ups, comprising:

a first identity tier wherein a customer activates a link in a confirmation email or scans a QR code from the confirmation email, causing the browser to navigate to the lookup URL and be redirected to the self-service page URL with the ticket code pre-loaded;

a second identity tier, available when the first identity tier is unavailable, wherein the customer enters the human-readable ticket code into a text input field on a self-service page; and

a third identity tier, available when both the first and second identity tiers are unavailable, wherein the customer authenticates using a passwordless email magic link on a ticket dashboard page and selects a ticket from a list of tickets associated with the customer's email address.

**4. The system of claim 1, further comprising:**

an offline resilience subsystem comprising:

a paper-based transaction recording mechanism comprising a pre-printed log sheet having columns for ticket code, amount, payment method, timestamp, and staff initials, configured for use during a network outage; and

a digital bulk catch-up subsystem activated upon detection of network connectivity restoration, comprising a batch input form configured to accept a plurality of pending transactions and an atomic batch processing function configured to process all rows in the batch, create balance transaction records for each row, and send confirmation receipt emails.

**5. The system of claim 1, further comprising:**

a stored-value balance management system comprising:

a balance field in each ticket record for tickets of a stored-value class;

a balance transactions table storing a chronologically ordered set of balance transaction records for each stored-value ticket;

a configurable balance cap value stored in a system configuration table; and

a balance cap enforcement subsystem configured to prevent a top-up operation from causing a current balance to exceed the balance cap value, wherein the balance cap enforcement subsystem operates at both an application level by dynamically constraining a user input field and a database level by including a balance cap condition in an atomic update operation.

**6. The system of claim 1, further comprising:**

an administrative management system comprising:

a role-based authentication subsystem configured to validate a user role selected from a set of roles including an admin role having full access and a ticketing role having access limited to ticketing functions;

an inventory overview subsystem configured to query the ticket type records and display sold count, capacity, remaining tickets, and fill rate;

an order management subsystem configured to display a filterable list of order records and provide controls to mark orders as paid and to regenerate tickets; and

a staff scanner code management subsystem configured to generate new staff scanner codes, assign staff member names and permission sets, revoke existing codes, and display last-used timestamps.

**7. The system of claim 1, wherein the database server stores a unified data model comprising:**

a tickets table having a type field distinguishing between an entry pass class and a stored-value class;

a status field for entry pass tickets that transitions from an active state to a used state upon scanning at a venue gate;

a balance field for stored-value tickets that is initialized upon ticket creation and modified by subsequent top-up and debit operations; and

a status field for stored-value tickets that transitions from an active state to an exhausted state when the balance reaches zero.

**8. The system of claim 1, further comprising:**

a manual override mechanism for the first payment path, comprising a control on the staff scanner page that, when activated by a staff member upon verifying a customer's payment through alternative means, creates a balance transaction record and causes an idempotency check to ignore a subsequently received duplicate webhook callback.

**9. The system of claim 1, wherein the QR code remains immutable for the entire lifetime of the ticket regardless of balance changes, top-ups, or debits, and encodes a lookup URL that is distinct from any balance information.

**10. The system of claim 1, wherein the static web server is configured to serve pre-built HTML pages without a build step, framework, or package manager dependency.

**11. A method for dual-mode ticketing for event venues, comprising the steps of:

(a) serving, by a static web server, pre-built hypertext markup language (HTML) pages to client devices without server-side rendering;

(b) receiving, by an edge function server from a first payment path comprising an instant electronic payment gateway, a webhook callback indicating successful payment, validating a signature of said webhook callback, checking an idempotency key, and responsively invoking a unified ticket generation pipeline;

(c) receiving, by the edge function server from a second payment path comprising an administrator confirmation of a manual transfer verification, an instruction to confirm payment and responsively invoking the unified ticket generation pipeline;

(d) executing, by the unified ticket generation pipeline, the steps of: atomically incrementing a sold counter for each purchased ticket type subject to a capacity constraint, generating a unique human-readable ticket code for each ticket, generating a QR code encoding a lookup URL that includes the ticket code, creating a ticket record in a database server, uploading the QR code to a storage service, and sending a confirmation email containing the QR code to a customer email address; and

(e) at a redirector page served at the lookup URL, executing a client-side detection script that detects a presence of a staff scanner session token in browser session storage and, based on said detection, selectively redirecting the browser to either a staff scanner page URL or a self-service page URL.

**12. The method of claim 11, further comprising the step of:**

identifying a customer's stored-value ticket through a three-tier booth staff identification process, comprising:

at a first identification tier, scanning, by a staff member using a camera interface on a staff scanner page, a QR code displayed on a customer device;

upon failure of the first identification tier, automatically invoking a second identification tier wherein the staff member manually enters the human-readable ticket code into a text input field; and

upon failure of both the first and second identification tiers, automatically invoking a third identification tier wherein the staff member enters a customer email address and selects a correct ticket from a list of tickets associated with said email address.

**13. The method of claim 11, further comprising the step of:**

proving ownership of a stored-value ticket through a three-tier customer self-service identity process, comprising:

at a first identity tier, activating, by a customer, a link in a confirmation email or scanning a QR code from the confirmation email, causing the browser to navigate to the lookup URL and be redirected to the self-service page URL with the ticket code pre-loaded;

at a second identity tier, when the first identity tier is unavailable, the customer entering the human-readable ticket code into a text input field on a self-service page; and

at a third identity tier, when both the first and second identity tiers are unavailable, the customer authenticating using a passwordless email magic link on a ticket dashboard page and selecting a ticket from a list of tickets associated with the customer's email address.

**14. The method of claim 11, further comprising the steps of:**

during a network outage, recording transactions on a pre-printed paper log sheet having columns for ticket code, amount, payment method, timestamp, and staff initials;

upon detection of network connectivity restoration, activating a digital bulk catch-up mode;

accepting, through a batch input form, a plurality of pending transactions from the paper log sheet;

atomically processing all rows in the batch, comprising for each row: looking up a ticket record by ticket code, validating the ticket, atomically updating a ticket balance with a balance cap condition in a WHERE clause, creating a balance transaction record, and sending a confirmation receipt email; and

returning a summary of processed rows and any errors encountered.

**15. The method of claim 11, further comprising the step of:**

managing a stored-value balance by: storing a current balance in a ticket record; storing a chronologically ordered set of balance transaction records in a balance transactions table; storing a configurable balance cap value in a system configuration table; and enforcing the balance cap at both an application level by dynamically constraining a user input field to a maximum value of balance cap minus current balance, and at a database level by including a condition of `balance + amount_delta <= balance_cap` in an atomic update operation.

**16. The method of claim 11, further comprising the steps of:**

authenticating an administrator by validating a user role selected from a set of roles including an admin role having full access and a ticketing role having access limited to ticketing functions;

displaying an inventory overview comprising sold count, capacity, remaining tickets, and fill rate;

displaying a filterable list of order records having controls to mark orders as paid and to regenerate tickets; and

managing staff scanner codes by generating new codes, assigning names and permission sets, revoking codes, and displaying last-used timestamps.

**17. The method of claim 11, further comprising the step of:**

responsive to a manual override activation by a staff member upon verifying a customer's payment through alternative means when a webhook callback is delayed, creating a balance transaction record with a source identifier indicating the payment gateway and a notes field indicating manual override, and subsequently responsive to receipt of the delayed webhook callback, checking an idempotency key and ignoring the duplicate callback.

**18. A non-transitory computer-readable medium storing instructions that, when executed by one or more processors, cause the processors to perform a method for dual-mode ticketing, the method comprising:

(a) serving, by a static web server, pre-built hypertext markup language (HTML) pages to client devices without server-side rendering;

(b) receiving, by an edge function server from a first payment path comprising an instant electronic payment gateway, a webhook callback indicating successful payment, validating a signature of said webhook callback, checking an idempotency key, and responsively invoking a unified ticket generation pipeline;

(c) receiving, by the edge function server from a second payment path comprising an administrator confirmation of a manual transfer verification, an instruction to confirm payment and responsively invoking the unified ticket generation pipeline;

(d) executing, by the unified ticket generation pipeline, the steps of: atomically incrementing a sold counter for each purchased ticket type subject to a capacity constraint, generating a unique human-readable ticket code for each ticket, generating a QR code encoding a lookup URL that includes the ticket code, creating a ticket record in a database server, uploading the QR code image to a storage service, and sending a confirmation email containing the QR code to a customer email address;

(e) at a redirector page served at the lookup URL, executing a client-side detection script that detects a presence of a staff scanner session token in browser session storage and, based on said detection, selectively redirecting the browser to either a staff scanner page URL or a self-service page URL;

(f) during a network outage, recording transactions on a pre-printed paper log sheet;

(g) upon detection of network connectivity restoration, activating a digital bulk catch-up mode, accepting a plurality of pending transactions from the paper log sheet through a batch input form, and atomically processing all rows in the batch; and

(h) managing a stored-value balance by storing a current balance in a ticket record, storing balance transaction records in a balance transactions table, storing a configurable balance cap value in a system configuration table, and enforcing the balance cap at both an application level and a database level.

**19. The computer-readable medium of claim 18, the method further comprising:**

identifying a customer's stored-value ticket through a three-tier booth staff identification process, comprising:

at a first identification tier, scanning a QR code displayed on a customer device using a camera interface;

upon failure of the first identification tier, automatically invoking a second identification tier wherein a staff member manually enters a human-readable ticket code into a text input field; and

upon failure of both the first and second identification tiers, automatically invoking a third identification tier wherein the staff member enters a customer email address and selects a correct ticket from a list of tickets associated with said email address.

**20. The computer-readable medium of claim 18, the method further comprising:**

proving ownership of a stored-value ticket through a three-tier customer self-service identity process, comprising:

at a first identity tier, activating a link in a confirmation email or scanning a QR code from the confirmation email, causing navigation to the lookup URL and redirection to the self-service page URL with the ticket code pre-loaded;

at a second identity tier, when the first identity tier is unavailable, entering the human-readable ticket code into a text input field on a self-service page; and

at a third identity tier, when both the first and second identity tiers are unavailable, authenticating using a passwordless email magic link on a ticket dashboard page and selecting a ticket from a list of tickets associated with an email address.

---

## ABSTRACT

A dual-mode ticketing system for event venues integrates an instant electronic payment path with a manual transfer verification path through a unified ticket generation pipeline. The system employs a single immutable QR code per ticket encoding a lookup URL rather than balance data, enabling the same QR to serve both customer self-service operations and venue staff scanning operations through client-side context-dependent redirection based on session state. An offline resilience subsystem uses paper-based transaction recording during network outages with digital bulk catch-up processing upon network restoration, avoiding synchronization conflicts inherent in local caching approaches. Three-tier identification subsystems for both booth staff (QR scan to ticket code to email lookup) and self-service customers (email link to ticket code to dashboard login) provide automatic progression through progressively lower-friction identification methods. A configurable balance cap enforced at both application and database levels limits financial exposure for stored-value tickets.

---

*END OF PATENT APPLICATION*

# TERMS OF SERVICE — TICKETING

## Walking-Fish Ticketing

*Powered by Walking-Fish Group*

**Last Updated:** June 2, 2026  
**Version:** 1.0.0  
**Contact:** tickets@walkingfish.gm  
**Website:** https://www.walkingfish.gm/tickets

---

## Quick Reference

| Topic | Summary |
|-------|---------|
| **What this covers** | Purchase, use, and management of event tickets, activity credits, and top-ups |
| **Age** | You must be 18+ (or 13+ with parent/guardian supervision) |
| **Tickets** | Entry passes: one-time scan at gate. Activity credits: stored-value, debited per use |
| **Payments** | ModemPay (instant) or Wave Transfer (manual, admin-verified). All prices in GMD |
| **Refunds** | No refunds except if we cancel the event |
| **QR Codes** | Keep yours private. Anyone with your QR can interact with your ticket |
| **Activity Credits** | Non-refundable, non-transferable. Forfeit at event end. Max balance cap applies |
| **Liability cap** | Limited to the amount you paid for tickets in the last 12 months |
| **Disputes** | Governed by the laws of The Gambia |

---

## 1. Agreement to Terms

### 1.1 Acceptance

By purchasing tickets, using the ticket dashboard, performing self-service top-ups, scanning tickets at venue, or otherwise using the ticketing services provided by Walking-Fish Group through the website at https://www.walkingfish.gm (the "Ticketing Services"), you agree to be bound by these Ticketing Terms of Service (the "Terms"). If you do not agree, do not use the Ticketing Services.

### 1.2 How You Accept

When you purchase tickets, create an account, or submit any form within the Ticketing Services, you will be required to affirmatively accept these Terms by checking a box or clicking a button. This creates a legally binding agreement.

### 1.3 Age

You must be at least 18 years old to use the Ticketing Services independently. If you are 13–17, you may use the Ticketing Services only under the supervision of a parent or legal guardian who agrees to these Terms on your behalf.

### 1.4 Changes to These Terms

We may update these Terms at any time. If we make material changes, we will notify you by email (if you have provided one) and/or a notice on the ticketing pages at least 14 days before the changes take effect. Your continued use after the effective date means you accept the updated Terms. If you don't agree, stop using the Ticketing Services.

---

## 2. The Ticketing Services

### 2.1 What We Provide

Walking-Fish Ticketing allows you to:

- **Browse ticket types** and see prices, availability, and descriptions for upcoming events.
- **Purchase tickets** for events, including entry passes, parking passes, and activity credit bundles.
- **Top up activity credits** on existing tickets, either yourself (through the self-service page) or at venue booths.
- **View your tickets** through a dashboard, see your activity credit balances, and review transaction history.
- **Use your tickets at events**, where venue staff scan your QR code for entry (gate), activity debits (booths), or top-ups (top-up booth).

### 2.2 What We Do Not Guarantee

- **No uninterrupted service.** We do not guarantee that the Ticketing Services will be available at all times without interruption or error.
- **No liability for third parties.** We use third-party services for payment processing (ModemPay), data hosting (Supabase), and email delivery (Resend). We are not responsible for their failures, outages, or security breaches.
- **No liability for venue network issues.** If network congestion or outages at the event venue affect QR scanning, ticket lookups, or top-up operations, we are not liable. The system includes offline fallback procedures (paper log sheets + bulk catch-up) to mitigate this.
- **No liability for phone compatibility.** The QR scanner page depends on your phone's camera and browser. We do not guarantee it will work on every device.

### 2.3 Service Changes

We may add, modify, or remove features of the Ticketing Services at any time. We will make reasonable efforts to notify you of significant changes that affect your existing tickets.

---

## 3. Tickets

### 3.1 Ticket Types

There are two fundamentally different kinds of tickets:

**Entry Passes (and Parking Passes)**
- One-time use. Scanned once at the venue gate (or parking lot entrance), then marked as "used."
- Cannot be reused, recharged, or topped up.
- Types include Regular Entry, VIP Entry, Group Entry, and Parking.

**Activity Credits**
- Stored-value balance loaded onto a ticket.
- Balance is debited per use at activity booths (games, karaoke, food, drinks, kids' zone).
- Can be topped up (recharged) — either by you online or at the venue top-up booth.
- If your balance reaches zero, the ticket becomes "exhausted" and you must top up to use it again.

### 3.2 Order States

Every order goes through these stages:

| State | Meaning |
|-------|---------|
| **Unpaid** | Order created. No payment received yet. No tickets generated. |
| **Pending Verification** | You submitted a Wave Transfer payment. We're checking it. |
| **Paid** | Payment confirmed. Tickets generated and emailed. |
| **Cancelled** | Order voided before tickets were created. |
| **Refunded** | Order cancelled and refunded (refund processed outside the system). |

### 3.3 Pricing

All prices are in Gambian Dalasi (GMD), shown as "D." Prices include applicable taxes. We may change prices at any time, but price changes will not affect orders you have already placed.

### 3.4 Capacity Limits

Each ticket type has a limited supply. Orders are fulfilled on a first-come, first-served basis. If a ticket type sells out before your payment is confirmed, we will cancel that portion of your order. For ModemPay you won't be charged; for Wave Transfer we'll arrange a refund.

### 3.5 Delivery

When your payment is confirmed, we send you an email containing QR codes and ticket codes for every ticket in your order. You can also access your tickets by logging into the ticket dashboard at `/tickets` via email magic link.

**You are responsible for providing a correct email address.** We are not liable if you mistype your email and someone else receives your tickets.

### 3.6 No Refunds

All ticket sales are final. We do not offer refunds, exchanges, or credits except:

- **Event cancellation by us.** If we cancel the event, you get a full refund or a credit toward a future event (your choice).
- **Event postponement.** If the event is rescheduled, all tickets remain valid for the new date. No refunds for postponements.

Activity credit balances are never refunded — even if you don't use them. Unused activity credits expire at the end of the event.

### 3.7 Tickets Are Non-Transferable

You may not resell, give away, or transfer your ticket to another person. If we detect that a ticket has been transferred, we may invalidate it without compensation.

### 3.8 Balance Cap

Activity credit tickets have a maximum balance (default: D5,000). You cannot exceed this cap through any combination of initial purchases and top-ups. The cap exists to limit financial exposure and is configurable by us. We will notify you if we change the cap.

---

## 4. Payments

### 4.1 Payment Methods

You can pay for tickets in two ways:

**ModemPay (Instant)**
- An electronic payment gateway supporting Wave, QMoney, and AfriMoney mobile money.
- A 1.5% processor fee applies (included in the total you see).
- Payment is confirmed automatically via webhook. Tickets are generated and emailed immediately upon confirmation.
- If the webhook is delayed, tickets will be generated as soon as it arrives. If you haven't received tickets within 30 minutes of paying, contact us.

**Wave Transfer (Manual)**
- Send the exact amount to our designated Wave number. No platform fee.
- Submit the reference number (and optional screenshot) through the order page.
- We verify the transfer manually. This usually takes up to 2 hours during business hours. It may take longer evenings, weekends, or public holidays.
- Once verified, tickets are generated and emailed.

### 4.2 Failed Payments

If a ModemPay payment fails or you cancel, your order stays unpaid. You can retry. We don't charge for failed attempts.

### 4.3 Chargebacks

If you dispute a charge with your mobile money provider:
- We may suspend your account and invalidate any associated tickets.
- We may block you from future purchases.
- We may take legal action to recover the disputed amount plus any fees we incur.

### 4.4 Pricing Errors

If we list an incorrect price and you place an order at that price, we will notify you and either:
- Cancel the order and fully refund you, or
- Offer you the option to purchase at the corrected price.

---

## 5. Your QR Code & Ticket Code

### 5.1 What They Are

Every ticket has:
- A **QR code** that encodes a unique lookup URL (`/t?t=TKT-XXXXXX`).
- A **human-readable ticket code** (e.g., `TKT-7F3A2B`).

These identifiers are **immutable** — they do not change for the lifetime of the ticket, even after top-ups or debits.

### 5.2 Keep Them Private

Anyone who has your QR code or ticket code can:
- Check your ticket balance.
- Perform a top-up (if they know the method).
- Present it at the gate or booth.

**You are responsible for keeping your QR code and ticket code confidential.** Do not post photos of your QR code on social media. If someone else uses your ticket before you do, we are not liable.

### 5.3 Fraud

Forging, duplicating, or tampering with QR codes is strictly prohibited. We will invalidate any ticket suspected of fraud and may pursue legal action.

---

## 6. Using Tickets at the Venue

### 6.1 Gate Entry

Present your QR code on your phone (or a printout) at the venue entrance. Staff will scan it. Once scanned, the ticket is marked "used" and cannot be scanned again.

### 6.2 Activity Booths

At game booths, karaoke, food stalls, etc., staff will scan your activity credit ticket and enter the amount to debit. Your balance decreases. You will see the remaining balance after each transaction.

### 6.3 Top-Up Booth

To add credits at the venue, visit the top-up booth. Staff will identify your ticket (by scanning your QR, typing your ticket code, or looking up your email). You can pay via:
- **ModemPay QR** (scan a QR on the staff's screen with your phone and pay)
- **Wave Transfer** (send to the booth's dedicated Wave number)
- **Cash** (pay cash, staff confirms)

### 6.4 Network Outages

If the venue network goes down, staff will record transactions on a paper log sheet. When the network comes back, they will enter all pending transactions in bulk. Your balance will be updated and you'll receive a confirmation email. You may receive a paper receipt slip in the meantime — keep it safe.

### 6.5 Event Rules

You must follow all event rules, safety guidelines, and instructions from venue staff. We reserve the right to refuse entry or eject anyone who violates event rules.

---

## 7. Your Account

### 7.1 Account Types

- **Customer Dashboard:** Accessed via magic link sent to your email. View tickets, balances, and transaction history.
- **Staff Scanner Account:** Accessed via a unique passcode issued by us. Used by venue staff for gate/booth operations.

### 7.2 Your Responsibility

You are responsible for:
- Keeping your login credentials and ticket codes confidential.
- All activity under your account.
- Notifying us immediately if you suspect unauthorised use.

### 7.3 Sharing

Do not share your account with others. Staff scanner passcodes are personal to each staff member — any transaction using your passcode is your responsibility.

---

## 8. Privacy & Data

### 8.1 What We Collect

We collect:
- **Contact info:** Name, email, phone (you provide).
- **Purchase data:** What you bought, how much you paid, payment method.
- **Usage data:** Activity credit balances, transaction history, when/where your ticket was scanned.
- **Communications:** Messages you send us through contact forms or issue reports.

### 8.2 How We Use It

We use your data to:
- Process and deliver your tickets.
- Provide the ticket dashboard and top-up features.
- Enable venue staff to scan and verify your tickets.
- Send you important updates about your tickets and events.
- Improve the Ticketing Services.

See our full Privacy Policy at `/privacy` for details.

### 8.3 Data Retention

We keep your data as long as needed to provide the Ticketing Services and comply with legal obligations. If you delete your account, we keep your data for 30 days (for retrieval) then delete it from active systems. Backups may persist up to 90 days.

### 8.4 Aggregated Data

We may use anonymised, aggregated data (e.g., "X tickets sold," "average spend per customer") for reporting, analytics, and marketing. This data cannot identify you.

---

## 9. Our Intellectual Property

The Ticketing Services — including the software, branding, ticket designs, and underlying technology — are owned by Walking-Fish Group. You get a limited, non-exclusive, revocable licence to use the Ticketing Services to buy tickets and attend events. You may not copy, modify, or reverse-engineer any part of the Ticketing Services.

---

## 10. Limitation of Liability

### 10.1 What We Are Not Liable For

To the maximum extent permitted by law, Walking-Fish Group is not liable for:

- **Indirect damages.** Loss of profits, data, goodwill, or opportunity.
- **Service failures.** Interruptions, bugs, or downtime of the Ticketing Services.
- **Third-party failures.** Issues caused by ModemPay, Supabase, Resend, or other third-party services.
- **Venue incidents.** Personal injury, property damage, theft, or other incidents at the event venue.
- **Network issues.** Problems caused by network congestion or outages at the venue.
- **Device issues.** Problems caused by your phone, camera, or browser.

### 10.2 Liability Cap

Our total liability to you for any claim related to the Ticketing Services is limited to the amount you paid us for tickets in the 12 months before the event giving rise to the claim.

### 10.3 What We Cannot Limit

Nothing in these Terms limits our liability for:
- Death or personal injury caused by our negligence.
- Fraud or fraudulent misrepresentation.
- Any liability that cannot be limited under applicable law.

### 10.4 Attendance Is At Your Own Risk

You attend events at your own risk. You assume all risks associated with a live event, including crowds, weather, loud noises, physical activities, and theft.

---

## 11. Indemnification

You agree to indemnify (cover) Walking-Fish Group and its staff against any claims, damages, or costs (including legal fees) arising from:
- Your misuse of the Ticketing Services.
- Your violation of these Terms or applicable law.
- Your attendance at an event.

---

## 12. Termination

### 12.1 You Can Stop

You may stop using the Ticketing Services at any time. Delete your account through the dashboard or by emailing tickets@walkingfish.gm.

### 12.2 We Can Suspend or Terminate

We may suspend or terminate your access to the Ticketing Services immediately if:
- You violate these Terms.
- Your use creates legal risk or harm to us or others.
- We are required to do so by law.
- We discontinue the Ticketing Services.

### 12.3 After Termination

- Your right to use the Ticketing Services ends immediately.
- Pending unpaid orders are cancelled.
- We keep your data for 30 days, then delete it.
- Sections 10 (Liability), 11 (Indemnification), and 13 (Disputes) survive termination.

---

## 13. Disputes & Governing Law

### 13.1 Governing Law

These Terms are governed by the laws of The Gambia.

### 13.2 Try to Resolve Informally First

Before taking legal action, contact us at tickets@walkingfish.gm and try to resolve the issue informally for at least 30 days.

### 13.3 Where to Bring Claims

Any legal action must be brought exclusively in the courts of The Gambia.

### 13.4 No Class Actions

Disputes will be handled on an individual basis, not as a class action or consolidated action.

---

## 14. Force Majeure

We are not liable for delays or failures caused by circumstances beyond our reasonable control, including: acts of God, natural disasters, war, terrorism, civil unrest, government actions, pandemics, public health emergencies, labour disputes, network outages, power failures, or third-party service disruptions.

---

## 15. General

### 15.1 Entire Agreement

These Terms (together with the Privacy Policy) are the entire agreement between you and Walking-Fish Group regarding the Ticketing Services.

### 15.2 Severability

If any part of these Terms is found to be invalid, the rest remains in effect.

### 15.3 No Transfer

You may not transfer your rights under these Terms without our written consent. We may transfer our rights without restriction.

### 15.4 Waiver

If we don't enforce a provision, that does not waive our right to enforce it later.

### 15.5 Notices

Send legal notices to: Walking-Fish Group, Attn: Legal, tickets@walkingfish.gm. We may send notices to you at the email you provided.

---

## 16. Contact

**Email:** tickets@walkingfish.gm  
**Website:** https://www.walkingfish.gm/tickets  

**Walking-Fish Group**  
The Gambia

---

## 17. Definitions

| Term | Meaning |
|------|---------|
| **Activity Credits** | Stored-value balance on a ticket, deducted per use at activity booths |
| **Balance Cap** | Maximum balance an activity credit ticket can hold (default D5,000) |
| **Bulk Catch-Up** | Entering paper-recorded transactions into the system after network is restored |
| **Entry Pass** | One-time ticket scanned at venue gate |
| **ModemPay** | Our instant mobile money payment gateway |
| **QR Code** | The scannable code on your ticket that links to a lookup page |
| **Ticket Code** | The human-readable code (e.g., `TKT-7F3A2B`) on your ticket |
| **Ticketing Services** | All ticket purchase, top-up, scanning, and management features at walkingfish.gm |
| **Top-Up** | Adding more activity credits to an existing ticket |
| **Wave Transfer** | Manual payment by sending money to our Wave number |
| **We/Us/Our** | Walking-Fish Group |
| **You/Your** | The person or entity using the Ticketing Services |

---

*These Terms of Service are specific to the Walking-Fish Ticketing system. They are drafted for reference and planning purposes and do not constitute legal advice. Have them reviewed by a qualified legal professional in The Gambia before publication.*

*END OF TERMS OF SERVICE — TICKETING*

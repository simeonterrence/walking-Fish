import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import * as QRCode from "qrcode";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Request routing ─────────────────────────────────────────────────────────

async function routeRequest(req: Request, pathname: string): Promise<Response> {
  switch (pathname) {
    case "/create-intent":
      return handleCreateIntent(req);
    case "/webhook":
      return handleWebhook(req);
    case "/create-order":
      return handleCreateOrder(req);
    case "/lookup-ticket":
      return handleLookupTicket(req);
    case "/confirm-wave":
      return handleConfirmWave(req);
    case "/staff-auth":
      return handleStaffAuth(req);
    case "/mark-used":
      return handleMarkUsed(req);
    case "/debit":
      return handleDebit(req);
    case "/bulk-topup":
      return handleBulkTopup(req);
    case "/debug-ticket":
      return handleDebugTicket(req);
    default:
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }
}

// ─── Helper: get Supabase client (service role) ──────────────────────────────

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(supabaseUrl, supabaseKey);
}

// ─── Helper: send email via Resend ───────────────────────────────────────────

function emailShell(body: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#111;">${body}<hr style="margin:32px 0;border:none;border-top:1px solid #eee;"><p style="font-size:12px;color:#999;margin:0;">Walking-Fish Group · walkingfish.gm</p></div>`;
}

async function sendEmail(payload: { to: string; subject: string; html: string }) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping email");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Walking-Fish <noreply@walkingfish.gm>",
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      console.error(`[Email] Resend error ${res.status}: ${await res.text()}`);
    } else {
      console.log(`[Email] ✓ Sent to ${payload.to} — ${payload.subject}`);
    }
  } catch (err: any) {
    console.error(`[Email] Send failed: ${err.message}`);
  }
}

// ─── Helper: generate QR code as base64 data URI ─────────────────────────────

async function generateQRDataUri(text: string): Promise<string> {
  return await QRCode.toDataURL(text, {
    width: 400,
    margin: 2,
    color: { dark: "#111111", light: "#ffffff" },
  });
}

// ─── Helper: create tickets for an order ──────────────────────────────────────

interface OrderItem {
  ticket_type_id: string;
  quantity: number;
}

async function createTicketsForOrder(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  email: string,
  items: OrderItem[],
  customerName?: string
): Promise<{ code: string; ticketTypeSlug: string }[]> {
  const created: { code: string; ticketTypeSlug: string }[] = [];

  for (const item of items) {
    // Fetch ticket type info
    const { data: ticketType, error: typeErr } = await supabase
      .from("ticket_types")
      .select("id, name, slug, type, price")
      .eq("id", item.ticket_type_id)
      .single();

    if (typeErr || !ticketType) {
      console.error(`[Tickets] Ticket type ${item.ticket_type_id} not found:`, typeErr);
      continue;
    }

    // Try to increment sold count — if at capacity, skip
    const { data: canSell } = await supabase.rpc("increment_ticket_sold_count", {
      ticket_type_id: item.ticket_type_id,
    });

    if (canSell === false) {
      console.warn(`[Tickets] Ticket type ${ticketType.slug} is sold out`);
      continue;
    }

    for (let i = 0; i < item.quantity; i++) {
      // Generate ticket code
      const { data: code } = await supabase.rpc("generate_ticket_code");

      if (!code) {
        console.error("[Tickets] Failed to generate ticket code");
        continue;
      }

      const qrContent = `https://walkingfish.gm/t?t=${code}`;
      const qrDataUri = await generateQRDataUri(qrContent);

      const initialBalance = ticketType.type === "activity_credit" ? ticketType.price : 0;

      const { data: ticket, error: ticketErr } = await supabase
        .from("tickets")
        .insert({
          order_id: orderId,
          ticket_type_id: item.ticket_type_id,
          type: ticketType.type,
          code,
          balance: initialBalance,
          customer_email: email,
          customer_name: customerName || null,
          qr_url: qrContent,
          metadata: { qr_data_uri: qrDataUri },
        })
        .select()
        .single();

      if (ticketErr) {
        console.error(`[Tickets] Failed to create ticket:`, ticketErr);
        continue;
      }

      // Record initial balance transaction for activity credits
      // The balance is already set in the insert above; this just creates the audit trail.
      // We insert directly rather than calling update_ticket_balance (which would double-add).
      if (initialBalance > 0) {
        await supabase.from("balance_transactions").insert({
          ticket_id: ticket.id,
          type: "initial_purchase",
          amount_delta: initialBalance,
          balance_after: initialBalance,
          source: "initial",
          notes: `Initial purchase — ${ticketType.name}`,
        });
      }

      created.push({ code, ticketTypeSlug: ticketType.slug });
    }
  }

  return created;
}

// ─── Handler: /create-intent
// Creates a ModemPay payment intent for an order.
// Called from frontend after creating the order.
// ──────────────────────────────────────────────────────────────────────────────

async function handleCreateIntent(req: Request): Promise<Response> {
  try {
    const { order_id, amount, email, description, purpose, ticket_code } = await req.json();

    if (!order_id || !amount || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: order_id, amount, email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();

    // Verify order exists and is unpaid
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, total, metadata")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (order.status !== "unpaid") {
      return new Response(
        JSON.stringify({ error: `Order is already ${order.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── TODO: Replace with actual ModemPay API integration ────────────────────
    // ModemPay API details (endpoint, auth, etc.) to be provided by ModemPay.
    // Expected flow:
    //   1. POST to ModemPay API to create a payment intent
    //   2. ModemPay returns a payment URL (for redirect) or a payment QR code
    //   3. Store the ModemPay payment intent ID on the order for webhook matching
    //
    // Placeholder implementation:
    const modemPayPaymentUrl = `https://modempay.example.com/pay?order_id=${order_id}&amount=${amount}&email=${encodeURIComponent(email)}`;
    const modemPayIntentId = `mp_${crypto.randomUUID()}`;

    // Store the ModemPay intent ID and purpose metadata on the order
    const existingMeta = order.metadata as Record<string, any> || {};
    const metadata = {
      ...existingMeta,
      modempay_intent_id: modemPayIntentId,
      purpose: purpose || existingMeta.purpose || "purchase",
      ticket_code: ticket_code || existingMeta.ticket_code || null,
    };
    await supabase.from("orders").update({ metadata }).eq("id", order_id);

    console.log(`[ModemPay] Created intent ${modemPayIntentId} for order ${order_id} (D${amount}) purpose=${purpose || "purchase"}`);

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: modemPayPaymentUrl,
        intent_id: modemPayIntentId,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[create-intent] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to create payment intent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /webhook
// Receives ModemPay webhook callbacks.
// On charge.succeeded: mark order paid, create tickets, send email.
// On charge.cancelled: update order status.
// ──────────────────────────────────────────────────────────────────────────────

async function handleWebhook(req: Request): Promise<Response> {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-modempay-signature") || "";

    // ─── TODO: Verify ModemPay webhook signature ───────────────────────────────
    // ModemPay should provide a signing secret. The signature is sent in
    // the x-modempay-signature header. Verify using HMAC-SHA256 (or whatever
    // ModemPay specifies).
    //
    // Placeholder — skip verification until ModemPay provides details.
    console.log("[Webhook] Signature verification: TODO");

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const event = payload.event || payload.type || "";
    const intentId = payload.intent_id || payload.data?.intent_id || "";
    const status = payload.status || payload.data?.status || "";

    console.log(`[Webhook] Event: ${event}, Intent: ${intentId}, Status: ${status}`);

    // ─── TODO: Implement idempotency check ──────────────────────────────────
    // ModemPay may retry webhooks. Store processed webhook IDs or use
    // idempotency keys to prevent duplicate processing.

    const supabase = getSupabaseClient();

    // Find the order by ModemPay intent ID
    // The intent ID was stored in order.metadata during create-intent
    // Query: orders where metadata->>modempay_intent_id = intentId
    const { data: orders, error: orderErr } = await supabase
      .from("orders")
      .select("id, email, status, total, metadata")
      .filter("metadata->>modempay_intent_id", "eq", intentId);

    if (orderErr || !orders || orders.length === 0) {
      console.error(`[Webhook] No order found for intent ${intentId}`);
      return new Response(
        JSON.stringify({ error: "Order not found for this intent" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order = orders[0];

    // Handle charge.succeeded
    if (event === "charge.succeeded" || status === "completed") {
      if (order.status === "paid") {
        console.log(`[Webhook] Order ${order.id} already paid — skipping duplicate`);
        return new Response(
          JSON.stringify({ status: "already_processed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark order as paid
      await supabase
        .from("orders")
        .update({
          status: "paid",
          payment_method: "modempay",
          metadata: { ...(order.metadata as Record<string, any> || {}), webhook_verified_at: new Date().toISOString() },
        })
        .eq("id", order.id);

      // Parse order metadata for purpose detection
      const orderMetadata = order.metadata as Record<string, any> || {};
      const isTopUp = orderMetadata.purpose === "top-up";

      if (isTopUp) {
        // ─── Top-up flow: increase ticket balance ────────────────────────────
        const ticketCode = orderMetadata.ticket_code;
        const topupAmount = orderMetadata.topup_amount || amount;

        if (!ticketCode) {
          console.error(`[Webhook] Top-up order ${order.id} has no ticket_code in metadata`);
          return new Response(
            JSON.stringify({ error: "Missing ticket_code for top-up" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Find the ticket by code
        const { data: ticket } = await supabase
          .from("tickets")
          .select("id, code, balance")
          .eq("code", ticketCode)
          .maybeSingle();

        if (!ticket) {
          console.error(`[Webhook] Ticket ${ticketCode} not found for top-up order ${order.id}`);
          return new Response(
            JSON.stringify({ error: "Ticket not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update balance atomically
        const { data: newBalance, error: balanceErr } = await supabase
          .rpc("update_ticket_balance", {
            p_ticket_id: ticket.id,
            p_amount_delta: topupAmount,
            p_txn_type: "top_up",
            p_source: "modempay",
            p_notes: "Self-service top-up via ModemPay",
          });

        if (balanceErr || newBalance === -1) {
          console.error(`[Webhook] Balance update failed for ticket ${ticketCode}:`, balanceErr);
          // Don't fail the webhook — the order is already marked paid
        }

        // Send top-up confirmation email
        await sendEmail({
          to: order.email,
          subject: "Credits Added! Top-Up Confirmed — Walking-Fish",
          html: emailShell(`
            <h2 style="margin:0 0 8px;">Top-Up Successful</h2>
            <p style="color:#666;margin:0 0 24px;">
              Your top-up of <strong>D${topupAmount}</strong> has been added to ticket <strong>${ticketCode}</strong>.
            </p>
            <p style="color:#666;margin:0 0 24px;">
              New balance: <strong>D${newBalance > 0 ? newBalance : (ticket.balance || 0) + topupAmount}</strong>
            </p>
            <p style="margin-top:20px;">
              <a href="https://walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
            </p>
            <p style="margin-top:12px;font-size:12px;color:#999;">
              Need help? Visit the info desk at Piroake Fest 2026.
            </p>
          `),
        });

        console.log(`[Webhook] ✓ Top-up order ${order.id} — ticket ${ticketCode} +D${topupAmount}`);

        return new Response(
          JSON.stringify({ success: true, topup: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Normal purchase: create tickets ─────────────────────────────────
      const items: OrderItem[] = orderMetadata.items || [];
      const customerName = orderMetadata.customer_name || undefined;
      const customerEmail = order.email;

      // Debug: if no items found, return detailed debug info
      if (!items || items.length === 0) {
        const debug = {
          success: false,
          error: 'No items in metadata',
          metadata_keys: Object.keys(orderMetadata),
          has_items: 'items' in orderMetadata,
          items_json: JSON.stringify(orderMetadata.items),
          items_is_array: Array.isArray(orderMetadata.items),
        };
        console.error(`[Webhook] DEBUG: ${JSON.stringify(debug)}`);
        return new Response(JSON.stringify(debug), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tickets = await createTicketsForOrder(supabase, order.id, customerEmail, items, customerName);

      // Debug: if tickets_created is 0, return debug info
      if (tickets.length === 0) {
        const debug = {
          success: false,
          error: 'createTicketsForOrder returned 0 tickets',
          items_length: items.length,
          first_item_type_id: items[0]?.ticket_type_id,
        };
        console.error(`[Webhook] DEBUG: ${JSON.stringify(debug)}`);
        return new Response(JSON.stringify(debug), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Send confirmation email
      if (tickets.length > 0) {
        const ticketList = tickets
          .map((t) => `<li><strong>${t.ticketTypeSlug}</strong>: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:14px;">${t.code}</code></li>`)
          .join("");

        await sendEmail({
          to: customerEmail,
          subject: "Your tickets are ready! — Walking-Fish",
          html: emailShell(`
            <h2 style="margin:0 0 8px;">Payment Confirmed</h2>
            <p style="color:#666;margin:0 0 24px;">Your order <strong>#${order.id.slice(0, 8)}</strong> has been paid.</p>
            <h3 style="margin:0 0 12px;">Your Tickets</h3>
            <ul style="padding-left:20px;line-height:1.8;">${ticketList}</ul>
            <p style="margin-top:20px;">
              <a href="https://walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
            </p>
            <p style="margin-top:12px;font-size:12px;color:#999;">
              Tap the link above or scan the QR code at the venue. Need help? Visit the info desk.
            </p>
          `),
        });
      }

      console.log(`[Webhook] ✓ Order ${order.id} paid, ${tickets.length} tickets created`);

      return new Response(
        JSON.stringify({ success: true, tickets_created: tickets.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle charge.cancelled / charge.failed
    if (event === "charge.cancelled" || event === "charge.failed" || status === "failed" || status === "cancelled") {
      if (order.status !== "unpaid") {
        console.log(`[Webhook] Order ${order.id} is ${order.status} — skipping cancellation`);
        return new Response(
          JSON.stringify({ status: "already_processed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", order.id);

      console.log(`[Webhook] Order ${order.id} cancelled`);

      return new Response(
        JSON.stringify({ success: true, status: "cancelled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle manual_paid trigger from scanner's createNewTicket
    if (payload.trigger === "manual_paid") {
      const { order_id, email, customer_name, payment_method } = payload;

      if (!order_id) {
        return new Response(
          JSON.stringify({ error: "Missing order_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch the order and its items from metadata
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, email, status, metadata, total")
        .eq("id", order_id)
        .single();

      if (orderErr || !order) {
        console.error(`[Webhook] Order ${order_id} not found for manual_paid`);
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (order.status !== "paid" && order.status !== "unpaid") {
        console.log(`[Webhook] Order ${order_id} is ${order.status} — cannot process manual_paid`);
        return new Response(
          JSON.stringify({ status: "already_processed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If order was marked paid by createNewTicket, create the tickets
      if (order.status === "paid") {
        const orderMetadata = order.metadata as Record<string, any> || {};
        const items: OrderItem[] = orderMetadata.items || [];
        const custName = customer_name || orderMetadata.customer_name || undefined;

        const tickets = await createTicketsForOrder(supabase, order.id, email, items, custName);

        // Send confirmation email
        if (tickets.length > 0) {
          const ticketList = tickets
            .map((t) => `<li><strong>${t.ticketTypeSlug}</strong>: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:14px;">${t.code}</code></li>`)
            .join("");

          await sendEmail({
            to: email,
            subject: "Your tickets are ready! — Walking-Fish",
            html: emailShell(`
              <h2 style="margin:0 0 8px;">Ticket Created at Venue</h2>
              <p style="color:#666;margin:0 0 24px;">
                Your ticket was created at the Piroake Fest booth. Payment collected on-site.
              </p>
              <h3 style="margin:0 0 12px;">Your Tickets</h3>
              <ul style="padding-left:20px;line-height:1.8;">${ticketList}</ul>
              <p style="margin-top:20px;">
                <a href="https://walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
              </p>
              <p style="margin-top:12px;font-size:12px;color:#999;">
                Show your ticket QR at the gate. Need help? Visit the info desk.
              </p>
            `),
          });
        }

        // Return first ticket code for the frontend to show
        const firstCode = tickets.length > 0 ? tickets[0].code : null;

        console.log(`[Webhook] ✓ Manual order ${order_id} paid, ${tickets.length} tickets created${firstCode ? " (" + firstCode + ")" : ""}`);

        return new Response(
          JSON.stringify({ success: true, tickets_created: tickets.length, ticket_code: firstCode }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Order is unpaid — return early
      return new Response(
        JSON.stringify({ success: false, status: "unpaid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown event — acknowledge receipt
    console.log(`[Webhook] Unhandled event: ${event}`);
    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Webhook] Error:", err.message);
    // Always return 200 for webhooks to acknowledge receipt
    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /create-order
// Creates an order and its order items in a single call.
// Used by the ticket shop frontend for initial purchases.
// ──────────────────────────────────────────────────────────────────────────────

async function handleCreateOrder(req: Request): Promise<Response> {
  try {
    const { email, customer_name, items, purpose, ticket_code, topup_amount } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Missing required field: email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();

    let total = 0;
    let validatedItems: OrderItem[] = [];
    const isTopUp = purpose === "top-up";

    if (isTopUp) {
      // Top-up orders: use provided topup_amount and store ticket_code reference
      total = topup_amount || 0;
    } else {
      // Normal purchase: validate ticket types and calculate total
      if (!items || !Array.isArray(items) || items.length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: items" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (const item of items) {
        const { data: ticketType } = await supabase
          .from("ticket_types")
          .select("id, price, is_active")
          .eq("id", item.ticket_type_id)
          .single();

        if (!ticketType || !ticketType.is_active) {
          return new Response(
            JSON.stringify({ error: `Invalid ticket type: ${item.ticket_type_id}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        total += ticketType.price * item.quantity;
        validatedItems.push({ ticket_type_id: item.ticket_type_id, quantity: item.quantity });
      }
    }

    // Build metadata with top-up fields if applicable
    const metadata: Record<string, any> = {
      items: validatedItems,
      customer_name: customer_name || null,
    };
    if (isTopUp) {
      metadata.purpose = "top-up";
      metadata.ticket_code = ticket_code || null;
      metadata.topup_amount = topup_amount || 0;
    }

    // Create the order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        email,
        total,
        status: isTopUp ? "unpaid" : "unpaid",
        metadata,
      })
      .select()
      .single();

    if (orderErr) {
      console.error("[create-order] Error:", orderErr);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, order_id: order.id, total }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[create-order] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to create order" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /lookup-ticket
// Looks up a ticket by code. Used by the /t page, /top-up page,
// and /scan page to fetch ticket info.
// Returns limited public info (no personal data beyond customer_name).
// ──────────────────────────────────────────────────────────────────────────────

async function handleLookupTicket(req: Request): Promise<Response> {
  try {
    const { code } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Missing ticket code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();

    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select(`
        id,
        code,
        type,
        status,
        balance,
        customer_name,
        customer_email,
        ticket_type_id,
        order_id,
        created_at,
        ticket_types!inner(name, slug, price)
      `)
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (ticketErr) {
      console.error("[lookup-ticket] Error:", ticketErr);
      return new Response(
        JSON.stringify({ error: "Failed to look up ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ticket) {
      return new Response(
        JSON.stringify({ error: "Ticket not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return safe public subset
    return new Response(
      JSON.stringify({
        success: true,
        ticket: {
          id: ticket.id,
          code: ticket.code,
          type: ticket.type,
          status: ticket.status,
          balance: ticket.balance,
          customer_name: ticket.customer_name,
          ticket_type: {
            name: (ticket.ticket_types as any).name,
            slug: (ticket.ticket_types as any).slug,
            price: (ticket.ticket_types as any).price,
          },
          order_id: ticket.order_id,
          created_at: ticket.created_at,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[lookup-ticket] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to look up ticket" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /confirm-wave
// Called from admin dashboard when confirming/rejecting a Wave Transfer payment proof.
// Routes:
//   action = "confirm" → marks proof verified, order paid, creates tickets, sends email
//   action = "reject"   → marks proof rejected, order cancelled
// ──────────────────────────────────────────────────────────────────────────────

async function handleConfirmWave(req: Request): Promise<Response> {
  try {
    const { proof_id, order_id, action } = await req.json();

    if (!proof_id || !order_id || !action) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: proof_id, order_id, action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action !== "confirm" && action !== "reject") {
      return new Response(
        JSON.stringify({ error: 'Action must be "confirm" or "reject"' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch the payment proof
    const { data: proof, error: proofErr } = await supabase
      .from("payment_proofs")
      .select("id, order_id, email, status, reference_number")
      .eq("id", proof_id)
      .single();

    if (proofErr || !proof) {
      return new Response(
        JSON.stringify({ error: "Payment proof not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (proof.status !== "pending") {
      return new Response(
        JSON.stringify({ error: `Proof is already ${proof.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "confirm") {
      // 1. Mark proof as verified
      await supabase
        .from("payment_proofs")
        .update({
          status: "verified",
          verified_at: new Date().toISOString(),
        })
        .eq("id", proof_id);

      // 2. Fetch the order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, email, total, status, metadata")
        .eq("id", order_id)
        .single();

      if (orderErr || !order) {
        console.error(`[confirm-wave] Order ${order_id} not found`);
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (order.status !== "unpaid" && order.status !== "pending_verification") {
        return new Response(
          JSON.stringify({ error: `Order is already ${order.status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Mark order as paid
      await supabase
        .from("orders")
        .update({
          status: "paid",
          payment_method: "wave_transfer",
          payment_proof_id: proof_id,
        })
        .eq("id", order_id);

      // 4. Create tickets
      const orderMetadata = order.metadata as Record<string, any> || {};
      const items: OrderItem[] = orderMetadata.items || [];
      const customerName = orderMetadata.customer_name || undefined;

      const tickets = await createTicketsForOrder(supabase, order.id, order.email, items, customerName);

      // 5. Send confirmation email
      if (tickets.length > 0) {
        const ticketList = tickets
          .map((t) => `<li><strong>${t.ticketTypeSlug}</strong>: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:14px;">${t.code}</code></li>`)
          .join("");

        await sendEmail({
          to: order.email,
          subject: "Your tickets are ready! — Walking-Fish",
          html: emailShell(`
            <h2 style="margin:0 0 8px;">Wave Transfer Confirmed</h2>
            <p style="color:#666;margin:0 0 24px;">Your payment of <strong>D${order.total}</strong> via Wave Transfer has been verified.</p>
            <h3 style="margin:0 0 12px;">Your Tickets</h3>
            <ul style="padding-left:20px;line-height:1.8;">${ticketList}</ul>
            <p style="margin-top:20px;">
              <a href="https://walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
            </p>
            <p style="margin-top:12px;font-size:12px;color:#999;">
              Tap the link above or scan the QR code at the venue. Need help? Visit the info desk.
            </p>
          `),
        });
      }

      console.log(`[confirm-wave] ✓ Order ${order_id} paid via Wave, ${tickets.length} tickets created`);

      return new Response(
        JSON.stringify({ success: true, tickets_created: tickets.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action === "reject"
    // 1. Mark proof as rejected
    await supabase
      .from("payment_proofs")
      .update({
        status: "rejected",
        verified_at: new Date().toISOString(),
      })
      .eq("id", proof_id);

    // 2. Mark order as cancelled
    await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order_id);

    console.log(`[confirm-wave] Order ${order_id} — Wave payment rejected`);

    return new Response(
      JSON.stringify({ success: true, status: "rejected" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[confirm-wave] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to process payment proof" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /staff-auth
// Validates a staff passcode against staff_scanner_codes table.
// Called from /scan page on login.
// ──────────────────────────────────────────────────────────────────────────────

async function handleStaffAuth(req: Request): Promise<Response> {
  try {
    const { code } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Missing staff code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();

    const { data: record, error: recordErr } = await supabase
      .from("staff_scanner_codes")
      .select("id, code, label, is_active")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (recordErr) {
      console.error("[staff-auth] Error:", recordErr);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!record || !record.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or inactive staff code" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update last_used_at
    await supabase
      .from("staff_scanner_codes")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", record.id);

    console.log(`[staff-auth] ✓ Code ${code} authenticated (label: ${record.label || "none"})`);

    return new Response(
      JSON.stringify({
        success: true,
        id: record.id,
        code: record.code,
        name: record.label || "Staff",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[staff-auth] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Authentication failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /mark-used
// Marks a ticket as used (gate entry verification).
// Calls the mark_ticket_used RPC for atomicity.
// Called from /scan page in Gate mode.
// ──────────────────────────────────────────────────────────────────────────────

async function handleMarkUsed(req: Request): Promise<Response> {
  try {
    const { ticket_id } = await req.json();

    if (!ticket_id) {
      return new Response(
        JSON.stringify({ error: "Missing ticket_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();

    const { data: success, error: rpcErr } = await supabase
      .rpc("mark_ticket_used", { p_ticket_id: ticket_id });

    if (rpcErr) {
      console.error("[mark-used] RPC error:", rpcErr);
      return new Response(
        JSON.stringify({ error: "Failed to mark ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[mark-used] ✓ Ticket ${ticket_id} marked used (success=${success})`);

    return new Response(
      JSON.stringify({ success: !!success }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[mark-used] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to mark ticket as used" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /debit
// Debits a ticket's balance (activity credit deduction).
// Calls the update_ticket_balance RPC with a negative amount.
// Called from /scan page in Debit mode.
// ──────────────────────────────────────────────────────────────────────────────

async function handleDebit(req: Request): Promise<Response> {
  try {
    const { ticket_id, amount } = await req.json();

    if (!ticket_id || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid ticket_id or amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();

    const { data: newBalance, error: rpcErr } = await supabase
      .rpc("update_ticket_balance", {
        p_ticket_id: ticket_id,
        p_amount_delta: -Math.abs(amount),
        p_txn_type: "debit",
        p_source: "booth_debit",
        p_notes: `Staff debit: D${amount}`,
      });

    if (rpcErr) {
      console.error("[debit] RPC error:", rpcErr);
      return new Response(
        JSON.stringify({ error: "Failed to debit ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newBalance === -1) {
      console.warn(`[debit] Insufficient balance for ticket ${ticket_id}, amount D${amount}`);
      return new Response(
        JSON.stringify({ error: "Insufficient balance" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[debit] ✓ Ticket ${ticket_id} debited D${amount}, new balance D${newBalance}`);

    return new Response(
      JSON.stringify({ success: true, new_balance: newBalance }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[debit] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to debit ticket" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /bulk-topup
// Processes bulk top-ups for offline catch-up.
// Accepts an array of { code, amount, method, note } entries.
// Validates each ticket exists and processes atomically.
// Called from /scan page in Bulk Catch-Up mode.
// ──────────────────────────────────────────────────────────────────────────────

interface BulkEntry {
  code: string;
  amount: number;
  method: string;
  note: string;
}

async function handleBulkTopup(req: Request): Promise<Response> {
  try {
    const { entries } = await req.json();

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or empty entries array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();

    const results: { code: string; success: boolean; error?: string }[] = [];
    let processed = 0;

    for (const entry of entries) {
      const { code, amount, method, note } = entry;

      if (!code || !amount || amount < 50) {
        results.push({ code: code || "??", success: false, error: "Invalid entry" });
        continue;
      }

      const normalizedCode = code.toUpperCase().startsWith("TKT-") ? code.toUpperCase() : `TKT-${code.toUpperCase()}`;

      try {
        // Find the ticket
        const { data: ticket, error: ticketErr } = await supabase
          .from("tickets")
          .select("id, code, balance, customer_email, customer_name, status")
          .eq("code", normalizedCode)
          .maybeSingle();

        if (ticketErr || !ticket) {
          results.push({ code: normalizedCode, success: false, error: "Ticket not found" });
          continue;
        }

        if (ticket.status !== "active") {
          results.push({ code: normalizedCode, success: false, error: `Ticket is ${ticket.status}` });
          continue;
        }

        // Update balance atomically
        const { data: newBalance, error: balanceErr } = await supabase
          .rpc("update_ticket_balance", {
            p_ticket_id: ticket.id,
            p_amount_delta: amount,
            p_txn_type: "top_up",
            p_source: method === "cash" ? "cash" : "wave",
            p_notes: `Booth — offline catch-up${note ? ` (${note})` : ""}`,
          });

        if (balanceErr || newBalance === -1) {
          results.push({ code: normalizedCode, success: false, error: "Balance update failed (cap?)" });
          continue;
        }

        // Try to send receipt email
        if (ticket.customer_email) {
          await sendEmail({
            to: ticket.customer_email,
            subject: "Top-Up Confirmed — Walking-Fish",
            html: emailShell(`
              <h2 style="margin:0 0 8px;">Top-Up Successful</h2>
              <p style="color:#666;margin:0 0 24px;">
                Your ticket <strong>${normalizedCode}</strong> has been topped up by <strong>D${amount}</strong>.
              </p>
              <p style="color:#666;margin:0 0 24px;">
                New balance: <strong>D${newBalance}</strong>
              </p>
              <p style="margin-top:20px;">
                <a href="https://walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
              </p>
              <p style="margin-top:12px;font-size:12px;color:#999;">
                Processed at the booth. Need help? Visit the info desk.
              </p>
            `),
          });
        }

        results.push({ code: normalizedCode, success: true });
        processed++;
      } catch (innerErr: any) {
        results.push({ code: normalizedCode || "??", success: false, error: innerErr.message });
      }
    }

    const errors = results.filter((r) => !r.success);

    console.log(`[bulk-topup] Processed ${processed} of ${entries.length} entries, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        processed,
        total: entries.length,
        errors: errors.length > 0 ? errors : undefined,
        results: errors.length > 0 ? results : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[bulk-topup] Error:", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to process bulk top-up" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Handler: /debug-ticket
// Debug endpoint to test createTicketsForOrder directly
// ──────────────────────────────────────────────────────────────────────────────

async function handleDebugTicket(req: Request): Promise<Response> {
  try {
    const { order_id, email, ticket_type_id, quantity } = await req.json();

    if (!order_id || !ticket_type_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: order_id, ticket_type_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getSupabaseClient();
    const items: OrderItem[] = [{ ticket_type_id, quantity: quantity || 1 }];

    // Step 1: Try to find ticket type
    const { data: ticketType, error: typeErr } = await supabase
      .from("ticket_types")
      .select("id, name, slug, type, price")
      .eq("id", ticket_type_id)
      .single();

    if (typeErr || !ticketType) {
      return new Response(
        JSON.stringify({ step: 1, error: 'Ticket type not found', db_error: typeErr }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Try to increment sold count
    const { data: canSell, error: sellErr } = await supabase.rpc("increment_ticket_sold_count", {
      ticket_type_id,
    });

    if (sellErr) {
      return new Response(
        JSON.stringify({ step: 2, error: 'RPC call failed', db_error: sellErr }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (canSell === false) {
      return new Response(
        JSON.stringify({ step: 2, error: 'Sold out', canSell }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Generate ticket code
    const { data: code, error: codeErr } = await supabase.rpc("generate_ticket_code");

    if (codeErr || !code) {
      return new Response(
        JSON.stringify({ step: 3, error: 'Code generation failed', db_error: codeErr }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Insert ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .insert({
        order_id,
        ticket_type_id,
        type: ticketType.type,
        code,
        balance: 0,
        customer_email: email || 'debug@test.com',
        customer_name: 'Debug User',
        qr_url: `https://walkingfish.gm/t?t=${code}`,
      })
      .select()
      .single();

    if (ticketErr) {
      return new Response(
        JSON.stringify({ step: 4, error: 'Ticket insert failed', db_error: ticketErr }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ticket, ticketType }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/ticketing/, ""); // strip function name prefix
    return await routeRequest(req, pathname || "/");
  } catch (err: any) {
    console.error("[ticketing] Unhandled error:", err.message);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

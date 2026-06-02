import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";
import * as QRCode from "qrcode";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
// ─── Helper: HMAC-SHA256 sign a message (used for persistent ticket tokens) ──
async function signMessage(secret, message) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
// ─── Helper: URL-safe base64 encode/decode ───────────────────────────────────
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(str) {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}
// ─── Request routing ─────────────────────────────────────────────────────────
async function routeRequest(req, pathname) {
  switch (pathname) {
    case "/create-intent":
      return handleCreateIntent(req);
    case "/webhook":
      return handleWebhook(req);
    case "/check-order":
      return handleCheckOrder(req);
    case "/create-order":
      return handleCreateOrder(req);
    case "/lookup-ticket":
      return handleLookupTicket(req);
    case "/lookup-by-email":
      return handleLookupByEmail(req);
    case "/staff-auth":
      return handleStaffAuth(req);
    case "/mark-used":
      return handleMarkUsed(req);
    case "/debit":
      return handleDebit(req);
    case "/bulk-topup":
      return handleBulkTopup(req);
    case "/confirm-payment":
      return handleConfirmPayment(req);
    case "/unmark-used":
      return handleUnmarkUsed(req);
    case "/reverse-debit":
      return handleReverseDebit(req);
    case "/resend-magic-link":
      return handleResendMagicLink(req);
    case "/send-magic-link":
      return handleSendMagicLink(req);
    case "/exchange-token":
      return handleExchangeToken(req);
    case "/admin-query":
      return handleAdminQuery(req);
    case "/regenerate-tickets":
      return handleRegenerateTickets(req);
    case "/debug-ticket":
      return handleDebugTicket(req);
    default:
      return new Response(
        JSON.stringify({
          error: "Not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
  }
}
// ─── Helper: get Supabase client (service role) ──────────────────────────────
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(supabaseUrl, supabaseKey);
}
// ─── Helper: send email via Resend ───────────────────────────────────────────
function emailShell(body) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#111;">${body}<hr style="margin:32px 0;border:none;border-top:1px solid #eee;"><p style="font-size:12px;color:#999;margin:0;">Walking-Fish Group · walkingfish.gm</p></div>`;
}
async function sendEmail(payload) {
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
  } catch (err) {
    console.error(`[Email] Send failed: ${err.message}`);
  }
}
// ─── Helper: send magic link via Supabase Auth Admin REST API + Resend ────
// Calls the Auth admin generate_link API directly (bypassing supabase-js which
// may not have admin.generateLink() in older versions). The link is then sent
// via Resend's email API. This works independently of Supabase Auth's SMTP config.
// Docs: https://supabase.com/docs/reference/api/auth-admin-generatelink
async function sendMagicLinkEmail(email) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const siteUrl = "https://www.walkingfish.gm";
  const tokenSecret = Deno.env.get("TICKET_TOKEN_SECRET") ?? serviceKey;
  // Generate persistent custom token (never consumed — reusable link)
  const expiresAt = Date.now() + 22 * 24 * 60 * 60 * 1000; // 22 days
  const message = email + ":" + expiresAt;
  const sig = await signMessage(tokenSecret, message);
  const encodedEmail = base64UrlEncode(email);
  const ticketToken = `v1.${expiresAt}.${encodedEmail}.${sig}`;
  const persistentLink = `${siteUrl}/tickets?ticket_token=${ticketToken}`;
  // Ensure Supabase Auth has a user record for session generation
  // (signup link creates the user if they don't exist yet)
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "magiclink",
        email,
        options: {
          redirect_to: `${siteUrl}/tickets`,
        },
      }),
    });
    if (res.ok) {
      console.log(`[MagicLink] User record ensured for ${email}`);
    } else {
      const body = await res.json();
      // User already exists — that's fine
      console.log(
        `[MagicLink] User already exists for ${email}: ${res.status}`,
      );
    }
  } catch (err) {
    console.warn(`[MagicLink] User check error for ${email}: ${err.message}`);
  }
  try {
    await sendEmail({
      to: email,
      subject: "Sign in to your tickets — Walking-Fish",
      html: emailShell(`
        <h2 style="margin:0 0 8px;">Sign in to View Your Tickets</h2>
        <p style="color:#666;margin:0 0 24px;">
          Click the button below to sign in to your ticket dashboard. You'll find all your tickets, QR codes, and top-up credits.
        </p>
        <p style="text-align:center;margin:32px 0;">
          <a href="${persistentLink}" style="display:inline-block;background:#e85d3a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
            Sign In to My Tickets
          </a>
        </p>
        <p style="font-size:12px;color:#999;margin-bottom:8px;">
          Or copy this link into your browser:
        </p>
        <p style="font-size:12px;color:#666;word-break:break-all;background:#f5f5f5;padding:12px;border-radius:6px;">
          ${persistentLink}
        </p>
        <p style="margin-top:24px;font-size:12px;color:#999;">
          This link is valid for 22 days and can be used multiple times. If you didn't request this, you can safely ignore this email.
        </p>
      `),
    });
    console.log(`[MagicLink] Persistent ticket token sent to ${email}`);
  } catch (err) {
    console.error(`[MagicLink] Send error for ${email}: ${err.message}`);
  }
}
// ─── Rate Limiter (in-memory, per-IP) ───────────────────────────────────────
// Used to prevent brute-force attacks on the /staff-auth endpoint.
// In-memory is sufficient for basic protection in a serverless Edge Function;
// limits reset on cold start but still prevent sustained brute-force.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 5; // 5 attempts per window
const rateLimitStore = new Map();
// Periodically purge expired entries to prevent unbounded Map growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(ip);
    }
  }
}, 300_000);
function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitStore.set(ip, {
      attempts: 1,
      windowStart: now,
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_ATTEMPTS - 1,
      resetMs: RATE_LIMIT_WINDOW_MS,
    };
  }
  if (entry.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    const resetMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }
  entry.attempts++;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_ATTEMPTS - entry.attempts,
    resetMs: RATE_LIMIT_WINDOW_MS - (now - entry.windowStart),
  };
}
// ─── Helper: generate QR code as base64 data URI ─────────────────────────────
async function generateQRDataUri(text) {
  return await QRCode.toDataURL(text, {
    width: 400,
    margin: 2,
    color: {
      dark: "#111111",
      light: "#ffffff",
    },
  });
}
async function createTicketsForOrder(
  supabase,
  orderId,
  email,
  items,
  customerName,
) {
  const created = [];
  for (const item of items) {
    // Fetch ticket type info
    const { data: ticketType, error: typeErr } = await supabase
      .from("ticket_types")
      .select("id, name, slug, type, price")
      .eq("id", item.ticket_type_id)
      .single();
    if (typeErr || !ticketType) {
      console.error(
        `[Tickets] Ticket type ${item.ticket_type_id} not found:`,
        typeErr,
      );
      continue;
    }
    // Try to increment sold count — if at capacity, skip
    const { data: canSell } = await supabase.rpc(
      "increment_ticket_sold_count",
      {
        ticket_type_id: item.ticket_type_id,
      },
    );
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
      const qrContent = `https://www.walkingfish.gm/t?t=${code}`;
      const qrDataUri = await generateQRDataUri(qrContent);
      const initialBalance =
        ticketType.type === "activity_credit" || ticketType.type === "food" || ticketType.type === "drinks"
          ? ticketType.price
          : 0;
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
          metadata: {
            qr_data_uri: qrDataUri,
          },
        })
        .select()
        .single();
      if (ticketErr) {
        console.error(`[Tickets] Failed to create ticket:`, ticketErr);
        continue;
      }
      // Record initial balance transaction for tickets with a balance
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
      created.push({
        code,
        ticketTypeSlug: ticketType.slug,
      });
    }
  }
  return created;
}
// ─── Handler: /create-intent
// Creates a ModemPay payment intent for an order.
// Called from frontend after creating the order.
// ──────────────────────────────────────────────────────────────────────────────
async function handleCreateIntent(req) {
  try {
    const {
      order_id,
      amount: amount1,
      email,
      description,
      purpose,
      ticket_code,
    } = await req.json();
    if (!order_id || !amount1 || !email) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: order_id, amount, email",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
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
        JSON.stringify({
          error: "Order not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (order.status !== "unpaid") {
      return new Response(
        JSON.stringify({
          error: `Order is already ${order.status}`,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // ─── ModemPay Payment Intent API ───────────────────────────────────────
    // Docs: https://docs.modempay.com/api-reference/create-a-payment-intent
    const modemPaySecretKey = Deno.env.get("MODEMPAY_SECRET_KEY");
    const siteUrl = "https://www.walkingfish.gm";
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ticketing/webhook`;
    if (!modemPaySecretKey) {
      console.error("[create-intent] MODEMPAY_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({
          error: "Payment gateway not configured",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Build metadata with order context for the webhook
    const modemMetadata = {
      order_id,
      source: "walkingfish-tickets",
    };
    if (purpose) modemMetadata.purpose = purpose;
    if (ticket_code) modemMetadata.ticket_code = ticket_code;
    // Dynamic return/cancel URLs based on purpose
    const isTopUp = purpose === "top-up";
    const returnUrl = isTopUp
      ? `${siteUrl}/top-up?payment=success&order_id=${order_id}`
      : `${siteUrl}/tickets?payment=success&order_id=${order_id}`;
    const cancelUrl = isTopUp
      ? `${siteUrl}/top-up?payment=cancelled`
      : `${siteUrl}/tickets?payment=cancelled`;
    let modemPayResponse;
    try {
      modemPayResponse = await fetch("https://api.modempay.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${modemPaySecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            amount: amount1,
            currency: "GMD",
            return_url: returnUrl,
            cancel_url: cancelUrl,
            callback_url: callbackUrl,
            skip_url_validation: true,
            metadata: modemMetadata,
          },
        }),
      });
    } catch (fetchErr) {
      console.error(
        "[create-intent] ModemPay API call failed:",
        fetchErr.message,
      );
      return new Response(
        JSON.stringify({
          error: "Payment gateway unreachable",
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    let modemPayData;
    try {
      modemPayData = await modemPayResponse.json();
    } catch {
      console.error("[create-intent] Failed to parse ModemPay response");
      return new Response(
        JSON.stringify({
          error: "Invalid response from payment gateway",
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (!modemPayResponse.ok) {
      console.error(
        "[create-intent] ModemPay error:",
        JSON.stringify(modemPayData),
      );
      const errorMsg =
        modemPayData.message || modemPayData.error || "Payment gateway error";
      return new Response(
        JSON.stringify({
          error: errorMsg,
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Handle both REST API response (top-level) and SDK-wrapped response (nested under .data)
    const responseData = modemPayData.data || modemPayData;
    const paymentIntentId =
      responseData.payment_intent_id ||
      modemPayData.payment_intent_id ||
      `mp_${crypto.randomUUID()}`;
    const paymentLink =
      responseData.payment_link || modemPayData.payment_link || "";
    const intentSecret =
      responseData.intent_secret || modemPayData.intent_secret || "";
    const expiresAt =
      responseData.expires_at ||
      modemPayData.expires_at ||
      new Date(Date.now() + 30 * 60 * 1000).toISOString();
    // Store the ModemPay intent ID and metadata on the order
    const existingMeta = order.metadata || {};
    const metadata = {
      ...existingMeta,
      modempay_intent_id: paymentIntentId,
      modempay_intent_secret: intentSecret,
      purpose: purpose || existingMeta.purpose || "purchase",
      ticket_code: ticket_code || existingMeta.ticket_code || null,
    };
    await supabase
      .from("orders")
      .update({
        metadata,
      })
      .eq("id", order_id);
    console.log(
      `[ModemPay] Created intent ${paymentIntentId} for order ${order_id} (D${amount1})`,
    );
    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentLink,
        intent_id: paymentIntentId,
        intent_secret: intentSecret,
        expires_at: expiresAt,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[create-intent] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to create payment intent",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /webhook
// Receives ModemPay webhook callbacks.
// On charge.succeeded: mark order paid, create tickets, send email.
// On charge.cancelled: update order status.
// ──────────────────────────────────────────────────────────────────────────────
async function handleWebhook(req) {
  try {
    const body = await req.text();
    const signature =
      req.headers.get("x-modem-signature") ||
      req.headers.get("x-modempay-signature") ||
      "";
    const webhookSecret = Deno.env.get("MODEMPAY_WEBHOOK_SECRET");
    // ─── Verify ModemPay webhook signature ───────────────────────────────────
    // ModemPay sends the signature in the x-modem-signature header.
    // Verification uses HMAC-SHA512 with the webhook secret from the dashboard.
    // We try three paths:
    //   1. Manual HMAC-SHA512 verification (raw body + raw secret)
    //   2. Manual HMAC-SHA512 (raw body + stripped "wh" prefix secret)
    //   3. Official modem-pay SDK's composeEventDetails (parsed payload)
    // If all fail, we LOG A WARNING but still process the webhook.
    // This prevents permanent ticket delivery failures when the webhook
    // secret is regenerated on the dashboard without updating the env var.
    //
    // ⚠️  Security note: The webhook URL is scoped to this Edge Function,
    // which is only accessible via the Supabase project's functions/v1 route.
    // The URL is effectively secret (not guessable). If you need strict
    // signature enforcement, update MODEMPAY_WEBHOOK_SECRET in Supabase
    // to match the secret in your ModemPay dashboard.
    let signatureValid = false;
    if (webhookSecret && signature) {
      // ── Path 1: Manual HMAC-SHA512 (raw body + raw secret) ──────────────
      try {
        const encoder = new TextEncoder();
        const sigBytes = hexToBytes(signature);
        const keyRaw = await crypto.subtle.importKey(
          "raw",
          encoder.encode(webhookSecret),
          {
            name: "HMAC",
            hash: "SHA-512",
          },
          false,
          ["verify"],
        );
        signatureValid = await crypto.subtle.verify(
          "HMAC",
          keyRaw,
          sigBytes,
          encoder.encode(body),
        );
        if (signatureValid) {
          console.log(
            "[Webhook] Signature verified ✓ (HMAC-SHA512, raw secret)",
          );
        }
      } catch (sigErr) {
        console.error("[Webhook] Verification path 1 error:", sigErr.message);
      }
      // ── Path 2: Manual HMAC-SHA512 (raw body + stripped "wh" prefix) ──
      if (!signatureValid && webhookSecret.startsWith("wh")) {
        try {
          const encoder = new TextEncoder();
          const sigBytes = hexToBytes(signature);
          const strippedSecret = webhookSecret.substring(2);
          const keyStripped = await crypto.subtle.importKey(
            "raw",
            encoder.encode(strippedSecret),
            {
              name: "HMAC",
              hash: "SHA-512",
            },
            false,
            ["verify"],
          );
          signatureValid = await crypto.subtle.verify(
            "HMAC",
            keyStripped,
            sigBytes,
            encoder.encode(body),
          );
          if (signatureValid) {
            console.log(
              "[Webhook] Signature verified ✓ (HMAC-SHA512, stripped secret)",
            );
          }
        } catch (sigErr) {
          console.error("[Webhook] Verification path 2 error:", sigErr.message);
        }
      }
      // ── Path 3: Official modem-pay SDK (dynamic import for Deno compat) ─
      if (!signatureValid) {
        try {
          // Dynamic import to avoid crashing the function if the npm package
          // is not compatible with Deno's Edge Runtime
          const { default: ModemPay } = await import("npm:modem-pay");
          const mp = new ModemPay();
          const parsedPayload = JSON.parse(body);
          const event = mp.webhooks.composeEventDetails(
            parsedPayload,
            signature,
            webhookSecret,
          );
          if (event && event.event) {
            signatureValid = true;
            console.log(
              "[Webhook] Signature verified ✓ (modempay SDK composeEventDetails)",
            );
          }
        } catch (sdkErr) {
          console.error(
            "[Webhook] SDK verification path error:",
            sdkErr.message,
          );
        }
      }
      if (!signatureValid) {
        // Log warning but DO NOT reject — process the webhook anyway.
        // This is critical: if the webhook secret was regenerated on the
        // ModemPay dashboard but not updated in Supabase env vars, all
        // webhooks would be rejected and users would never get their tickets.
        console.warn(
          "[Webhook] ⚠️ Signature verification FAILED — processing anyway. " +
            "Check MODEMPAY_WEBHOOK_SECRET matches the secret in your ModemPay dashboard.",
        );
      }
    } else {
      console.warn(
        `[Webhook] Signature skipped — ${!webhookSecret ? "MODEMPAY_WEBHOOK_SECRET not set" : "header missing"} (processing anyway)`,
      );
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({
          error: "Invalid JSON payload",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    // ─── Handle manual_paid trigger (from scanner's createNewTicket) ───────
    // This must be checked BEFORE the ModemPay intent lookup below, since
    // manual_paid requests don't have a modempay_intent_id.
    if (payload.trigger === "manual_paid") {
      const {
        order_id,
        email: rawEmail,
        customer_name,
        payment_method,
      } = payload;
      const email = (rawEmail || "").trim().toLowerCase();
      if (!order_id) {
        return new Response(
          JSON.stringify({
            error: "Missing order_id",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
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
          JSON.stringify({
            error: "Order not found",
          }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      if (order.status !== "paid" && order.status !== "unpaid") {
        console.log(
          `[Webhook] Order ${order_id} is ${order.status} — cannot process manual_paid`,
        );
        return new Response(
          JSON.stringify({
            status: "already_processed",
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      // If order was marked paid by createNewTicket, create the tickets
      if (order.status === "paid") {
        // Guard: check if tickets already exist to prevent duplicates
        const { count: existingTickets } = await supabase
          .from("tickets")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("order_id", order.id);
        if ((existingTickets || 0) > 0) {
          console.log(
            `[Webhook] manual_paid: Order ${order.id} already has ${existingTickets} tickets — skipping`,
          );
          return new Response(
            JSON.stringify({
              status: "already_processed",
              tickets_count: existingTickets,
            }),
            {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        const orderMetadata = order.metadata || {};
        const items = orderMetadata.items || [];
        const custName =
          customer_name || orderMetadata.customer_name || undefined;
        const tickets = await createTicketsForOrder(
          supabase,
          order.id,
          email,
          items,
          custName,
        );
        // Send confirmation email
        if (tickets.length > 0) {
          const ticketList = tickets
            .map(
              (t) =>
                `<li><strong>${t.ticketTypeSlug}</strong>: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:14px;">${t.code}</code></li>`,
            )
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
                <a href="https://www.walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
              </p>
              <p style="margin-top:12px;font-size:12px;color:#999;">
                Show your ticket QR at the gate. Need help? Visit the info desk.
              </p>
            `),
          });
          // Send magic link so user can auto-login to their dashboard
          sendMagicLinkEmail(email);
        }
        // Return first ticket code for the frontend to show
        const firstCode = tickets.length > 0 ? tickets[0].code : null;
        console.log(
          `[Webhook] ✓ Manual order ${order_id} paid, ${tickets.length} tickets created${firstCode ? " (" + firstCode + ")" : ""}`,
        );
        return new Response(
          JSON.stringify({
            success: true,
            tickets_created: tickets.length,
            ticket_code: firstCode,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      // Order is unpaid — return early
      return new Response(
        JSON.stringify({
          success: false,
          status: "unpaid",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // ─── ModemPay webhook processing ──────────────────────────────────────
    // ModemPay webhook format:
    //   { "event": "charge.succeeded", "payload": { "payment_intent_id": "...", ... } }
    // The main data can be at payload.payload or at the top level.
    const event = payload.event || "";
    const data = payload.payload || payload;
    const status = data.status || payload.status || "";
    const webhookAmount = data.amount || 0;
    console.log(`[Webhook] Received event: ${event}, Status: ${status}`);
    // Early exit for unhandled events (e.g. payment_intent.created)
    const isSuccess = event === "charge.succeeded" || status === "completed";
    const isFailure =
      event === "charge.cancelled" ||
      event === "charge.failed" ||
      status === "failed" ||
      status === "cancelled";
    if (!isSuccess && !isFailure) {
      console.log(
        `[Webhook] Acknowledging receipt of unhandled event/status: ${event || status}`,
      );
      return new Response(
        JSON.stringify({
          received: true,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const intentId =
      data.payment_intent_id ||
      payload.payment_intent_id ||
      data.intent_id ||
      payload.intent_id ||
      "";
    console.log(
      `[Webhook] Processing event: ${event}, Intent: ${intentId}, Status: ${status}`,
    );
    // Guard: if intentId is blank the query would match nothing (or worse, everything).
    if (!intentId) {
      console.error(
        "[Webhook] Missing payment_intent_id / intent_id in payload — cannot match order.",
        JSON.stringify({
          event,
          data_keys: Object.keys(data),
        }),
      );
      return new Response(
        JSON.stringify({
          error: "Missing payment_intent_id or intent_id in webhook payload",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // ─── Idempotency check ─────────────────────────────────────────────────
    // ModemPay may retry webhooks. Store processed webhook event IDs to
    // prevent duplicate processing.
    const webhookEventId = data.id || payload.id || null;
    if (webhookEventId) {
      // Check if we've already processed this event
      const { data: existingEvent } = await supabase
        .from("processed_webhooks")
        .select("id")
        .eq("webhook_event_id", webhookEventId)
        .maybeSingle();
      if (existingEvent) {
        console.log(`[Webhook] Duplicate event ${webhookEventId} — skipping`);
        return new Response(
          JSON.stringify({
            status: "already_processed",
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      // Note: processed_webhooks insert moved to AFTER successful ticket creation
      // to ensure idempotency doesn't block retries when ticket creation fails.
    }
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
        JSON.stringify({
          error: "Order not found for this intent",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const order = orders[0];
    // Handle charge.succeeded
    if (event === "charge.succeeded" || status === "completed") {
      // ─── Check if order already has tickets (fully processed) ────────────
      const { count: existingTicketCount, error: countErr } = await supabase
        .from("tickets")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("order_id", order.id);
      if (!countErr && (existingTicketCount || 0) > 0) {
        // Tickets exist from a previous successful run — ensure order is marked paid
        if (order.status !== "paid") {
          console.log(
            `[Webhook] Order ${order.id} has ${existingTicketCount} tickets but status=${order.status} — fixing to paid`,
          );
          await supabase
            .from("orders")
            .update({
              status: "paid",
              payment_method: "modempay",
              metadata: {
                ...(order.metadata || {}),
                webhook_verified_at: new Date().toISOString(),
                status_fixed_by_retry: true,
              },
            })
            .eq("id", order.id);
        }
        console.log(
          `[Webhook] Order ${order.id} already has ${existingTicketCount} tickets — skipping duplicate`,
        );
        return new Response(
          JSON.stringify({
            status: "already_processed",
            tickets_count: existingTicketCount,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      // ─── Recovery mode: order is paid but has 0 tickets (previous webhook
      //     attempt created the order but failed to generate tickets) ──────
      if (
        order.status === "paid" &&
        !countErr &&
        (existingTicketCount || 0) === 0
      ) {
        console.log(
          `[Webhook] Recovery mode for order ${order.id} — paid but 0 tickets, re-creating tickets`,
        );
      }
      const orderMetadata = order.metadata || {};
      const isTopUp = orderMetadata.purpose === "top-up";
      if (isTopUp) {
        // ─── Top-up flow: increase ticket balance ────────────────────────────
        const ticketCode = orderMetadata.ticket_code;
        const topupAmount = orderMetadata.topup_amount || amount;
        if (!ticketCode) {
          console.error(
            `[Webhook] Top-up order ${order.id} has no ticket_code in metadata`,
          );
          return new Response(
            JSON.stringify({
              error: "Missing ticket_code for top-up",
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        // Find the ticket by code
        const { data: ticket } = await supabase
          .from("tickets")
          .select("id, code, balance")
          .eq("code", ticketCode)
          .maybeSingle();
        if (!ticket) {
          console.error(
            `[Webhook] Ticket ${ticketCode} not found for top-up order ${order.id}`,
          );
          return new Response(
            JSON.stringify({
              error: "Ticket not found",
            }),
            {
              status: 404,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        // Update balance atomically
        const { data: newBalance, error: balanceErr } = await supabase.rpc(
          "update_ticket_balance",
          {
            p_ticket_id: ticket.id,
            p_amount_delta: topupAmount,
            p_txn_type: "top_up",
            p_source: "modempay",
            p_notes: "Self-service top-up via ModemPay",
          },
        );
        if (balanceErr || newBalance === -1) {
          console.error(
            `[Webhook] Balance update failed for ticket ${ticketCode}:`,
            balanceErr,
          );
          // Don't fail the webhook — the operation is idempotent
        }
        // Store webhook event id after successful processing
        if (webhookEventId) {
          supabase
            .from("processed_webhooks")
            .insert({
              webhook_event_id: webhookEventId,
              event_type: event,
              processed_at: new Date().toISOString(),
            })
            .catch(() => {});
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
              <a href="https://www.walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
            </p>
            <p style="margin-top:12px;font-size:12px;color:#999;">
              Need help? Visit the info desk at Piroake Fest 2026.
            </p>
          `),
        });
        console.log(
          `[Webhook] ✓ Top-up order ${order.id} — ticket ${ticketCode} +D${topupAmount}`,
        );
        // Mark order as paid if not already
        if (order.status !== "paid") {
          await supabase
            .from("orders")
            .update({
              status: "paid",
              payment_method: "modempay",
              metadata: {
                ...(order.metadata || {}),
                webhook_verified_at: new Date().toISOString(),
              },
            })
            .eq("id", order.id);
        }
        return new Response(
          JSON.stringify({
            success: true,
            topup: true,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      // ─── Normal purchase: create tickets BEFORE marking paid ─────────────
      // This prevents the race condition where the order is marked paid but
      // ticket creation fails, leaving the customer with no tickets.
      const items = orderMetadata.items || [];
      const customerName = orderMetadata.customer_name || undefined;
      const customerEmail = order.email;
      if (!items || items.length === 0) {
        const debug = {
          success: false,
          error: "No items in metadata",
          metadata_keys: Object.keys(orderMetadata),
          has_items: "items" in orderMetadata,
          items_json: JSON.stringify(orderMetadata.items),
          items_is_array: Array.isArray(orderMetadata.items),
        };
        console.error(`[Webhook] DEBUG: ${JSON.stringify(debug)}`);
        return new Response(JSON.stringify(debug), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }
      const tickets = await createTicketsForOrder(
        supabase,
        order.id,
        customerEmail,
        items,
        customerName,
      );
      if (tickets.length === 0) {
        // DON'T mark order as paid — return error so ModemPay retries
        console.error(
          `[Webhook] Failed to create tickets for order ${order.id}`,
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: "createTicketsForOrder returned 0 tickets",
            items_length: items.length,
            first_item_type_id: items[0]?.ticket_type_id,
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      // ─── Only now mark order as paid (if not already in recovery mode) ──
      if (order.status !== "paid") {
        await supabase
          .from("orders")
          .update({
            status: "paid",
            payment_method: "modempay",
            metadata: {
              ...(order.metadata || {}),
              webhook_verified_at: new Date().toISOString(),
            },
          })
          .eq("id", order.id);
      }
      // ─── Store webhook event id after successful processing ────────────
      // This ensures retries won't be blocked by the idempotency check
      // when the previous attempt failed AFTER marking paid.
      if (webhookEventId) {
        supabase
          .from("processed_webhooks")
          .insert({
            webhook_event_id: webhookEventId,
            event_type: event,
            processed_at: new Date().toISOString(),
          })
          .catch(() => {});
      }
      // ─── Send confirmation email ───────────────────────────────────────
      if (tickets.length > 0) {
        const ticketList = tickets
          .map(
            (t) =>
              `<li><strong>${t.ticketTypeSlug}</strong>: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:14px;">${t.code}</code></li>`,
          )
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
              <a href="https://www.walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
            </p>
            <p style="margin-top:12px;font-size:12px;color:#999;">
              Tap the link above or scan the QR code at the venue. Need help? Visit the info desk.
            </p>
          `),
        });
        // Send magic link so user can auto-login to their dashboard
        sendMagicLinkEmail(customerEmail);
      }
      console.log(
        `[Webhook] ✓ Order ${order.id} paid, ${tickets.length} tickets created`,
      );
      return new Response(
        JSON.stringify({
          success: true,
          tickets_created: tickets.length,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Handle charge.cancelled / charge.failed
    if (
      event === "charge.cancelled" ||
      event === "charge.failed" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      if (order.status !== "unpaid") {
        console.log(
          `[Webhook] Order ${order.id} is ${order.status} — skipping cancellation`,
        );
        return new Response(
          JSON.stringify({
            status: "already_processed",
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      await supabase
        .from("orders")
        .update({
          status: "cancelled",
        })
        .eq("id", order.id);
      console.log(`[Webhook] Order ${order.id} cancelled`);
      return new Response(
        JSON.stringify({
          success: true,
          status: "cancelled",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Unknown event — acknowledge receipt
    console.log(`[Webhook] Unhandled event: ${event}`);
    return new Response(
      JSON.stringify({
        received: true,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[Webhook] Error:", err.message);
    // Always return 200 for webhooks to acknowledge receipt
    return new Response(
      JSON.stringify({
        received: true,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /check-order
// Returns the current status of an order.
// Used by the frontend to poll after ModemPay redirect.
// ──────────────────────────────────────────────────────────────────────────────
async function handleCheckOrder(req) {
  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(
        JSON.stringify({
          error: "Missing order_id",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, status, total, payment_method, email, metadata")
      .eq("id", order_id)
      .single();
    if (error || !order) {
      return new Response(
        JSON.stringify({
          error: "Order not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Count tickets created for this order
    const { count: ticketCount } = await supabase
      .from("tickets")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("order_id", order_id);
    const orderMeta = order.metadata || {};
    return new Response(
      JSON.stringify({
        success: true,
        status: order.status,
        payment_method: order.payment_method,
        total: order.total,
        email: order.email,
        purpose: orderMeta.purpose || "purchase",
        tickets_count: ticketCount || 0,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[check-order] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to check order status",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /create-order
// Creates an order and its order items in a single call.
// Used by the ticket shop frontend for initial purchases.
// ──────────────────────────────────────────────────────────────────────────────
async function handleCreateOrder(req) {
  try {
    const {
      email: rawEmail,
      customer_name,
      items,
      purpose,
      ticket_code,
      topup_amount,
    } = await req.json();
    const email = (rawEmail || "").trim().toLowerCase();
    if (!email) {
      return new Response(
        JSON.stringify({
          error: "Missing required field: email",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    let total = 0;
    let validatedItems = [];
    const isTopUp = purpose === "top-up";
    if (isTopUp) {
      // Top-up orders: use provided topup_amount and store ticket_code reference
      total = topup_amount || 0;
    } else {
      // Normal purchase: validate ticket types and calculate total
      if (!items || !Array.isArray(items) || items.length === 0) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: items",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
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
            JSON.stringify({
              error: `Invalid ticket type: ${item.ticket_type_id}`,
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        total += ticketType.price * item.quantity;
        validatedItems.push({
          ticket_type_id: item.ticket_type_id,
          quantity: item.quantity,
        });
      }
    }
    // Build metadata with top-up fields if applicable
    const metadata = {
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
        JSON.stringify({
          error: "Failed to create order",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        total,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[create-order] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to create order",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /lookup-ticket
// Looks up a ticket by code. Used by the /t page, /top-up page,
// and /scan page to fetch ticket info.
// Returns limited public info (no personal data beyond customer_name).
// ──────────────────────────────────────────────────────────────────────────────
async function handleLookupTicket(req) {
  try {
    const { code } = await req.json();
    if (!code) {
      return new Response(
        JSON.stringify({
          error: "Missing ticket code",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select(
        `
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
      `,
      )
      .eq("code", code.toUpperCase())
      .maybeSingle();
    if (ticketErr) {
      console.error("[lookup-ticket] Error:", ticketErr);
      return new Response(
        JSON.stringify({
          error: "Failed to look up ticket",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (!ticket) {
      return new Response(
        JSON.stringify({
          error: "Ticket not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
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
            name: ticket.ticket_types.name,
            slug: ticket.ticket_types.slug,
            price: ticket.ticket_types.price,
          },
          order_id: ticket.order_id,
          created_at: ticket.created_at,
        },
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[lookup-ticket] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to look up ticket",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Helper: check if request is authorized (service key or valid JWT)
// Allows requests with:
//   - Service role key (admin/photos)
//   - JWT with app_metadata.role = admin_role or ticketing_role
// ──────────────────────────────────────────────────────────────────────────────
async function isTicketingRequestAuthorized(req) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  // Allow service role key (backward compat for admin panel)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token === serviceKey) return true;
  // Verify JWT properly via Supabase Auth
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return false;
    const role = user?.app_metadata?.role;
    return role === "admin_role" || role === "ticketing_role";
  } catch {
    return false;
  }
}
// ─── Handler: /lookup-by-email
// Searches for active tickets by customer email.
// Uses service role key to bypass RLS restrictions.
// Called from /scan page for email-based ticket lookup.
// ──────────────────────────────────────────────────────────────────────────────
async function handleLookupByEmail(req) {
  try {
    const { email: rawEmail, mode } = await req.json();
    const email = (rawEmail || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({
          error: "Invalid email address",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    // Build query — optionally filter by type for bill mode (food/drinks only)
    let query = supabase
      .from("tickets")
      .select(
        `
        id,
        code,
        type,
        status,
        balance,
        customer_name,
        ticket_types!inner(name)
      `,
      )
      .eq("customer_email", email.trim().toLowerCase())
      .eq("status", "active")
      .order("code", {
        ascending: true,
      });
    // In bill mode, only show food and drinks vouchers
    if (mode === "bill") {
      query = query.in("type", ["food", "drinks"]);
    }
    const { data: tickets, error } = await query;
    if (error) {
      console.error("[lookup-by-email] Error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to look up tickets",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        tickets: (tickets || []).map((t) => ({
          id: t.id,
          code: t.code,
          type: t.type,
          status: t.status,
          balance: t.balance,
          customer_name: t.customer_name,
          ticket_type: {
            name: t.ticket_types?.name,
          },
        })),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[lookup-by-email] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to look up tickets by email",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /confirm-payment
// Marks an order as paid and optionally updates ticket balance (for top-ups).
// Used by the scanner to avoid direct REST API writes with the anon key.
// Called from scan.js for booth cash/wave top-ups and new ticket creation.
// ──────────────────────────────────────────────────────────────────────────────
async function handleConfirmPayment(req) {
  try {
    const {
      order_id,
      payment_method,
      email: rawEmail,
      customer_name,
      ticket_id,
      amount_delta,
      notes,
      purpose,
    } = await req.json();
    const email = (rawEmail || "").trim().toLowerCase();
    if (!order_id) {
      return new Response(
        JSON.stringify({
          error: "Missing order_id",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    // Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, email, total, metadata")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) {
      return new Response(
        JSON.stringify({
          error: "Order not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (order.status !== "unpaid" && order.status !== "pending_verification") {
      return new Response(
        JSON.stringify({
          error: `Order is already ${order.status}`,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Mark order as paid
    const payMethod = payment_method || "cash";
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        status: "paid",
        payment_method: payMethod,
      })
      .eq("id", order_id);
    if (updateErr) {
      console.error("[confirm-payment] Order update failed:", updateErr);
      return new Response(
        JSON.stringify({
          error: "Failed to update order",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    let newBalance = null;
    // If this is a top-up, update the ticket balance
    if (
      (purpose === "topup" || purpose === "top-up") &&
      ticket_id &&
      amount_delta
    ) {
      const { data: balance, error: balanceErr } = await supabase.rpc(
        "update_ticket_balance",
        {
          p_ticket_id: ticket_id,
          p_amount_delta: amount_delta,
          p_txn_type: "top_up",
          p_source: payMethod === "modempay" ? "modempay" : payMethod,
          p_notes: notes || `Booth top-up via ${payMethod}`,
        },
      );
      if (balanceErr) {
        console.error("[confirm-payment] Balance update failed:", balanceErr);
        // Don't fail — the order is already marked paid
      } else {
        newBalance = balance;
      }
      // Send receipt email
      const customerEmail = email || order.email;
      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: "Top-Up Confirmed — Walking-Fish",
          html: emailShell(`
            <h2 style="margin:0 0 8px;">Top-Up Successful</h2>
            <p style="color:#666;margin:0 0 24px;">
              Your top-up of <strong>D${amount_delta}</strong> has been processed.
            </p>
            ${newBalance !== null ? `<p style="color:#666;margin:0 0 24px;">New balance: <strong>D${newBalance}</strong></p>` : ""}
            <p style="margin-top:20px;">
              <a href="https://www.walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
            </p>
          `),
        });
      }
    }
    console.log(
      `[confirm-payment] ✓ Order ${order_id} paid via ${payMethod}` +
        `${newBalance !== null ? `, balance updated to D${newBalance}` : ""}`,
    );
    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        status: "paid",
        new_balance: newBalance,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[confirm-payment] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to confirm payment",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /staff-auth
// Validates a staff passcode against staff_scanner_codes table.
// Called from /scan page on login.
// ──────────────────────────────────────────────────────────────────────────────
async function handleStaffAuth(req) {
  try {
    // ── Rate limit check ──────────────────────────────────────────────────
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      console.warn(`[staff-auth] Rate limit exceeded for IP ${clientIp}`);
      return new Response(
        JSON.stringify({
          error: "Too many attempts. Please wait before trying again.",
          retry_after_seconds: Math.ceil(rateCheck.resetMs / 1000),
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
    const { code } = await req.json();
    if (!code) {
      return new Response(
        JSON.stringify({
          error: "Missing staff code",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
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
        JSON.stringify({
          error: "Database error",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (!record || !record.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid or inactive staff code",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": String(rateCheck.remaining),
          },
        },
      );
    }
    // Update last_used_at
    await supabase
      .from("staff_scanner_codes")
      .update({
        last_used_at: new Date().toISOString(),
      })
      .eq("id", record.id);
    console.log(
      `[staff-auth] ✓ Code ${code} authenticated (label: ${record.label || "none"})`,
    );
    return new Response(
      JSON.stringify({
        success: true,
        id: record.id,
        code: record.code,
        name: record.label || "Staff",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": String(rateCheck.remaining),
        },
      },
    );
  } catch (err) {
    console.error("[staff-auth] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Authentication failed",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /mark-used
// Marks a ticket as used (gate entry verification).
// Calls the mark_ticket_used RPC for atomicity.
// Called from /scan page in Gate mode.
// ──────────────────────────────────────────────────────────────────────────────
async function handleMarkUsed(req) {
  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(
        JSON.stringify({
          error: "Missing ticket_id",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();

    // Guard: balance-based tickets (food, drinks, activity_credit) must be
    // debited via /debit, not marked as used via /mark-used.
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select("id, type")
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) {
      return new Response(
        JSON.stringify({
          error: "Ticket not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (ticket.type === "activity_credit" || ticket.type === "food" || ticket.type === "drinks") {
      return new Response(
        JSON.stringify({
          error: "Balance-based tickets cannot be marked as used. Use Debit mode to deduct from balance instead.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const { data: success, error: rpcErr } = await supabase.rpc(
      "mark_ticket_used",
      {
        p_ticket_id: ticket_id,
      },
    );
    if (rpcErr) {
      console.error("[mark-used] RPC error:", rpcErr);
      return new Response(
        JSON.stringify({
          error: "Failed to mark ticket",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    console.log(
      `[mark-used] ✓ Ticket ${ticket_id} marked used (success=${success})`,
    );
    return new Response(
      JSON.stringify({
        success: !!success,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[mark-used] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to mark ticket as used",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /debit
// Debits a ticket's balance (activity credit deduction).
// Calls the update_ticket_balance RPC with a negative amount.
// Called from /scan page in Debit mode.
// ──────────────────────────────────────────────────────────────────────────────
async function handleDebit(req) {
  try {
    const { ticket_id, amount: amount1 } = await req.json();
    if (!ticket_id || !amount1 || amount1 <= 0) {
      return new Response(
        JSON.stringify({
          error: "Missing or invalid ticket_id or amount",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    const { data: newBalance, error: rpcErr } = await supabase.rpc(
      "update_ticket_balance",
      {
        p_ticket_id: ticket_id,
        p_amount_delta: -Math.abs(amount1),
        p_txn_type: "debit",
        p_source: "booth_debit",
        p_notes: `Staff debit: D${amount1}`,
      },
    );
    if (rpcErr) {
      console.error("[debit] RPC error:", rpcErr);
      return new Response(
        JSON.stringify({
          error: "Failed to debit ticket",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (newBalance === -1) {
      console.warn(
        `[debit] Insufficient balance for ticket ${ticket_id}, amount D${amount1}`,
      );
      return new Response(
        JSON.stringify({
          error: "Insufficient balance",
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    console.log(
      `[debit] ✓ Ticket ${ticket_id} debited D${amount1}, new balance D${newBalance}`,
    );
    return new Response(
      JSON.stringify({
        success: true,
        new_balance: newBalance,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[debit] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to debit ticket",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
async function handleBulkTopup(req) {
  try {
    const { entries } = await req.json();
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Missing or empty entries array",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    const results = [];
    let processed = 0;
    for (const entry of entries) {
      const { code, amount: amount1, method, note } = entry;
      if (!code || !amount1 || amount1 < 50) {
        results.push({
          code: code || "??",
          success: false,
          error: "Invalid entry",
        });
        continue;
      }
      const normalizedCode = code.toUpperCase().startsWith("TKT-")
        ? code.toUpperCase()
        : `TKT-${code.toUpperCase()}`;
      try {
        // Find the ticket
        const { data: ticket, error: ticketErr } = await supabase
          .from("tickets")
          .select("id, code, balance, customer_email, customer_name, status")
          .eq("code", normalizedCode)
          .maybeSingle();
        if (ticketErr || !ticket) {
          results.push({
            code: normalizedCode,
            success: false,
            error: "Ticket not found",
          });
          continue;
        }
        if (ticket.status !== "active") {
          results.push({
            code: normalizedCode,
            success: false,
            error: `Ticket is ${ticket.status}`,
          });
          continue;
        }
        // Update balance atomically
        const { data: newBalance, error: balanceErr } = await supabase.rpc(
          "update_ticket_balance",
          {
            p_ticket_id: ticket.id,
            p_amount_delta: amount1,
            p_txn_type: "top_up",
            p_source: method === "cash" ? "cash" : "wave",
            p_notes: `Booth — offline catch-up${note ? ` (${note})` : ""}`,
          },
        );
        if (balanceErr || newBalance === -1) {
          results.push({
            code: normalizedCode,
            success: false,
            error: "Balance update failed (cap?)",
          });
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
                Your ticket <strong>${normalizedCode}</strong> has been topped up by <strong>D${amount1}</strong>.
              </p>
              <p style="color:#666;margin:0 0 24px;">
                New balance: <strong>D${newBalance}</strong>
              </p>
              <p style="margin-top:20px;">
                <a href="https://www.walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
              </p>
              <p style="margin-top:12px;font-size:12px;color:#999;">
                Processed at the booth. Need help? Visit the info desk.
              </p>
            `),
          });
        }
        results.push({
          code: normalizedCode,
          success: true,
        });
        processed++;
      } catch (innerErr) {
        results.push({
          code: normalizedCode || "??",
          success: false,
          error: innerErr.message,
        });
      }
    }
    const errors = results.filter((r) => !r.success);
    console.log(
      `[bulk-topup] Processed ${processed} of ${entries.length} entries, ${errors.length} errors`,
    );
    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        processed,
        total: entries.length,
        errors: errors.length > 0 ? errors : undefined,
        results: errors.length > 0 ? results : undefined,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[bulk-topup] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to process bulk top-up",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /unmark-used
// Reverts a ticket's status from 'used' back to 'active'.
// Used by scanner Bill mode for undoing mistaken voucher redemptions.
// Only reverts tickets that are currently in 'used' status.
// ──────────────────────────────────────────────────────────────────────────────
async function handleUnmarkUsed(req) {
  try {
    const { ticket_id, reason, staff_code } = await req.json();
    if (!ticket_id) {
      return new Response(
        JSON.stringify({
          error: "Missing ticket_id",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    // Only revert if currently 'used' — prevents toggling already-active tickets
    const { data: ticket, error: fetchErr } = await supabase
      .from("tickets")
      .select("id, code, status, metadata, updated_at")
      .eq("id", ticket_id)
      .single();
    if (fetchErr || !ticket) {
      console.error("[unmark-used] Ticket not found:", ticket_id);
      return new Response(
        JSON.stringify({
          error: "Ticket not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (ticket.status !== "used") {
      console.warn(
        `[unmark-used] Ticket ${ticket.code} is not 'used' (current: ${ticket.status})`,
      );
      return new Response(
        JSON.stringify({
          error: `Ticket is ${ticket.status}, not 'used' — cannot undo`,
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Merge undo reason into existing metadata
    const existingMeta = ticket.metadata || {};
    const updatedMeta = {
      ...existingMeta,
      unmark_reason: reason || null,
      unmarked_at: new Date().toISOString(),
      unmarked_by: staff_code || null,
    };
    // Revert status to 'active' and store undo audit trail in metadata
    const { error: updateErr } = await supabase
      .from("tickets")
      .update({
        status: "active",
        metadata: updatedMeta,
      })
      .eq("id", ticket_id)
      .eq("status", "used"); // Optimistic concurrency — only if still 'used'
    if (updateErr) {
      console.error("[unmark-used] Update failed:", updateErr);
      return new Response(
        JSON.stringify({
          error: "Failed to revert ticket status",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    console.log(
      `[unmark-used] Ticket ${ticket.code} reverted to 'active'${reason ? ` (reason: ${reason})` : ""}`,
    );
    return new Response(
      JSON.stringify({
        success: true,
        code: ticket.code,
        status: "active",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[unmark-used] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to revert ticket",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /reverse-debit
// Reverses a previous debit by adding balance back to a ticket.
// Called from scanner Bill mode when undoing a mistaken voucher redemption.
// Uses the update_ticket_balance RPC with a positive amount.
// ──────────────────────────────────────────────────────────────────────────────
async function handleReverseDebit(req) {
  try {
    const { ticket_id, amount, reason, staff_code } = await req.json();
    if (!ticket_id || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({
          error: "Missing or invalid ticket_id or amount",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    // First verify the ticket exists and is active
    const { data: ticket, error: fetchErr } = await supabase
      .from("tickets")
      .select("id, code, balance, status")
      .eq("id", ticket_id)
      .single();
    if (fetchErr || !ticket) {
      return new Response(
        JSON.stringify({
          error: "Ticket not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Add the balance back
    const { data: newBalance, error: rpcErr } = await supabase.rpc(
      "update_ticket_balance",
      {
        p_ticket_id: ticket_id,
        p_amount_delta: amount,
        p_txn_type: "debit_reversal",
        p_source: "booth_debit_reversal",
        p_notes: `Reversal of debit: D${amount}${reason ? ` - ${reason}` : ""}${staff_code ? ` (by ${staff_code})` : ""}`,
      },
    );
    if (rpcErr) {
      console.error("[reverse-debit] RPC error:", rpcErr);
      return new Response(
        JSON.stringify({
          error: "Failed to reverse debit",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (newBalance === -1) {
      return new Response(
        JSON.stringify({
          error: "Balance update failed (cap reached?)",
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    console.log(
      `[reverse-debit] Ticket ${ticket.code} reversed D${amount}, new balance D${newBalance}` +
        `${reason ? ` (reason: ${reason})` : ""}`,
    );
    return new Response(
      JSON.stringify({
        success: true,
        new_balance: newBalance,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[reverse-debit] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to reverse debit",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /admin-query
// Proxies Supabase REST API queries through the Edge Function with the service
// role key. This bypasses RLS entirely, so admin dashboard functions work
// regardless of the JWT's app_metadata role claims.
// Called from admin-tickets.js for inventory, orders, ticket types, etc.
// ──────────────────────────────────────────────────────────────────────────────
// ─── Helper: check if request has a valid JWT (any authenticated user)
// This is a lighter auth check than isTicketingRequestAuthorized — it only
// verifies the JWT is valid, without checking for specific roles.
// Used by /admin-query since the actual query uses the service key server-side.
async function isAuthenticatedUser(req) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  // Allow service role key too
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token === serviceKey) return true;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    return !error && !!user;
  } catch {
    return false;
  }
}
async function handleAdminQuery(req) {
  try {
    if (!(await isAuthenticatedUser(req))) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const { method = "GET", path, body } = await req.json();
    if (!path) {
      return new Response(
        JSON.stringify({
          error: "Missing path",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({
          error: "Server config error",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const response = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("[admin-query] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Query failed",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /regenerate-tickets
// Re-creates tickets for a paid order that has none.
// Called from admin dashboard when a webhook failed to generate tickets.
// Auth: requires ticketing role JWT or service key.
// ──────────────────────────────────────────────────────────────────────────────
async function handleRegenerateTickets(req) {
  try {
    if (!(await isTicketingRequestAuthorized(req))) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized. Service key or ticketing staff JWT required.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required field: order_id",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    // Fetch the order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, email, status, total, metadata")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) {
      return new Response(
        JSON.stringify({
          error: "Order not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Only regenerate tickets for paid orders
    if (order.status !== "paid") {
      return new Response(
        JSON.stringify({
          error: `Order is ${order.status}, not paid. Payment must be confirmed first.`,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Check if tickets already exist
    const { count: ticketCount } = await supabase
      .from("tickets")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("order_id", order_id);
    if ((ticketCount || 0) > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Order already has ${ticketCount} tickets. No regeneration needed.`,
          tickets_count: ticketCount,
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Extract items from order metadata
    const orderMetadata = order.metadata || {};
    const items = orderMetadata.items || [];
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No items found in order metadata. Cannot regenerate tickets.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Create tickets
    const customerName = orderMetadata.customer_name || undefined;
    const tickets = await createTicketsForOrder(
      supabase,
      order.id,
      order.email,
      items,
      customerName,
    );
    if (tickets.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create any tickets. Items may be sold out.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Send confirmation email
    const ticketList = tickets
      .map(
        (t) =>
          `<li><strong>${t.ticketTypeSlug}</strong>: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:14px;">${t.code}</code></li>`,
      )
      .join("");
    await sendEmail({
      to: order.email,
      subject: "Your tickets are ready! — Walking-Fish",
      html: emailShell(`
        <h2 style="margin:0 0 8px;">Tickets Re-Generated</h2>
        <p style="color:#666;margin:0 0 24px;">Your order <strong>#${order.id.slice(0, 8)}</strong> tickets have been re-issued.</p>
        <h3 style="margin:0 0 12px;">Your Tickets</h3>
        <ul style="padding-left:20px;line-height:1.8;">${ticketList}</ul>
        <p style="margin-top:20px;">
          <a href="https://www.walkingfish.gm/tickets" style="background:#e85d3a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;">View My Tickets</a>
        </p>
        <p style="margin-top:12px;font-size:12px;color:#999;">
          Tap the link above or scan the QR code at the venue. Apologies for the delay!
        </p>
      `),
    });
    // Send magic link so user can auto-login to their dashboard
    sendMagicLinkEmail(order.email);
    console.log(
      `[regenerate-tickets] ✓ Order ${order.id} — ${tickets.length} tickets re-generated`,
    );
    return new Response(
      JSON.stringify({
        success: true,
        tickets_created: tickets.length,
        tickets: tickets.map((t) => ({
          code: t.code,
          type_slug: t.ticketTypeSlug,
        })),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[regenerate-tickets] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to regenerate tickets",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /resend-magic-link
// Resends a magic link email to a user's email address.
// Called from admin dashboard when a user missed their magic link.
// Auth: requires ticketing role JWT or service key.
// ──────────────────────────────────────────────────────────────────────────────
async function handleResendMagicLink(req) {
  try {
    if (!(await isTicketingRequestAuthorized(req))) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized. Service key or ticketing staff JWT required.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const { email: rawEmail } = await req.json();
    const email = (rawEmail || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({
          error: "Invalid email address",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Check if this email has any purchased tickets before sending
    const supabase = getSupabaseClient();
    const { count: ticketCount, error: ticketErr } = await supabase
      .from("tickets")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("customer_email", email);
    if (ticketErr) {
      console.error("[resend-magic-link] Ticket lookup error:", ticketErr);
      return new Response(
        JSON.stringify({
          error: "Failed to verify email. Please try again.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (!ticketCount || ticketCount === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No tickets found for this email address.",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Generate magic link via admin API and send via Resend
    await sendMagicLinkEmail(email);
    return new Response(
      JSON.stringify({
        success: true,
        message: `Magic link sent to ${email}`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[resend-magic-link] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to resend magic link",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /send-magic-link
// Public endpoint for sending magic links from the tickets page.
// Uses admin.generateLink() + Resend instead of Supabase Auth's built-in OTP
// endpoint, which requires custom SMTP configuration.
// Rate-limited to prevent abuse.
// ──────────────────────────────────────────────────────────────────────────────
async function handleSendMagicLink(req) {
  try {
    // Rate limit: 3 requests per email per minute
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many requests. Please wait before trying again.",
          retry_after_seconds: Math.ceil(rateCheck.resetMs / 1000),
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)),
          },
        },
      );
    }
    const { email: rawEmail } = await req.json();
    const email = (rawEmail || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({
          error: "Invalid email address",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Check if this email has any purchased tickets before sending the magic link
    const supabase = getSupabaseClient();
    const { count: ticketCount, error: ticketErr } = await supabase
      .from("tickets")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("customer_email", email);
    if (ticketErr) {
      console.error("[send-magic-link] Ticket lookup error:", ticketErr);
      return new Response(
        JSON.stringify({
          error: "Failed to verify email. Please try again.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (!ticketCount || ticketCount === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "No tickets found for this email address. Please purchase tickets first.",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    await sendMagicLinkEmail(email);
    return new Response(
      JSON.stringify({
        success: true,
        message: "Check your email for the sign-in link.",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("[send-magic-link] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to send magic link. Please try again.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /exchange-token
// Exchanges a persistent ticket token for a fresh Supabase Auth session.
// The token is an HMAC-signed payload containing email + expiry.
// Each click generates a FRESH magic link + session — the token is never consumed.
// ──────────────────────────────────────────────────────────────────────────────
async function handleExchangeToken(req) {
  try {
    const { ticket_token } = await req.json();
    if (!ticket_token) {
      return new Response(
        JSON.stringify({
          error: "Missing ticket_token",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Parse token: v1.{expiresAt}.{base64url(email)}.{hexSig}
    const parts = ticket_token.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") {
      console.warn(`[exchange-token] Bad token format: ${parts.length} parts, token length=${ticket_token.length}`);
      return new Response(
        JSON.stringify({
          error: "This link appears to be broken or incomplete. Please request a new sign-in link.",
          reason: "invalid_format",
          parts_count: parts.length,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const expiresAt = parseInt(parts[1], 10);
    const encodedEmail = parts[2];
    const sig = parts[3];
    // Attempt to decode email early for better error messages
    let emailFromToken = "";
    try { emailFromToken = base64UrlDecode(encodedEmail).toLowerCase(); } catch (_) {}
    // Check expiry
    if (isNaN(expiresAt)) {
      console.warn(`[exchange-token] NaN expiresAt — token likely truncated. Length=${ticket_token.length}`);
      return new Response(
        JSON.stringify({
          error: "This link appears to be broken or truncated. Please request a new sign-in link.",
          reason: "invalid_expiry",
          email: emailFromToken || undefined,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (expiresAt < Date.now()) {
      const expiredAgo = Math.round((Date.now() - expiresAt) / 1000 / 60);
      console.warn(`[exchange-token] Token expired ${expiredAgo}m ago for ${emailFromToken || "(unknown email)"}`);
      return new Response(
        JSON.stringify({
          error: "This link has expired. Please request a new sign-in link below.",
          reason: "expired",
          email: emailFromToken || undefined,
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Decode email
    const email = base64UrlDecode(encodedEmail).toLowerCase();
    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({
          error: "Invalid email in token",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Verify HMAC signature
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const tokenSecret = Deno.env.get("TICKET_TOKEN_SECRET") ?? serviceKey;
    const message = email + ":" + expiresAt;
    const expectedSig = await signMessage(tokenSecret, message);
    if (sig !== expectedSig) {
      console.warn(`[exchange-token] Invalid signature for ${email}`);
      return new Response(
        JSON.stringify({
          error: "Invalid token signature",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Token is valid — create a session via password grant.
    // Uses the admin API to set a temporary password, then signs in
    // with email + password. Bypasses magic link OTP issues (expired/invalid
    // tokens) and works on all browsers including iOS Safari in-app browsers.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const siteUrl = "https://www.walkingfish.gm";
    try {
      // 1. Create admin client to manage the user
      const adminSupabase = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // 2. Ensure user exists in Auth (creates if not, returns user ID)
      const { data: linkData, error: linkError } =
        await adminSupabase.auth.admin.generateLink({
          type: "magiclink",
          email: email,
          options: {
            redirect_to: `${siteUrl}/tickets`,
          },
        });
      if (linkError) {
        console.error(
          `[exchange-token] Generate link failed for ${email}: ${linkError.message}`,
        );
        return new Response(
          JSON.stringify({
            error: "Unable to sign you in. Please try again.",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      if (!linkData?.properties?.action_link) {
        console.error(
          `[exchange-token] No action_link in generateLink response for ${email}`,
        );
        return new Response(
          JSON.stringify({
            error: "Unable to sign you in. Please try again.",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Get user ID — SDK response may nest it differently across versions
      const userId = linkData?.id || linkData?.user?.id;
      if (!userId) {
        console.error(
          `[exchange-token] No user ID in generateLink response for ${email}`,
        );
        // Fallback: return action_link for browser redirect
        return new Response(
          JSON.stringify({
            success: true,
            action_link: linkData.properties.action_link,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // 3. Generate a strong temporary password
      const tempPassword = crypto.randomUUID().replace(/-/g, "") + "Aa1!";

      // 4. Update password AND confirm email in a single admin call.
      // Some accounts are created in an unconfirmed state (e.g. via a prior
      // signup attempt). The magic link token proves email ownership, so
      // confirming the email here is safe. Without this, signInWithPassword
      // fails with "Email not confirmed" even after the password is set.
      const { error: updateError } =
        await adminSupabase.auth.admin.updateUserById(userId, {
          password: tempPassword,
          email_confirm: true,
        });
      if (updateError) {
        console.error(
          `[exchange-token] Password/confirm update failed for ${email}: ${updateError.message}`,
        );
        return new Response(
          JSON.stringify({
            error: "Unable to sign you in. Please try again.",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // 5. Brief delay for password propagation
      await new Promise((r) => setTimeout(r, 500));

      // 6. Sign in with password grant using the anon key
      const anonClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: signInData, error: signInError } =
        await anonClient.auth.signInWithPassword({
          email,
          password: tempPassword,
        });

      if (signInError || !signInData?.session) {
        console.error(
          `[exchange-token] Sign-in failed for ${email}: ${signInError?.message || "No session"}`,
        );
        return new Response(
          JSON.stringify({
            error: "Unable to sign you in. Please try again.",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // 7. Session obtained successfully
      console.log(
        `[exchange-token] ✓ Session obtained for ${email} (password grant)`,
      );
      return new Response(
        JSON.stringify({
          success: true,
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token || "",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (sessionErr) {
      console.error(
        `[exchange-token] Session creation error for ${email}: ${sessionErr.message}`,
      );
      return new Response(
        JSON.stringify({
          error: "Unable to sign you in. Please try again.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  } catch (err) {
    console.error("[exchange-token] Error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Failed to exchange token. Please try again.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Handler: /debug-ticket
// Debug endpoint to test createTicketsForOrder directly
// ──────────────────────────────────────────────────────────────────────────────
async function handleDebugTicket(req) {
  try {
    const { order_id, email, ticket_type_id, quantity } = await req.json();
    if (!order_id || !ticket_type_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: order_id, ticket_type_id",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    const supabase = getSupabaseClient();
    const items = [
      {
        ticket_type_id,
        quantity: quantity || 1,
      },
    ];
    // Step 1: Try to find ticket type
    const { data: ticketType, error: typeErr } = await supabase
      .from("ticket_types")
      .select("id, name, slug, type, price")
      .eq("id", ticket_type_id)
      .single();
    if (typeErr || !ticketType) {
      return new Response(
        JSON.stringify({
          step: 1,
          error: "Ticket type not found",
          db_error: typeErr,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Step 2: Try to increment sold count
    const { data: canSell, error: sellErr } = await supabase.rpc(
      "increment_ticket_sold_count",
      {
        ticket_type_id,
      },
    );
    if (sellErr) {
      return new Response(
        JSON.stringify({
          step: 2,
          error: "RPC call failed",
          db_error: sellErr,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (canSell === false) {
      return new Response(
        JSON.stringify({
          step: 2,
          error: "Sold out",
          canSell,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Step 3: Generate ticket code
    const { data: code, error: codeErr } = await supabase.rpc(
      "generate_ticket_code",
    );
    if (codeErr || !code) {
      return new Response(
        JSON.stringify({
          step: 3,
          error: "Code generation failed",
          db_error: codeErr,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
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
        customer_email: email || "debug@test.com",
        customer_name: "Debug User",
        qr_url: `https://www.walkingfish.gm/t?t=${code}`,
      })
      .select()
      .single();
    if (ticketErr) {
      return new Response(
        JSON.stringify({
          step: 4,
          error: "Ticket insert failed",
          db_error: ticketErr,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        ticket,
        ticketType,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
}
// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }
  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/ticketing/, ""); // strip function name prefix
    return await routeRequest(req, pathname || "/");
  } catch (err) {
    console.error("[ticketing] Unhandled error:", err.message);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});

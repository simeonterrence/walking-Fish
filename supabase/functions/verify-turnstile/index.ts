import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Email inboxes ───────────────────────────────────────────────────────────
// admin@walkingfish.gm          — internal admin / early access signups
// hello@walkingfish.gm          — general enquiries, bookings
// vendor@walkingfish.gm         — vendor applications
// theevents.guy@walkingfish.gm  — partnerships, sponsorships, collaborations
// musterpoint@walkingfish.gm    — media & press, event coverage, production

function resolveContactInbox(inquiry: string): string {
  const s = (inquiry || "").toLowerCase();
  if (s.includes("vendor"))                             return "vendor@walkingfish.gm";
  if (s.includes("sponsor") || s.includes("partner"))  return "theevents.guy@walkingfish.gm";
  if (s.includes("media") || s.includes("press") ||
      s.includes("production"))                         return "musterpoint@walkingfish.gm";
  // General Inquiry, Book an Experience → hello@
  return "hello@walkingfish.gm";
}

function row(label: string, value: string) {
  return `<tr><td style="padding:8px 0;color:#666;width:140px;vertical-align:top;">${label}</td><td style="padding:8px 0;">${value}</td></tr>`;
}

function emailShell(body: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#111;">${body}<hr style="margin:32px 0;border:none;border-top:1px solid #eee;"><p style="font-size:12px;color:#999;margin:0;">Walking-Fish Group · walkingfish.gm</p></div>`;
}

// ─── Per-table email builders ────────────────────────────────────────────────
function buildEmails(table: string, data: Record<string, any>): Array<{ to: string; subject: string; html: string }> {
  const emails: Array<{ to: string; subject: string; html: string }> = [];

  if (table === "vendor_applications") {
    emails.push({
      to: "vendor@walkingfish.gm",
      subject: `New Vendor Application: ${data.business_name || "Unknown"}`,
      html: emailShell(`
        <h2 style="margin:0 0 24px;">New Vendor Application</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${row("Business", data.business_name || "-")}
          ${row("Contact", data.contact_name || "-")}
          ${row("Email", `<a href="mailto:${data.email}">${data.email}</a>`)}
          ${data.phone ? row("WhatsApp", `<a href="https://wa.me/${data.phone.replace(/[^0-9]/g, '')}" target="_blank">${data.phone}</a>`) : ""}
          ${row("Category", data.category || "-")}
          ${row("Message", data.message || "No message provided.")}
          ${data.details ? `
            <tr><td colspan="2" style="padding:16px 0 8px;font-weight:bold;border-bottom:1px solid #eee;">Application Details</td></tr>
            ${row("Intended Items", data.details.sell_intent || "-")}
            ${row("Stall Selection", data.details.stall_preference || "-")}
            ${row("Team Size", data.details.team_size || "-")}
            ${data.details.team_members && data.details.team_members.length ? `
              <tr><td style="padding:8px 0;color:#666;vertical-align:top;">Team Members</td><td style="padding:8px 0;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                  ${data.details.team_members.map((m: any, i: number) => `
                    <tr style="border-bottom:1px solid #f5f5f5;">
                      <td style="padding:4px 0;">
                        <strong>${m.name || "-"}</strong> (${m.role || "-"})<br>
                        Phone: ${m.phone || "-"}
                        ${m.id_photo ? `<br><img src="${m.id_photo}" style="max-width:200px;max-height:150px;border-radius:4px;margin-top:4px;border:1px solid #ddd;" alt="ID Photo">` : ""}
                      </td>
                    </tr>
                  `).join("")}
                </table>
              </td></tr>
            ` : ""}
            ${row("Extra Tags?", data.details.extra_tags_needed || "-")}
            ${data.details.extra_tags_justification ? row("Tags Justification", data.details.extra_tags_justification) : ""}
            ${row("Appliances?", data.details.bringing_appliances || "-")}
            ${data.details.appliances_list ? row("Appliances List", data.details.appliances_list) : ""}
            ${row("Power Req", data.details.power_requirements || "-")}
            ${row("Readiness", data.details.readiness_level || "-")}
          ` : ""}
        </table>
        <p style="margin-top:24px;font-size:13px;color:#999;">Review in the <a href="https://www.walkingfish.gm/admin">admin panel</a>.</p>
      `),
    });

    if (data.email) {
      emails.push({
        to: data.email,
        subject: `We've received your vendor application — Walking-Fish`,
        html: emailShell(`
          <h2 style="margin:0 0 24px;">Application Received</h2>
          <p>Hi ${data.contact_name || "there"},</p>
          <p>Thanks for applying to be a vendor with Walking-Fish. We've received your details for <strong>${data.business_name || "your business"}</strong>.</p>
          <p>Our team will review your application and get back to you shortly.</p>
        `),
      });
    }
  }

  if (table === "contact_messages") {
    const inquiry = data.subject || data.inquiry || "";
    const to = resolveContactInbox(inquiry);
    emails.push({
      to,
      subject: `[Contact] ${inquiry || "New Message"} — ${data.name || data.email}`,
      html: emailShell(`
        <h2 style="margin:0 0 24px;">New Contact Message</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${row("Name", data.name || "-")}
          ${row("Email", `<a href="mailto:${data.email}">${data.email}</a>`)}
          ${data.phone ? row("WhatsApp", `<a href="https://wa.me/${data.phone.replace(/[^0-9]/g, '')}" target="_blank">${data.phone}</a>`) : ""}
          ${row("Inquiry", inquiry || "-")}
        </table>
        <div style="margin-top:20px;padding:16px;background:#f9f9f9;border-radius:8px;">
          <p style="color:#666;font-size:13px;margin:0 0 8px;">Message</p>
          <p style="margin:0;white-space:pre-wrap;">${data.message || "No message provided."}</p>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#bbb;">Routed to: ${to}</p>
      `),
    });

    if (data.email) {
      emails.push({
        to: data.email,
        subject: `We've received your message — Walking-Fish`,
        html: emailShell(`
          <h2 style="margin:0 0 24px;">Message Received</h2>
          <p>Hi ${data.name || "there"},</p>
          <p>Thanks for reaching out to us regarding <strong>${inquiry || "your inquiry"}</strong>. We've received your message and a member of our team will be in touch soon.</p>
        `),
      });
    }
  }

  if (table === "early_access") {
    emails.push({
      to: "admin@walkingfish.gm",
      subject: `Early Access Signup: ${data.email}`,
      html: emailShell(`
        <h2 style="margin:0 0 16px;">New Early Access Signup</h2>
        <p><strong>${data.email}</strong> signed up for early access to Piroake Fest 2026.</p>
        ${data.phone ? `<p>WhatsApp Number: <a href="https://wa.me/${data.phone.replace(/[^0-9]/g, '')}" target="_blank">${data.phone}</a></p>` : ""}
        ${data.ticket_code ? `<p>Ticket code: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:14px;">${data.ticket_code}</code></p>` : ""}
      `),
    });

    if (data.email) {
      emails.push({
        to: data.email,
        subject: `You're on the list! — Piroake Fest 2026`,
        html: emailShell(`
          <h2 style="margin:0 0 24px;">You're on the list!</h2>
          <p>Thanks for signing up for early access to Piroake Fest 2026.</p>
          ${data.ticket_code ? `<p>Your presale ticket code is: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:14px;">${data.ticket_code}</code></p>` : ""}
          <p>Here is a preview of the exclusive early-bird ticket pricing reserved for list members:</p>
          <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0;font-size:14px;">
            <ul style="margin:0;padding-left:20px;line-height:1.6;color:#333;">
              <li><strong>Regular Ticket:</strong> D300 <span style="color:#888;">(Gate: D400)</span></li>
              <li><strong>VIP Ticket:</strong> D800 <span style="color:#888;">(Gate: D1,000)</span></li>
              <li><strong>Group Ticket (5 Pax):</strong> D1,300</li>
              <li><strong>Festival Side Games:</strong> D50 per 5 minutes</li>
            </ul>
          </div>
          <p>We will notify you the moment the official presale goes live so you can secure your spots before they sell out.</p>
        `),
      });
    }
  }

  return emails;
}

async function sendEmail(table: string, data: Record<string, any>) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping email notification");
    return;
  }

  const emails = buildEmails(table, data);
  if (!emails.length) return;

  // walkingfish.gm is verified in Resend (DKIM + SPF confirmed May 18).
  const fromAddress = "Walking-Fish <noreply@walkingfish.gm>";

  for (const email of emails) {
    console.log(`[Email] Attempting to send to ${email.to} (table: ${table}, subject: ${email.subject})`);

    try {
      const payload = {
        from: fromAddress,
        to: [email.to],
        subject: email.subject,
        html: email.html,
      };

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await res.text();

      if (!res.ok) {
        console.error(`[Email] Resend API error ${res.status}: ${responseText}`);
      } else {
        console.log(`[Email] ✓ Sent to ${email.to} — Resend response: ${responseText}`);
      }
    } catch (err: any) {
      console.error(`[Email] Send failed for ${email.to}: ${err.message}`);
    }
  }
}

async function signMessage(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, table, data } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Turnstile token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!table || !data) {
      return new Response(JSON.stringify({ error: "Missing table or data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Turnstile — if key not set, skip (dev mode). If set, always verify.
    let isVerifiedVisitor = false;
    const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");

    if (secretKey && token && token.startsWith("v1.")) {
      const parts = token.split(".");
      if (parts.length === 3 && parts[0] === "v1") {
        const expiry = parseInt(parts[1], 10);
        const sig = parts[2];
        if (!isNaN(expiry) && expiry > Date.now()) {
          const expectedSig = await signMessage(secretKey, "verified:" + expiry);
          if (sig === expectedSig) {
            isVerifiedVisitor = true;
          }
        }
      }
    }

    if (secretKey && token !== "bypass" && !isVerifiedVisitor) {
      const formData = new FormData();
      formData.append("secret", secretKey);
      formData.append("response", token);

      const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: formData,
      });
      const outcome = await result.json();

      if (!outcome.success) {
        return new Response(JSON.stringify({ error: "Invalid CAPTCHA token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (!secretKey) {
      console.warn("TURNSTILE_SECRET_KEY not set — dev mode, skipping CAPTCHA");
    }

    const ALLOWED_TABLES = ["vendor_applications", "contact_messages", "early_access"];
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(JSON.stringify({ error: "Invalid table specified" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: insertedData, error } = await supabase
      .from(table)
      .insert([data])
      .select();

    // Generate verified token if successfully verified
    let verifiedToken: string | undefined = undefined;
    if (secretKey) {
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      const sig = await signMessage(secretKey, "verified:" + expiresAt);
      verifiedToken = `v1.${expiresAt}.${sig}`;
    }

    if (error) {
      console.error("Supabase insert error:", error);
      if (table === "early_access" && error.code === "23505") {
        return new Response(
          JSON.stringify({ success: true, duplicate: true, message: "You're already on the list!", verifiedToken }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Failed to save data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget email — never blocks the response
    sendEmail(table, data).catch((err) => console.error("Background email error:", err));

    return new Response(JSON.stringify({ success: true, data: insertedData, verifiedToken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Function error:", err.message);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

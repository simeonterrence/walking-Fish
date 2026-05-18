import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Email routing map ───
const EMAIL_ROUTING: Record<string, { to: string; subject: (d: any) => string; html: (d: any) => string }> = {
  vendor_applications: {
    to: "admin@walkingfish.gm",
    subject: (d) => `New Vendor Application: ${d.business_name || "Unknown"}`,
    html: (d) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 0;">
        <h2 style="color:#111;margin-bottom:24px;">New Vendor Application</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;width:140px;">Business</td><td style="padding:8px 0;font-weight:600;">${d.business_name || '-'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Contact</td><td style="padding:8px 0;">${d.contact_name || '-'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;"><a href="mailto:${d.email}">${d.email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#666;">Category</td><td style="padding:8px 0;">${d.category || '-'}</td></tr>
        </table>
        <div style="margin-top:20px;padding:16px;background:#f9f9f9;border-radius:8px;">
          <p style="color:#666;font-size:13px;margin:0 0 4px;">Message</p>
          <p style="margin:0;">${d.message || 'No message provided.'}</p>
        </div>
        <p style="margin-top:24px;font-size:13px;color:#999;">Review this application in the <a href="https://www.walkingfish.gm/admin">admin panel</a>.</p>
      </div>`,
  },
  contact_messages: {
    to: "hello@walkingfish.gm",
    subject: (d) => `Contact Form: ${d.subject || d.inquiry || "New Message"} from ${d.name || d.email}`,
    html: (d) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 0;">
        <h2 style="color:#111;margin-bottom:24px;">New Contact Message</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;width:140px;">Name</td><td style="padding:8px 0;font-weight:600;">${d.name || '-'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;"><a href="mailto:${d.email}">${d.email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#666;">Type</td><td style="padding:8px 0;">${d.subject || d.inquiry || '-'}</td></tr>
        </table>
        <div style="margin-top:20px;padding:16px;background:#f9f9f9;border-radius:8px;">
          <p style="color:#666;font-size:13px;margin:0 0 4px;">Message</p>
          <p style="margin:0;">${d.message || 'No message provided.'}</p>
        </div>
      </div>`,
  },
  early_access: {
    to: "admin@walkingfish.gm",
    subject: (d) => `Early Access Signup: ${d.email}`,
    html: (d) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 0;">
        <h2 style="color:#111;margin-bottom:16px;">New Early Access Signup</h2>
        <p><strong>${d.email}</strong> signed up for early access to Piroake Fest 2026.</p>
        ${d.ticket_code ? `<p>Ticket code: <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;">${d.ticket_code}</code></p>` : ''}
      </div>`,
  },
};

async function sendEmail(table: string, data: Record<string, any>) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping email notification");
    return;
  }

  const route = EMAIL_ROUTING[table];
  if (!route) return;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Walking-Fish <noreply@walkingfish.gm>",
        to: [route.to],
        subject: route.subject(data),
        html: route.html(data),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", res.status, err);
    } else {
      console.log(`Email sent to ${route.to} for ${table}`);
    }
  } catch (err: any) {
    console.error("Email send failed:", err.message);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
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

    // Verify Turnstile token with Cloudflare
    const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!secretKey) {
      console.error("TURNSTILE_SECRET_KEY is not set");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // List of allowed tables for generic insertion to prevent abuse
    const ALLOWED_TABLES = ["vendor_applications", "contact_messages", "early_access"];
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(JSON.stringify({ error: "Invalid table specified" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Token is valid. Proceed to insert into Supabase using Service Role Key
    // to bypass RLS policies so public inserts can be locked down securely.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: insertedData, error } = await supabase
      .from(table)
      .insert([data])
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      // Handle duplicate early_access emails gracefully
      if (table === "early_access" && error.code === "23505") {
        return new Response(JSON.stringify({ success: true, duplicate: true, message: "You're already on the list!" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to save data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email notification (fire-and-forget, don't block response)
    sendEmail(table, data).catch((err) => console.error("Background email error:", err));

    return new Response(JSON.stringify({ success: true, data: insertedData }), {
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

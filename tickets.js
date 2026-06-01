/* tickets.js — Piroake Fest 2026 ticket shop and dashboard
 *
 * Handles four views:
 *   1. Shop — ticket type listing, cart, checkout (ModemPay)
 *   2. ModemPay — create order → create intent → simulate webhook → show tickets
 *   3. Dashboard — Supabase Auth magic link, ticket display, QR codes, balances,
 *      transaction history
 *
 * API endpoints used (all via anon key unless JWT-authenticated):
 *   GET  /rest/v1/ticket_types?is_active=eq.true&order=sort_order.asc
 *   GET  /rest/v1/orders?email=eq.X...  (authenticated)
 *   GET  /rest/v1/tickets?customer_email=eq.X...  (authenticated)
 *   GET  /rest/v1/balance_transactions?order=created_at.desc  (authenticated, RLS-filtered)
 *   POST /functions/v1/ticketing/create-order
 *   POST /functions/v1/ticketing/create-intent
 *   POST /functions/v1/ticketing/webhook
 *   POST /auth/v1/magic_link       (anon, for magic link login)
 *   POST /auth/v1/token            (anon, for token refresh)
 */
(function () {
  "use strict";

  const TICKET_FN = SUPABASE_URL + "/functions/v1/ticketing";
  const ANON_H = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };

  /* ─── Ticket type icons (inline SVGs, clean preset 24px/1.5px stroke) ─── */
  const ICON_FOOD =
    '<svg class="ticket-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 4v14"/><path d="M8 4v6"/><path d="M12 4v6"/><path d="M16 4v6"/>' +
    '<path d="M8 10a4 4 0 0 0 8 0"/><path d="M21 4v14"/><path d="M21 18a2.5 2.5 0 0 1-5 0"/>' +
    "</svg>";

  const ICON_DRINKS =
    '<svg class="ticket-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M8 3h8l-2 9a2 2 0 0 1-4 0L8 3z"/><path d="M12 12v5"/><path d="M9 17h6"/>' +
    "</svg>";

  const ICON_KIDS =
    '<svg class="ticket-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 2l1.5 5.5L19 9l-5.5 2L12 17l-1.5-6L5 9l5.5-1.5z"/>' +
    '<path d="M11 22l1-4 1 4"/>' +
    "</svg>";

  /* ─── State ─────────────────────────────────────────────────────────────── */
  let cart = {}; // { [ticketTypeId]: quantity }
  let ticketTypes = []; // cached ticket type rows
  let orderId = null;
  let orderTotal = 0;
  let userEmail = null; // set after login hash is parsed

  const $ = function (id) {
    return document.getElementById(id);
  };

  /* ─── Init ──────────────────────────────────────────────────────────────── */
  function init() {
    loadTicketTypes();
    setupTabs();
    setupCheckout();
    setupDashboard();
    checkLoginHash();
    checkPaymentReturn();
    checkTicketToken();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 1 — SHOP: TICKET TYPE LISTING & CART
     ═══════════════════════════════════════════════════════════════════════════ */

  async function loadTicketTypes() {
    var el = $("ticket-types-container");
    try {
      var res = await fetch(
        SUPABASE_URL +
          "/rest/v1/ticket_types?is_active=eq.true&order=sort_order.asc",
        {
          headers: { apikey: SUPABASE_ANON_KEY },
        },
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      ticketTypes = await res.json();

      var entries = ticketTypes.filter(function (t) {
        return t.type === "entry" || t.type === "parking";
      });
      var credits = ticketTypes.filter(function (t) {
        return t.type === "activity_credit";
      });
      var vouchers = ticketTypes.filter(function (t) {
        return t.type === "food" || t.type === "drinks";
      });
      var kidsZones = ticketTypes.filter(function (t) {
        return t.type === "kids_zone";
      });
      var html = "";

      if (entries.length) {
        html +=
          '<h2 style="font-size:20px;margin-bottom:16px;">Entry Passes</h2>';
        html += renderCards(entries);
      }
      if (kidsZones.length) {
        html += '<h2 style="font-size:20px;margin:32px 0 16px;">Kids Zone</h2>';
        html += renderCards(kidsZones);
      }
      if (credits.length) {
        html +=
          '<h2 style="font-size:20px;margin:32px 0 16px;">Games Passes</h2>';
        html += renderCards(credits);
      }
      if (vouchers.length) {
        html +=
          '<h2 style="font-size:20px;margin:32px 0 16px;">Food & Drinks</h2>';
        html += renderCards(vouchers);
      }

      el.innerHTML = html;

      /* attach +/- handlers via delegation on container */
      el.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-action]");
        if (!btn) return;
        var card = btn.closest("[data-tid]");
        if (!card) return;
        var id = card.getAttribute("data-tid");
        if (btn.getAttribute("data-action") === "inc") incCart(id);
        else if (btn.getAttribute("data-action") === "dec") decCart(id);
      });
    } catch (err) {
      el.innerHTML =
        '<div class="error-message">Could not load ticket types. Please refresh.</div>';
      console.error("[tickets] loadTicketTypes:", err);
    }
  }

  function renderCards(types) {
    return types
      .map(function (t) {
        var desc =
          t.type === "activity_credit"
            ? t.price.toLocaleString() +
              " credits for on-site games, karaoke & activities"
            : t.type === "parking"
              ? "On-site parking pass"
              : t.type === "food"
                ? "Redeemable at any food stall at Piroake Fest 2026"
                : t.type === "drinks"
                  ? "Redeemable for beverages at the bar and drink stations"
                  : t.type === "kids_zone"
                    ? "Dedicated Kids Center & Playground · Open 12:00pm–7:00pm · Ages 3–10 years"
                    : "General admission to Piroake Fest 2026";
        var iconHtml =
          t.type === "food"
            ? ICON_FOOD
            : t.type === "drinks"
              ? ICON_DRINKS
              : t.type === "kids_zone"
                ? ICON_KIDS
                : "";
        return (
          '<div class="ticket-card' +
          (iconHtml ? " has-icon" : "") +
          '" data-tid="' +
          t.id +
          '">' +
          (iconHtml
            ? '<div class="ticket-card-icon">' + iconHtml + "</div>"
            : "") +
          '<div class="ticket-card-info">' +
          "<h3>" +
          escHtml(t.name) +
          "</h3>" +
          '<div class="desc">' +
          desc +
          "</div>" +
          "</div>" +
          '<div class="ticket-card-price">D' +
          t.price.toLocaleString() +
          "</div>" +
          '<div class="ticket-card-actions">' +
          '<button class="qty-btn" data-action="dec" aria-label="Decrease">−</button>' +
          '<span class="qty-val" id="qty-' +
          t.id +
          '">0</span>' +
          '<button class="qty-btn" data-action="inc" aria-label="Increase">+</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  /* ─── Cart helpers ──────────────────────────────────────────────────────── */

  function incCart(id) {
    cart[id] = (cart[id] || 0) + 1;
    renderCart();
  }

  function decCart(id) {
    if (!cart[id]) return;
    cart[id] = cart[id] - 1;
    if (cart[id] <= 0) delete cart[id];
    renderCart();
  }

  function renderCart() {
    /* update quantity badges on ticket cards */
    ticketTypes.forEach(function (t) {
      var el = $("qty-" + t.id);
      if (el) el.textContent = cart[t.id] || 0;
    });

    var contents = $("cart-contents");
    var totalWrap = $("cart-total");
    var totalAmt = $("cart-total-amount");

    var ids = Object.keys(cart).filter(function (id) {
      return cart[id] > 0;
    });

    if (ids.length === 0) {
      contents.innerHTML = '<div class="cart-empty">Select tickets above</div>';
      totalWrap.style.display = "none";
      $("checkout-section").classList.remove("active");
      return;
    }

    var total = 0;
    var html = "";
    ids.forEach(function (id) {
      var t = ticketTypes.find(function (tt) {
        return tt.id === id;
      });
      if (!t) return;
      var qty = cart[id];
      var subtotal = t.price * qty;
      total += subtotal;
      html +=
        '<div class="cart-item">' +
        '<span class="cart-item-name">' +
        escHtml(t.name) +
        "</span>" +
        '<span class="cart-item-qty">\u00d7' +
        qty +
        "</span>" +
        '<span class="cart-item-cost">D' +
        subtotal.toLocaleString() +
        "</span>" +
        "</div>";
    });

    orderTotal = total;
    contents.innerHTML = html;
    totalAmt.textContent = "D" + total.toLocaleString();
    totalWrap.style.display = "block";

    var section = $("checkout-section");
    section.classList.add("active");
    var email = $("checkout-email").value.trim().toLowerCase();
    $("checkout-btn").disabled = !email || total <= 0;
  }

  function escHtml(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 2 — TABS
     ═══════════════════════════════════════════════════════════════════════════ */

  function setupTabs() {
    document.querySelectorAll("[data-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".section-tab").forEach(function (t) {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");

        var view = tab.getAttribute("data-tab");
        $("shop-view").style.display = view === "shop" ? "" : "none";
        $("dashboard-view").classList.toggle("active", view === "dashboard");
        if (view === "dashboard" && !userEmail) {
          checkSession();
        }
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 3 — CHECKOUT
     ═══════════════════════════════════════════════════════════════════════════ */

  function setupCheckout() {
    /* email input — enable/disable checkout button */
    $("checkout-email").addEventListener("input", function () {
      var email = $("checkout-email").value.trim();
      $("checkout-btn").disabled = !email || orderTotal <= 0;
    });

    $("checkout-btn").addEventListener("click", handleCheckout);

    /* back from confirmation */
    $("confirmation-back-btn").addEventListener("click", resetShop);
  }

  function resetShop() {
    $("confirmation-view").classList.remove("active");
    $("checkout-section").classList.add("active");
    cart = {};
    orderId = null;
    renderCart();
  }

  /* ─── Handle Checkout ───────────────────────────────────────────────────── */

  async function handleCheckout() {
    var btn = $("checkout-btn");
    var errEl = $("checkout-error");
    errEl.style.display = "none";

    var email = $("checkout-email").value.trim().toLowerCase();
    var name = $("checkout-name").value.trim();

    if (!email) {
      errEl.textContent = "Please enter your email address.";
      errEl.style.display = "block";
      return;
    }

    if (!EMAIL_RE.test(email)) {
      errEl.textContent = "Please enter a valid email address (e.g. name@domain.com).";
      errEl.style.display = "block";
      return;
    }

    var items = Object.keys(cart)
      .filter(function (id) {
        return cart[id] > 0;
      })
      .map(function (id) {
        return { ticket_type_id: id, quantity: cart[id] };
      });

    if (!items.length) return;

    btn.disabled = true;
    btn.textContent = "Processing\u2026";

    try {
      /* 1. Create order via Edge Function */
      var orderRes = await fetch(TICKET_FN + "/create-order", {
        method: "POST",
        headers: ANON_H,
        body: JSON.stringify({
          email: email,
          customer_name: name,
          items: items,
        }),
      });
      var orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success) {
        throw new Error(orderData.error || "Failed to create order");
      }

      orderId = orderData.order_id;

      await checkoutModemPay(email, name);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Proceed to Checkout";
    }
  }

  /* ─── ModemPay Flow ─────────────────────────────────────────────────────── */

  async function checkoutModemPay(email, name) {
    var btn = $("checkout-btn");

    /* 2. Create payment intent */
    var intentRes = await fetch(TICKET_FN + "/create-intent", {
      method: "POST",
      headers: ANON_H,
      body: JSON.stringify({
        order_id: orderId,
        amount: orderTotal,
        email: email,
        description: "Piroake Fest tickets \u2014 " + (name || email),
      }),
    });
    var intentData = await intentRes.json();
    if (!intentRes.ok || !intentData.success) {
      throw new Error(intentData.error || "Failed to create payment intent");
    }

    /* 3. Save pending order to detect return from ModemPay */
    sessionStorage.setItem(
      "wf_pending_order",
      JSON.stringify({
        order_id: orderId,
        email: email,
        customer_name: name || "",
        amount: orderTotal,
      }),
    );

    /* 4. Redirect to ModemPay hosted payment page */
    var payUrl = intentData.payment_url || "";
    if (!payUrl || !payUrl.startsWith("http")) {
      throw new Error(
        "Payment gateway did not return a valid checkout URL. Please try again.",
      );
    }
    window.location.href = payUrl;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 4 — DASHBOARD: MAGIC LINK AUTH
     ═══════════════════════════════════════════════════════════════════════════ */

  function setupDashboard() {
    $("dashboard-login-btn").addEventListener("click", sendMagicLink);
    $("dashboard-email").addEventListener("keydown", function (e) {
      if (e.key === "Enter") sendMagicLink();
    });
    $("dashboard-logout-btn").addEventListener("click", handleLogout);
  }

  /* ─── Email validation ────────────────────────────────────────── */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function sendMagicLink() {
    var email = $("dashboard-email").value.trim().toLowerCase();
    var msg = $("dashboard-login-msg");
    var btn = $("dashboard-login-btn");

    if (!email) {
      msg.textContent = "Please enter your email.";
      return;
    }

    if (!EMAIL_RE.test(email)) {
      msg.style.color = "#c53030";
      msg.textContent = "Please enter a valid email address (e.g. name@domain.com).";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Sending\u2026";
    msg.textContent = "";

    try {
      var res = await fetch(TICKET_FN + "/send-magic-link", {
        method: "POST",
        headers: ANON_H,
        body: JSON.stringify({
          email: email,
        }),
      });

      var d;
      try {
        d = await res.json();
      } catch (_) {
        d = {};
      }

      if (res.ok && d.success) {
        btn.textContent = "Check your email";
        msg.innerHTML =
          "We sent you a sign-in link! Click it to view your tickets.";
        msg.style.color = "";
      } else {
        throw new Error(d.error || "Failed to send magic link");
      }
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = "#c53030";
      btn.disabled = false;
      btn.textContent = "Send Magic Link";
    }
  }

  /* ─── Parse login redirect (hash or query params) ───────────────────────── */

  function checkLoginHash() {
    var hash = window.location.hash;
    var params = new URLSearchParams(window.location.search);

    /* Supabase Auth usually returns tokens in the URL hash fragment */
    var accessToken = null;
    var refreshToken = null;

    if (hash && hash.indexOf("access_token") !== -1) {
      var h = hash.charAt(0) === "#" ? hash.substring(1) : hash;
      var hp = new URLSearchParams(h);
      accessToken = hp.get("access_token");
      refreshToken = hp.get("refresh_token");
    }

    /* also check query params (some auth flows use ? instead of #) */
    if (!accessToken) {
      accessToken = params.get("access_token");
      refreshToken = params.get("refresh_token");
    }

    if (accessToken) {
      sessionStorage.setItem(
        "wf_ticket_session",
        JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
        }),
      );
      try {
        var payload = JSON.parse(atob(accessToken.split(".")[1]));
        userEmail = payload.email;
        window.history.replaceState({}, document.title, "/tickets");

        /* Switch to dashboard tab and load tickets */
        document.querySelectorAll("[data-tab]").forEach(function (t) {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        var dashTab = document.querySelector('[data-tab="dashboard"]');
        if (dashTab) {
          dashTab.classList.add("active");
          dashTab.setAttribute("aria-selected", "true");
        }
        $("shop-view").style.display = "none";
        $("dashboard-view").classList.add("active");
        loadDashboard();
        return;
      } catch (e) {
        console.error("[tickets] parse token:", e);
      }
    }

    /* no redirect — check existing session */
    checkSession();
  }

  function checkSession() {
    var raw = sessionStorage.getItem("wf_ticket_session");
    if (!raw) return;

    try {
      var s = JSON.parse(raw);
      var payload = JSON.parse(atob(s.access_token.split(".")[1]));

      if (payload.exp * 1000 > Date.now()) {
        userEmail = payload.email;
        loadDashboard();
      } else if (s.refresh_token) {
        /* expired — try refreshing */
        refreshSession(s.refresh_token);
      } else {
        sessionStorage.removeItem("wf_ticket_session");
      }
    } catch (e) {
      sessionStorage.removeItem("wf_ticket_session");
    }
  }

  async function refreshSession(refreshToken) {
    try {
      var res = await fetch(
        SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token",
        {
          method: "POST",
          headers: ANON_H,
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
      );
      if (res.ok) {
        var data = await res.json();
        sessionStorage.setItem(
          "wf_ticket_session",
          JSON.stringify({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          }),
        );
        var payload = JSON.parse(atob(data.access_token.split(".")[1]));
        userEmail = payload.email;
        loadDashboard();
      } else {
        sessionStorage.removeItem("wf_ticket_session");
      }
    } catch (e) {
      sessionStorage.removeItem("wf_ticket_session");
    }
  }

  /* ─── Logout ────────────────────────────────────────────────────────────── */

  function handleLogout() {
    sessionStorage.removeItem("wf_ticket_session");
    userEmail = null;
    $("dashboard-content").style.display = "none";
    $("dashboard-login-prompt").style.display = "block";
    $("dashboard-email").value = "";
    $("dashboard-login-msg").textContent = "";
    $("dashboard-login-btn").disabled = false;
    $("dashboard-login-btn").textContent = "Send Magic Link";

    /* switch to shop tab */
    document.querySelectorAll("[data-tab]").forEach(function (t) {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    var shopTab = document.querySelector('[data-tab="shop"]');
    if (shopTab) {
      shopTab.classList.add("active");
      shopTab.setAttribute("aria-selected", "true");
    }
    $("shop-view").style.display = "";
    $("dashboard-view").classList.remove("active");
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 5 — DASHBOARD: TICKET DISPLAY
     ═══════════════════════════════════════════════════════════════════════════ */

  async function loadDashboard() {
    $("dashboard-login-prompt").style.display = "none";
    $("dashboard-content").style.display = "block";
    $("dashboard-user-email").textContent = userEmail;

    try {
      var raw = sessionStorage.getItem("wf_ticket_session");
      if (!raw) return;
      var s = JSON.parse(raw);
      var authH = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + s.access_token,
        "Content-Type": "application/json",
      };
      var encEmail = encodeURIComponent(userEmail);

      var [ticketsRes, txnsRes] = await Promise.all([
        fetch(
          SUPABASE_URL +
            "/rest/v1/tickets?customer_email=eq." +
            encEmail +
            "&select=id,code,type,balance,status,created_at,customer_name,metadata,qr_url,order_id,ticket_types(name,slug,price)" +
            "&order=created_at.desc",
          { headers: authH },
        ),
        fetch(
          SUPABASE_URL +
            "/rest/v1/balance_transactions" +
            "?select=id,ticket_id,type,amount_delta,balance_after,source,created_at" +
            "&order=created_at.desc&limit=50",
          { headers: authH },
        ).catch(function () {
          return null;
        }),
      ]);

      var tickets = ticketsRes.ok ? await ticketsRes.json() : [];

      /* Calculate magic link countdown (22 days from earliest ticket purchase) */
      if (tickets && tickets.length > 0) {
        var earliestCreated = tickets.reduce(function (min, t) {
          return t.created_at && t.created_at < min ? t.created_at : min;
        }, tickets[0].created_at);
        var expiresAt =
          new Date(earliestCreated).getTime() + 22 * 24 * 60 * 60 * 1000;
        var now = Date.now();
        var remainingMs = expiresAt - now;
        if (remainingMs > 0) {
          var remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
          var remainingHours = Math.floor(
            (remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
          );
          var banner = document.getElementById("magic-link-countdown");
          if (!banner) {
            banner = document.createElement("div");
            banner.id = "magic-link-countdown";
            banner.style.cssText =
              "background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;";
            var dashContent = $("dashboard-content");
            if (dashContent)
              dashContent.insertBefore(banner, dashContent.firstChild);
          }
          var daysText =
            remainingDays > 0
              ? remainingDays +
                " day" +
                (remainingDays !== 1 ? "s" : "") +
                (remainingHours > 0 ? " " + remainingHours + "h" : "")
              : remainingHours + " hour" + (remainingHours !== 1 ? "s" : "");
          banner.innerHTML =
            '<div style="display:flex;align-items:center;gap:12px;">' +
            '<span style="font-size:24px;">\u23F3</span>' +
            '<div><strong style="font-size:15px;">Magic link expires in ' +
            daysText +
            "</strong>" +
            '<p style="font-size:13px;color:var(--muted);margin:2px 0 0;">Your sign-in link from your purchase email is valid for 22 days. Request a new one anytime from the login page.</p></div></div>' +
            '<a href="/tickets" class="btn btn-secondary" style="font-size:13px;white-space:nowrap;">Send New Link</a>';
        }
      }

      renderTickets(tickets);

      if (txnsRes && txnsRes.ok) {
        var txns = await txnsRes.json();
        renderTransactions(txns);
      }
    } catch (err) {
      $("dashboard-tickets-list").innerHTML =
        '<div class="error-message">Failed to load tickets. Please try again.</div>';
      console.error("[tickets] loadDashboard:", err);
    }
  }

  function renderTickets(tickets) {
    var container = $("dashboard-tickets-list");

    if (!tickets || tickets.length === 0) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px 20px;border:2px dashed var(--border);border-radius:16px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">\uD83C\uDFAB</div>' +
        '<h3 style="margin-bottom:8px;">No Tickets Yet</h3>' +
        '<p style="font-size:14px;color:var(--muted);margin-bottom:20px;">You haven\u2019t purchased any tickets yet.</p>' +
        '<a href="/tickets" class="btn btn-primary">Buy Tickets</a>' +
        "</div>";
      return;
    }

    var html = "";
    tickets.forEach(function (t) {
      var typeName = (t.ticket_types && t.ticket_types.name) || "Ticket";
      var typeSlug = t.type || "entry";
      var isActivity = t.type === "activity_credit";
      var balance = t.balance || 0;
      var statusBadge =
        t.status !== "active"
          ? ' <span style="font-size:12px;color:var(--muted);text-transform:uppercase;">(' +
            t.status +
            ")</span>"
          : "";

      var qrDataUri = null;
      try {
        if (
          t.metadata &&
          typeof t.metadata === "object" &&
          t.metadata.qr_data_uri
        ) {
          qrDataUri = t.metadata.qr_data_uri;
        } else if (typeof t.metadata === "string") {
          var parsed = JSON.parse(t.metadata);
          if (parsed.qr_data_uri) qrDataUri = parsed.qr_data_uri;
        }
      } catch (_) {}

      var qrContent = t.qr_url || "https://www.walkingfish.gm/t?t=" + t.code;

      html +=
        '<div class="ticket-dashboard-card">' +
        '<div class="ticket-db-info">' +
        "<h3>" +
        escHtml(typeName) +
        statusBadge +
        "</h3>" +
        '<div class="code">' +
        escHtml(t.code) +
        "</div>" +
        '<div class="meta">Purchased ' +
        fmtDate(t.created_at) +
        "</div>" +
        "</div>" +
        (isActivity
          ? '<div class="ticket-db-balance"><div class="amt">D' +
            balance.toLocaleString() +
            '</div><div class="lbl">Balance</div></div>'
          : "") +
        '<div class="ticket-db-actions">' +
        '<button class="btn btn-secondary" style="font-size:13px;" data-qr-id="' +
        t.id +
        '">' +
        (qrDataUri ? "Show QR" : "View Code") +
        "</button>" +
        "</div>" +
        "</div>" +
        '<div id="qr-' +
        t.id +
        '" style="display:none;margin:-8px 0 16px;text-align:center;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
        (qrDataUri
          ? '<img src="' +
            qrDataUri +
            '" alt="QR Code for ' +
            escHtml(t.code) +
            '" style="width:200px;height:200px;">'
          : '<p style="font-size:13px;color:var(--muted);">Show this code at the gate:</p>' +
            '<p style="font-family:var(--font-mono);font-size:18px;font-weight:700;letter-spacing:0.1em;margin-top:8px;">' +
            escHtml(t.code) +
            "</p>" +
            '<p style="font-size:12px;color:var(--muted);margin-top:8px;">' +
            '<a href="' +
            qrContent +
            '" target="_blank" style="color:var(--accent);">View Ticket Page</a>' +
            "</p>") +
        "</div>";
    });

    container.innerHTML = html;

    /* QR toggle handlers */
    container.querySelectorAll("[data-qr-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-qr-id");
        var el = $("qr-" + id);
        if (!el) return;
        var show = el.style.display === "none";
        el.style.display = show ? "block" : "none";
        btn.textContent = show
          ? "Hide QR"
          : el.querySelector("img")
            ? "Show QR"
            : "View Code";
      });
    });
  }

  /* ─── Transactions ──────────────────────────────────────────────────────── */

  function renderTransactions(txns) {
    var section = $("txn-history-section");

    if (!txns || txns.length === 0) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    var list = $("txn-history-list");

    list.innerHTML = txns
      .map(function (txn) {
        var sign = txn.amount_delta >= 0 ? "+" : "";
        var cls = txn.amount_delta >= 0 ? "positive" : "negative";
        var label =
          txn.type === "top_up"
            ? "Top-Up"
            : txn.type === "debit"
              ? "Debit"
              : "Purchase";
        return (
          '<div class="transaction-item">' +
          '<span class="transaction-date">' +
          fmtDate(txn.created_at) +
          "</span>" +
          '<span class="transaction-type">' +
          label +
          "</span>" +
          '<span class="transaction-amount ' +
          cls +
          '">' +
          sign +
          "D" +
          Math.abs(txn.amount_delta).toLocaleString() +
          "</span>" +
          '<span class="transaction-source" style="font-size:12px;color:var(--muted);"></span>' +
          "</div>"
        );
      })
      .join("");
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 6 — MODEMPAY RETURN HANDLING
     ═══════════════════════════════════════════════════════════════════════════ */

  function checkPaymentReturn() {
    var params = new URLSearchParams(window.location.search);
    var payment = params.get("payment");
    var orderIdFromUrl = params.get("order_id");

    if (payment === "success") {
      var pendingRaw = sessionStorage.getItem("wf_pending_order");
      if (pendingRaw) {
        try {
          var pending = JSON.parse(pendingRaw);
          sessionStorage.removeItem("wf_pending_order");
          showPaymentSuccess(pending.order_id, pending.email, pending.amount);
          return;
        } catch (e) {
          // Invalid session data — fall through to order_id from URL
        }
      }
      // Fallback: use order_id from URL directly (handles page refresh after sessionStorage cleared)
      if (orderIdFromUrl) {
        showPaymentSuccess(orderIdFromUrl, null, null);
        return;
      }
      // No order_id at all — clean up silently
      window.history.replaceState({}, document.title, "/tickets");
    } else if (payment === "cancelled") {
      sessionStorage.removeItem("wf_pending_order");
      showPaymentCancelled();
    }
  }

  function showPaymentView(html) {
    $("checkout-section").classList.remove("active");
    var conf = $("confirmation-view");
    conf.classList.add("active");
    conf.innerHTML = html;
  }

  async function showPaymentSuccess(orderId, email, amount) {
    showPaymentView(
      '<div style="font-size:48px;text-align:center;margin-bottom:16px;">\u231B</div>' +
        '<h2 style="text-align:center;margin-bottom:8px;">Verifying Payment</h2>' +
        '<p style="text-align:center;color:var(--muted);margin:8px 0 20px;">Checking your order status\u2026</p>' +
        '<div style="text-align:center;"><div class="spinner" style="display:inline-block;width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;"></div></div>',
    );

    /* Poll for order to be marked as paid (webhook may still be processing) */
    var maxAttempts = 60;
    for (var i = 0; i < maxAttempts; i++) {
      try {
        var res = await fetch(TICKET_FN + "/check-order", {
          method: "POST",
          headers: ANON_H,
          body: JSON.stringify({ order_id: orderId }),
        });
        var data = await res.json();

        if (data.success && data.status === "paid") {
          if (data.tickets_count === 0) {
            /* Paid but no tickets — webhook failed during ticket creation.
               Show warning and point user to email/contact support. */
            showPaymentView(
              '<div style="font-size:48px;text-align:center;margin-bottom:16px;">\u2705</div>' +
                '<h2 style="text-align:center;margin-bottom:8px;">Payment Confirmed!</h2>' +
                '<p style="text-align:center;color:var(--muted);margin:8px 0 20px;">' +
                "Your payment of <strong>D" +
                (amount || data.total).toLocaleString() +
                "</strong> was successful." +
                "</p>" +
                '<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:16px;margin:16px 0;font-size:14px;">' +
                '<strong style="display:block;margin-bottom:4px;">\u26A0\uFE0F Tickets Being Generated</strong>' +
                '<p style="margin:0;color:#5d4037;">We received your payment but are still creating your tickets. This usually takes a moment. Check your email shortly — your tickets and QR codes will arrive there. If you don\u2019t see them within 15 minutes, contact us or visit the info desk at the venue.</p>' +
                "</div>" +
                '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">' +
                '<button class="btn btn-primary" onclick="location.reload()">Check Again</button>' +
                '<a href="/tickets" class="btn btn-secondary">Go to My Tickets</a>' +
                "</div>",
            );
            return;
          }

          var ticketWord = data.tickets_count === 1 ? "ticket" : "tickets";
          showPaymentView(
            '<div style="font-size:48px;text-align:center;margin-bottom:16px;">\u2705</div>' +
              '<h2 style="text-align:center;margin-bottom:8px;">Payment Confirmed!</h2>' +
              '<p style="text-align:center;color:var(--muted);margin:8px 0 20px;">' +
              "Your payment of <strong>D" +
              (amount || data.total).toLocaleString() +
              "</strong> was successful." +
              "</p>" +
              '<p style="text-align:center;font-size:14px;color:var(--muted);margin-bottom:20px;">' +
              "Check your email for " +
              ticketWord +
              " and QR codes." +
              "</p>" +
              '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">' +
              '<a href="/tickets" class="btn btn-primary">View My Tickets</a>' +
              '<a href="/top-up" class="btn btn-secondary">Top Up Credits</a>' +
              "</div>",
          );
          return;
        }
      } catch (e) {
        // Ignore transient errors, keep polling
      }
      await new Promise(function (r) {
        setTimeout(r, 1000);
      });
    }

    /* Timeout — webhook may be delayed. Show manual refresh option. */
    showPaymentView(
      '<div style="font-size:48px;text-align:center;margin-bottom:16px;">\uD83D\uDCE7</div>' +
        '<h2 style="text-align:center;margin-bottom:8px;">Payment Received</h2>' +
        '<p style="text-align:center;color:var(--muted);margin:8px 0 20px;">' +
        "Your payment was successful but we\u2019re still processing. Tickets will arrive by email shortly." +
        "</p>" +
        '<p style="text-align:center;font-size:13px;color:var(--muted);margin-bottom:20px;">' +
        "If your tickets don\u2019t appear within 15 minutes, please contact us at the venue info desk or email <a href=\"mailto:support@walkingfish.gm\" style=\"color:var(--accent);\">support@walkingfish.gm</a>." +
        "</p>" +
        '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">' +
        '<button class="btn btn-primary" onclick="location.reload()">Check Again</button>' +
        '<a href="/tickets" class="btn btn-secondary">Go to Tickets</a>' +
        "</div>",
    );
  }

  function showPaymentCancelled() {
    showPaymentView(
      '<div style="font-size:48px;text-align:center;margin-bottom:16px;">\u274C</div>' +
        '<h2 style="text-align:center;margin-bottom:8px;">Payment Cancelled</h2>' +
        '<p style="text-align:center;color:var(--muted);margin:8px 0 20px;">' +
        "Your payment was cancelled. No charges were made." +
        "</p>" +
        '<button class="btn btn-primary" id="cancel-retry-btn" style="width:100%;">Try Again</button>',
    );
    $("cancel-retry-btn").addEventListener("click", function () {
      $("confirmation-view").classList.remove("active");
      $("checkout-section").classList.add("active");
    });
  }

  /* ─── Helper: rebuild login form after token exchange error ─────── */

  function rebuildLoginForm(msg) {
    var prompt = $("dashboard-login-prompt");
    if (!prompt) return;
    prompt.style.display = "block";
    prompt.innerHTML =
      '<div class="error-message">' +
      escHtml(msg) +
      '</div><p style="font-size:14px;color:var(--muted);margin:16px 0;">You can also request a fresh magic link using the form below.</p>' +
      '<div class="login-form">' +
      '<input type="email" id="dashboard-email" placeholder="you@example.com" required>' +
      '<button class="btn btn-primary" id="dashboard-login-btn">Send Magic Link</button>' +
      '<div id="dashboard-login-msg" style="font-size:13px;color:var(--muted);"></div>' +
      "</div>";
    var btn = $("dashboard-login-btn");
    var input = $("dashboard-email");
    if (btn) btn.addEventListener("click", sendMagicLink);
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") sendMagicLink();
      });
    }
  }

  /* ─── Persistent token magic link handler ─────────────────────────── */

  async function checkTicketToken() {
    var params = new URLSearchParams(window.location.search);
    var ticketToken = params.get("ticket_token");

    if (!ticketToken) return;

    /* Immediately switch to dashboard tab with visible loading state */
    document.querySelectorAll("[data-tab]").forEach(function (t) {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    var dashTab = document.querySelector('[data-tab="dashboard"]');
    if (dashTab) {
      dashTab.classList.add("active");
      dashTab.setAttribute("aria-selected", "true");
    }
    $("shop-view").style.display = "none";
    $("dashboard-view").classList.add("active");

    /* Show visible loading state in the dashboard login prompt */
    var loginPrompt = $("dashboard-login-prompt");
    if (loginPrompt) {
      loginPrompt.style.display = "block";
      loginPrompt.innerHTML =
        '<div class="loading-spinner"><div class="spinner"></div><p style="margin-top:12px;">Signing you in\u2026</p></div>';
    }

    try {
      var res = await fetch(TICKET_FN + "/exchange-token", {
        method: "POST",
        headers: ANON_H,
        body: JSON.stringify({ ticket_token: ticketToken }),
      });

      var data = await res.json();

      if (res.ok && data.success && data.action_link) {
        /* Redirect the browser to the action_link URL.
         * Supabase Auth will process the magic link (GET redirect),
         * create a session, and redirect back to /tickets#access_token=xxx
         * The checkLoginHash() function in init() will parse the tokens
         * from the URL hash and load the dashboard. */
        window.location.href = data.action_link;
        return;
      } else {
        /* Token exchange failed — show error with login form retry */
        rebuildLoginForm(data.error || "Link expired. Please request a new one.");
      }
    } catch (err) {
      console.error("[tickets] checkTicketToken:", err);
      rebuildLoginForm("Something went wrong. Please try again or request a new link.");
    }
  }

  /* ─── Helpers ──────────────────────────────────────────────────── */

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (_) {
      return iso;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════════════════════ */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

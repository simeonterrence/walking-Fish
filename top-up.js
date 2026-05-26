/* top-up.js — Piroake Fest 2026 Self-Service Top-Up
 *
 * Allows users to top-up activity credit tickets by entering their ticket code.
 * Supports ModemPay (online payment simulation) and Wave Transfer (manual).
 *
 * Views: landing (code entry) → loading → form (bundles, amount, payment) → success
 *
 * API:
 *   POST /functions/v1/ticketing/lookup-ticket
 *   POST /functions/v1/ticketing/create-order
 *   POST /functions/v1/ticketing/create-intent
 *   POST /functions/v1/ticketing/webhook
 *   GET  /rest/v1/top_up_bundles?is_active=eq.true&order=sort_order.asc
 *   GET  /rest/v1/system_config?key=eq.balance_cap
 */
(function () {
  'use strict';

  const TICKET_FN = SUPABASE_URL + '/functions/v1/ticketing';
  const ANON_H = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };

  /* ─── State ─────────────────────────────────────────────────────────────── */
  let ticket = null;            // Current looked-up ticket
  let bundles = [];             // top_up_bundles from DB
  let balanceCap = 5000;        // From system_config
  let selectedAmount = 0;       // D
  let selectedBundleIdx = -1;
  let selectedPayment = 'modempay';
  let orderId = null;
  let orderTotal = 0;

  const $ = function (id) { return document.getElementById(id); };

  /* ─── Init ──────────────────────────────────────────────────────────────── */
  function init() {
    // Check for return from ModemPay before anything else
    if (checkPaymentReturn()) return;
    setupLookup();
    setupForm();
    showView('landing');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 1 — TICKET LOOKUP
     ═══════════════════════════════════════════════════════════════════════════ */

  function setupLookup() {
    var codeInput = $('topup-code-input');
    var goBtn = $('topup-lookup-btn');
    var errorBack = $('topup-error-back-btn');

    if (!codeInput || !goBtn) return;

    codeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') lookupTicket();
    });
    goBtn.addEventListener('click', lookupTicket);

    if (errorBack) {
      errorBack.addEventListener('click', function () {
        $('topup-code-input').value = '';
        $('topup-code-input').focus();
        showView('landing');
      });
    }

    // Auto-focus code input
    codeInput.focus();
  }

  async function lookupTicket() {
    var codeInput = $('topup-code-input');
    if (!codeInput) return;
    var code = codeInput.value.trim().toUpperCase();
    if (!code) return;

    // Normalize: add TKT- prefix if missing
    if (!code.startsWith('TKT-')) code = 'TKT-' + code;
    codeInput.value = code;

    hideError('topup-landing-error');
    showView('loading');

    try {
      var res = await fetch(TICKET_FN + '/lookup-ticket', {
        method: 'POST',
        headers: ANON_H,
        body: JSON.stringify({ code: code })
      });
      var data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ticket not found');
      }

      ticket = data.ticket;

      // Must be an activity credit ticket
      if (ticket.type !== 'activity_credit') {
        $('topup-error').querySelector('p').textContent =
          'This ticket is not an activity pass. Only activity credit tickets can be topped up.';
        showView('error');
        return;
      }

      if (ticket.status !== 'active') {
        $('topup-error').querySelector('p').textContent =
          'This ticket is ' + ticket.status + ' and cannot be topped up.';
        showView('error');
        return;
      }

      renderTicketInfo();
      await loadBundlesAndCap();
      showView('form');

    } catch (err) {
      console.error('[topup] lookupTicket:', err);
      showView('error');
    }
  }

  function renderTicketInfo() {
    var tt = ticket.ticket_type || {};
    var typeName = tt.name || 'Activity Pass';
    $('topup-ticket-name').textContent = typeName;
    $('topup-ticket-code').textContent = ticket.code;
    $('topup-ticket-meta').textContent = 'Activity Credit';
    $('topup-current-balance').textContent = 'D' + (ticket.balance || 0).toLocaleString();
    $('topup-cap-note').textContent = 'Max D' + balanceCap.toLocaleString();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 2 — BUNDLES & BALANCE CAP
     ═══════════════════════════════════════════════════════════════════════════ */

  async function loadBundlesAndCap() {
    try {
      var [bundlesRes, capRes] = await Promise.all([
        fetch(SUPABASE_URL + '/rest/v1/top_up_bundles?is_active=eq.true&order=sort_order.asc', {
          headers: { apikey: SUPABASE_ANON_KEY }
        }),
        fetch(SUPABASE_URL + '/rest/v1/system_config?key=eq.balance_cap&select=value', {
          headers: { apikey: SUPABASE_ANON_KEY }
        })
      ]);

      if (bundlesRes.ok) {
        bundles = await bundlesRes.json();
      } else {
        bundles = getFallbackBundles();
      }

      if (capRes.ok) {
        var configs = await capRes.json();
        if (configs && configs.length > 0) {
          balanceCap = parseInt(configs[0].value, 10) || 5000;
        }
      }

      renderBundles();
    } catch (err) {
      console.error('[topup] loadBundles:', err);
      bundles = getFallbackBundles();
      renderBundles();
    }
  }

  function getFallbackBundles() {
    return [
      { id: 'fb-100', amount: 100, sort_order: 1 },
      { id: 'fb-200', amount: 200, sort_order: 2 },
      { id: 'fb-500', amount: 500, sort_order: 3 },
      { id: 'fb-1000', amount: 1000, sort_order: 4 },
      { id: 'fb-2000', amount: 2000, sort_order: 5 },
    ];
  }

  function renderBundles() {
    var container = $('topup-bundles');
    if (!container) return;

    container.innerHTML = bundles.map(function (b, i) {
      var selected = selectedBundleIdx === i ? ' selected' : '';
      return '<button class="bundle-btn' + selected + '" data-idx="' + i + '">'
        + '<div class="amt">D' + b.amount.toLocaleString() + '</div>'
        + (b.amount >= 1000 ? '<div class="lbl-adj">Best value</div>' : '')
        + '</button>';
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 3 — FORM LOGIC
     ═══════════════════════════════════════════════════════════════════════════ */

  function setupForm() {
    /* Bundle click delegation */
    var bundleContainer = $('topup-bundles');
    if (bundleContainer) {
      bundleContainer.addEventListener('click', function (e) {
        var btn = e.target.closest('.bundle-btn');
        if (!btn) return;
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (!isNaN(idx)) selectBundle(idx);
      });
    }

    /* Custom amount input */
    var customInput = $('topup-custom-amount');
    if (customInput) {
      customInput.addEventListener('input', function () {
        var val = parseInt(this.value, 10) || 0;
        if (val > 0 && selectedBundleIdx >= 0) {
          selectedBundleIdx = -1;
          renderBundles();
        }
        selectedAmount = val >= 50 ? Math.min(val, balanceCap) : 0;
        updateSummary();
      });
    }

    /* Payment method selection */
    document.querySelectorAll('[data-payment]').forEach(function (el) {
      el.addEventListener('click', function () {
        document.querySelectorAll('[data-payment]').forEach(function (p) {
          p.classList.remove('selected');
          var radio = p.querySelector('input[type="radio"]');
          if (radio) radio.checked = false;
        });
        el.classList.add('selected');
        var radio = el.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        selectedPayment = el.getAttribute('data-payment');
        var waveDetails = $('topup-wave-details');
        if (waveDetails) waveDetails.classList.toggle('active', selectedPayment === 'wave');
        updatePayButton();
      });
    });

    /* Pay button */
    var payBtn = $('topup-pay-btn');
    if (payBtn) payBtn.addEventListener('click', handlePay);
  }

  function selectBundle(idx) {
    selectedBundleIdx = idx;
    selectedAmount = 0;
    var customInput = $('topup-custom-amount');
    if (customInput) customInput.value = '';
    document.querySelectorAll('.bundle-btn').forEach(function (b) { b.classList.remove('selected'); });
    var btn = document.querySelector('.bundle-btn[data-idx="' + idx + '"]');
    if (btn) btn.classList.add('selected');
    renderBundles();
    updateSummary();
  }

  function getAmount() {
    if (selectedBundleIdx >= 0 && selectedBundleIdx < bundles.length) {
      return bundles[selectedBundleIdx].amount;
    }
    return selectedAmount;
  }

  function updateSummary() {
    var amount = getAmount();
    var currentBalance = ticket ? (ticket.balance || 0) : 0;
    var newBalance = currentBalance + amount;
    var valid = amount >= 50;

    var chargeEl = $('topup-charge-amount');
    if (chargeEl) chargeEl.textContent = 'D' + amount.toLocaleString();

    var balanceAfter = $('topup-balance-after');
    if (balanceAfter) {
      balanceAfter.innerHTML = 'Balance after: <strong>D' + newBalance.toLocaleString() + '</strong>';
    }

    var capCheck = $('topup-cap-check');
    if (capCheck) {
      if (newBalance > balanceCap) {
        capCheck.textContent = 'Exceeds max balance of D' + balanceCap.toLocaleString();
        capCheck.style.color = '#c53030';
        valid = false;
      } else if (amount > 0) {
        capCheck.textContent = 'Within limit';
        capCheck.style.color = 'var(--accent-text)';
      } else {
        capCheck.textContent = '';
      }
    }

    updatePayButton(valid);
  }

  function updatePayButton(validOverride) {
    var btn = $('topup-pay-btn');
    if (!btn) return;
    var amount = getAmount();
    var valid = amount >= 50;
    if (validOverride !== undefined) valid = validOverride;
    btn.disabled = !valid;

    if (valid) {
      if (selectedPayment === 'wave') {
        btn.textContent = 'Send D' + amount.toLocaleString() + ' & Confirm';
      } else {
        btn.textContent = 'D' + amount.toLocaleString() + ' — Top Up Now';
      }
    } else {
      btn.textContent = 'Select an amount';
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 4 — PAYMENT HANDLING
     ═══════════════════════════════════════════════════════════════════════════ */

  async function handlePay() {
    var amount = getAmount();
    var btn = $('topup-pay-btn');
    var errEl = $('topup-pay-error');
    if (!btn || !errEl) return;

    errEl.style.display = 'none';

    if (amount < 50) {
      errEl.textContent = 'Minimum top-up is D50.';
      errEl.style.display = 'block';
      return;
    }

    var newBalance = (ticket.balance || 0) + amount;
    if (newBalance > balanceCap) {
      errEl.textContent = 'This would exceed the max balance of D' + balanceCap.toLocaleString() + '.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Processing\u2026';
    orderTotal = amount;

    try {
      /* 1. Create order with purpose=top-up */
      var orderRes = await fetch(TICKET_FN + '/create-order', {
        method: 'POST',
        headers: ANON_H,
        body: JSON.stringify({
          email: ticket.customer_email || 'guest@walkingfish.gm',
          customer_name: ticket.customer_name || '',
          purpose: 'top-up',
          ticket_code: ticket.code,
          topup_amount: amount,
          items: []
        })
      });
      var orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success) {
        throw new Error(orderData.error || 'Failed to create order');
      }

      orderId = orderData.order_id;

      if (selectedPayment === 'modempay') {
        await handleModemPay();
      } else {
        await handleWave();
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Top Up Now';
    }
  }

  /* ─── ModemPay Flow ─────────────────────────────────────────────────────── */

  async function handleModemPay() {
    var btn = $('topup-pay-btn');

    /* 2. Create payment intent */
    var intentRes = await fetch(TICKET_FN + '/create-intent', {
      method: 'POST',
      headers: ANON_H,
      body: JSON.stringify({
        order_id: orderId,
        amount: orderTotal,
        email: ticket.customer_email || 'guest@walkingfish.gm',
        description: 'Top-up for ticket ' + ticket.code,
        purpose: 'top-up',
        ticket_code: ticket.code
      })
    });
    var intentData = await intentRes.json();
    if (!intentRes.ok || !intentData.success) {
      throw new Error(intentData.error || 'Failed to create payment intent');
    }

    /* 3. Save pending order to detect return from ModemPay */
    sessionStorage.setItem('wf_pending_topup', JSON.stringify({
      order_id: orderId,
      ticket_code: ticket.code,
      amount: orderTotal,
      current_balance: ticket.balance || 0
    }));

    /* 4. Redirect to ModemPay hosted payment page */
    window.location.href = intentData.payment_url;
  }

  /* ─── Wave Transfer Flow ────────────────────────────────────────────────── */

  async function handleWave() {
    $('topup-form-container').classList.remove('active');

    var conf = document.createElement('div');
    conf.id = 'topup-payment-view';
    conf.style.cssText = 'max-width:520px;margin:0 auto;padding:40px 20px;text-align:center;';

    conf.innerHTML =
      '<div style="font-size:48px;margin-bottom:16px;">\uD83D\uDCCB</div>'
      + '<h2 style="margin-bottom:8px;">Top-Up Requested</h2>'
      + '<p style="font-size:14px;color:var(--muted);margin:8px 0 20px;">'
      +   'Please send <strong>D' + orderTotal.toLocaleString() + '</strong> to one of the following:'
      + '</p>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;">'
      +   '<div style="background:var(--accent-dim);border-radius:var(--radius);padding:16px;text-align:center;">'
      +     '<div style="font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;">Wave</div>'
      +     '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;margin-top:4px;">+220 696 3419</div>'
      +   '</div>'
      +   '<div style="background:var(--accent-dim);border-radius:var(--radius);padding:16px;text-align:center;">'
      +     '<div style="font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;">Bank</div>'
      +     '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;margin-top:4px;">206370720110</div>'
      +   '</div>'
      + '</div>'
      + '<p style="font-size:13px;color:var(--muted);">'
      +   'Reference: <strong>' + ticket.code + '</strong><br>'
      +   'Include your ticket code so we can match your payment.'
      + '</p>'
      + '<p style="font-size:13px;color:var(--muted);margin-top:16px;">'
      +   'Credit applied after manual verification. You\u2019ll receive a confirmation email.'
      + '</p>'
      + '<div style="display:flex;gap:12px;margin-top:20px;">'
      +   '<button class="btn btn-primary" id="topup-wave-done-btn" style="flex:1;">I\u2019ve Sent Payment</button>'
      +   '<a href="/top-up" class="btn btn-secondary" style="flex:1;text-align:center;">Back to Top-Up</a>'
      + '</div>';

    $('topup-form-container').parentNode.insertBefore(conf, $('topup-form-container').nextSibling);

    $('topup-wave-done-btn').addEventListener('click', function () {
      if (conf.parentNode) conf.parentNode.removeChild(conf);
      showSuccess((ticket.balance || 0) + orderTotal, 'pending');
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 5 — SUCCESS VIEW
     ═══════════════════════════════════════════════════════════════════════════ */

  function showSuccess(newBalance, status) {
    var paymentView = $('topup-payment-view');
    if (paymentView) paymentView.remove();

    $('topup-new-balance').textContent = 'D' + newBalance.toLocaleString();

    var msg = $('topup-success-msg');
    if (msg) {
      if (status === 'pending') {
        msg.textContent =
          'Your payment is being verified. You\u2019ll receive a confirmation email once approved.';
      } else {
        msg.textContent =
          'Your credits have been added. Check your email for the receipt.';
      }
    }

    showView('success');

    // Fire confetti via gift.js
    if (typeof giftConfetti === 'function') {
      setTimeout(function () {
        var box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999;';
        document.body.appendChild(box);
        giftConfetti(box);
        setTimeout(function () { box.remove(); }, 3000);
      }, 400);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 6 — VIEW MANAGEMENT
     ═══════════════════════════════════════════════════════════════════════════ */

  function showView(view) {
    var landing   = $('topup-landing');
    var loading   = $('topup-loading');
    var error     = $('topup-error');
    var form      = $('topup-form-container');
    var success   = $('topup-success');

    // Hide all
    if (landing) landing.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'none';
    if (form) form.classList.remove('active');
    if (success) success.style.display = 'none';

    // Show target
    switch (view) {
      case 'landing':
        if (landing) landing.style.display = '';
        break;
      case 'loading':
        if (loading) loading.style.display = '';
        break;
      case 'error':
        if (error) error.style.display = '';
        break;
      case 'form':
        if (form) form.classList.add('active');
        break;
      case 'success':
        if (success) success.style.display = '';
        break;
    }

    // Remove any dynamic payment views
    var paymentView = $('topup-payment-view');
    if (paymentView && view !== 'form') paymentView.remove();
  }

  function hideError(id) {
    var el = $(id);
    if (el) el.style.display = 'none';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION 7 — MODEMPAY RETURN HANDLING
     ═══════════════════════════════════════════════════════════════════════════ */

  function checkPaymentReturn() {
    var params = new URLSearchParams(window.location.search);
    var payment = params.get('payment');

    if (payment === 'success') {
      var pendingRaw = sessionStorage.getItem('wf_pending_topup');
      if (pendingRaw) {
        try {
          var pending = JSON.parse(pendingRaw);
          sessionStorage.removeItem('wf_pending_topup');
          handleTopupReturn(pending);
        } catch (e) {
          window.history.replaceState({}, document.title, '/top-up');
        }
      } else {
        window.history.replaceState({}, document.title, '/top-up');
      }
      return true;
    }

    if (payment === 'cancelled') {
      sessionStorage.removeItem('wf_pending_topup');
      showView('landing');
      window.history.replaceState({}, document.title, '/top-up');
      return true;
    }

    return false;
  }

  async function handleTopupReturn(pending) {
    /* Show loading state in the form area */
    showView('loading');
    $('topup-loading').querySelector('p').textContent = 'Verifying payment\u2026';

    /* Poll for order confirmation */
    var maxAttempts = 30;
    for (var i = 0; i < maxAttempts; i++) {
      try {
        var res = await fetch(TICKET_FN + '/check-order', {
          method: 'POST',
          headers: ANON_H,
          body: JSON.stringify({ order_id: pending.order_id })
        });
        var data = await res.json();

        if (data.success && data.status === 'paid') {
          var newBalance = (pending.current_balance || 0) + pending.amount;
          window.history.replaceState({}, document.title, '/top-up');
          showSuccess(newBalance);
          return;
        }
      } catch (e) {
        // Keep polling
      }
      await new Promise(function (r) { setTimeout(r, 1000); });
    }

    /* Timeout — show persistent banner instead of clean landing */
    window.history.replaceState({}, document.title, '/top-up');
    showView('landing');
    // Show a persistent banner above the code input
    var banner = document.createElement('div');
    banner.id = 'topup-process-banner';
    banner.style.cssText = 'background:var(--accent-dim);border:1px solid var(--accent);border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;';
    banner.innerHTML = '<div style="font-size:28px;margin-bottom:8px;">\uD83D\uDCE7</div>'
      + '<p style="font-size:14px;font-weight:500;margin:0 0 4px;">Payment Received — Still Processing</p>'
      + '<p style="font-size:13px;color:var(--muted);margin:0 0 12px;">Your top-up of <strong>D' + pending.amount.toLocaleString() + '</strong> was successful but we\u2019re still applying the credits. This usually takes just a moment.</p>'
      + '<button class="btn btn-primary" style="font-size:13px;padding:8px 20px;" onclick="location.reload()">Check Now</button>';
    var landing = $('topup-landing');
    if (landing) {
      landing.insertBefore(banner, landing.firstChild);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

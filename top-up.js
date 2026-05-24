// top-up.js — Piroake Fest Self-Service Top-Up
// Handles: ticket lookup by code, bundle selection, balance cap, ModemPay/Wave payment

(function() {
  'use strict';

  var SUPA_URL = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://anigcqdquakinlzvyaur.supabase.co';
  var SUPA_ANON = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';
  var EDGE_URL = SUPA_URL + '/functions/v1/ticketing';

  // ─── State ────────────────────────────────────────────────────────────────
  var state = {
    ticket: null,           // Currently loaded ticket
    bundles: [],            // Top-up bundles from table
    selectedBundleId: null, // ID of selected bundle (null for custom)
    customAmount: 0,        // Custom amount input
    selectedPayment: 'modempay',
    balanceCap: 5000,       // From system_config
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatCurrency(amount) {
    return 'D' + Number(amount).toLocaleString();
  }

  function show(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) el.style.display = '';
  }

  function hide(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) el.style.display = 'none';
  }

  function showError(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideError(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function getTopupAmount() {
    // Determine the selected amount: bundle or custom
    if (state.selectedBundleId) {
      var bundle = state.bundles.find(function(b) { return b.id === state.selectedBundleId; });
      if (bundle) return bundle.amount;
    }
    return state.customAmount;
  }

  // ─── Supabase REST helpers ────────────────────────────────────────────────

  function fetchFromSupabase(path) {
    return fetch(SUPA_URL + path, {
      headers: {
        'apikey': SUPA_ANON,
        'Authorization': 'Bearer ' + SUPA_ANON,
        'Accept': 'application/json',
      }
    }).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'Request failed'); });
      return r.json();
    });
  }

  // ─── Screen Display ───────────────────────────────────────────────────────

  function showLanding() {
    hide('topup-loading');
    hide('topup-error');
    hide('topup-form-container');
    hide('topup-success');
    show('topup-landing');
  }

  function showLoading() {
    hide('topup-landing');
    hide('topup-error');
    hide('topup-form-container');
    hide('topup-success');
    show('topup-loading');
  }

  function showErrorScreen() {
    hide('topup-landing');
    hide('topup-loading');
    hide('topup-form-container');
    hide('topup-success');
    show('topup-error');
  }

  function showForm() {
    hide('topup-landing');
    hide('topup-loading');
    hide('topup-error');
    hide('topup-success');
    show('topup-form-container');
  }

  function showSuccess() {
    hide('topup-landing');
    hide('topup-loading');
    hide('topup-error');
    hide('topup-form-container');
    show('topup-success');
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  function init() {
    loadBundles();
    loadBalanceCap();
    initEventListeners();

    // Check for ?t= query param
    var params = new URLSearchParams(window.location.search);
    var code = params.get('t');
    if (code) {
      document.getElementById('topup-code-input').value = code;
      lookupTicket(code);
    }
  }

  function loadBundles() {
    fetchFromSupabase('/rest/v1/top_up_bundles?select=id,amount,is_active,sort_order&is_active=eq.true&order=sort_order.asc')
      .then(function(bundles) {
        state.bundles = bundles || [];
        renderBundles();
      })
      .catch(function(err) {
        console.error('[top-up] Failed to load bundles:', err.message);
        // Fallback bundles if table not available
        state.bundles = [
          { id: 'fallback-100', amount: 100 },
          { id: 'fallback-200', amount: 200 },
          { id: 'fallback-500', amount: 500 },
          { id: 'fallback-1000', amount: 1000 },
        ];
        renderBundles();
      });
  }

  function loadBalanceCap() {
    fetchFromSupabase('/rest/v1/system_config?select=key,value&key=eq.balance_cap&limit=1')
      .then(function(configs) {
        if (configs && configs.length > 0) {
          state.balanceCap = parseInt(configs[0].value, 10) || 5000;
          var capNote = document.getElementById('topup-cap-note');
          if (capNote) capNote.textContent = 'Max ' + formatCurrency(state.balanceCap);
        }
      })
      .catch(function(err) {
        console.warn('[top-up] Failed to load balance cap, using default:', err.message);
      });
  }

  // ─── Ticket Lookup ────────────────────────────────────────────────────────

  function lookupTicket(code) {
    if (!code || code.trim().length < 6) {
      showError('topup-landing-error', 'Please enter a valid ticket code.');
      return;
    }

    hideError('topup-landing-error');
    showLoading();

    var normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode.startsWith('TKT-')) {
      normalizedCode = 'TKT-' + normalizedCode;
    }

    fetch(EDGE_URL + '/lookup-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body: JSON.stringify({ code: normalizedCode }),
    })
    .then(function(r) {
      if (r.status === 404) {
        showErrorScreen();
        return null;
      }
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Lookup failed'); });
      return r.json();
    })
    .then(function(data) {
      if (!data || !data.success) {
        showErrorScreen();
        return;
      }

      state.ticket = data.ticket;

      // Check ticket type — only activity credits can be topped up
      if (state.ticket.type !== 'activity_credit') {
        showError('topup-error', 'This ticket type cannot be topped up.');
        showErrorScreen();
        return;
      }

      // Check status
      if (state.ticket.status !== 'active') {
        showErrorScreen();
        return;
      }

      renderTicketInfo();
      showForm();
    })
    .catch(function(err) {
      console.error('[top-up] Lookup error:', err.message);
      showError('topup-landing-error', err.message || 'Failed to look up ticket. Please try again.');
      showLanding();
    });
  }

  // ─── Render Ticket Info ───────────────────────────────────────────────────

  function renderTicketInfo() {
    var t = state.ticket;
    if (!t) return;

    var nameEl = document.getElementById('topup-ticket-name');
    var codeEl = document.getElementById('topup-ticket-code');
    var metaEl = document.getElementById('topup-ticket-meta');
    var balanceEl = document.getElementById('topup-current-balance');
    var capNoteEl = document.getElementById('topup-cap-note');

    if (nameEl) nameEl.textContent = t.ticket_type ? t.ticket_type.name : 'Activity Credit';
    if (codeEl) codeEl.textContent = t.code;
    if (metaEl) metaEl.textContent = 'Activity Credit — ' + escapeHtml(t.ticket_type ? t.ticket_type.name : '');
    if (balanceEl) balanceEl.textContent = formatCurrency(t.balance);
    if (capNoteEl) capNoteEl.textContent = 'Max ' + formatCurrency(state.balanceCap);
  }

  // ─── Render Bundles ───────────────────────────────────────────────────────

  function renderBundles() {
    var container = document.getElementById('topup-bundles');
    if (!container) return;

    if (state.bundles.length === 0) {
      container.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:16px 0;">No bundles available. Use custom amount below.</p>';
      return;
    }

    var html = '';
    state.bundles.forEach(function(bundle) {
      var isSelected = state.selectedBundleId === bundle.id;
      html += '<button class="bundle-btn' + (isSelected ? ' selected' : '') + '" data-bundle-id="' + bundle.id + '" data-amount="' + bundle.amount + '">' +
        '<div class="amt">' + formatCurrency(bundle.amount) + '</div>' +
      '</button>';
    });

    container.innerHTML = html;
  }

  // ─── Amount Selection ─────────────────────────────────────────────────────

  function selectBundle(id) {
    state.selectedBundleId = id;
    state.customAmount = 0;

    // Clear custom input
    var customInput = document.getElementById('topup-custom-amount');
    if (customInput) customInput.value = '';

    renderBundles();
    updateSummary();
  }

  function selectCustomAmount(amount) {
    state.selectedBundleId = null;
    state.customAmount = Math.max(0, parseInt(amount, 10) || 0);

    renderBundles();
    updateSummary();
  }

  function updateSummary() {
    var amount = getTopupAmount();
    var chargeEl = document.getElementById('topup-charge-amount');
    var afterEl = document.getElementById('topup-balance-after');
    var capCheckEl = document.getElementById('topup-cap-check');
    var payBtn = document.getElementById('topup-pay-btn');

    if (chargeEl) chargeEl.textContent = formatCurrency(amount);

    if (state.ticket && afterEl) {
      var newBalance = (state.ticket.balance || 0) + amount;
      afterEl.innerHTML = 'Balance after: <strong>' + formatCurrency(newBalance) + '</strong>';

      if (capCheckEl) {
        if (newBalance > state.balanceCap) {
          capCheckEl.innerHTML = 'Exceeds max balance by ' + formatCurrency(newBalance - state.balanceCap);
          capCheckEl.style.color = '#c53030';
          if (payBtn) payBtn.disabled = true;
        } else {
          capCheckEl.innerHTML = 'Within limit';
          capCheckEl.style.color = '#2f855a';
          if (payBtn) payBtn.disabled = amount < 50;
        }
      }
    } else {
      if (payBtn) payBtn.disabled = amount < 50;
    }

    // Update Wave amount
    var waveAmt = document.getElementById('topup-wave-details');
    if (waveAmt && waveAmt.querySelector('.topup-wave-number')) {
      var existing = waveAmt.querySelector('.amount-display');
      if (existing) existing.textContent = 'Amount: ' + formatCurrency(amount);
    }

    // Disable pay button if amount is 0 or below minimum
    if (payBtn && amount < 50) {
      payBtn.disabled = true;
    }
  }

  // ─── Payment ──────────────────────────────────────────────────────────────

  function handlePay() {
    var amount = getTopupAmount();
    var payBtn = document.getElementById('topup-pay-btn');
    hideError('topup-pay-error');

    if (amount < 50) {
      showError('topup-pay-error', 'Minimum top-up is D50.');
      return;
    }

    if (!state.ticket) {
      showError('topup-pay-error', 'No ticket loaded. Please look up your ticket first.');
      return;
    }

    var newBalance = (state.ticket.balance || 0) + amount;
    if (newBalance > state.balanceCap) {
      showError('topup-pay-error', 'This top-up would exceed the maximum balance of ' + formatCurrency(state.balanceCap) + '.');
      return;
    }

    if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Processing…'; }

    if (state.selectedPayment === 'modempay') {
      handleModemPay(amount);
    } else {
      handleWave(amount);
    }
  }

  function handleModemPay(amount) {
    var ticketCode = state.ticket.code;

    // Create a minimal order for the top-up, then initiate ModemPay intent
    fetch(EDGE_URL + '/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body: JSON.stringify({
        email: state.ticket.customer_email || 'topup@walkingfish.gm',
        customer_name: state.ticket.customer_name || '',
        items: [{ ticket_type_id: state.ticket.ticket_type_id, quantity: 0 }],
        purpose: 'top-up',
        ticket_code: ticketCode,
        topup_amount: amount,
      }),
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Order creation failed'); });
      return r.json();
    })
    .then(function(orderData) {
      if (!orderData.success) throw new Error(orderData.error || 'Order creation failed');

      // Create payment intent with top-up metadata
      return fetch(EDGE_URL + '/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
        body: JSON.stringify({
          order_id: orderData.order_id,
          amount: amount,
          email: state.ticket.customer_email || 'topup@walkingfish.gm',
          description: 'Piroake Fest top-up — ' + ticketCode,
          purpose: 'top-up',
          ticket_code: ticketCode,
        }),
      })
      .then(function(r) {
        if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Payment initiation failed'); });
        return r.json();
      })
      .then(function(intentData) {
        if (intentData.payment_url) {
          // Store pending info in sessionStorage for success screen on return
          try {
            sessionStorage.setItem('wf_topup_pending', JSON.stringify({
              amount: amount,
              ticketCode: ticketCode,
              newBalance: (state.ticket.balance || 0) + amount,
              email: state.ticket.customer_email,
            }));
          } catch (e) {}
          window.location.href = intentData.payment_url;
        } else {
          throw new Error('No payment URL returned');
        }
      });
    })
    .catch(function(err) {
      showError('topup-pay-error', err.message || 'Payment failed. Please try again.');
      if (payBtn) { payBtn.disabled = false; payBtn.textContent = 'Top Up Now'; }
    });
  }

  function handleWave(amount) {
    var ticketCode = state.ticket.code;
    var email = state.ticket.customer_email || 'topup@walkingfish.gm';

    // Create order + payment proof for Wave Transfer
    fetch(EDGE_URL + '/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body: JSON.stringify({
        email: email,
        customer_name: state.ticket.customer_name || '',
        items: [{ ticket_type_id: state.ticket.ticket_type_id, quantity: 0 }],
        purpose: 'top-up',
        ticket_code: ticketCode,
        topup_amount: amount,
      }),
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Order creation failed'); });
      return r.json();
    })
    .then(function(orderData) {
      if (!orderData.success) throw new Error(orderData.error || 'Order creation failed');

      // Ask for Wave or Bank reference number
      var ref = prompt('Enter your Wave Transfer or Bank Transfer reference number:');
      if (!ref || !ref.trim()) {
        throw new Error('Reference number required for verification.');
      }

      // Submit payment proof
      var refNum = ref.trim();
      return fetch(SUPA_URL + '/rest/v1/payment_proofs', {
        method: 'POST',
        headers: {
          'apikey': SUPA_ANON,
          'Authorization': 'Bearer ' + SUPA_ANON,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify([{
          order_id: orderData.order_id,
          email: email,
          amount: amount,
          reference_number: refNum,
          notes: 'Self-service top-up for ticket ' + ticketCode,
        }]),
      })
      .then(function() {
        // Show success message with Wave pending info
        var newBalance = (state.ticket.balance || 0) + amount;
        showTopupSuccess(newBalance, 'wave', email);
      });
    })
    .catch(function(err) {
      showError('topup-pay-error', err.message || 'Failed to submit payment. Please try again.');
      var payBtn = document.getElementById('topup-pay-btn');
      if (payBtn) { payBtn.disabled = false; payBtn.textContent = 'Top Up Now'; }
    });
  }

  // ─── Success View ─────────────────────────────────────────────────────────

  function showTopupSuccess(newBalance, method, email) {
    var balanceEl = document.getElementById('topup-new-balance');
    var msgEl = document.getElementById('topup-success-msg');

    if (balanceEl) balanceEl.textContent = formatCurrency(newBalance);
    if (msgEl) {
      if (method === 'modempay' || method === 'redirect') {
        msgEl.textContent = 'Your credits have been added. Check your email for the receipt.';
      } else {
        msgEl.textContent = 'Your top-up is pending verification. We\'ll notify you once confirmed (usually within 24 hours).';
      }
    }

    showSuccess();

    // Reset state
    state.selectedBundleId = null;
    state.customAmount = 0;
  }

  // ─── Event Listeners ──────────────────────────────────────────────────────

  function initEventListeners() {
    // Lookup button
    var lookupBtn = document.getElementById('topup-lookup-btn');
    var codeInput = document.getElementById('topup-code-input');
    if (lookupBtn) {
      lookupBtn.addEventListener('click', function() {
        lookupTicket(codeInput ? codeInput.value : '');
      });
    }
    if (codeInput) {
      codeInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          lookupTicket(this.value);
        }
      });
    }

    // Error screen back button
    var errorBack = document.getElementById('topup-error-back-btn');
    if (errorBack) {
      errorBack.addEventListener('click', function() {
        showLanding();
      });
    }

    // Bundle selection (event delegation)
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.bundle-btn');
      if (btn) {
        selectBundle(btn.getAttribute('data-bundle-id'));
      }
    });

    // Custom amount input
    var customInput = document.getElementById('topup-custom-amount');
    if (customInput) {
      customInput.addEventListener('input', function() {
        selectCustomAmount(this.value);
      });
    }

    // Payment method selection
    var payRadios = $$('input[name="topup-payment"]');
    payRadios.forEach(function(radio) {
      radio.addEventListener('change', function() {
        state.selectedPayment = this.value;
        $$('.pay-option').forEach(function(el) { el.classList.remove('selected'); });
        var parent = this.closest('.pay-option');
        if (parent) parent.classList.add('selected');

        var waveDetails = document.getElementById('topup-wave-details');
        if (waveDetails) {
          waveDetails.classList.toggle('active', this.value === 'wave');
          // Update amount display in wave details
          if (this.value === 'wave') {
            var amountDisplay = waveDetails.querySelector('.amount-display');
            if (!amountDisplay) {
              var p = document.createElement('p');
              p.className = 'amount-display';
              p.style.cssText = 'font-size:13px;color:var(--muted);margin-bottom:4px;';
              waveDetails.insertBefore(p, waveDetails.querySelector('.topup-wave-number').nextSibling);
            }
            var existing = waveDetails.querySelector('.amount-display');
            if (existing) existing.textContent = 'Amount: ' + formatCurrency(getTopupAmount());
          }
        }
      });
    });

    // Pay button
    var payBtn = document.getElementById('topup-pay-btn');
    if (payBtn) {
      payBtn.addEventListener('click', handlePay);
    }

    // Check for returned-from-ModemPay pending top-up in sessionStorage
    try {
      var pending = sessionStorage.getItem('wf_topup_pending');
      if (pending) {
        sessionStorage.removeItem('wf_topup_pending');
        var data = JSON.parse(pending);
        showTopupSuccess(data.newBalance, 'modempay', data.email);
      }
    } catch (e) {}
  }

  // ─── Start ────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

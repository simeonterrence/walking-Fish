// scan.js — Piroake Fest Staff Scanner
// Handles: passcode auth, QR scanning, gate/debit/top-up/bulk modes
(function() {
  'use strict';

  const SUPA_URL = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://anigcqdquakinlzvyaur.supabase.co';
  const SUPA_ANON = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';
  const EDGE_URL = SUPA_URL + '/functions/v1/ticketing';

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    authenticated: false,
    scannerCode: null,
    scannerId: null,
    mode: null,           // 'gate' | 'debit' | 'topup' | 'bulk'
    currentTicket: null,  // Currently loaded ticket after scan/lookup
    cameraStream: null,
    scanningActive: false,
    barcodeDetector: null,
    bundles: [],          // Top-up bundles
    selectedBundleIdx: -1,
    customAmount: 0,
    balanceCap: 5000,
    crossTypeMode: 'scan', // 'scan' | 'new'
    pollingInterval: null,
  };

  // ─── DOM Refs (cached on init) ────────────────────────────────────────────
  let $ = {};
  // Will be populated in init()

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  function formatCurrency(amount) {
    return 'D' + Number(amount).toLocaleString();
  }

  function show(el) {
    if (typeof el === 'string') { el = document.getElementById(el); }
    if (el) { el.style.display = ''; el.classList.remove('hidden-elem'); }
  }

  function hide(el) {
    if (typeof el === 'string') { el = document.getElementById(el); }
    if (el) { el.style.display = 'none'; }
  }

  function showError(containerId, msg) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideError(containerId) {
    var el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
  }

  function loading(containerId, show) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = show
      ? '<div class="scanner-loading"><div class="spinner"></div></div>'
      : '';
  }

  function showResult(type, msg) {
    // type: 'success' | 'error' | 'info'
    var container = document.getElementById('scanner-result');
    if (!container) return;
    container.className = 'scanner-result ' + type;
    container.innerHTML = msg;
    container.style.display = 'block';
    setTimeout(function() {
      container.style.display = 'none';
    }, 6000);
  }

  // ─── Supabase REST Helper ─────────────────────────────────────────────────

  function supabaseGet(path) {
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

  function supabaseInsert(table, data) {
    return fetch(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        'apikey': SUPA_ANON,
        'Authorization': 'Bearer ' + SUPA_ANON,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(Array.isArray(data) ? data : [data]),
    }).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'Insert failed'); });
      return r.json();
    });
  }

  function callEdgeFunction(route, body) {
    return fetch(EDGE_URL + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body: JSON.stringify(body || {}),
    }).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Request failed'); });
      return r.json();
    });
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  function initPasscode() {
    var input = document.getElementById('passcode-input');
    if (!input) return;

    // Check for existing session
    try {
      var stored = sessionStorage.getItem('wf_scanner_session');
      if (stored) {
        var s = JSON.parse(stored);
        state.authenticated = true;
        state.scannerCode = s.code;
        state.scannerId = s.id;
        showModes();
        return;
      }
    } catch (e) {}

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        validatePasscode();
      }
    });

    // Also listen for the button if there's a submit button
    var submitBtn = document.querySelector('#scanner-passcode .btn, #passcode-input + button');
    if (!submitBtn) {
      // Auto-submit on blur after enough chars
      input.addEventListener('blur', function() {
        if (this.value.trim().length >= 4) validatePasscode();
      });
    }
  }

  function validatePasscode() {
    var input = document.getElementById('passcode-input');
    var errorEl = document.getElementById('passcode-error');
    if (!input) return;
    var code = input.value.trim();
    if (!code) {
      if (errorEl) { errorEl.textContent = 'Please enter your staff code.'; errorEl.style.display = 'block'; }
      return;
    }

    hideError('passcode-error');
    var btn = input.closest('.scanner-passcode').querySelector('button, .btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }

    callEdgeFunction('/staff-auth', { code: code })
      .then(function(data) {
        if (!data.success) throw new Error(data.error || 'Invalid code');
        state.authenticated = true;
        state.scannerCode = data.code;
        state.scannerId = data.id;
        try {
          sessionStorage.setItem('wf_scanner_session', JSON.stringify({ code: data.code, id: data.id, name: data.name || '' }));
        } catch (e) {}
        showModes();
      })
      .catch(function(err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'Invalid staff code. Please try again.';
          errorEl.style.display = 'block';
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
      });
  }

  function showModes() {
    hide('scanner-passcode');
    var modes = document.getElementById('scanner-modes');
    if (modes) modes.classList.add('active');
  }

  function lockScanner() {
    state.authenticated = false;
    state.scannerCode = null;
    state.scannerId = null;
    try { sessionStorage.removeItem('wf_scanner_session'); } catch (e) {}
    stopCamera();
    resetScannerView();

    var input = document.getElementById('passcode-input');
    if (input) input.value = '';

    hide('scanner-modes');
    hide('scanner-view');
    hide('bulk-section');
    hide('booth-topup-form');
    hide('debit-form');
    hide('new-ticket-form');
    show('scanner-passcode');
  }

  // ─── Mode Selection ──────────────────────────────────────────────────────

  function selectMode(mode) {
    state.mode = mode;
    state.currentTicket = null;
    state.crossTypeMode = 'scan';

    hide('scanner-modes');
    show('scanner-view');

    var title = document.getElementById('scanner-view-title');
    var badge = document.getElementById('scanner-mode-badge');
    var crossToggle = document.getElementById('cross-type-toggle');
    var debitForm = document.getElementById('debit-form');
    var boothTopupForm = document.getElementById('booth-topup-form');
    var bulkSection = document.getElementById('bulk-section');
    var newTicketForm = document.getElementById('new-ticket-form');
    var actions = document.getElementById('scanner-actions');
    var result = document.getElementById('scanner-ticket-result');

    // Reset sub-views
    if (debitForm) debitForm.classList.remove('active');
    if (boothTopupForm) boothTopupForm.classList.remove('active');
    if (bulkSection) bulkSection.classList.remove('active');
    if (newTicketForm) newTicketForm.classList.remove('active');
    if (crossToggle) crossToggle.style.display = 'none';
    if (actions) actions.innerHTML = '';
    if (result) result.innerHTML = '';
    hide('scanner-result');

    var modeLabel = '';
    if (mode === 'gate') { modeLabel = 'Gate'; title.textContent = 'Gate — Verify Entry'; }
    else if (mode === 'debit') { modeLabel = 'Debit'; title.textContent = 'Debit — Activity Credits'; }
    else if (mode === 'topup') {
      modeLabel = 'Top-Up';
      title.textContent = 'Top-Up — Add Credits';
      if (crossToggle) crossToggle.style.display = 'flex';
      loadBoothBundles();
    }
    else if (mode === 'bulk') {
      modeLabel = 'Bulk';
      title.textContent = 'Bulk Catch-Up';
      if (bulkSection) bulkSection.classList.add('active');
      stopCamera();
      return;
    }

    if (badge) badge.textContent = modeLabel;

    // Start camera (not in bulk mode)
    if (mode !== 'bulk') {
      startCamera();
    }
  }

  function backToModes() {
    stopCamera();
    resetScannerView();
    hide('scanner-view');
    hide('bulk-section');
    hide('booth-topup-form');
    hide('debit-form');
    hide('new-ticket-form');
    hide('scanner-result');
    var modes = document.getElementById('scanner-modes');
    if (modes) modes.classList.add('active');
    state.mode = null;
    state.currentTicket = null;
  }

  function resetScannerView() {
    state.currentTicket = null;
    state.scanningActive = false;

    var ticketResult = document.getElementById('scanner-ticket-result');
    if (ticketResult) ticketResult.innerHTML = '';
    var actions = document.getElementById('scanner-actions');
    if (actions) actions.innerHTML = '';
    var debitForm = document.getElementById('debit-form');
    if (debitForm) debitForm.classList.remove('active');
    var boothTopupForm = document.getElementById('booth-topup-form');
    if (boothTopupForm) boothTopupForm.classList.remove('active');
    var newTicketForm = document.getElementById('new-ticket-form');
    if (newTicketForm) newTicketForm.classList.remove('active');

    var manualEntry = document.getElementById('manual-entry');
    if (manualEntry) manualEntry.classList.remove('active');
    var emailLookup = document.getElementById('email-lookup');
    if (emailLookup) emailLookup.style.display = 'none';

    hide('scanner-result');
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  function startCamera() {
    var video = document.querySelector('#camera-zone video');
    if (!video) {
      // Create video element
      var cameraZone = document.getElementById('camera-zone');
      if (!cameraZone) return;
      var placeholder = document.getElementById('camera-placeholder');
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:16px;display:none;';
      if (placeholder) cameraZone.insertBefore(video, placeholder);
    }

    if (state.cameraStream) {
      // Already have camera
      video.style.display = 'block';
      var placeholder = document.getElementById('camera-placeholder');
      if (placeholder) placeholder.style.display = 'none';
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[scan] Camera not supported');
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
    })
    .then(function(stream) {
      state.cameraStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';
      var placeholder = document.getElementById('camera-placeholder');
      if (placeholder) placeholder.style.display = 'none';
      video.play().then(function() {
        startQRDetection();
      }).catch(function(err) {
        console.warn('[scan] Video play error:', err.message);
      });
    })
    .catch(function(err) {
      console.warn('[scan] Camera access denied:', err.message);
      var placeholder = document.getElementById('camera-placeholder');
      if (placeholder) {
        placeholder.innerHTML = '<span class="cam-icon">&#128274;</span><p>Camera access denied.<br><span style="font-size:12px;">Use Manual Entry instead.</span></p>';
      }
    });
  }

  function stopCamera() {
    state.scanningActive = false;
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
      state.pollingInterval = null;
    }
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(function(t) { t.stop(); });
      state.cameraStream = null;
    }
    var video = document.querySelector('#camera-zone video');
    if (video) {
      video.srcObject = null;
      video.style.display = 'none';
    }
    var placeholder = document.getElementById('camera-placeholder');
    if (placeholder) placeholder.style.display = '';
  }

  // ─── QR Detection (BarcodeDetector API) ───────────────────────────────────

  function startQRDetection() {
    if (!('BarcodeDetector' in window)) {
      console.log('[scan] BarcodeDetector not available — manual entry only');
      return;
    }

    if (state.barcodeDetector === null) {
      try {
        state.barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) {
        console.warn('[scan] Failed to create BarcodeDetector:', e.message);
        return;
      }
    }

    state.scanningActive = true;
    detectLoop();
  }

  function detectLoop() {
    if (!state.scanningActive) return;

    var video = document.querySelector('#camera-zone video');
    if (!video || !video.videoWidth) {
      // Video not ready yet — retry
      setTimeout(detectLoop, 500);
      return;
    }

    state.barcodeDetector.detect(video)
      .then(function(barcodes) {
        if (barcodes.length > 0 && state.scanningActive) {
          var rawValue = barcodes[0].rawValue;
          // Parse ticket code from URL
          var code = parseTicketCode(rawValue);
          if (code && code !== (state.currentTicket ? state.currentTicket.code : null)) {
            // Pause scanning briefly to avoid duplicate triggers
            state.scanningActive = false;
            lookupTicket(code);
            // Resume after delay
            setTimeout(function() {
              if (state.mode && state.scanningActive === false) {
                state.scanningActive = true;
                detectLoop();
              }
            }, 2000);
            return;
          }
        }
        if (state.scanningActive) {
          requestAnimationFrame(detectLoop);
        }
      })
      .catch(function(err) {
        // BarcodeDetector might throw on some frames — keep going
        if (state.scanningActive) {
          setTimeout(detectLoop, 300);
        }
      });
  }

  function parseTicketCode(url) {
    try {
      if (url.startsWith('http') || url.startsWith('/t')) {
        var u = new URL(url, window.location.origin);
        var code = u.searchParams.get('t');
        if (code) return code.toUpperCase();
      }
      // Direct code (TKT-XXXXXX)
      if (/^TKT-/i.test(url)) return url.toUpperCase();
      return null;
    } catch (e) {
      return null;
    }
  }

  // ─── Manual Entry ─────────────────────────────────────────────────────────

  function toggleManualEntry() {
    var manualEntry = document.getElementById('manual-entry');
    if (!manualEntry) return;
    manualEntry.classList.toggle('active');
    if (manualEntry.classList.contains('active')) {
      document.getElementById('manual-code-input').focus();
      stopCamera();
    } else {
      startCamera();
    }
  }

  function manualLookup() {
    var input = document.getElementById('manual-code-input');
    if (!input) return;
    var code = input.value.trim().toUpperCase();
    if (!code) { showError('scanner-result', 'Please enter a ticket code.'); return; }
    if (!code.startsWith('TKT-')) code = 'TKT-' + code;
    lookupTicket(code);
  }

  // ─── Email Lookup ─────────────────────────────────────────────────────────

  function toggleEmailLookup() {
    var emailLookup = document.getElementById('email-lookup');
    if (!emailLookup) return;
    emailLookup.style.display = emailLookup.style.display === 'none' ? '' : 'none';
    if (emailLookup.style.display !== 'none') {
      document.getElementById('email-input').focus();
    }
  }

  function searchByEmail() {
    var email = document.getElementById('email-input');
    if (!email || !email.value || !email.value.includes('@')) {
      showResult('error', 'Please enter a valid email address.');
      return;
    }
    var results = document.getElementById('email-results');
    if (results) results.innerHTML = '<div class="scanner-loading"><div class="spinner"></div></div>';

    supabaseGet('/rest/v1/tickets?select=' + encodeURIComponent('id,code,type,status,balance,customer_name,ticket_types(name)') + '&customer_email=eq.' + encodeURIComponent(email.value.trim()) + '&status=eq.active&order=code.asc')
      .then(function(tickets) {
        if (!tickets || tickets.length === 0) {
          if (results) results.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:12px 0;">No active tickets found for this email.</p>';
          return;
        }
        var html = '';
        tickets.forEach(function(t) {
          var typeName = t.ticket_types ? t.ticket_types.name : t.type;
          html += '<div class="email-result-item" data-code="' + escapeHtml(t.code) + '">' +
            '<div><div class="code">' + escapeHtml(t.code) + '</div><div class="detail">' + escapeHtml(typeName) + '</div></div>' +
            (t.type === 'activity_credit' ? '<div class="bal">' + formatCurrency(t.balance) + '</div>' : '<div style="font-size:12px;color:var(--muted);">' + t.status + '</div>') +
          '</div>';
        });
        if (results) results.innerHTML = html;
      })
      .catch(function(err) {
        if (results) results.innerHTML = '<p style="font-size:13px;color:#c53030;padding:12px 0;">' + escapeHtml(err.message) + '</p>';
      });
  }

  // ─── Ticket Lookup ────────────────────────────────────────────────────────

  function lookupTicket(code) {
    if (!code || code.length < 6) {
      showResult('error', 'Invalid ticket code.');
      return;
    }

    var normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode.startsWith('TKT-')) normalizedCode = 'TKT-' + normalizedCode;

    // Show loading in ticket result area
    var ticketResult = document.getElementById('scanner-ticket-result');
    if (ticketResult) ticketResult.innerHTML = '<div class="scanner-loading"><div class="spinner"></div></div>';

    callEdgeFunction('/lookup-ticket', { code: normalizedCode })
      .then(function(data) {
        if (!data.success || !data.ticket) {
          showResult('error', 'Ticket not found: ' + escapeHtml(normalizedCode));
          if (ticketResult) ticketResult.innerHTML = '';
          return;
        }

        state.currentTicket = data.ticket;
        renderScannerTicket(data.ticket);
        showScannerActions(data.ticket);
      })
      .catch(function(err) {
        showResult('error', err.message || 'Failed to look up ticket.');
        if (ticketResult) ticketResult.innerHTML = '';
      });
  }

  function renderScannerTicket(ticket) {
    var container = document.getElementById('scanner-ticket-result');
    if (!container) return;

    var typeName = ticket.ticket_type ? ticket.ticket_type.name : (ticket.type || 'Ticket');
    var statusLabel = '';
    var statusClass = '';
    if (ticket.status === 'active') { statusLabel = 'Active'; statusClass = 'active'; }
    else if (ticket.status === 'used') { statusLabel = 'Used'; statusClass = 'used'; }
    else if (ticket.status === 'exhausted') { statusLabel = 'Exhausted'; statusClass = 'exhausted'; }
    else if (ticket.status === 'revoked') { statusLabel = 'Revoked'; statusClass = 'revoked'; }
    else { statusLabel = ticket.status; statusClass = ''; }

    var isActivity = ticket.type === 'activity_credit';
    var headerName = escapeHtml(ticket.customer_name || 'Anonymous');

    container.innerHTML =
      '<div class="scanner-ticket-card" data-ticket-id="' + escapeHtml(ticket.id) + '">' +
        '<div class="row">' +
          '<div class="info">' +
            '<h3>' + headerName + '</h3>' +
            '<div class="code">' + escapeHtml(ticket.code) + '</div>' +
            '<div class="meta">' + escapeHtml(typeName) +
              (isActivity ? ' &middot; Balance: ' + formatCurrency(ticket.balance) : '') +
            '</div>' +
          '</div>' +
          '<div class="balance">' +
            '<div class="status-badge ' + statusClass + '">' + statusLabel + '</div>' +
            (isActivity ? '<div class="amt">' + formatCurrency(ticket.balance) + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function showScannerActions(ticket) {
    var container = document.getElementById('scanner-actions');
    if (!container) return;

    if (state.mode === 'gate') {
      showGateActions(ticket, container);
    } else if (state.mode === 'debit') {
      showDebitForm(ticket);
    } else if (state.mode === 'topup') {
      if (state.crossTypeMode === 'scan') {
        showTopupForm(ticket);
      }
    }
  }

  // ─── Gate Mode ────────────────────────────────────────────────────────────

  function showGateActions(ticket, container) {
    if (ticket.type !== 'entry' && ticket.type !== 'parking' && ticket.type !== 'food' && ticket.type !== 'drinks') {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:14px;">' +
        'This is not an entry, parking, food, or drinks pass. Switch to Debit or Top-Up mode.' +
        '</div>';
      return;
    }

    if (ticket.status !== 'active') {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:#c53030;font-size:14px;">' +
        '<strong>Ticket already ' + escapeHtml(ticket.status) + '</strong><br>' +
        '<span style="font-size:12px;color:var(--muted);">Cannot mark as entered.</span>' +
        '</div>';
      return;
    }

    container.innerHTML =
      '<button class="action-btn success" id="gate-mark-used-btn">' +
        '&#10003; Mark as Entered' +
      '</button>' +
      '<div id="gate-error" class="error-message" style="display:none;margin-top:8px;"></div>';
  }

  function markTicketUsed(ticketId) {
    var btn = document.getElementById('gate-mark-used-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

    callEdgeFunction('/mark-used', { ticket_id: ticketId })
      .then(function(data) {
        if (!data.success) throw new Error(data.error || 'Failed to mark ticket');
        showResult('success', '&#10003; Entry confirmed for <strong>' + escapeHtml(state.currentTicket.code) + '</strong>');
        var container = document.getElementById('scanner-actions');
        if (container) {
          container.innerHTML = '<div style="padding:16px;text-align:center;color:#2f855a;">' +
            '<strong style="font-size:18px;">&#10003; Entered</strong><br>' +
            '<span style="font-size:13px;color:var(--muted);">' + escapeHtml(state.currentTicket.code) + '</span>' +
          '</div>';
        }
        // Update ticket status locally
        if (state.currentTicket) state.currentTicket.status = 'used';
      })
      .catch(function(err) {
        showError('gate-error', err.message || 'Failed to mark ticket as used.');
        if (btn) { btn.disabled = false; btn.textContent = 'Mark as Entered'; }
      });
  }

  // ─── Debit Mode ───────────────────────────────────────────────────────────

  function showDebitForm(ticket) {
    if (ticket.type !== 'activity_credit') {
      var container = document.getElementById('scanner-actions');
      if (container) {
        container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:14px;">' +
          'This ticket does not have a balance to debit. Use Gate mode for entry passes.' +
        '</div>';
      }
      return;
    }

    if (ticket.status !== 'active') {
      var container = document.getElementById('scanner-actions');
      if (container) {
        container.innerHTML = '<div style="padding:16px;text-align:center;color:#c53030;font-size:14px;">' +
          'Ticket is ' + escapeHtml(ticket.status) + ' — cannot debit.' +
        '</div>';
      }
      return;
    }

    var balanceEl = document.getElementById('debit-current-balance');
    if (balanceEl) balanceEl.textContent = formatCurrency(ticket.balance);

    var debitForm = document.getElementById('debit-form');
    if (debitForm) debitForm.classList.add('active');
  }

  function debitTicket(ticketId, amount) {
    hideError('debit-error');
    var btn = document.getElementById('debit-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

    callEdgeFunction('/debit', { ticket_id: ticketId, amount: amount })
      .then(function(data) {
        if (!data.success) throw new Error(data.error || 'Debit failed');

        showResult('success', '&#10003; Debited <strong>' + formatCurrency(amount) + '</strong>. Remaining: ' + formatCurrency(data.new_balance));

        // Update local state
        if (state.currentTicket) {
          state.currentTicket.balance = data.new_balance;
          renderScannerTicket(state.currentTicket);
        }

        // Reset debit form
        var debitForm = document.getElementById('debit-form');
        if (debitForm) debitForm.classList.remove('active');
        var input = document.getElementById('debit-amount-input');
        if (input) input.value = '';
        $$('.preset-btn').forEach(function(b) { b.classList.remove('selected'); });
      })
      .catch(function(err) {
        showError('debit-error', err.message || 'Debit failed.');
        if (btn) { btn.disabled = false; btn.textContent = 'Confirm Debit'; }
      });
  }

  // ─── Top-Up Mode ──────────────────────────────────────────────────────────

  function loadBoothBundles() {
    var container = document.getElementById('booth-bundles');
    if (!container) return;

    supabaseGet('/rest/v1/top_up_bundles?select=id,amount,is_active,sort_order&is_active=eq.true&order=sort_order.asc')
      .then(function(bundles) {
        state.bundles = (bundles || []).map(function(b, i) { b._idx = i; return b; });
        renderBoothBundles();
      })
      .catch(function() {
        // Fallback bundles
        state.bundles = [
          { id: 'fb-100', amount: 100, _idx: 0 },
          { id: 'fb-200', amount: 200, _idx: 1 },
          { id: 'fb-500', amount: 500, _idx: 2 },
          { id: 'fb-1000', amount: 1000, _idx: 3 },
        ];
        renderBoothBundles();
      });

    // Also load balance cap
    supabaseGet('/rest/v1/system_config?select=key,value&key=eq.balance_cap&limit=1')
      .then(function(configs) {
        if (configs && configs.length > 0) {
          state.balanceCap = parseInt(configs[0].value, 10) || 5000;
        }
      })
      .catch(function() {});
  }

  function renderBoothBundles() {
    var container = document.getElementById('booth-bundles');
    if (!container) return;
    var html = '';
    state.bundles.forEach(function(b) {
      var selected = state.selectedBundleIdx === b._idx ? ' selected' : '';
      html += '<button class="bundle-btn booth-bundle-btn' + selected + '" data-idx="' + b._idx + '">' +
        '<div class="amt">' + formatCurrency(b.amount) + '</div>' +
      '</button>';
    });
    container.innerHTML = html;
  }

  function showTopupForm(ticket) {
    if (ticket.type !== 'activity_credit') {
      var actions = document.getElementById('scanner-actions');
      if (actions) {
        actions.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:14px;">' +
          'This is not an activity credit ticket. Use Gate mode for entry/parking passes.' +
        '</div>';
      }
      return;
    }

    if (ticket.status !== 'active') {
      var actions = document.getElementById('scanner-actions');
      if (actions) {
        actions.innerHTML = '<div style="padding:16px;text-align:center;color:#c53030;font-size:14px;">' +
          'Ticket is ' + escapeHtml(ticket.status) + ' — cannot top up.' +
        '</div>';
      }
      return;
    }

    var form = document.getElementById('booth-topup-form');
    if (form) form.classList.add('active');
  }

  function selectBoothBundle(idx) {
    state.selectedBundleIdx = parseInt(idx, 10);
    var customInput = document.getElementById('booth-custom-amount');
    if (customInput) customInput.value = '';
    state.customAmount = 0;
    renderBoothBundles();
    updateBoothSummary();
  }

  function selectBoothCustomAmount(val) {
    state.selectedBundleIdx = -1;
    state.customAmount = Math.max(0, parseInt(val, 10) || 0);
    renderBoothBundles();
    updateBoothSummary();
  }

  function getBoothAmount() {
    if (state.selectedBundleIdx >= 0 && state.selectedBundleIdx < state.bundles.length) {
      return state.bundles[state.selectedBundleIdx].amount;
    }
    return state.customAmount;
  }

  function updateBoothSummary() {
    var amount = getBoothAmount();
    var chargeEl = document.getElementById('booth-charge-amount');
    if (chargeEl) chargeEl.textContent = formatCurrency(amount);

    var payMethods = document.getElementById('payment-methods');
    if (payMethods) {
      payMethods.classList.toggle('active', amount >= 50);
    }

    // Show/hide result
    var result = document.getElementById('booth-topup-result');
    if (result) result.style.display = 'none';

    // Validate against balance cap
    if (state.currentTicket && amount > 0) {
      var newBalance = (state.currentTicket.balance || 0) + amount;
      if (newBalance > state.balanceCap) {
        showResult('error', 'This top-up would exceed the maximum balance of ' + formatCurrency(state.balanceCap) + '.');
      }
    }
  }

  // ─── Top-Up: Payment Methods ──────────────────────────────────────────────

  function handlePaymentMethod(method) {
    var amount = getBoothAmount();
    if (amount < 50) {
      showResult('error', 'Minimum top-up is D50.');
      return;
    }

    if (!state.currentTicket) {
      showResult('error', 'No ticket selected. Scan or enter a ticket code first.');
      return;
    }

    var ticket = state.currentTicket;
    var newBalance = (ticket.balance || 0) + amount;
    if (newBalance > state.balanceCap) {
      showResult('error', 'Would exceed max balance of ' + formatCurrency(state.balanceCap));
      return;
    }

    if (method === 'modempay') {
      handleBoothModemPay(ticket, amount);
    } else if (method === 'wave') {
      handleBoothWaveCash(ticket, amount, 'wave_transfer');
    } else if (method === 'cash') {
      handleBoothWaveCash(ticket, amount, 'cash');
    }
  }

  function handleBoothModemPay(ticket, amount) {
    // Show QR code for customer to scan with their phone
    var qrContainer = document.getElementById('modempay-qr');
    var qrBox = document.getElementById('modempay-qr-box');
    var qrStatus = document.getElementById('modempay-qr-status');
    var orderId = null;

    if (qrContainer) qrContainer.classList.add('active');

    // Generate a payment URL for the QR code
    var paymentUrl = window.location.origin + '/top-up?t=' + ticket.code + '&amount=' + amount;

    if (qrBox) {
      qrBox.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' +
        encodeURIComponent(paymentUrl) +
        '" alt="Payment QR" style="width:200px;height:200px;border-radius:4px;" onerror="this.parentElement.innerHTML=\'<span style=font-size:13px;color:var(--muted);>Could not generate QR</span>\'">';
    }
    if (qrStatus) qrStatus.textContent = 'Waiting for customer to pay…';

    // Create an order for this top-up
    callEdgeFunction('/create-order', {
      email: ticket.customer_email || 'booth@walkingfish.gm',
      customer_name: ticket.customer_name || '',
      items: [{ ticket_type_id: ticket.ticket_type_id, quantity: 0 }],
      purpose: 'top-up',
      ticket_code: ticket.code,
      topup_amount: amount,
    })
    .then(function(orderData) {
      if (!orderData.success) throw new Error(orderData.error || 'Order creation failed');
      orderId = orderData.order_id;

      // Poll order status until paid or manual override
      if (qrStatus) qrStatus.textContent = 'Order created. Polling for payment…';

      state.pollingInterval = setInterval(function() {
        if (!orderId || state.mode !== 'topup') {
          clearInterval(state.pollingInterval);
          state.pollingInterval = null;
          return;
        }

        supabaseGet('/rest/v1/orders?select=id,status&id=eq.' + orderId + '&limit=1')
          .then(function(orders) {
            if (orders && orders.length > 0 && orders[0].status === 'paid') {
              clearInterval(state.pollingInterval);
              state.pollingInterval = null;

              if (qrStatus) qrStatus.textContent = 'Payment confirmed! Processing…';

              // Fetch the updated ticket balance
              supabaseGet('/rest/v1/tickets?select=id,balance&code=eq.' + encodeURIComponent(ticket.code) + '&limit=1')
                .then(function(tickets) {
                  if (tickets && tickets.length > 0) {
                    var newBalance = tickets[0].balance;
                    if (state.currentTicket) state.currentTicket.balance = newBalance;
                    renderScannerTicket(state.currentTicket);
                  }
                })
                .catch(function() {});

              // Mark as completed
              showResult('success', '&#10003; Payment received! Top-up of <strong>' + formatCurrency(amount) + '</strong> confirmed.');

              // Hide QR and reset
              var qrContainer = document.getElementById('modempay-qr');
              if (qrContainer) qrContainer.classList.remove('active');
              var form = document.getElementById('booth-topup-form');
              if (form) form.classList.remove('active');
              state.selectedBundleIdx = -1;
              state.customAmount = 0;
            }
          })
          .catch(function() {});
      }, 3000);
    })
    .catch(function(err) {
      if (qrStatus) qrStatus.textContent = 'Error: ' + err.message;
    });
  }

  function handleBoothModemPayOverride() {
    var ticket = state.currentTicket;
    var amount = getBoothAmount();
    if (!ticket || amount < 50) return;

    var qrContainer = document.getElementById('modempay-qr');
    if (qrContainer) qrContainer.classList.remove('active');

    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
      state.pollingInterval = null;
    }

    processBoothTopup(ticket, amount, 'modempay', 'Booth — manual override (ModemPay)');
  }

  function handleBoothWaveCash(ticket, amount, method) {
    var source = method === 'wave_transfer' ? 'wave' : 'cash';
    processBoothTopup(ticket, amount, source, 'Booth top-up via ' + method);
  }

  function processBoothTopup(ticket, amount, source, notes) {
    // Create order + update balance directly
    callEdgeFunction('/create-order', {
      email: ticket.customer_email || 'booth@walkingfish.gm',
      customer_name: ticket.customer_name || '',
      items: [{ ticket_type_id: ticket.ticket_type_id, quantity: 0 }],
      purpose: 'top-up',
      ticket_code: ticket.code,
      topup_amount: amount,
    })
    .then(function(orderData) {
      if (!orderData.success) throw new Error(orderData.error || 'Order creation failed');

      // Mark order as paid
      return fetch(SUPA_URL + '/rest/v1/orders', {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_ANON,
          'Authorization': 'Bearer ' + SUPA_ANON,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          status: 'paid',
          payment_method: source,
        }),
      }).then(function() {
        // Update balance via RPC
        return fetch(SUPA_URL + '/rest/v1/rpc/update_ticket_balance', {
          method: 'POST',
          headers: {
            'apikey': SUPA_ANON,
            'Authorization': 'Bearer ' + SUPA_ANON,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_ticket_id: ticket.id,
            p_amount_delta: amount,
            p_txn_type: 'top_up',
            p_source: source,
            p_notes: notes || 'Booth top-up',
          }),
        });
      });
    })
    .then(function(r) {
      if (!r || !r.ok) return r ? r.json().then(function(e) { throw new Error(e.message || 'Balance update failed'); }) : null;
      return r.json().then(function(data) {
        var newBalance = data !== null && data !== undefined ? data : (ticket.balance || 0) + amount;
        // Update local state
        if (state.currentTicket) state.currentTicket.balance = newBalance;
        renderScannerTicket(state.currentTicket);

        // Reset form
        var form = document.getElementById('booth-topup-form');
        if (form) form.classList.remove('active');
        state.selectedBundleIdx = -1;
        state.customAmount = 0;

        showResult('success', '&#10003; Top-up of <strong>' + formatCurrency(amount) + '</strong> complete. New balance: ' + formatCurrency(newBalance));

        // Send receipt via Edge Function
        callEdgeFunction('/webhook', {
          trigger: 'receipt',
          email: ticket.customer_email,
          subject: 'Top-Up Confirmed — Walking-Fish',
          ticket_code: ticket.code,
          amount: amount,
          new_balance: newBalance,
        }).catch(function() {});
      });
    })
    .catch(function(err) {
      showResult('error', err.message || 'Top-up failed. Please try again.');
    });
  }

  // ─── Cross-Type: New Activity Credit ──────────────────────────────────────

  function toggleCrossType(mode) {
    state.crossTypeMode = mode;
    $$('.toggle-btn[data-ct]').forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-ct') === mode); });

    var scanForm = document.getElementById('booth-topup-form');
    var newForm = document.getElementById('new-ticket-form');
    var cameraZone = document.getElementById('camera-zone');
    var manualEntry = document.getElementById('manual-entry');
    var emailLkup = document.getElementById('email-lookup');

    if (mode === 'new') {
      if (scanForm) scanForm.classList.remove('active');
      if (newForm) newForm.classList.add('active');
      if (cameraZone) cameraZone.style.display = 'none';
      if (manualEntry) manualEntry.classList.remove('active');
      if (emailLkup) emailLkup.style.display = 'none';
      stopCamera();
      loadActivityTicketTypes();
    } else {
      if (newForm) newForm.classList.remove('active');
      if (cameraZone) cameraZone.style.display = '';
      startCamera();
    }
  }

  function loadActivityTicketTypes() {
    var select = document.getElementById('new-ticket-type');
    if (!select) return;

    supabaseGet('/rest/v1/ticket_types?select=id,name,price,sort_order&type=eq.activity_credit&is_active=eq.true&order=sort_order.asc')
      .then(function(types) {
        if (!types || types.length === 0) {
          select.innerHTML = '<option value="">No activity credits available</option>';
          return;
        }
        var html = types.map(function(t) {
          return '<option value="' + t.id + '" data-price="' + t.price + '">' + escapeHtml(t.name) + ' — ' + formatCurrency(t.price) + '</option>';
        }).join('');
        select.innerHTML = '<option value="">Select type…</option>' + html;
      })
      .catch(function() {
        select.innerHTML = '<option value="">Failed to load types</option>';
      });
  }

  function createNewTicket() {
    var typeSelect = document.getElementById('new-ticket-type');
    var nameInput = document.getElementById('new-ticket-name');
    var emailInput = document.getElementById('new-ticket-email');
    var errorEl = document.getElementById('new-ticket-error');
    var payBtn = document.getElementById('new-ticket-pay-btn');

    hideError('new-ticket-error');

    if (!typeSelect || !typeSelect.value) {
      if (errorEl) { errorEl.textContent = 'Please select a ticket type.'; errorEl.style.display = 'block'; }
      return;
    }
    if (!nameInput || !nameInput.value.trim()) {
      if (errorEl) { errorEl.textContent = 'Please enter the customer name.'; errorEl.style.display = 'block'; }
      return;
    }
    if (!emailInput || !emailInput.value || !emailInput.value.includes('@')) {
      if (errorEl) { errorEl.textContent = 'Please enter a valid email address.'; errorEl.style.display = 'block'; }
      return;
    }

    if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Creating…'; }

    var typeId = typeSelect.value;
    var customerName = nameInput.value.trim();
    var email = emailInput.value.trim();
    var price = parseInt(typeSelect.options[typeSelect.selectedIndex].getAttribute('data-price'), 10);

    // Create a minimal order, then process
    callEdgeFunction('/create-order', {
      email: email,
      customer_name: customerName,
      items: [{ ticket_type_id: typeId, quantity: 1 }],
    })
    .then(function(orderData) {
      if (!orderData.success) throw new Error(orderData.error || 'Order creation failed');

      // Mark order as paid directly (staff collected payment)
      return fetch(SUPA_URL + '/rest/v1/orders', {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_ANON,
          'Authorization': 'Bearer ' + SUPA_ANON,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'paid', payment_method: 'cash' }),
      }).then(function() {
        return orderData;
      });
    })
    .then(function(orderData) {
      // Generate ticket via Edge Function (reuse webhook flow)
      return callEdgeFunction('/webhook', {
        trigger: 'manual_paid',
        order_id: orderData.order_id,
        email: email,
        customer_name: customerName,
        payment_method: 'cash',
      });
    })
    .then(function(data) {
      if (data && data.success && data.ticket_code) {
        // Show result with ticket code for paper slip
        showResult('success', '&#10003; Created <strong>' + escapeHtml(data.ticket_code) + '</strong> for ' + escapeHtml(customerName));

        // Reset form
        if (typeSelect) typeSelect.value = '';
        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
      } else {
        showResult('info', 'Order created. Ticket will be generated and emailed to ' + escapeHtml(email));
      }

      if (payBtn) { payBtn.disabled = false; payBtn.textContent = 'Continue to Payment'; }
    })
    .catch(function(err) {
      if (errorEl) { errorEl.textContent = err.message || 'Failed to create ticket.'; errorEl.style.display = 'block'; }
      if (payBtn) { payBtn.disabled = false; payBtn.textContent = 'Continue to Payment'; }
    });
  }

  // ─── Bulk Top-Up ──────────────────────────────────────────────────────────

  function addBulkRow() {
    var tbody = document.getElementById('bulk-rows');
    if (!tbody) return;
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="text" class="bulk-code" placeholder="TKT-XXXXXX" maxlength="12"></td>' +
      '<td><input type="number" class="bulk-amount" placeholder="D" min="50" style="min-width:70px;"></td>' +
      '<td><select class="bulk-method"><option value="wave">Wave</option><option value="cash">Cash</option></select></td>' +
      '<td><input type="text" class="bulk-note" placeholder="Booth # / staff name"></td>' +
      '<td><button class="del-btn" onclick="this.closest(\'tr\').remove()">&times;</button></td>';
    tbody.appendChild(tr);
  }

  function submitBulk() {
    var rows = $$('#bulk-rows tr');
    var resultEl = document.getElementById('bulk-result');
    var submitBtn = document.getElementById('bulk-submit-btn');
    if (!rows || rows.length === 0) {
      if (resultEl) { resultEl.className = 'scanner-result error'; resultEl.innerHTML = 'No rows to submit.'; resultEl.style.display = 'block'; }
      return;
    }

    var entries = [];
    rows.forEach(function(tr) {
      var code = tr.querySelector('.bulk-code');
      var amount = tr.querySelector('.bulk-amount');
      var method = tr.querySelector('.bulk-method');
      var note = tr.querySelector('.bulk-note');
      if (!code || !amount) return;
      var codeVal = code.value.trim().toUpperCase();
      var amountVal = parseInt(amount.value, 10);
      if (!codeVal || !amountVal || amountVal < 50) return;
      var normalizedCode = codeVal.startsWith('TKT-') ? codeVal : 'TKT-' + codeVal;
      entries.push({
        code: normalizedCode,
        amount: amountVal,
        method: method ? method.value : 'wave',
        note: note ? note.value.trim() : '',
      });
    });

    if (entries.length === 0) {
      if (resultEl) { resultEl.className = 'scanner-result error'; resultEl.innerHTML = 'No valid entries found.'; resultEl.style.display = 'block'; }
      return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Processing ' + entries.length + '…'; }

    callEdgeFunction('/bulk-topup', { entries: entries })
      .then(function(data) {
        if (!data.success) throw new Error(data.error || 'Bulk top-up failed');

        if (resultEl) {
          resultEl.className = 'scanner-result success';
          var successCount = data.processed || entries.length;
          resultEl.innerHTML = '&#10003; ' + successCount + ' top-up' + (successCount !== 1 ? 's' : '') + ' processed.' +
            (data.errors && data.errors.length > 0 ? '<br><span style="font-size:12px;">' + data.errors.length + ' error(s)</span>' : '');
          resultEl.style.display = 'block';
        }

        // Clear rows
        var tbody = document.getElementById('bulk-rows');
        if (tbody) tbody.innerHTML = '';
      })
      .catch(function(err) {
        if (resultEl) {
          resultEl.className = 'scanner-result error';
          resultEl.innerHTML = err.message || 'Bulk top-up failed. Please try again.';
          resultEl.style.display = 'block';
        }
      })
      .finally(function() {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit All'; }
      });
  }

  // ─── Event Delegation ─────────────────────────────────────────────────────

  function initEventDelegation() {
    document.addEventListener('click', function(e) {
      var target = e.target;

      // Mode selection buttons
      if (target.closest('.mode-btn[data-mode]')) {
        var modeBtn = target.closest('.mode-btn[data-mode]');
        var mode = modeBtn.getAttribute('data-mode');
        selectMode(mode);
        return;
      }

      // Logout / Lock
      if (target.closest('#scanner-logout')) {
        lockScanner();
        return;
      }

      // Back button
      if (target.closest('#scanner-back')) {
        backToModes();
        return;
      }

      // Manual entry toggle
      if (target.closest('#manual-toggle-btn')) {
        toggleManualEntry();
        return;
      }

      // Manual lookup button
      if (target.closest('#manual-lookup-btn')) {
        manualLookup();
        return;
      }

      // Manual code input - Enter key
      var manualInput = document.getElementById('manual-code-input');
      if (manualInput && e.target === manualInput && e.key === undefined) {
        // Handled by keydown below
        return;
      }

      // Email lookup toggle
      if (target.closest('#email-lookup-toggle')) {
        toggleEmailLookup();
        return;
      }

      // Email search button
      if (target.closest('#email-search-btn')) {
        searchByEmail();
        return;
      }

      // Email result item click
      if (target.closest('.email-result-item')) {
        var item = target.closest('.email-result-item');
        var code = item.getAttribute('data-code');
        if (code) {
          lookupTicket(code);
          toggleEmailLookup();
        }
        return;
      }

      // Gate: Mark as Entered
      if (target.closest('#gate-mark-used-btn')) {
        if (state.currentTicket) markTicketUsed(state.currentTicket.id);
        return;
      }

      // Debit: preset buttons
      if (target.closest('.preset-btn')) {
        var presetBtn = target.closest('.preset-btn');
        var amount = presetBtn.getAttribute('data-amount');
        var input = document.getElementById('debit-amount-input');
        if (input) input.value = amount;
        $$('.preset-btn').forEach(function(b) { b.classList.remove('selected'); });
        presetBtn.classList.add('selected');
        var confirmBtn = document.getElementById('debit-confirm-btn');
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }

      // Debit: amount input change
      var debitInput = document.getElementById('debit-amount-input');
      if (debitInput && e.target === debitInput && e.key === undefined) {
        // handled by keydown/input
        return;
      }

      // Debit: confirm
      if (target.closest('#debit-confirm-btn')) {
        var debitInput = document.getElementById('debit-amount-input');
        var amount = parseInt(debitInput ? debitInput.value : '0', 10);
        if (!amount || amount < 0) { showError('debit-error', 'Please enter a valid amount.'); return; }
        if (state.currentTicket && amount > state.currentTicket.balance) {
          showError('debit-error', 'Insufficient balance. Available: ' + formatCurrency(state.currentTicket.balance));
          return;
        }
        if (state.currentTicket) debitTicket(state.currentTicket.id, amount);
        return;
      }

      // Booth bundle selection
      if (target.closest('.booth-bundle-btn')) {
        var bundleBtn = target.closest('.booth-bundle-btn');
        selectBoothBundle(bundleBtn.getAttribute('data-idx'));
        return;
      }

      // Booth custom amount - handled by input event

      // Booth payment method
      if (target.closest('.method-btn')) {
        var methodBtn = target.closest('.method-btn');
        handlePaymentMethod(methodBtn.getAttribute('data-method'));
        return;
      }

      // ModemPay override
      if (target.closest('#modempay-override-btn')) {
        handleBoothModemPayOverride();
        return;
      }

      // Cross-type toggle
      if (target.closest('.toggle-btn[data-ct]')) {
        var ctBtn = target.closest('.toggle-btn[data-ct]');
        toggleCrossType(ctBtn.getAttribute('data-ct'));
        return;
      }

      // New ticket pay button
      if (target.closest('#new-ticket-pay-btn')) {
        createNewTicket();
        return;
      }

      // Bulk: add row
      if (target.closest('#bulk-add-row')) {
        addBulkRow();
        return;
      }

      // Bulk: submit
      if (target.closest('#bulk-submit-btn')) {
        submitBulk();
        return;
      }
    });

    // Keyboard events
    document.addEventListener('keydown', function(e) {
      // Manual code input
      var manualInput = document.getElementById('manual-code-input');
      if (manualInput && e.target === manualInput && e.key === 'Enter') {
        e.preventDefault();
        manualLookup();
        return;
      }

      // Email input
      var emailInput = document.getElementById('email-input');
      if (emailInput && e.target === emailInput && e.key === 'Enter') {
        e.preventDefault();
        searchByEmail();
        return;
      }

      // Debit amount input
      var debitInput = document.getElementById('debit-amount-input');
      if (debitInput && e.target === debitInput && e.key === 'Enter') {
        e.preventDefault();
        var amount = parseInt(debitInput.value, 10);
        if (!amount || amount < 0) return;
        if (state.currentTicket && amount > state.currentTicket.balance) {
          showError('debit-error', 'Insufficient balance. Available: ' + formatCurrency(state.currentTicket.balance));
          return;
        }
        if (state.currentTicket) debitTicket(state.currentTicket.id, amount);
        return;
      }
    });

    // Input events
    document.addEventListener('input', function(e) {
      // Booth custom amount
      var boothCustomInput = document.getElementById('booth-custom-amount');
      if (boothCustomInput && e.target === boothCustomInput) {
        selectBoothCustomAmount(boothCustomInput.value);
        return;
      }

      // Debit amount input — enable/disable confirm button
      var debitInput = document.getElementById('debit-amount-input');
      if (debitInput && e.target === debitInput) {
        var confirmBtn = document.getElementById('debit-confirm-btn');
        var val = parseInt(debitInput.value, 10);
        if (confirmBtn) {
          confirmBtn.disabled = !val || val <= 0 || (state.currentTicket && val > state.currentTicket.balance);
        }
        $$('.preset-btn').forEach(function(b) { b.classList.remove('selected'); });
        return;
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    initPasscode();
    initEventDelegation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

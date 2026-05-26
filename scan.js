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
    billCount: 0,
    billLog: [],
    billLogPanelVisible: false,
    billClearTimer: null,
    billReceiptDelay: null,
    undoingEntryIdx: -1, // index in billLog of entry being undone with note input
    crossTypeMode: 'scan', // 'scan' | 'new'
    pollingInterval: null,
  };

  // ─── DOM Refs (cached on init) ────────────────────────────────────────────
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
    if (state.billClearTimer) { clearTimeout(state.billClearTimer); state.billClearTimer = null; }
    if (state.billReceiptDelay) { clearTimeout(state.billReceiptDelay); state.billReceiptDelay = null; }
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
    else if (mode === 'bill') {
      modeLabel = 'Bill';
      title.textContent = 'Bill — Redeem Vouchers';
      state.billCount = 0;
      state.billLog = [];
      state.billLogPanelVisible = false;
      var headerControls = document.getElementById('bill-header-controls');
      if (headerControls) headerControls.style.display = 'flex';
      var counterBadge = document.getElementById('bill-counter-badge');
      if (counterBadge) counterBadge.style.display = 'inline-flex';
      var counterEl = document.getElementById('bill-counter');
      if (counterEl) counterEl.textContent = '0';
      var logPanel = document.getElementById('bill-log-panel');
      if (logPanel) { logPanel.classList.remove('active'); logPanel.style.display = 'none'; }
      var logBtn = document.getElementById('bill-log-btn');
      if (logBtn) { logBtn.textContent = '\u{1F4CB} Log'; logBtn.classList.remove('active'); }
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
    if (state.billClearTimer) { clearTimeout(state.billClearTimer); state.billClearTimer = null; }
    if (state.billReceiptDelay) { clearTimeout(state.billReceiptDelay); state.billReceiptDelay = null; }
    resetScannerView();
    hide('scanner-view');
    var headerControls = document.getElementById('bill-header-controls');
    if (headerControls) headerControls.style.display = 'none';
    var logPanel = document.getElementById('bill-log-panel');
    if (logPanel) { logPanel.classList.remove('active'); logPanel.style.display = 'none'; }
    state.billLogPanelVisible = false;
    hide('bulk-section');
    hide('booth-topup-form');
    hide('debit-form');
    hide('new-ticket-form');
    hide('scanner-result');
    var counterBadge = document.getElementById('bill-counter-badge');
    if (counterBadge) counterBadge.style.display = 'none';
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

    var mode = state.mode;
    callEdgeFunction('/lookup-by-email', { email: email.value.trim(), mode: mode })
      .then(function(data) {
        if (!data.success) throw new Error(data.error || 'Lookup failed');
        var tickets = data.tickets;
        if (!tickets || tickets.length === 0) {
          if (results) results.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:12px 0;">No active tickets found for this email.</p>';
          return;
        }
        var html = '';
        tickets.forEach(function(t) {
          var typeName = t.ticket_type ? t.ticket_type.name : t.type;
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
    } else if (state.mode === 'bill') {
      showBillActions(ticket, container);
    }
  }

  // ─── Bill Mode (Food & Drinks Voucher Redemption) ──────────────────────

  function generateBillReceiptHTML(ticket) {
    var now = new Date();
    var dateStr = now.toLocaleDateString('en-GM', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
    var timeStr = now.toLocaleTimeString('en-GM', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    var voucherEmoji = ticket.type === 'food' ? '&#127858;' : '&#127866;';
    var voucherLabel = ticket.type === 'food' ? 'Food Voucher' : 'Drinks Voucher';

    return '<div class="bill-receipt" style="background:var(--surface);border:2px solid var(--accent);border-radius:12px;padding:20px;margin-bottom:12px;text-align:center;">' +
      '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-text);margin-bottom:4px;">&#10003; Redeemed</div>' +
      '<div style="font-size:40px;line-height:1.2;margin:4px 0;">' + voucherEmoji + '</div>' +
      '<div style="font-size:24px;font-weight:700;letter-spacing:0.06em;font-family:monospace;word-break:break-all;">' + escapeHtml(ticket.code) + '</div>' +
      '<div style="font-size:14px;color:var(--muted);margin-top:4px;">' + escapeHtml(ticket.customer_name || 'Anonymous') + ' &middot; ' + voucherLabel + '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:8px;display:flex;justify-content:center;gap:16px;">' +
        '<span>' + dateStr + ' ' + timeStr + '</span>' +
        '<span>Staff: ' + escapeHtml(state.scannerCode || '—') + '</span>' +
      '</div>' +
      '<button class="btn btn-secondary" id="print-receipt-btn" style="margin-top:14px;width:100%;font-size:15px;font-weight:600;padding:14px;">' +
        '&#128424; Print Receipt' +
      '</button>' +
    '</div>';
  }

  function printBillReceipt() {
    // Snapshot ticket data before print (print() is non-blocking in some browsers)
    var ticketSnapshot = {
      code: state.currentTicket ? state.currentTicket.code : '—',
      type: state.currentTicket ? state.currentTicket.type : '',
      customer_name: state.currentTicket ? state.currentTicket.customer_name : '',
    };

    var now = new Date();
    var dateStr = now.toLocaleDateString('en-GM', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
    var timeStr = now.toLocaleTimeString('en-GM', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    var voucherLabel = ticketSnapshot.type === 'food' ? 'FOOD VOUCHER' : 'DRINKS VOUCHER';
    var voucherPrice = ticketSnapshot.ticket_type && ticketSnapshot.ticket_type.price
      ? 'D' + Number(ticketSnapshot.ticket_type.price).toLocaleString()
      : (ticketSnapshot.type === 'food' ? 'D200' : 'D150');

    var content = document.getElementById('bill-receipt-print-content');
    if (!content) return;

    content.innerHTML =
      '<div style="text-align:center;margin-bottom:12px;">' +
        '<div style="font-size:15px;font-weight:700;">WALKING-FISH GROUP</div>' +
        '<div style="font-size:11px;">Piroake Fest 2026</div>' +
        '<div style="font-size:11px;">Voucher Redemption Receipt</div>' +
      '</div>' +
      '<div style="border-top:1px dashed #000;margin:8px 0;"></div>' +
      '<div style="text-align:center;margin:10px 0;">' +
        '<div style="font-size:13px;font-weight:700;">' + voucherLabel + '</div>' +
        '<div style="font-size:22px;font-weight:700;letter-spacing:0.12em;font-family:monospace;margin:6px 0;">' + escapeHtml(ticketSnapshot.code) + '</div>' +
      '</div>' +
      '<table style="width:100%;font-size:11px;line-height:1.6;">' +
        '<tr><td style="padding:1px 0;color:#555;">Voucher</td><td style="padding:1px 0;text-align:right;">' + voucherLabel + '</td></tr>' +
        '<tr><td style="padding:1px 0;color:#555;">Value</td><td style="padding:1px 0;text-align:right;font-weight:600;">' + voucherPrice + '</td></tr>' +
        '<tr><td style="padding:1px 0;color:#555;">Customer</td><td style="padding:1px 0;text-align:right;">' + escapeHtml(ticketSnapshot.customer_name || 'Anonymous') + '</td></tr>' +
        '<tr><td style="padding:1px 0;color:#555;">Date</td><td style="padding:1px 0;text-align:right;">' + dateStr + '</td></tr>' +
        '<tr><td style="padding:1px 0;color:#555;">Time</td><td style="padding:1px 0;text-align:right;">' + timeStr + '</td></tr>' +
        '<tr><td style="padding:1px 0;color:#555;">Status</td><td style="padding:1px 0;text-align:right;font-weight:700;color:#2f855a;">REDEEMED</td></tr>' +
        '<tr><td style="padding:1px 0;color:#555;">Staff</td><td style="padding:1px 0;text-align:right;">' + escapeHtml(state.scannerCode || '—') + '</td></tr>' +
      '</table>' +
      '<div style="border-top:1px dashed #000;margin:10px 0 8px;"></div>' +
      '<div style="text-align:center;font-size:10px;color:#888;">' +
        'Thank you &mdash; enjoy Piroake Fest 2026!<br>' +
        'walkingfish.gm' +
      '</div>';

    window.print();
  }

  // ─── Bill Mode: Session Log ─────────────────────────────────────────────

  function toggleBillLog() {
    state.billLogPanelVisible = !state.billLogPanelVisible;

    // Close any pending undo note input
    state.undoingEntryIdx = -1;

    var logBtn = document.getElementById('bill-log-btn');
    if (logBtn) {
      logBtn.textContent = state.billLogPanelVisible ? 'Close Log' : '\u{1F4CB} Log';
      logBtn.classList.toggle('active', state.billLogPanelVisible);
    }

    var cameraZone = document.getElementById('camera-zone');
    var manualEntry = document.getElementById('manual-entry');
    var emailLookup = document.getElementById('email-lookup');
    var ticketResult = document.getElementById('scanner-ticket-result');
    var actions = document.getElementById('scanner-actions');
    var logPanel = document.getElementById('bill-log-panel');

    if (state.billLogPanelVisible) {
      renderBillLog();
      if (cameraZone) cameraZone.style.display = 'none';
      if (manualEntry) manualEntry.classList.remove('active');
      if (emailLookup) emailLookup.style.display = 'none';
      if (ticketResult) ticketResult.innerHTML = '';
      if (actions) actions.innerHTML = '';
      stopCamera();
    } else {
      if (cameraZone) cameraZone.style.display = '';
      startCamera();
    }

    if (logPanel) logPanel.classList.toggle('active', state.billLogPanelVisible);
  }

  function renderBillLog() {
    var logPanel = document.getElementById('bill-log-panel');
    if (!logPanel) return;

    if (state.billLog.length === 0) {
      logPanel.innerHTML = '<div class="bill-log-empty">' +
        '<div style="font-size:36px;margin-bottom:8px;">&#128210;</div>' +
        '<p>No vouchers redeemed yet this session.</p>' +
        '<p style="font-size:12px;color:var(--muted);">Scan and redeem food &amp; drinks vouchers — they\'ll appear here.</p>' +
      '</div>';
      return;
    }

    var total = state.billLog.length;
    var foodCount = state.billLog.filter(function(e) { return e.type === 'food'; }).length;
    var drinksCount = state.billLog.filter(function(e) { return e.type === 'drinks'; }).length;
    var totalValue = state.billLog.reduce(function(sum, e) { return sum + (e.value || 0); }, 0);

    var html = '<div class="bill-log-summary">' +
      '<span>Total: <strong>' + total + '</strong></span>' +
      '<span>&#127858; <strong>' + foodCount + '</strong></span>' +
      '<span>&#127866; <strong>' + drinksCount + '</strong></span>' +
      '<span class="bill-log-total-amount">' + formatCurrency(totalValue) + '</span>' +
    '</div>' +
    '<div class="bill-log-list">';

    // Most recent first
    var logCopy = state.billLog.slice().reverse();
    logCopy.forEach(function(entry, idx) {
      var emoji = entry.type === 'food' ? '&#127858;' : '&#127866;';
      var label = entry.type === 'food' ? 'Food' : 'Drinks';
      var originalIdx = state.billLog.length - 1 - idx;

      if (state.undoingEntryIdx === originalIdx) {
        // Show inline note input instead of the regular item
        html += '<div class="bill-log-item undoing" data-log-idx="' + originalIdx + '">' +
          '<div class="undo-note-wrapper">' +
            '<div class="undo-note-label">Why undo <strong>' + escapeHtml(entry.code) + '</strong>?</div>' +
            '<input type="text" class="undo-note-input" placeholder="e.g. Wrong voucher, duplicate scan" maxlength="200">' +
            '<div class="undo-note-actions">' +
              '<button class="btn btn-primary undo-note-confirm" data-log-idx="' + originalIdx + '" style="flex:1;padding:10px;font-size:13px;">Confirm Undo</button>' +
              '<button class="btn btn-secondary undo-note-cancel" style="flex:1;padding:10px;font-size:13px;">Cancel</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      } else {
        html += '<div class="bill-log-item' + (idx === 0 ? ' latest' : '') + '" data-log-idx="' + originalIdx + '">' +
          '<div class="bill-log-item-icon">' + emoji + '</div>' +
          '<div class="bill-log-item-info">' +
            '<div class="bill-log-item-code">' + escapeHtml(entry.code) + '</div>' +
            '<div class="bill-log-item-customer">' + escapeHtml(entry.customer_name) + ' &middot; ' + label + '</div>' +
          '</div>' +
          '<div class="bill-log-item-time">' +
            '<div>' + escapeHtml(entry.time) + '</div>' +
            '<div style="font-size:10px;color:var(--muted);">' + escapeHtml(entry.staff) + '</div>' +
          '</div>' +
          '<button class="bill-log-undo-btn" data-log-idx="' + originalIdx + '" title="Undo redemption" aria-label="Undo">&#8634;</button>' +
        '</div>';
      }
    });

    html += '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button class="btn btn-secondary" id="bill-log-export-btn" style="flex:1;font-size:13px;">&#11015; Export CSV</button>' +
        '<button class="btn btn-secondary" id="bill-log-clear-btn" style="flex:1;font-size:13px;color:#c53030;">Clear Log</button>' +
      '</div>';

    logPanel.innerHTML = html;
  }

  // ─── Bill Mode: Log Panel Toast ───────────────────────────────────────

  var logToastTimer = null;

  function showLogToast(type, msg) {
    var logPanel = document.getElementById('bill-log-panel');
    if (!logPanel) {
      // Fallback to scanner result
      showResult(type, msg);
      return;
    }

    // Remove any existing toast
    var existing = logPanel.querySelector('.bill-log-toast');
    if (existing) existing.remove();
    if (logToastTimer) { clearTimeout(logToastTimer); logToastTimer = null; }

    var toast = document.createElement('div');
    toast.className = 'bill-log-toast ' + type;
    toast.innerHTML = msg;
    logPanel.appendChild(toast);

    logToastTimer = setTimeout(function() {
      if (toast.parentNode) toast.remove();
      logToastTimer = null;
    }, 5000);
  }

  // ─── Bill Mode: Export Log ────────────────────────────────────────────

  function exportBillLog() {
    if (state.billLog.length === 0) {
      showResult('info', 'Nothing to export — no vouchers redeemed this session.');
      return;
    }

    // Build CSV
    var header = 'Code,Type,Value,Customer,Time,Staff\n';
    var rows = state.billLog.map(function(e) {
      var typeLabel = e.type === 'food' ? 'Food' : 'Drinks';
      var value = e.value || (e.type === 'food' ? 200 : 150);
      return [
        escapeCsvField(e.code),
        escapeCsvField(typeLabel),
        value,
        escapeCsvField(e.customer_name || ''),
        escapeCsvField(e.time || ''),
        escapeCsvField(e.staff || ''),
      ].join(',');
    }).join('\n');

    var totals = state.billLog.reduce(function(acc, e) {
      acc.totalCount++;
      acc.totalValue += e.value || (e.type === 'food' ? 200 : 150);
      if (e.type === 'food') acc.foodCount++;
      if (e.type === 'drinks') acc.drinksCount++;
      return acc;
    }, { totalCount: 0, totalValue: 0, foodCount: 0, drinksCount: 0 });

    var summary = '\nSummary\n' +
      'Total Vouchers,' + totals.totalCount + '\n' +
      'Food,' + totals.foodCount + '\n' +
      'Drinks,' + totals.drinksCount + '\n' +
      'Total Value,D' + totals.totalValue + '\n';

    var csvContent = '\uFEFF' + header + rows + summary;

    // Create download
    var now = new Date();
    var dateStr = now.toISOString().slice(0, 10);
    var staffCode = state.scannerCode || 'staff';
    var filename = 'bill-log-' + staffCode + '-' + dateStr + '.csv';

    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showResult('success', '&#11015; Exported <strong>' + escapeHtml(filename) + '</strong> (' + totals.totalCount + ' entries, ' + formatCurrency(totals.totalValue) + ')');
  }

  function escapeCsvField(str) {
    if (!str) return '""';
    var s = String(str);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return '"' + s + '"';
  }

  // ─── Bill Mode: Undo with Note ──────────────────────────────────────────

  function showUndoNoteInput(idx) {
    state.undoingEntryIdx = idx;
    renderBillLog();

    // Auto-focus the note input after render
    setTimeout(function() {
      var input = document.querySelector('.undo-note-input');
      if (input) input.focus();
    }, 100);
  }

  function confirmUndoWithNote(idx) {
    var input = document.querySelector('.undo-note-input');
    var reason = input ? input.value.trim() : '';
    state.undoingEntryIdx = -1;

    // Disable confirm button immediately to prevent rapid double-click
    var confirmBtn = document.querySelector('.undo-note-confirm[data-log-idx="' + idx + '"]');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '…'; }

    handleUndoRedemption(idx, reason);
  }

  function cancelUndoNote() {
    state.undoingEntryIdx = -1;
    renderBillLog();
  }

  function handleUndoRedemption(idx, reason) {
    var entry = state.billLog[idx];
    if (!entry) return;

    // If no reason entered, still proceed — the audit trail will have null
    reason = reason || '';

    // Find the specific button (if still rendered) and disable it
    var undoBtn = document.querySelector('.bill-log-undo-btn[data-log-idx="' + idx + '"]');
    if (undoBtn) { undoBtn.disabled = true; undoBtn.textContent = '…'; }

    callEdgeFunction('/unmark-used', {
      ticket_id: entry.id,
      reason: reason,
      staff_code: state.scannerCode || null,
    })
      .then(function(data) {
        if (!data.success) throw new Error(data.error || 'Undo failed');

        // Remove from log
        state.billLog.splice(idx, 1);

        // Decrement counter
        state.billCount = Math.max(0, state.billCount - 1);
        var counterEl = document.getElementById('bill-counter');
        if (counterEl) counterEl.textContent = state.billCount;

        // Re-render log first so the removed entry is gone
        renderBillLog();

        // Show inline log toast with note if provided
        var noteMsg = reason
          ? ' &#8212; "' + escapeHtml(reason) + '"'
          : '';
        showLogToast('success', '&#8634; Undone <strong>' + escapeHtml(entry.code) + '</strong>' + noteMsg);
      })
      .catch(function(err) {
        showLogToast('error', err.message || 'Failed to undo redemption');
        if (undoBtn) { undoBtn.disabled = false; undoBtn.innerHTML = '↺'; }
      });
  }

  function clearBillLog() {
    if (state.billLog.length === 0) return;
    state.billLog = [];
    state.billCount = 0;
    var counterEl = document.getElementById('bill-counter');
    if (counterEl) counterEl.textContent = '0';
    renderBillLog();
  }

  function showBillActions(ticket, container) {
    if (ticket.type !== 'food' && ticket.type !== 'drinks') {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:14px;">' +
        'This is not a food or drinks voucher. Switch to Gate, Debit, or Top-Up mode.' +
        '</div>';
      return;
    }

    if (ticket.status !== 'active') {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:#c53030;font-size:14px;">' +
        '<strong>Voucher already ' + escapeHtml(ticket.status) + '</strong><br>' +
        '<span style="font-size:12px;color:var(--muted);">Cannot redeem again.</span>' +
        '</div>';
      return;
    }

    var voucherEmoji = ticket.type === 'food' ? '&#127858;' : '&#127866;';
    var voucherLabel = ticket.type === 'food' ? 'Food Voucher' : 'Drinks Voucher';

    container.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;padding:16px;background:var(--accent-dim);border-radius:12px;margin-bottom:12px;">' +
        '<div style="font-size:36px;line-height:1;">' + voucherEmoji + '</div>' +
        '<div>' +
          '<div style="font-size:13px;color:var(--accent-text);font-weight:600;">' + voucherLabel + '</div>' +
          '<div style="font-size:12px;color:var(--muted);">' + escapeHtml(ticket.customer_name || 'Anonymous') + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="action-btn success" id="gate-mark-used-btn" style="background:var(--accent);font-size:18px;padding:20px;">' +
        '&#10003; Redeem Voucher' +
      '</button>' +
      '<div id="gate-error" class="error-message" style="display:none;margin-top:8px;"></div>';
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

        if (state.mode === 'bill') {
          // Bill mode: count it, show receipt card with Print button
          state.billCount++;
          var counterEl = document.getElementById('bill-counter');
          if (counterEl) counterEl.textContent = state.billCount;

          // Log this redemption
          state.billLog.push({
            id: state.currentTicket.id,
            code: state.currentTicket.code,
            type: state.currentTicket.type,
            customer_name: state.currentTicket.customer_name || 'Anonymous',
            time: new Date().toLocaleTimeString('en-GM', { hour: '2-digit', minute: '2-digit' }),
            staff: state.scannerCode || '—',
            value: state.currentTicket.type === 'food' ? 200 : (state.currentTicket.type === 'drinks' ? 150 : 0),
          });

          showResult('success', '&#10003; Redeemed <strong>' + escapeHtml(state.currentTicket.code) + '</strong> (' + (state.currentTicket.type === 'food' ? 'Food' : 'Drinks') + ')');

          // Snapshot ticket so receipt shows correct info even if another ticket is scanned
          var redeemedTicket = {
            code: state.currentTicket.code,
            type: state.currentTicket.type,
            customer_name: state.currentTicket.customer_name,
          };

          // Delay showing receipt card so staff can show customer the confirmation first
          state.billReceiptDelay = setTimeout(function() {
            var actionsContainer = document.getElementById('scanner-actions');
            if (actionsContainer) {
              actionsContainer.innerHTML = generateBillReceiptHTML(redeemedTicket);
            }

            // Auto-clear 10s after receipt appears — long enough for print dialog
            state.billClearTimer = setTimeout(function() {
              var container = document.getElementById('scanner-actions');
              if (container) container.innerHTML = '';
              var ticketResult = document.getElementById('scanner-ticket-result');
              if (ticketResult) ticketResult.innerHTML = '';
              redeemedTicket = null;
              if (state.currentTicket) state.currentTicket = null;
              if (state.scanningActive === false) {
                state.scanningActive = true;
                if (typeof detectLoop === 'function') detectLoop();
              }
            }, 10000);
          }, 2000);
        } else {
          // Gate / other: show success state
          showResult('success', '&#10003; Entry confirmed for <strong>' + escapeHtml(state.currentTicket.code) + '</strong>');
          var container = document.getElementById('scanner-actions');
          if (container) {
            container.innerHTML = '<div style="padding:16px;text-align:center;color:#2f855a;">' +
              '<strong style="font-size:18px;">&#10003; Entered</strong><br>' +
              '<span style="font-size:13px;color:var(--muted);">' + escapeHtml(state.currentTicket.code) + '</span>' +
            '</div>';
          }
        }

        // Update ticket status locally
        if (state.currentTicket) state.currentTicket.status = 'used';
      })
      .catch(function(err) {
        showError('gate-error', err.message || 'Failed to mark ticket as used.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = state.mode === 'bill' ? 'Redeem Voucher' : 'Mark as Entered';
        }
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

        callEdgeFunction('/check-order', { order_id: orderId })
          .then(function(data) {
            if (data.success && data.status === 'paid') {
              clearInterval(state.pollingInterval);
              state.pollingInterval = null;

              if (qrStatus) qrStatus.textContent = 'Payment confirmed! Processing…';

              // Fetch the updated ticket balance via lookup
              callEdgeFunction('/lookup-ticket', { code: ticket.code })
                .then(function(lookupData) {
                  if (lookupData.success && lookupData.ticket) {
                    var newBalance = lookupData.ticket.balance;
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

      // Mark order as paid via Edge Function (avoids anon key on writes)
      return callEdgeFunction('/confirm-payment', {
        order_id: orderData.order_id,
        payment_method: source,
        email: ticket.customer_email || 'booth@walkingfish.gm',
        ticket_id: ticket.id,
        amount_delta: amount,
        notes: notes || 'Booth top-up',
        purpose: 'topup',
      });
    })
    .then(function(data) {
      if (!data || !data.success) throw new Error((data && data.error) || 'Payment confirmation failed');

      var newBalance = (data.new_balance !== null && data.new_balance !== undefined) ? data.new_balance : (ticket.balance || 0) + amount;
      // Update local state
      if (state.currentTicket) state.currentTicket.balance = newBalance;
      renderScannerTicket(state.currentTicket);

      // Reset form
      var form = document.getElementById('booth-topup-form');
      if (form) form.classList.remove('active');
      state.selectedBundleIdx = -1;
      state.customAmount = 0;

      showResult('success', '&#10003; Top-up of <strong>' + formatCurrency(amount) + '</strong> complete. New balance: ' + formatCurrency(newBalance));
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

      // Mark order as paid via Edge Function (avoids anon key on writes)
      return callEdgeFunction('/confirm-payment', {
        order_id: orderData.order_id,
        payment_method: 'cash',
        email: email,
      }).then(function(data) {
        if (!data.success) throw new Error(data.error || 'Payment confirmation failed');
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

      // Gate: Mark as Entered / Bill: Redeem Voucher
      if (target.closest('#gate-mark-used-btn')) {
        if (state.currentTicket) markTicketUsed(state.currentTicket.id);
        return;
      }

      // Bill: Print Receipt
      if (target.closest('#print-receipt-btn')) {
        printBillReceipt();
        return;
      }

      // Bill: View / Close Log
      if (target.closest('#bill-log-btn')) {
        toggleBillLog();
        return;
      }

      // Bill: Close Log (X button)
      if (target.closest('#bill-log-close-btn')) {
        if (state.billLogPanelVisible) toggleBillLog();
        return;
      }

      // Bill: Undo entry — show inline note input
      if (target.closest('.bill-log-undo-btn')) {
        var undoBtn = target.closest('.bill-log-undo-btn');
        var idx = parseInt(undoBtn.getAttribute('data-log-idx'), 10);
        if (!isNaN(idx)) showUndoNoteInput(idx);
        return;
      }

      // Bill: Confirm undo with note
      if (target.closest('.undo-note-confirm')) {
        var confirmBtn = target.closest('.undo-note-confirm');
        var idx = parseInt(confirmBtn.getAttribute('data-log-idx'), 10);
        if (!isNaN(idx)) confirmUndoWithNote(idx);
        return;
      }

      // Bill: Cancel undo note
      if (target.closest('.undo-note-cancel')) {
        cancelUndoNote();
        return;
      }

      // Bill: Export Log
      if (target.closest('#bill-log-export-btn')) {
        exportBillLog();
        return;
      }

      // Bill: Clear Log
      if (target.closest('#bill-log-clear-btn')) {
        clearBillLog();
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

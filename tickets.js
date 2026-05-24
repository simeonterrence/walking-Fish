// tickets.js — Piroake Fest Ticket Shop & Dashboard
// Handles: ticket type listing, cart, ModemPay/Wave checkout, magic link auth, dashboard

(function() {
  'use strict';

  const SUPA_URL = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://anigcqdquakinlzvyaur.supabase.co';
  const SUPA_ANON = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';
  const EDGE_URL = SUPA_URL + '/functions/v1/ticketing';

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    ticketTypes: [],
    cart: {},              // { [ticketTypeId]: quantity }
    selectedPayment: 'modempay',
    session: null,         // Supabase Auth session
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
    if (show) {
      el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    }
  }

  function getSupabaseClient() {
    // Simple Supabase client using REST API pattern
    return {
      from: function(table) {
        return {
          select: function(columns) {
            var url = SUPA_URL + '/rest/v1/' + table + '?' + (columns ? 'select=' + encodeURIComponent(columns) : '');
            return {
              eq: function(col, val) {
                url += '&' + col + '=eq.' + encodeURIComponent(val);
                return this;
              }.bind(this),
              filter: function(col, op, val) {
                url += '&' + col + '=' + op + '.' + encodeURIComponent(val);
                return this;
              }.bind(this),
              order: function(col, opts) {
                url += '&order=' + encodeURIComponent(col) + (opts && opts.ascending === false ? '.desc' : '');
                return this;
              }.bind(this),
              limit: function(n) {
                url += '&limit=' + n;
                return this;
              }.bind(this),
              single: function() {
                url += '&limit=1';
                return fetch(url, {
                  headers: {
                    'apikey': SUPA_ANON,
                    'Authorization': 'Bearer ' + SUPA_ANON,
                    'Accept': 'application/json',
                  }
                }).then(function(r) {
                  if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'Failed to fetch'); });
                  return r.json().then(function(data) {
                    if (!data || data.length === 0) return { data: null, error: { message: 'Not found' } };
                    return { data: data[0], error: null };
                  });
                });
              }.bind(this),
              then: function(cb) {
                return fetch(url, {
                  headers: {
                    'apikey': SUPA_ANON,
                    'Authorization': 'Bearer ' + SUPA_ANON,
                    'Accept': 'application/json',
                  }
                }).then(function(r) {
                  if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'Failed to fetch'); });
                  return r.json().then(function(data) { return { data: data, error: null }; });
                }).then(cb);
              }
            };
          },
          insert: function(data) {
            return {
              select: function() {
                return {
                  single: function() {
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
                      return r.json().then(function(d) { return { data: d, error: null }; });
                    });
                  }
                };
              }
            };
          }
        };
      },
      rpc: function(fn, params) {
        return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
          method: 'POST',
          headers: {
            'apikey': SUPA_ANON,
            'Authorization': 'Bearer ' + SUPA_ANON,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params || {}),
        }).then(function(r) {
          if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'RPC failed'); });
          return r.json().then(function(d) { return { data: d, error: null }; });
        });
      },
      auth: {
        signInWithOtp: function(opts) {
          // Use Supabase Auth REST API
          return fetch(SUPA_URL + '/auth/v1/otp', {
            method: 'POST',
            headers: {
              'apikey': SUPA_ANON,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: opts.email, create_user: true }),
          }).then(function(r) {
            if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || 'OTP send failed'); });
            return { data: null, error: null };
          });
        },
        setSession: function(session) {
          state.session = session;
          try {
            if (session) sessionStorage.setItem('wf_tickets_session', JSON.stringify(session));
            else sessionStorage.removeItem('wf_tickets_session');
          } catch (e) {}
        },
        getSession: function() {
          if (state.session) return { data: { session: state.session }, error: null };
          try {
            var stored = sessionStorage.getItem('wf_tickets_session');
            if (stored) {
              state.session = JSON.parse(stored);
              return { data: { session: state.session }, error: null };
            }
          } catch (e) {}
          return { data: { session: null }, error: null };
        },
        onAuthStateChange: function(cb) {
          // Poll for hash fragment (magic link redirect)
          var handleHash = function() {
            var hash = window.location.hash;
            if (hash && hash.indexOf('access_token') !== -1) {
              var params = new URLSearchParams(hash.replace('#', ''));
              var session = {
                access_token: params.get('access_token'),
                refresh_token: params.get('refresh_token'),
                expires_at: parseInt(params.get('expires_in') || '3600', 10) * 1000 + Date.now(),
                user: { email: params.get('email') },
              };
              if (session.access_token) {
                state.session = session;
                try { sessionStorage.setItem('wf_tickets_session', JSON.stringify(session)); } catch (e) {}
                window.location.hash = '';
                cb('SIGNED_IN', session);
                // Reload dashboard
                loadDashboard();
              }
            }
          };
          handleHash();
          window.addEventListener('hashchange', handleHash);
        }
      }
    };
  }

  var supabase = getSupabaseClient();

  // ─── Ticket Type Loading ──────────────────────────────────────────────────

  function loadTicketTypes() {
    var container = document.getElementById('ticket-types-container');
    if (!container) return;

    supabase
      .from('ticket_types')
      .select('id,name,slug,type,price,capacity,sold,sort_order,is_active')
      .order('sort_order', { ascending: true })
      .then(function(result) {
        if (result.error) {
          container.innerHTML = '<div class="error-message">Failed to load ticket types. Please refresh.</div>';
          return;
        }

        state.ticketTypes = result.data || [];

        if (state.ticketTypes.length === 0) {
          container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px 0;">No tickets available yet. Check back soon!</p>';
          return;
        }

        renderTicketTypes();
      });
  }

  function renderTicketTypes() {
    var container = document.getElementById('ticket-types-container');
    if (!container) return;

    var entryTypes = state.ticketTypes.filter(function(t) { return t.type === 'entry' || t.type === 'parking'; });
    var activityTypes = state.ticketTypes.filter(function(t) { return t.type === 'activity_credit'; });

    var html = '';

    // Section: Entry & Parking
    html += '<h3 style="font-size:15px;color:var(--muted);margin-bottom:16px;text-transform:uppercase;letter-spacing:0.06em;">Entry &amp; Parking</h3>';
    html += '<div style="display:grid;gap:12px;margin-bottom:32px;">';
    entryTypes.forEach(function(t) { html += renderTicketCard(t); });
    html += '</div>';

    // Section: Activity Credits
    html += '<h3 style="font-size:15px;color:var(--muted);margin-bottom:16px;text-transform:uppercase;letter-spacing:0.06em;">Games &amp; Activity Credits</h3>';
    html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Pre-load credits for on-site games, karaoke, and activities. Unused credits are fully refundable.</p>';
    html += '<div style="display:grid;gap:12px;">';
    activityTypes.forEach(function(t) { html += renderTicketCard(t); });
    html += '</div>';

    container.innerHTML = html;
  }

  function renderTicketCard(t) {
    var qty = state.cart[t.id] || 0;
    var remaining = t.capacity - t.sold;
    var soldOut = remaining <= 0;

    var typeLabel = '';
    if (t.type === 'entry') typeLabel = 'Entry Pass';
    else if (t.type === 'parking') typeLabel = 'Parking';
    else typeLabel = 'Activity Credit';

    return '<div class="ticket-card' + (soldOut ? '" style="opacity:0.5;"' : '"') + ' data-type-id="' + t.id + '">' +
      '<div class="ticket-card-info">' +
        '<h3>' + escapeHtml(t.name) + '</h3>' +
        '<div class="desc">' + typeLabel + (soldOut ? ' &middot; <strong style="color:#c53030;">Sold out</strong>' : remaining < 100 ? ' &middot; <strong style="color:var(--accent);">Only ' + remaining + ' left!</strong>' : '') + '</div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div class="ticket-card-price">' + formatCurrency(t.price) + '</div>' +
        '<div class="ticket-card-actions" style="margin-top:8px;justify-content:flex-end;">' +
          '<button class="qty-btn" data-ticket-id="' + t.id + '" data-action="decrement"' + (qty <= 0 ? ' disabled' : '') + '>&minus;</button>' +
          '<span class="qty-val" id="qty-' + t.id + '">' + qty + '</span>' +
          '<button class="qty-btn" data-ticket-id="' + t.id + '" data-action="increment"' + (soldOut ? ' disabled' : '') + '>+</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Cart Management ──────────────────────────────────────────────────────

  function updateCart(ticketId, delta) {
    var t = state.ticketTypes.find(function(t) { return t.id === ticketId; });
    if (!t) return;

    var current = state.cart[ticketId] || 0;
    var newQty = Math.max(0, current + delta);

    if (newQty === 0) {
      delete state.cart[ticketId];
    } else {
      // Check capacity
      var remaining = t.capacity - t.sold;
      if (newQty > remaining) newQty = remaining;
      state.cart[ticketId] = newQty;
    }

    renderCart();
    renderTicketTypes();
    updateCheckoutButton();
  }

  function renderCart() {
    var container = document.getElementById('cart-contents');
    var totalEl = document.getElementById('cart-total');
    var totalAmt = document.getElementById('cart-total-amount');
    if (!container) return;

    var ids = Object.keys(state.cart);
    if (ids.length === 0) {
      container.innerHTML = '<div class="cart-empty">Select tickets above</div>';
      if (totalEl) totalEl.style.display = 'none';
      return;
    }

    var total = 0;
    var html = '';
    ids.forEach(function(id) {
      var t = state.ticketTypes.find(function(t) { return t.id === id; });
      if (!t) return;
      var qty = state.cart[id];
      var lineTotal = t.price * qty;
      total += lineTotal;
      html += '<div class="cart-item">' +
        '<span class="cart-item-name">' + escapeHtml(t.name) + '</span>' +
        '<span class="cart-item-qty">' + qty + 'x</span>' +
        '<span class="cart-item-cost">' + formatCurrency(lineTotal) + '</span>' +
      '</div>';
    });

    container.innerHTML = html;
    if (totalEl) totalEl.style.display = 'block';
    if (totalAmt) totalAmt.textContent = formatCurrency(total);

    // Update Wave amount
    var waveAmt = document.getElementById('wave-amount');
    if (waveAmt) waveAmt.textContent = formatCurrency(total);
  }

  function updateCheckoutButton() {
    var btn = document.getElementById('checkout-btn');
    if (!btn) return;
    var hasItems = Object.keys(state.cart).length > 0;
    btn.disabled = !hasItems;
  }

  function getCartTotal() {
    var total = 0;
    Object.keys(state.cart).forEach(function(id) {
      var t = state.ticketTypes.find(function(t) { return t.id === id; });
      if (t) total += t.price * state.cart[id];
    });
    return total;
  }

  // ─── Payment Method Selection ─────────────────────────────────────────────

  function initPaymentSelection() {
    var options = $$('.payment-option input[name="payment"]');
    options.forEach(function(radio) {
      radio.addEventListener('change', function() {
        state.selectedPayment = this.value;
        $$('.payment-option').forEach(function(el) { el.classList.remove('selected'); });
        var parent = this.closest('.payment-option');
        if (parent) parent.classList.add('selected');

        var waveDetails = document.getElementById('wave-details');
        if (waveDetails) {
          waveDetails.classList.toggle('active', this.value === 'wave');
        }
      });
    });

    // Select default
    var defaultRadio = document.querySelector('.payment-option input[value="modempay"]');
    if (defaultRadio) {
      defaultRadio.checked = true;
      var parent = defaultRadio.closest('.payment-option');
      if (parent) parent.classList.add('selected');
    }
  }

  // ─── Checkout Flow ────────────────────────────────────────────────────────

  function initCheckout() {
    var btn = document.getElementById('checkout-btn');
    if (!btn) return;
    btn.addEventListener('click', handleCheckout);
  }

  function handleCheckout() {
    var email = document.getElementById('checkout-email');
    var nameInput = document.getElementById('checkout-name');
    var errorEl = document.getElementById('checkout-error');
    hideError('checkout-error');

    if (!email || !email.value || !email.value.includes('@')) {
      showError('checkout-error', 'Please enter a valid email address.');
      if (email) email.focus();
      return;
    }

    var items = Object.keys(state.cart).filter(function(id) { return state.cart[id] > 0; }).map(function(id) {
      return { ticket_type_id: id, quantity: state.cart[id] };
    });

    if (items.length === 0) {
      showError('checkout-error', 'Your cart is empty.');
      return;
    }

    var btn = document.getElementById('checkout-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

    // 1. Create order via Edge Function
    fetch(EDGE_URL + '/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body: JSON.stringify({
        email: email.value.trim(),
        customer_name: nameInput ? nameInput.value.trim() : '',
        items: items,
      }),
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Failed to create order'); });
      return r.json();
    })
    .then(function(orderData) {
      if (!orderData.success) throw new Error(orderData.error || 'Failed to create order');

      var orderId = orderData.order_id;

      if (state.selectedPayment === 'modempay') {
        // 2a. Create ModemPay intent
        return fetch(EDGE_URL + '/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
          body: JSON.stringify({
            order_id: orderId,
            amount: orderData.total,
            email: email.value.trim(),
            description: 'Piroake Fest 2026 ticket purchase',
          }),
        })
        .then(function(r) {
          if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'Payment initiation failed'); });
          return r.json();
        })
        .then(function(intentData) {
          if (intentData.payment_url) {
            // Redirect to ModemPay
            window.location.href = intentData.payment_url;
            // Show redirect message in case redirect doesn't happen (popup blocker etc.)
            showConfirmation('redirect', {
              email: email.value.trim(),
              orderId: orderId,
              paymentUrl: intentData.payment_url,
            });
          } else {
            throw new Error('No payment URL returned from ModemPay');
          }
        });
      } else {
        // 2b. Wave Transfer — show proof submission
        showConfirmation('wave_pending', {
          email: email.value.trim(),
          orderId: orderId,
          total: orderData.total,
        });
      }
    })
    .catch(function(err) {
      showError('checkout-error', err.message || 'Something went wrong. Please try again.');
      if (btn) { btn.disabled = false; btn.textContent = 'Proceed to Checkout'; }
    });
  }

  // ─── Confirmation Display ─────────────────────────────────────────────────

  function showConfirmation(mode, data) {
    // Hide shop view sections
    var cartContents = document.getElementById('cart-contents');
    var cartTotal = document.getElementById('cart-total');
    var checkoutSection = document.getElementById('checkout-section');
    var checkoutError = document.getElementById('checkout-error');

    if (cartContents) cartContents.innerHTML = '';
    if (cartTotal) cartTotal.style.display = 'none';
    if (checkoutSection) checkoutSection.classList.remove('active');
    if (checkoutError) checkoutError.style.display = 'none';

    var confView = document.getElementById('confirmation-view');
    var confMsg = document.getElementById('confirmation-msg');
    var confTickets = document.getElementById('confirmation-tickets');
    if (!confView) return;

    if (mode === 'redirect') {
      confMsg.textContent = 'You are being redirected to ModemPay to complete your payment.';
      if (confTickets) {
        confTickets.innerHTML =
          '<div class="success-message">' +
            '<strong>Order #' + data.orderId.slice(0, 8) + '</strong><br>' +
            'If you are not redirected automatically, ' +
            '<a href="' + escapeHtml(data.paymentUrl) + '" style="color:var(--accent);">click here</a> to continue.' +
          '</div>';
      }
    } else if (mode === 'wave_pending') {
      confMsg.textContent = 'Your order is pending payment verification.';
      if (confTickets) {
        confTickets.innerHTML =
          '<div class="success-message" style="text-align:left;">' +
            '<p style="margin-bottom:8px;"><strong>Order #' + data.orderId.slice(0, 8) + '</strong></p>' +
            '<p>Send <strong>' + formatCurrency(data.total) + '</strong> to one of the following:</p>' +
            '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin:12px 0;">' +
              '<div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:8px; text-align:center;">' +
                '<div style="font-size:10px; text-transform:uppercase; color:var(--muted); margin-bottom:2px;">Wave Number</div>' +
                '<div style="font-family:var(--font-mono); font-size:14px; font-weight:700;">+220 696 3419</div>' +
              '</div>' +
              '<div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:8px; text-align:center;">' +
                '<div style="font-size:10px; text-transform:uppercase; color:var(--muted); margin-bottom:2px;">Bank Account</div>' +
                '<div style="font-family:var(--font-mono); font-size:14px; font-weight:700;">206370720110</div>' +
              '</div>' +
            '</div>' +
            '<p style="font-size:13px;">Keep your reference number. We\'ll notify you once the payment is verified.<br>' +
            'Tickets will be emailed to <strong>' + escapeHtml(data.email) + '</strong>.</p>' +
          '</div>';
      }
    }

    confView.classList.add('active');

    // Clear cart
    state.cart = {};
    renderCart();
    updateCheckoutButton();

    var btn = document.getElementById('checkout-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Proceed to Checkout'; }
  }

  // ─── Dashboard — Magic Link Auth ──────────────────────────────────────────

  function initDashboard() {
    var loginBtn = document.getElementById('dashboard-login-btn');
    var logoutBtn = document.getElementById('dashboard-logout-btn');

    if (loginBtn) {
      loginBtn.addEventListener('click', function() {
        var email = document.getElementById('dashboard-email');
        var msg = document.getElementById('dashboard-login-msg');
        if (!email || !email.value || !email.value.includes('@')) {
          if (msg) msg.textContent = 'Please enter a valid email address.';
          return;
        }
        if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Sending…'; }
        if (msg) msg.textContent = '';

        supabase.auth.signInWithOtp({ email: email.value.trim() })
          .then(function(result) {
            if (result.error) throw result.error;
            if (msg) msg.textContent = 'Magic link sent! Check your email (check spam too).';
          })
          .catch(function(err) {
            if (msg) msg.textContent = err.message || 'Failed to send. Try again.';
          })
          .finally(function() {
            if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Send Magic Link'; }
          });
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        supabase.auth.setSession(null);
        showDashboardLogin();
      });
    }

    // Check for existing session
    var sessionResult = supabase.auth.getSession();
    if (sessionResult.data && sessionResult.data.session) {
      loadDashboard();
    }

    // Listen for auth state changes
    supabase.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_IN') {
        loadDashboard();
      }
    });
  }

  function loadDashboard() {
    var session = state.session;
    if (!session) {
      showDashboardLogin();
      return;
    }

    var prompt = document.getElementById('dashboard-login-prompt');
    var content = document.getElementById('dashboard-content');
    var userEmail = document.getElementById('dashboard-user-email');

    if (prompt) prompt.style.display = 'none';
    if (content) content.style.display = 'block';
    if (userEmail) userEmail.textContent = session.user && session.user.email ? session.user.email : '';

    // Fetch tickets for this email
    var email = session.user && session.user.email ? session.user.email : '';
    if (!email) {
      showDashboardLogin();
      return;
    }

    loading('dashboard-tickets-list', true);

    supabase
      .from('tickets')
      .select('id,code,type,status,balance,customer_name,ticket_type_id,order_id,created_at')
      .filter('customer_email', 'eq', email)
      .then(function(result) {
        if (result.error) {
          document.getElementById('dashboard-tickets-list').innerHTML =
            '<div class="error-message">Failed to load tickets.</div>';
          return;
        }

        var tickets = result.data || [];
        renderDashboardTickets(tickets);
      });
  }

  function renderDashboardTickets(tickets) {
    var container = document.getElementById('dashboard-tickets-list');
    if (!container) return;

    if (tickets.length === 0) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px 0;">' +
          '<p style="color:var(--muted);margin-bottom:16px;">You don\'t have any tickets yet.</p>' +
          '<a href="#shop-view" class="btn btn-primary" onclick="document.querySelector(\'[data-tab=shop]\').click()">Buy Tickets</a>' +
        '</div>';
      return;
    }

    var entryTickets = tickets.filter(function(t) { return t.type === 'entry' || t.type === 'parking'; });
    var activityTickets = tickets.filter(function(t) { return t.type === 'activity_credit'; });

    var html = '';

    // Entry tickets
    if (entryTickets.length > 0) {
      html += '<h3 style="font-size:15px;color:var(--muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.06em;">Entry &amp; Parking</h3>';
      entryTickets.forEach(function(t) {
        html += renderDashboardCard(t);
      });
    }

    // Activity credit tickets
    if (activityTickets.length > 0) {
      html += '<h3 style="font-size:15px;color:var(--muted);margin:24px 0 12px;text-transform:uppercase;letter-spacing:0.06em;">Activity Credits</h3>';
      activityTickets.forEach(function(t) {
        html += renderDashboardCard(t);
      });
    }

    container.innerHTML = html;

    // Load transaction history for first activity credit ticket
    var firstActivity = activityTickets[0];
    if (firstActivity) {
      loadTransactionHistory(firstActivity.id);
    }
  }

  function renderDashboardCard(t) {
    var isUsed = t.status === 'used';
    var isExhausted = t.status === 'exhausted';
    var isActive = t.status === 'active';

    var statusLabel = isActive ? '' : isUsed ? 'Used' : isExhausted ? 'Exhausted' : t.status;
    var qrUrl = window.location.origin + '/t?t=' + t.code;

    return '<div class="ticket-dashboard-card">' +
      '<div class="ticket-db-info">' +
        '<h3>' + escapeHtml(t.customer_name || 'Ticket') + '</h3>' +
        '<div class="code">' + escapeHtml(t.code) + '</div>' +
        '<div class="meta">' +
          (statusLabel ? '<span style="color:#c53030;font-weight:500;">' + statusLabel + '</span> &middot; ' : '') +
          'Type: ' + t.type +
        '</div>' +
      '</div>' +
      (t.type === 'activity_credit' ? '<div class="ticket-db-balance"><div class="amt">' + formatCurrency(t.balance) + '</div><div class="lbl">Balance</div></div>' : '') +
      '<div class="ticket-db-actions">' +
        '<button class="btn btn-secondary btn-icon qr-toggle-btn" data-qr="' + escapeHtml(qrUrl) + '" title="Show QR code" style="font-size:18px;padding:8px 12px;">&#9632;</button>' +
        (t.type === 'activity_credit' && isActive ?
          '<a href="/top-up?t=' + t.code + '" class="btn btn-primary" style="font-size:13px;padding:8px 16px;">Top Up</a>' : '') +
      '</div>' +
    '</div>';
  }

  // ─── Transaction History ──────────────────────────────────────────────────

  function loadTransactionHistory(ticketId) {
    var section = document.getElementById('txn-history-section');
    var list = document.getElementById('txn-history-list');
    if (!section || !list) return;

    supabase
      .from('balance_transactions')
      .select('id,type,amount_delta,balance_after,source,notes,created_at')
      .filter('ticket_id', 'eq', ticketId)
      .then(function(result) {
        if (result.error || !result.data || result.data.length === 0) {
          return;
        }

        section.style.display = 'block';
        var txns = result.data.sort(function(a, b) {
          return new Date(b.created_at) - new Date(a.created_at);
        });

        var html = '';
        txns.forEach(function(txn) {
          var isPositive = txn.amount_delta > 0;
          var date = new Date(txn.created_at);
          var dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          html += '<div class="transaction-item">' +
            '<span class="transaction-date">' + dateStr + '</span>' +
            '<span class="transaction-type">' + escapeHtml(txn.type.replace(/_/g, ' ')) + '</span>' +
            '<span class="transaction-source">' + escapeHtml(txn.source) + '</span>' +
            '<span class="transaction-amount ' + (isPositive ? 'positive' : 'negative') + '">' +
              (isPositive ? '+' : '') + formatCurrency(txn.amount_delta) +
            '</span>' +
          '</div>';
        });

        list.innerHTML = html;
      });
  }

  // ─── Dashboard Login / Logout UI ──────────────────────────────────────────

  function showDashboardLogin() {
    var prompt = document.getElementById('dashboard-login-prompt');
    var content = document.getElementById('dashboard-content');
    if (prompt) prompt.style.display = 'block';
    if (content) content.style.display = 'none';

    var section = document.getElementById('txn-history-section');
    if (section) section.style.display = 'none';
  }

  // ─── Tab Switching (Shop / Dashboard) ─────────────────────────────────────

  function initTabs() {
    $$('.section-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var tabName = this.getAttribute('data-tab');
        // Update tab styles
        $$('.section-tab').forEach(function(t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');

        // Show/hide views
        var shopView = document.getElementById('shop-view');
        var dashView = document.getElementById('dashboard-view');
        if (shopView) shopView.style.display = tabName === 'shop' ? '' : 'none';
        if (dashView) dashView.style.display = tabName === 'dashboard' ? '' : 'none';

        if (tabName === 'dashboard') {
          loadDashboard();
        }
      });
    });
  }

  // ─── QR Code Toggle ──────────────────────────────────────────────────────

  function initQRToggle() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.qr-toggle-btn');
      if (!btn) return;
      var qrUrl = btn.getAttribute('data-qr');
      if (!qrUrl) return;

      // Show QR in a simple overlay
      var existing = document.getElementById('qr-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'qr-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.6);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;';
      overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });

      overlay.innerHTML =
        '<div style="background:var(--surface);border-radius:16px;padding:32px;max-width:340px;width:100%;text-align:center;">' +
          '<p style="font-size:14px;color:var(--muted);margin-bottom:16px;">Scan this at the venue</p>' +
          '<div id="qr-code-container" style="margin:0 auto 16px;width:220px;height:220px;background:var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--muted);">Loading QR…</div>' +
          '<p style="font-size:13px;word-break:break-all;color:var(--muted);">' + escapeHtml(qrUrl) + '</p>' +
          '<button class="btn btn-secondary" style="margin-top:16px;width:100%;" onclick="this.closest(\'#qr-overlay\').remove()">Close</button>' +
        '</div>';

      document.body.appendChild(overlay);

      // Generate QR via image tag (works under existing CSP: img-src 'self' data: https:)
      var qrContainer = document.getElementById('qr-code-container');
      if (qrContainer) {
        var img = document.createElement('img');
        img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(qrUrl);
        img.alt = 'QR Code';
        img.style.cssText = 'width:220px;height:220px;border-radius:4px;';
        img.onerror = function() {
          qrContainer.innerHTML = '<a href="' + escapeHtml(qrUrl) + '" style="color:var(--accent);">Open link</a>';
        };
        qrContainer.appendChild(img);
      }
    });
  }

  // ─── Event Delegation for Qty Buttons ─────────────────────────────────────

  function initQtyButtons() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.qty-btn');
      if (!btn) return;
      var ticketId = btn.getAttribute('data-ticket-id');
      var action = btn.getAttribute('data-action');
      if (!ticketId) return;

      if (action === 'increment') {
        updateCart(ticketId, 1);
      } else if (action === 'decrement') {
        updateCart(ticketId, -1);
      }
    });
  }

  // ─── Wave Transfer Proof Submission via Payment Proofs ─────────────────────

  // When Wave is selected, we show the confirmation with payment details.
  // The proof is submitted by the admin verifying the payment (Task 1.3).
  // The order is created with status 'pending_verification'.

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    loadTicketTypes();
    initPaymentSelection();
    initCheckout();
    initDashboard();
    initTabs();
    initQtyButtons();
    initQRToggle();

    // Show checkout section when cart has items (via cart rendering)
    var checkoutSection = document.getElementById('checkout-section');
    var origRender = renderCart;
    renderCart = function() {
      origRender();
      var hasItems = Object.keys(state.cart).length > 0;
      if (checkoutSection) {
        checkoutSection.classList.toggle('active', hasItems);
      }
    };
    renderCart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

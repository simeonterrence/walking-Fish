// Admin ticket management: ticketing system admin features
// Loaded on admin.html alongside admin-photos.js and vendor-auth.js

/* ═══════════════════════════════════════════════════════════════════════════
   1. INVENTORY OVERVIEW
   ═══════════════════════════════════════════════════════════════════════════ */

function loadInventory() {
  var container = document.getElementById('inventory-container');
  container.innerHTML = '<p style="color:var(--muted);font-size:14px;">Loading inventory...</p>';

  fetchWithAuth(SUPABASE_URL + '/rest/v1/ticket_types?order=sort_order.asc&select=*')
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to load inventory.');
      return res.json();
    })
    .then(function(types) {
      if (!types || types.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No ticket types configured.</p>';
        return;
      }

      var totalCap = 0, totalSold = 0;
      types.forEach(function(t) { totalCap += t.capacity; totalSold += t.sold; });

      var html = '';
      // Overall stats
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">' +
        '<div class="stat-card"><div class="num">' + totalSold + '</div><div class="lbl">Total Sold</div></div>' +
        '<div class="stat-card"><div class="num">' + totalCap + '</div><div class="lbl">Total Capacity</div></div>' +
        '<div class="stat-card"><div class="num" style="color:' + (totalCap - totalSold <= 50 ? '#991B1B' : '#065F46') + ';">' + (totalCap - totalSold) + '</div><div class="lbl">Remaining</div></div>' +
        '<div class="stat-card"><div class="num">' + (totalCap > 0 ? Math.round(totalSold / totalCap * 100) : 0) + '%</div><div class="lbl">Fill Rate</div></div>' +
        '</div>';

      // Per-type table
      html += '<div style="overflow-x:auto;"><table class="app-table"><thead><tr>' +
        '<th>Ticket Type</th><th>Type</th><th>Price</th><th>Sold</th><th>Capacity</th><th>Fill</th><th>Status</th>' +
        '</tr></thead><tbody>';
      types.forEach(function(t) {
        var fillPct = t.capacity > 0 ? Math.round(t.sold / t.capacity * 100) : 0;
        var fillColor = fillPct >= 90 ? '#991B1B' : fillPct >= 70 ? '#92400E' : '#065F46';
        var statusClass = t.is_active ? 'status-approved' : 'status-rejected';
        var statusText = t.is_active ? 'Active' : 'Inactive';
        html += '<tr>' +
          '<td><strong>' + escapeHtml(t.name) + '</strong></td>' +
          '<td><span style="font-size:13px;color:var(--muted);text-transform:capitalize;">' + t.type.replace('_', ' ') + '</span></td>' +
          '<td><strong>D' + t.price + '</strong></td>' +
          '<td><span style="font-weight:600;">' + t.sold + '</span></td>' +
          '<td>' + t.capacity + '</td>' +
          '<td><span style="font-weight:600;color:' + fillColor + ';">' + fillPct + '%</span></td>' +
          '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    })
    .catch(function(err) {
      container.innerHTML = '<p style="color:#DC2626;font-size:14px;">Failed to load inventory: ' + escapeHtml(err.message) + '</p>';
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. ORDER MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */

var currentOrderFilter = 'all';

function setOrderFilter(status) {
  currentOrderFilter = status;
  document.querySelectorAll('.order-filter-btn').forEach(function(b) {
    b.classList.toggle('order-filter-active', b.getAttribute('data-status') === status);
  });
  loadOrders();
}

function loadOrders() {
  var container = document.getElementById('orders-container');
  container.innerHTML = '<p style="color:var(--muted);font-size:14px;">Loading orders...</p>';

  var url = SUPABASE_URL + '/rest/v1/orders?order=created_at.desc&select=*';
  if (currentOrderFilter !== 'all') {
    url += '&status=eq.' + currentOrderFilter;
  }

  fetchWithAuth(url)
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to load orders.');
      return res.json();
    })
    .then(function(orders) {
      if (!orders || orders.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No orders found' +
          (currentOrderFilter !== 'all' ? ' with this status' : '') + '.</p>';
        return;
      }

      var html = '';
      html += '<div style="overflow-x:auto;"><table class="app-table"><thead><tr>' +
        '<th>Order ID</th><th>Email</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th></th>' +
        '</tr></thead><tbody>';
      orders.forEach(function(o) {
        var statusClass = 'status-' + (o.status === 'paid' ? 'approved' : o.status === 'unpaid' ? 'pending' : o.status === 'cancelled' || o.status === 'refunded' ? 'rejected' : 'pending');
        var payMethod = o.payment_method === 'modempay' ? 'ModemPay' : o.payment_method === 'wave_transfer' ? 'Wave' : '-';
        html += '<tr>' +
          '<td><code style="font-size:12px;">#' + o.id.slice(0, 8) + '</code></td>' +
          '<td><span style="font-size:13px;">' + escapeHtml(o.email) + '</span></td>' +
          '<td><strong>D' + o.total + '</strong></td>' +
          '<td><span style="font-size:13px;color:var(--muted);">' + payMethod + '</span></td>' +
          '<td><span class="status-badge ' + statusClass + '">' + o.status.replace('_', ' ') + '</span></td>' +
          '<td><span style="font-size:13px;color:var(--muted);">' + new Date(o.created_at).toLocaleDateString() + '</span></td>' +
          '<td><button class="action-btn order-expand-btn" data-order="' + o.id + '" style="background:var(--surface);border:1px solid var(--border);color:var(--fg);">View Tickets</button></td>' +
          '</tr>';
        // Hidden ticket row — expanded on click
        html += '<tr id="order-tickets-' + o.id + '" style="display:none;"><td colspan="7" style="padding:0;"><div class="order-tickets-detail">Loading...</div></td></tr>';
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    })
    .catch(function(err) {
      container.innerHTML = '<p style="color:#DC2626;font-size:14px;">Failed to load orders: ' + escapeHtml(err.message) + '</p>';
    });
}

function toggleOrderTickets(orderId) {
  var row = document.getElementById('order-tickets-' + orderId);
  if (!row) return;

  if (row.style.display !== 'none') {
    row.style.display = 'none';
    return;
  }

  row.style.display = 'table-row';
  var detail = row.querySelector('.order-tickets-detail');

  fetchWithAuth(SUPABASE_URL + '/rest/v1/tickets?order_id=eq.' + orderId + '&select=code,type,status,balance,customer_name,ticket_types!inner(name,slug,price)')
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to load tickets.');
      return res.json();
    })
    .then(function(tickets) {
      if (!tickets || tickets.length === 0) {
        detail.innerHTML = '<p style="padding:16px;color:var(--muted);font-size:13px;">No tickets found for this order.</p>';
        return;
      }
      var h = '<div style="padding:12px 16px;background:var(--accent-dim);border-radius:8px;margin:8px;">';
      h += '<table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Code</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Type</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Name</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Status</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Balance</th>' +
        '</tr></thead><tbody>';
      tickets.forEach(function(t) {
        var statusClass = 'status-' + (t.status === 'active' ? 'approved' : t.status === 'used' ? 'pending' : 'rejected');
        h += '<tr><td style="padding:6px 8px;font-family:var(--font-mono);font-size:12px;">' + escapeHtml(t.code) + '</td>' +
          '<td style="padding:6px 8px;">' + escapeHtml(t.ticket_types.name) + '</td>' +
          '<td style="padding:6px 8px;font-size:13px;">' + escapeHtml(t.customer_name || '-') + '</td>' +
          '<td style="padding:6px 8px;"><span class="status-badge ' + statusClass + '">' + t.status + '</span></td>' +
          '<td style="padding:6px 8px;font-weight:600;">' + (t.type === 'activity_credit' ? 'D' + t.balance : '-') + '</td></tr>';
      });
      h += '</tbody></table></div>';
      detail.innerHTML = h;
    })
    .catch(function(err) {
      detail.innerHTML = '<p style="padding:16px;color:#DC2626;font-size:13px;">' + escapeHtml(err.message) + '</p>';
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. TICKET TYPES EDITOR
   ═══════════════════════════════════════════════════════════════════════════ */

function loadTicketTypes() {
  var container = document.getElementById('ticket-types-container');
  container.innerHTML = '<p style="color:var(--muted);font-size:14px;">Loading ticket types...</p>';

  fetchWithAuth(SUPABASE_URL + '/rest/v1/ticket_types?order=sort_order.asc&select=*')
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to load ticket types.');
      return res.json();
    })
    .then(function(types) {
      if (!types || types.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No ticket types configured.</p>';
        return;
      }

      var html = '<div style="overflow-x:auto;margin-bottom:16px;"><table class="app-table"><thead><tr>' +
        '<th>Name</th><th>Slug</th><th>Type</th><th>Price</th><th>Capacity</th><th>Sold</th><th>Status</th><th>Actions</th>' +
        '</tr></thead><tbody>';
      types.forEach(function(t) {
        var statusClass = t.is_active ? 'status-approved' : 'status-rejected';
        var statusText = t.is_active ? 'Active' : 'Inactive';
        html += '<tr>' +
          '<td><strong>' + escapeHtml(t.name) + '</strong></td>' +
          '<td><code style="font-size:12px;background:#f0f0f0;padding:2px 6px;border-radius:4px;">' + escapeHtml(t.slug) + '</code></td>' +
          '<td><span style="font-size:13px;color:var(--muted);text-transform:capitalize;">' + t.type.replace('_', ' ') + '</span></td>' +
          '<td><strong>D' + t.price + '</strong></td>' +
          '<td>' + t.capacity + '</td>' +
          '<td>' + t.sold + '</td>' +
          '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>' +
          '<td>' +
            '<button class="action-btn ticket-type-toggle-btn" data-id="' + t.id + '" data-active="' + t.is_active + '" style="background:#065F46;color:white;' + (t.is_active ? '' : 'opacity:0.5;') + '">' + (t.is_active ? 'Deactivate' : 'Activate') + '</button>' +
          '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';

      // Add new ticket type form
      html += '<h4 style="font-size:15px;margin-bottom:12px;">Add New Ticket Type</h4>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Name</label><input type="text" id="new-ticket-name" placeholder="e.g. VIP Entry" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Slug</label><input type="text" id="new-ticket-slug" placeholder="e.g. vip-entry" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Type</label>' +
        '<select id="new-ticket-type" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
        '<option value="entry">Entry</option><option value="activity_credit">Activity Credit</option><option value="parking">Parking</option></select></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Price (D)</label><input type="number" id="new-ticket-price" value="0" min="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Capacity</label><input type="number" id="new-ticket-capacity" value="100" min="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Sort Order</label><input type="number" id="new-ticket-sort" value="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div style="display:flex;align-items:end;"><button id="add-ticket-type-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Add Ticket Type</button></div>' +
        '</div>';

      container.innerHTML = html;
    })
    .catch(function(err) {
      container.innerHTML = '<p style="color:#DC2626;font-size:14px;">Failed to load ticket types: ' + escapeHtml(err.message) + '</p>';
    });
}

function toggleTicketTypeActive(id, currentlyActive) {
  var btn = document.querySelector('.ticket-type-toggle-btn[data-id="' + id + '"]');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  // Try RPC first (works with ticketing_role JWT), fall back to service key
  fetchWithAuth(SUPABASE_URL + '/rest/v1/rpc/toggle_ticket_type_active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id, p_active: !currentlyActive })
  }).then(function(res) {
    if (res.ok) { loadTicketTypes(); return; }
    // RPC may fail if the DB hasn't been migrated — fall back to service key
    var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
    if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
    if (!svcKey) { throw new Error('Permission denied or service key required.'); }
    return fetch(SUPABASE_URL + '/rest/v1/ticket_types?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ is_active: !currentlyActive })
    }).then(function(r) { if (!r.ok) throw new Error('Failed to update.'); loadTicketTypes(); });
  }).catch(function(err) {
    alert('Error: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = currentlyActive ? 'Deactivate' : 'Activate'; }
  });
}

function addTicketType() {
  var name = document.getElementById('new-ticket-name').value.trim();
  var slug = document.getElementById('new-ticket-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  var type = document.getElementById('new-ticket-type').value;
  var price = parseInt(document.getElementById('new-ticket-price').value) || 0;
  var capacity = parseInt(document.getElementById('new-ticket-capacity').value) || 0;
  var sortOrder = parseInt(document.getElementById('new-ticket-sort').value) || 0;

  if (!name || !slug) { alert('Name and slug are required.'); return; }

  var btn = document.getElementById('add-ticket-type-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

  function clearForm() {
    document.getElementById('new-ticket-name').value = '';
    document.getElementById('new-ticket-slug').value = '';
    document.getElementById('new-ticket-price').value = '0';
    document.getElementById('new-ticket-capacity').value = '100';
    document.getElementById('new-ticket-sort').value = '0';
  }

  // Try RPC first (works with ticketing_role JWT), fall back to service key
  fetchWithAuth(SUPABASE_URL + '/rest/v1/rpc/add_ticket_type', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_name: name, p_slug: slug, p_type: type,
      p_price: price, p_capacity: capacity, p_sort_order: sortOrder
    })
  }).then(function(res) {
    if (res.ok) { clearForm(); loadTicketTypes(); return; }
    throw new Error('RPC failed.');
  }).catch(function(err) {
    // Fall back to service key method
    var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
    if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
    if (!svcKey) { alert('Permission denied. Contact admin.'); if (btn) { btn.disabled = false; btn.textContent = 'Add Ticket Type'; } return; }

    return fetch(SUPABASE_URL + '/rest/v1/ticket_types', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ name: name, slug: slug, type: type, price: price, capacity: capacity, sold: 0, is_active: true, sort_order: sortOrder })
    }).then(function(r) {
      if (!r.ok) throw new Error('Failed to add ticket type.');
      clearForm();
      loadTicketTypes();
    }).catch(function(e2) {
      alert('Error: ' + e2.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Add Ticket Type'; }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. TOP-UP BUNDLES MANAGER
   ═══════════════════════════════════════════════════════════════════════════ */

function loadTopUpBundles() {
  var container = document.getElementById('bundles-container');
  container.innerHTML = '<p style="color:var(--muted);font-size:14px;">Loading top-up bundles...</p>';

  fetchWithAuth(SUPABASE_URL + '/rest/v1/top_up_bundles?order=sort_order.asc&select=*')
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to load bundles.');
      return res.json();
    })
    .then(function(bundles) {
      if (!bundles || bundles.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No top-up bundles configured.</p>';
        return;
      }

      var html = '<div style="overflow-x:auto;margin-bottom:16px;"><table class="app-table"><thead><tr>' +
        '<th>Amount</th><th>Status</th><th>Sort Order</th><th>Actions</th>' +
        '</tr></thead><tbody>';
      bundles.forEach(function(b) {
        var statusClass = b.is_active ? 'status-approved' : 'status-rejected';
        var statusText = b.is_active ? 'Active' : 'Inactive';
        html += '<tr>' +
          '<td><strong>D' + b.amount + '</strong></td>' +
          '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>' +
          '<td><span style="font-size:13px;color:var(--muted);">' + b.sort_order + '</span></td>' +
          '<td>' +
            '<button class="action-btn bundle-toggle-btn" data-id="' + b.id + '" data-active="' + b.is_active + '" style="background:#065F46;color:white;margin-right:6px;">' + (b.is_active ? 'Deactivate' : 'Activate') + '</button>' +
            '<button class="action-btn action-reject bundle-delete-btn" data-id="' + b.id + '">Delete</button>' +
          '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';

      // Add new bundle form
      html += '<div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Amount (D)</label><input type="number" id="new-bundle-amount" value="100" min="50" step="50" style="width:120px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Sort Order</label><input type="number" id="new-bundle-sort" value="0" style="width:80px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<button id="add-bundle-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Add Bundle</button>' +
        '</div>';

      container.innerHTML = html;
    })
    .catch(function(err) {
      container.innerHTML = '<p style="color:#DC2626;font-size:14px;">Failed to load bundles: ' + escapeHtml(err.message) + '</p>';
    });
}

function toggleBundleActive(id, currentlyActive) {
  var btn = document.querySelector('.bundle-toggle-btn[data-id="' + id + '"]');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  fetchWithAuth(SUPABASE_URL + '/rest/v1/rpc/toggle_bundle_active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id, p_active: !currentlyActive })
  }).then(function(res) {
    if (res.ok) { loadTopUpBundles(); return; }
    var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
    if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
    if (!svcKey) { throw new Error('Permission denied.'); }
    return fetch(SUPABASE_URL + '/rest/v1/top_up_bundles?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ is_active: !currentlyActive })
    }).then(function(r) { if (!r.ok) throw new Error('Failed to update.'); loadTopUpBundles(); });
  }).catch(function(err) {
    alert('Error: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = currentlyActive ? 'Deactivate' : 'Activate'; }
  });
}

function deleteBundle(id) {
  if (!confirm('Delete this top-up bundle?')) return;

  var btn = document.querySelector('.bundle-delete-btn[data-id="' + id + '"]');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  fetchWithAuth(SUPABASE_URL + '/rest/v1/rpc/delete_top_up_bundle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id })
  }).then(function(res) {
    if (res.ok) { loadTopUpBundles(); return; }
    var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
    if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
    if (!svcKey) { throw new Error('Permission denied.'); }
    return fetch(SUPABASE_URL + '/rest/v1/top_up_bundles?id=eq.' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + svcKey, 'Prefer': 'return=minimal' }
    }).then(function(r) { if (!r.ok) throw new Error('Failed to delete.'); loadTopUpBundles(); });
  }).catch(function(err) {
    alert('Error: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
  });
}

function addBundle() {
  var amount = parseInt(document.getElementById('new-bundle-amount').value) || 0;
  var sortOrder = parseInt(document.getElementById('new-bundle-sort').value) || 0;

  if (amount < 50) { alert('Minimum bundle amount is D50.'); return; }

  var btn = document.getElementById('add-bundle-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

  fetchWithAuth(SUPABASE_URL + '/rest/v1/rpc/add_top_up_bundle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_amount: amount, p_sort_order: sortOrder })
  }).then(function(res) {
    if (res.ok) {
      document.getElementById('new-bundle-amount').value = '100';
      document.getElementById('new-bundle-sort').value = '0';
      loadTopUpBundles();
      return;
    }
    throw new Error('RPC failed.');
  }).catch(function(err) {
    var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
    if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
    if (!svcKey) { alert('Permission denied. Contact admin.'); if (btn) { btn.disabled = false; btn.textContent = 'Add Bundle'; } return; }
    return fetch(SUPABASE_URL + '/rest/v1/top_up_bundles', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ amount: amount, sort_order: sortOrder, is_active: true })
    }).then(function(r) {
      if (!r.ok) throw new Error('Failed to add bundle.');
      document.getElementById('new-bundle-amount').value = '100';
      document.getElementById('new-bundle-sort').value = '0';
      loadTopUpBundles();
    }).catch(function(e2) {
      alert('Error: ' + e2.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Add Bundle'; }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. BALANCE CAP SETTING
   ═══════════════════════════════════════════════════════════════════════════ */

function loadBalanceCap() {
  var container = document.getElementById('balance-cap-container');
  container.innerHTML = '<p style="color:var(--muted);font-size:14px;">Loading setting...</p>';

  fetch(SUPABASE_URL + '/rest/v1/system_config?key=eq.balance_cap&select=*')
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to load setting.');
      return res.json();
    })
    .then(function(configs) {
      var cap = '5000';
      if (configs && configs.length > 0) {
        cap = configs[0].value || '5000';
      }
      container.innerHTML =
        '<p style="font-size:13px;color:var(--muted);margin-bottom:8px;">Maximum balance per activity credit ticket. Changes apply to all subsequent top-ups.</p>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<label style="font-size:14px;font-weight:500;">Balance Cap: D</label>' +
        '<input type="number" id="balance-cap-input" value="' + cap + '" min="100" max="50000" style="width:120px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
        '<button id="save-balance-cap-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Save</button>' +
        '<span id="balance-cap-status" style="font-size:13px;color:#065F46;display:none;">Saved!</span>' +
        '</div>';
    })
    .catch(function(err) {
      container.innerHTML = '<p style="color:#DC2626;font-size:14px;">Failed to load: ' + escapeHtml(err.message) + '</p>';
    });
}

function saveBalanceCap() {
  var value = document.getElementById('balance-cap-input').value.trim();
  if (!value || parseInt(value) < 100) { alert('Minimum cap is D100.'); return; }

  var btn = document.getElementById('save-balance-cap-btn');
  var statusEl = document.getElementById('balance-cap-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  if (statusEl) { statusEl.style.display = 'none'; }

  fetchWithAuth(SUPABASE_URL + '/rest/v1/rpc/upsert_balance_cap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_value: String(value) })
  }).then(function(res) {
    if (res.ok) {
      if (statusEl) { statusEl.style.display = 'inline'; setTimeout(function() { statusEl.style.display = 'none'; }, 3000); }
      return;
    }
    throw new Error('RPC failed.');
  }).catch(function(err) {
    // Fall back to service key method
    var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
    if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
    if (!svcKey) { alert('Permission denied. Contact admin.'); if (btn) { btn.disabled = false; btn.textContent = 'Save'; } return; }

    // Upsert: try update first, then insert
    fetch(SUPABASE_URL + '/rest/v1/system_config?key=eq.balance_cap', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ value: value })
    }).then(function(res) {
      if (res.ok || res.status === 404) {
        if (statusEl) { statusEl.style.display = 'inline'; setTimeout(function() { statusEl.style.display = 'none'; }, 3000); }
      } else {
        return fetch(SUPABASE_URL + '/rest/v1/system_config', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ key: 'balance_cap', value: value, description: 'Maximum balance per activity credit ticket (in GMD)' })
        }).then(function(res2) {
          if (!res2.ok) throw new Error('Failed to save.');
          if (statusEl) { statusEl.style.display = 'inline'; setTimeout(function() { statusEl.style.display = 'none'; }, 3000); }
        });
      }
    }).catch(function(err2) {
      alert('Error: ' + err2.message);
    }).then(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    });
  });
  // Ensure button re-enables even if fetchWithAuth path has no .then after success
  setTimeout(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }, 5000);
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. STAFF SCANNER CODES MANAGER
   ═══════════════════════════════════════════════════════════════════════════ */

function loadScannerCodes() {
  var container = document.getElementById('scanner-codes-container');
  container.innerHTML = '<p style="color:var(--muted);font-size:14px;">Loading scanner codes...</p>';

  fetchWithAuth(SUPABASE_URL + '/rest/v1/staff_scanner_codes?order=created_at.desc&select=*')
    .then(function(res) {
      if (!res.ok) throw new Error('Failed to load scanner codes.');
      return res.json();
    })
    .then(function(codes) {
      if (!codes || codes.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No scanner codes issued yet.</p>' +
          '<div style="text-align:center;margin-top:12px;"><button id="issue-scanner-code-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Issue New Code</button></div>';
        return;
      }

      var html = '<div style="overflow-x:auto;margin-bottom:16px;"><table class="app-table"><thead><tr>' +
        '<th>Code</th><th>Label</th><th>Status</th><th>Last Used</th><th>Created</th><th>Actions</th>' +
        '</tr></thead><tbody>';
      codes.forEach(function(c) {
        var statusClass = c.is_active ? 'status-approved' : 'status-rejected';
        var statusText = c.is_active ? 'Active' : 'Revoked';
        var lastUsed = c.last_used_at ? new Date(c.last_used_at).toLocaleDateString() : '-';
        html += '<tr>' +
          '<td><code style="font-size:13px;background:#f0f0f0;padding:2px 8px;border-radius:4px;">' + escapeHtml(c.code) + '</code></td>' +
          '<td>' + escapeHtml(c.label || '-') + '</td>' +
          '<td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>' +
          '<td><span style="font-size:13px;color:var(--muted);">' + lastUsed + '</span></td>' +
          '<td><span style="font-size:13px;color:var(--muted);">' + new Date(c.created_at).toLocaleDateString() + '</span></td>' +
          '<td>' +
            (c.is_active
              ? '<button class="action-btn action-reject revoke-code-btn" data-id="' + c.id + '">Revoke</button>'
              : '<span style="font-size:13px;color:var(--muted);">Revoked</span>') +
          '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';

      // Issue new code form
      html += '<div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Staff Label/Name</label><input type="text" id="new-scanner-label" placeholder="e.g. Gate Alpha" style="width:200px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<button id="issue-scanner-code-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Issue Code</button>' +
        '</div>';

      container.innerHTML = html;
    })
    .catch(function(err) {
      container.innerHTML = '<p style="color:#DC2626;font-size:14px;">Failed to load scanner codes: ' + escapeHtml(err.message) + '</p>';
    });
}

function issueScannerCode() {
  var label = document.getElementById('new-scanner-label').value.trim();

  // Generate a random 6-char alphanumeric code
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  var btn = document.getElementById('issue-scanner-code-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Issuing...'; }

  fetchWithAuth(SUPABASE_URL + '/rest/v1/rpc/issue_scanner_code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: code, p_label: label || 'Staff' })
  }).then(function(res) {
    if (res.ok) {
      document.getElementById('new-scanner-label').value = '';
      alert('New staff code issued: ' + code);
      loadScannerCodes();
      return;
    }
    throw new Error('RPC failed.');
  }).catch(function(err) {
    var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
    if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
    if (!svcKey) { alert('Permission denied. Contact admin.'); if (btn) { btn.disabled = false; btn.textContent = 'Issue Code'; } return; }
    return fetch(SUPABASE_URL + '/rest/v1/staff_scanner_codes', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ code: code, label: label || 'Staff', is_active: true })
    }).then(function(r) {
      if (!r.ok) throw new Error('Failed to issue code.');
      document.getElementById('new-scanner-label').value = '';
      alert('New staff code issued: ' + code);
      loadScannerCodes();
    }).catch(function(e2) {
      alert('Error: ' + e2.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Issue Code'; }
    });
  });
}

function revokeScannerCode(id) {
  if (!confirm('Revoke this scanner code? The staff member will no longer be able to access the scanner page.')) return;

  var btn = document.querySelector('.revoke-code-btn[data-id="' + id + '"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Revoking...'; }

  fetchWithAuth(SUPABASE_URL + '/rest/v1/rpc/revoke_scanner_code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id })
  }).then(function(res) {
    if (res.ok) { loadScannerCodes(); return; }
    throw new Error('RPC failed.');
  }).catch(function(err) {
    var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
    if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
    if (!svcKey) { alert('Permission denied. Contact admin.'); if (btn) { btn.disabled = false; btn.textContent = 'Revoke'; } return; }
    return fetch(SUPABASE_URL + '/rest/v1/staff_scanner_codes?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ is_active: false })
    }).then(function(r) {
      if (!r.ok) throw new Error('Failed to revoke code.');
      loadScannerCodes();
    }).catch(function(e2) {
      alert('Error: ' + e2.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Revoke'; }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVENT DELEGATION
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('click', function(e) {
  // Order filter buttons
  if (e.target.classList.contains('order-filter-btn')) {
    setOrderFilter(e.target.getAttribute('data-status') || 'all');
  }

  // Order expand/collapse
  if (e.target.classList.contains('order-expand-btn')) {
    toggleOrderTickets(e.target.getAttribute('data-order'));
  }

  // Ticket type toggle
  if (e.target.classList.contains('ticket-type-toggle-btn')) {
    toggleTicketTypeActive(e.target.getAttribute('data-id'), e.target.getAttribute('data-active') === 'true');
  }

  // Bundle toggle
  if (e.target.classList.contains('bundle-toggle-btn')) {
    toggleBundleActive(e.target.getAttribute('data-id'), e.target.getAttribute('data-active') === 'true');
  }

  // Bundle delete
  if (e.target.classList.contains('bundle-delete-btn')) {
    deleteBundle(e.target.getAttribute('data-id'));
  }

  // Revoke scanner code
  if (e.target.classList.contains('revoke-code-btn')) {
    revokeScannerCode(e.target.getAttribute('data-id'));
  }

  // Issue scanner code
  if (e.target.id === 'issue-scanner-code-btn') {
    issueScannerCode();
  }

  // Add ticket type
  if (e.target.id === 'add-ticket-type-btn') {
    addTicketType();
  }

  // Add bundle
  if (e.target.id === 'add-bundle-btn') {
    addBundle();
  }

  // Save balance cap
  if (e.target.id === 'save-balance-cap-btn') {
    saveBalanceCap();
  }
});

// ─── Fetch pending Wave Transfer payment proofs ──────────────────────────────

function loadPaymentProofs() {
  var container = document.getElementById('proofs-container');
  container.innerHTML = '<p style="color:var(--muted);font-size:14px;">Loading payment proofs...</p>';

  // Fetch proofs with their order data
  fetchWithAuth(
    SUPABASE_URL + '/rest/v1/payment_proofs?order=created_at.desc&select=id,order_id,email,amount,reference_number,screenshot_url,status,notes,created_at,orders!inner(id,email,total,status,customer_name)'
  ).then(function(res) {
    if (!res.ok) throw new Error('Failed to load payment proofs.');
    return res.json();
  }).then(function(proofs) {
    if (!proofs || proofs.length === 0) {
      container.innerHTML = '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No payment proofs yet.</p>';
      return;
    }

    var pending = proofs.filter(function(p) { return p.status === 'pending'; });
    var verified = proofs.filter(function(p) { return p.status === 'verified'; });
    var rejected = proofs.filter(function(p) { return p.status === 'rejected'; });

    var html = '';

    // Stats
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">' +
      '<div class="stat-card"><div class="num" style="color:#92400E;">' + pending.length + '</div><div class="lbl">Pending</div></div>' +
      '<div class="stat-card"><div class="num" style="color:#065F46;">' + verified.length + '</div><div class="lbl">Verified</div></div>' +
      '<div class="stat-card"><div class="num" style="color:#991B1B;">' + rejected.length + '</div><div class="lbl">Rejected</div></div>' +
      '</div>';

    // Pending proofs (actionable)
    if (pending.length > 0) {
      html += '<h3 style="font-size:16px;margin-bottom:12px;">Pending Verification</h3>';
      html += '<div style="overflow-x:auto;margin-bottom:32px;">';
      html += '<table class="app-table"><thead><tr>' +
        '<th>Email</th><th>Amount</th><th>Reference</th><th>Proof</th><th>Submitted</th><th>Actions</th>' +
        '</tr></thead><tbody>';
      pending.forEach(function(p) {
        html += '<tr>' +
          '<td><span style="font-size:13px;">' + escapeHtml(p.email) + '</span></td>' +
          '<td><strong>D' + p.amount + '</strong></td>' +
          '<td><code style="font-size:12px;background:#f0f0f0;padding:2px 6px;border-radius:4px;">' + escapeHtml(p.reference_number || '-') + '</code></td>' +
          '<td>' + (p.screenshot_url ? '<a href="' + p.screenshot_url + '" target="_blank" style="font-size:13px;color:var(--accent);">View Screenshot</a>' : '<span style="font-size:13px;color:var(--muted);">None</span>') + '</td>' +
          '<td><span style="font-size:13px;color:var(--muted);">' + new Date(p.created_at).toLocaleDateString() + '</span></td>' +
          '<td>' +
            '<button class="action-btn action-approve wave-confirm-btn" data-proof="' + p.id + '" data-order="' + p.order_id + '">Confirm</button>' +
            '<button class="action-btn action-reject wave-reject-btn" data-proof="' + p.id + '" data-order="' + p.order_id + '" style="margin-left:6px;">Reject</button>' +
          '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // Recent verified proofs
    if (verified.length > 0) {
      html += '<details style="margin-bottom:16px;">';
      html += '<summary style="cursor:pointer;font-size:14px;font-weight:500;color:var(--muted);">Recently Verified (' + verified.length + ')</summary>';
      html += '<div style="margin-top:12px;overflow-x:auto;">';
      html += '<table class="app-table"><thead><tr>' +
        '<th>Email</th><th>Amount</th><th>Reference</th><th>Verified</th>' +
        '</tr></thead><tbody>';
      verified.forEach(function(p) {
        html += '<tr>' +
          '<td><span style="font-size:13px;">' + escapeHtml(p.email) + '</span></td>' +
          '<td><strong>D' + p.amount + '</strong></td>' +
          '<td><code style="font-size:12px;background:#f0f0f0;padding:2px 6px;border-radius:4px;">' + escapeHtml(p.reference_number || '-') + '</code></td>' +
          '<td><span class="status-badge status-approved">Verified</span></td>' +
          '</tr>';
      });
      html += '</tbody></table></div></details>';
    }

    // Recent rejected proofs
    if (rejected.length > 0) {
      html += '<details>';
      html += '<summary style="cursor:pointer;font-size:14px;font-weight:500;color:var(--muted);">Rejected (' + rejected.length + ')</summary>';
      html += '<div style="margin-top:12px;overflow-x:auto;">';
      html += '<table class="app-table"><thead><tr>' +
        '<th>Email</th><th>Amount</th><th>Reference</th><th>Status</th>' +
        '</tr></thead><tbody>';
      rejected.forEach(function(p) {
        html += '<tr>' +
          '<td><span style="font-size:13px;">' + escapeHtml(p.email) + '</span></td>' +
          '<td><strong>D' + p.amount + '</strong></td>' +
          '<td><code style="font-size:12px;background:#f0f0f0;padding:2px 6px;border-radius:4px;">' + escapeHtml(p.reference_number || '-') + '</code></td>' +
          '<td><span class="status-badge status-rejected">Rejected</span></td>' +
          '</tr>';
      });
      html += '</tbody></table></div></details>';
    }

    container.innerHTML = html;
  }).catch(function(err) {
    container.innerHTML = '<p style="color:#DC2626;font-size:14px;">Failed to load payment proofs: ' + escapeHtml(err.message) + '</p>';
  });
}

// ─── Helper: get auth token for Edge Function calls ───────────────────────────

function getEdgeFunctionToken() {
  // Try JWT first (works with ticketing_role), fall back to service key
  var session = getStoredSession();
  if (session && session.access_token) {
    return session.access_token;
  }
  var svcKey = localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key');
  if (!svcKey && typeof getServiceKey === 'function') { svcKey = getServiceKey(true); }
  return svcKey || '';
}

// ─── Confirm a Wave Transfer payment ─────────────────────────────────────────

function confirmWavePayment(proofId, orderId) {
  if (!confirm('Confirm this Wave Transfer payment? Tickets will be generated and the customer will receive a confirmation email.')) return;

  var btn = document.querySelector('.wave-confirm-btn[data-proof="' + proofId + '"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming...'; }

  var token = getEdgeFunctionToken();
  if (!token) {
    alert('Authentication required. Sign in as ticketing staff or admin.');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm'; }
    return;
  }

  fetch(SUPABASE_URL + '/functions/v1/ticketing/confirm-wave', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      proof_id: proofId,
      order_id: orderId,
      action: 'confirm'
    })
  }).then(function(res) {
    return res.json().then(function(data) {
      if (!res.ok) throw new Error(data.error || 'Failed to confirm payment.');
      return data;
    });
  }).then(function(data) {
    alert('Payment confirmed! ' + (data.tickets_created || 0) + ' tickets generated and email sent.');
    loadPaymentProofs();
  }).catch(function(err) {
    alert('Error: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm'; }
  });
}

// ─── Reject a Wave Transfer payment ──────────────────────────────────────────

function rejectWavePayment(proofId, orderId) {
  if (!confirm('Reject this Wave Transfer payment? The order will be cancelled.')) return;

  var btn = document.querySelector('.wave-reject-btn[data-proof="' + proofId + '"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting...'; }

  var token = getEdgeFunctionToken();
  if (!token) {
    alert('Authentication required. Sign in as ticketing staff or admin.');
    if (btn) { btn.disabled = false; btn.textContent = 'Reject'; }
    return;
  }

  fetch(SUPABASE_URL + '/functions/v1/ticketing/confirm-wave', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      proof_id: proofId,
      order_id: orderId,
      action: 'reject'
    })
  }).then(function(res) {
    return res.json().then(function(data) {
      if (!res.ok) throw new Error(data.error || 'Failed to reject payment.');
      return data;
    });
  }).then(function() {
    loadPaymentProofs();
  }).catch(function(err) {
    alert('Error: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Reject'; }
  });
}

// ─── Event delegation for confirm/reject buttons ─────────────────────────────

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('wave-confirm-btn')) {
    var proofId = e.target.getAttribute('data-proof');
    var orderId = e.target.getAttribute('data-order');
    if (proofId && orderId) confirmWavePayment(proofId, orderId);
  }
  if (e.target.classList.contains('wave-reject-btn')) {
    var proofId = e.target.getAttribute('data-proof');
    var orderId = e.target.getAttribute('data-order');
    if (proofId && orderId) rejectWavePayment(proofId, orderId);
  }
});

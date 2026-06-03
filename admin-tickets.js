// Admin ticket management: ticketing system admin features
// Loaded on admin.html alongside admin-photos.js and vendor-auth.js

// ─── Helper: escape HTML entities to prevent XSS ─────────────────────────────

function escapeHtml(str) {
  if (str == null) return "";
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. INVENTORY OVERVIEW
   ═══════════════════════════════════════════════════════════════════════════ */

function loadInventory() {
  var container = document.getElementById("inventory-container");
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading inventory...</p>';

  adminQuery("/rest/v1/ticket_types?order=sort_order.asc&select=*")
    .then(function (types) {
      if (!types || types.length === 0) {
        container.innerHTML =
          '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No ticket types configured.</p>';
        return;
      }

      var totalCap = 0,
        totalSold = 0,
        totalEarnings = 0,
        fixedEarnings = 0,
        pctEarnings = 0,
        typeEarnings = [];
      types.forEach(function (t) {
        totalCap += t.capacity;
        totalSold += t.sold;
        // Calculate superadmin earnings
        var feeType = t.superadmin_fee_type || "none";
        var feeVal = t.superadmin_fee_value || 0;
        var feePerTicket = 0;
        if (feeType === "fixed" && feeVal > 0) {
          feePerTicket = feeVal;
        } else if (feeType === "percentage" && feeVal > 0) {
          feePerTicket = Math.round((t.price * feeVal) / 100);
        }
        var earnings = feePerTicket * t.sold;
        totalEarnings += earnings;
        if (feeType === "fixed") fixedEarnings += earnings;
        else if (feeType === "percentage") pctEarnings += earnings;
        if (earnings > 0) typeEarnings.push({ name: t.name, earnings: earnings });
      });

      var html = "";
      // Overall stats
      html +=
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">' +
        '<div class="stat-card"><div class="num">' +
        totalSold +
        '</div><div class="lbl">Total Sold</div></div>' +
        '<div class="stat-card"><div class="num">' +
        totalCap +
        '</div><div class="lbl">Total Capacity</div></div>' +
        '<div class="stat-card"><div class="num" style="color:' +
        (totalCap - totalSold <= 50 ? "#991B1B" : "#065F46") +
        ';">' +
        (totalCap - totalSold) +
        '</div><div class="lbl">Remaining</div></div>' +
        '<div class="stat-card"><div class="num">' +
        (totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : 0) +
        '%</div><div class="lbl">Fill Rate</div></div>' +
        "</div>" +

      // Superadmin earnings summary (superadmin only)
      (getSession().type === "super-admin" && totalEarnings > 0 ?
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;padding:12px;background:var(--accent-dim);border:1px solid var(--border);border-radius:12px;">' +
        '<div style="text-align:center;"><div class="num" style="font-size:24px;color:#065F46;">D' +
        totalEarnings.toLocaleString() +
        '</div><div class="lbl" style="font-size:11px;">Est. Superadmin Earnings</div></div>' +
        '<div style="text-align:center;"><div class="num" style="font-size:24px;color:#1E40AF;">D' +
        (fixedEarnings > 0 ? fixedEarnings.toLocaleString() : '0') +
        '</div><div class="lbl" style="font-size:11px;">From Fixed Fees</div></div>' +
        '<div style="text-align:center;"><div class="num" style="font-size:24px;color:#7C3AED;">D' +
        (pctEarnings > 0 ? pctEarnings.toLocaleString() : '0') +
        '</div><div class="lbl" style="font-size:11px;">From % Fees</div></div>' +
        "</div>" : '') +

      // Earnings breakdown by ticket type (superadmin only)
      (getSession().type === "super-admin" && typeEarnings.length > 0 ? (function() {
        // Sort by earnings descending
        typeEarnings.sort(function (a, b) { return b.earnings - a.earnings; });
        var topEarnings = typeEarnings[0] ? typeEarnings[0].earnings : 1;
        var maxShow = 6;
        var showTypes = typeEarnings.slice(0, maxShow);
        var restSum = 0;
        if (typeEarnings.length > maxShow) {
          for (var ri = maxShow; ri < typeEarnings.length; ri++) {
            restSum += typeEarnings[ri].earnings;
          }
        }
        var ebHtml = '<div style="margin-bottom:24px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
          '<h4 style="font-size:14px;margin-bottom:14px;color:var(--fg);">Superadmin Earnings by Ticket Type</h4>' +
          '<div style="display:flex;flex-direction:column;gap:10px;">';
        var barColors = ["#065F46", "#1E40AF", "#7C3AED", "#B45309", "#059669", "#DB2777"];
        showTypes.forEach(function (te, idx) {
          var pct = Math.round((te.earnings / totalEarnings) * 100);
          var color = barColors[idx % barColors.length];
          ebHtml += '<div style="display:flex;flex-direction:column;gap:3px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:13px;font-weight:500;">' + escapeHtml(te.name) + '</span>' +
            '<span style="font-size:13px;font-weight:600;color:' + color + ';">D' + te.earnings.toLocaleString() + ' <span style="font-weight:400;color:var(--muted);font-size:12px;">(' + pct + '%)</span></span>' +
            '</div>' +
            '<div style="height:6px;background:var(--border);border-radius:6px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:6px;transition:width .6s ease;"></div></div>' +
            '</div>';
        });
        if (restSum > 0) {
          var restPct = Math.round((restSum / totalEarnings) * 100);
          ebHtml += '<div style="display:flex;flex-direction:column;gap:3px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:13px;font-weight:500;color:var(--muted);">' + (typeEarnings.length - maxShow) + ' other type' + (typeEarnings.length - maxShow !== 1 ? 's' : '') + '</span>' +
            '<span style="font-size:13px;font-weight:600;color:var(--muted);">D' + restSum.toLocaleString() + ' <span style="font-weight:400;font-size:12px;">(' + restPct + '%)</span></span>' +
            '</div>' +
            '<div style="height:6px;background:var(--border);border-radius:6px;overflow:hidden;">' +
            '<div style="height:100%;width:' + restPct + '%;background:var(--muted);border-radius:6px;transition:width .6s ease;"></div></div>' +
            '</div>';
        }
        ebHtml += '</div></div>';
        return ebHtml;
      })() : '') +

      // Per-type table
      html +=
        '<div style="overflow-x:auto;"><table class="app-table"><thead><tr>' +
        "<th>Ticket Type</th><th>Type</th><th>Price</th><th>Fee</th><th>Sold</th><th>Capacity</th><th>Fill</th><th>Status</th>" +
        "</tr></thead><tbody>";
      types.forEach(function (t) {
        var fillPct =
          t.capacity > 0 ? Math.round((t.sold / t.capacity) * 100) : 0;
        var fillColor =
          fillPct >= 90 ? "#991B1B" : fillPct >= 70 ? "#92400E" : "#065F46";
        var statusClass = t.is_active ? "status-approved" : "status-rejected";
        var statusText = t.is_active ? "Active" : "Inactive";
        html +=
          "<tr>" +
          "<td><strong>" +
          escapeHtml(t.name) +
          "</strong></td>" +
          '<td><span style="font-size:13px;color:var(--muted);text-transform:capitalize;">' +
          t.type.replace("_", " ") +
          "</span></td>" +
          "<td><strong>D" +
          t.price +
          "</strong></td>" +
          '<td><span style="font-size:12px;color:var(--muted);">' +
          (t.superadmin_fee_value > 0 && t.superadmin_fee_type === "fixed"
            ? "D" + t.superadmin_fee_value
            : t.superadmin_fee_value > 0 && t.superadmin_fee_type === "percentage"
              ? t.superadmin_fee_value + "%"
              : "—") +
          "</span></td>" +
          '<td><span style="font-weight:600;">' +
          t.sold +
          "</span></td>" +
          "<td>" +
          t.capacity +
          "</td>" +
          '<td><span style="font-weight:600;color:' +
          fillColor +
          ';">' +
          fillPct +
          "%</span></td>" +
          '<td><span class="status-badge ' +
          statusClass +
          '">' +
          statusText +
          "</span></td>" +
          "</tr>";
      });
      html += "</tbody></table></div>";

      // ═══════════════════════════════════════════════════════════════════
      // CATEGORY BREAKDOWN — group by ticket type category
      // ═══════════════════════════════════════════════════════════════════

      // Group types by their 'type' field
      var categories = {};
      var categoryLabels = {
        entry: "Entry Passes",
        activity_credit: "Activity Credits (Games)",
        food: "Food Vouchers",
        drinks: "Drinks",
        kids_zone: "Kids Zone",
        parking: "Parking",
      };
      var typeOrder = ["entry", "activity_credit", "food", "drinks", "kids_zone", "parking"];

      types.forEach(function (t) {
        var cat = t.type || "other";
        if (!categories[cat]) {
          categories[cat] = {
            label: categoryLabels[cat] || cat.replace("_", " "),
            types: [],
            totalSold: 0,
            totalCap: 0,
            totalRevenue: 0,
          };
        }
        categories[cat].types.push(t);
        categories[cat].totalSold += t.sold;
        categories[cat].totalCap += t.capacity;
        categories[cat].totalRevenue += t.price * t.sold;
      });

      // Determine which categories to show
      var shownCategories = typeOrder.filter(function (c) {
        return categories[c] && categories[c].types.length > 0;
      });

      if (shownCategories.length > 0) {
        html += "<hr style=\"margin:32px 0;border:none;border-top:2px solid var(--accent);\">";
        html += "<h3 style=\"font-size:17px;margin-bottom:16px;\">Detailed Sales Breakdown by Category</h3>";

        // ─── Category summary cards with progress bars ───
        html += "<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:20px;\">";
        var grandSold = 0, grandCap = 0, grandRev = 0;
        shownCategories.forEach(function (catKey) {
          var cat = categories[catKey];
          grandSold += cat.totalSold;
          grandCap += cat.totalCap;
          grandRev += cat.totalRevenue;
          var fillPct = cat.totalCap > 0 ? Math.round((cat.totalSold / cat.totalCap) * 100) : 0;
          var fillColor = fillPct >= 90 ? "#991B1B" : fillPct >= 70 ? "#92400E" : "#065F46";
          html += "<div class=\"stat-card\" style=\"padding:14px;\">" +
            "<div style=\"font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:4px;\">" +
            escapeHtml(cat.label) +
            "</div>" +
            "<div class=\"num\" style=\"font-size:24px;\">" + cat.totalSold + "</div>" +
            "<div class=\"lbl\" style=\"font-size:11px;\">Sold / " + cat.totalCap + " cap</div>" +
            "<div style=\"margin-top:6px;height:4px;background:var(--border);border-radius:4px;overflow:hidden;\">" +
            "<div style=\"height:100%;width:" + fillPct + "%;background:" + fillColor + ";border-radius:4px;transition:width .5s;\"></div></div>" +
            "<div style=\"font-size:12px;font-weight:600;color:" + fillColor + ";margin-top:4px;\">" + fillPct + "% fill</div>" +
            "</div>";
        });

        // Grand total card
        var grandPct = grandCap > 0 ? Math.round((grandSold / grandCap) * 100) : 0;
        var grandColor = grandPct >= 90 ? "#991B1B" : grandPct >= 70 ? "#92400E" : "#065F46";
        html += "<div class=\"stat-card\" style=\"padding:14px;border-color:var(--accent);\">" +
          "<div style=\"font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--accent);margin-bottom:4px;font-weight:600;\">All Categories</div>" +
          "<div class=\"num\" style=\"font-size:24px;\">" + grandSold + "</div>" +
          "<div class=\"lbl\" style=\"font-size:11px;\">Sold / " + grandCap + " total cap</div>" +
          "<div style=\"margin-top:6px;height:4px;background:var(--border);border-radius:4px;overflow:hidden;\">" +
          "<div style=\"height:100%;width:" + grandPct + "%;background:" + grandColor + ";border-radius:4px;transition:width .5s;\"></div></div>" +
          "<div style=\"font-size:12px;font-weight:600;color:" + grandColor + ";margin-top:4px;\">" + grandPct + "% overall fill</div>" +
          "</div>";
        html += "</div>";

        // ─── Detailed per-category table ───
        html += "<div style=\"overflow-x:auto;margin-bottom:16px;\"><table class=\"app-table\" style=\"font-size:13px;\"><thead><tr>" +
          "<th>Category</th>" +
          "<th>Ticket Type</th>" +
          "<th>Sold</th>" +
          "<th>Capacity</th>" +
          "<th>Fill</th>" +
          "<th>Price</th>" +
          "<th>Est. Revenue</th>" +
          "<th>Share</th>" +
          "</tr></thead><tbody>";

        var grandTotalTypes = 0;
        shownCategories.forEach(function (catKey) {
          var cat = categories[catKey];
          var catFill = cat.totalCap > 0 ? Math.round((cat.totalSold / cat.totalCap) * 100) : 0;
          var catShare = grandCap > 0 ? Math.round((cat.totalSold / grandCap) * 100) : 0;

          // Category header row
          html += "<tr style=\"background:var(--accent-dim);\">" +
            "<td><strong style=\"text-transform:uppercase;font-size:11px;letter-spacing:0.04em;\">" +
            escapeHtml(cat.label) +
            "</strong></td>" +
            "<td><span style=\"font-size:12px;color:var(--muted);\">" + cat.types.length + " type" + (cat.types.length !== 1 ? "s" : "") + "</span></td>" +
            "<td><strong>" + cat.totalSold + "</strong></td>" +
            "<td>" + cat.totalCap + "</td>" +
            "<td><span style=\"font-weight:600;color:" + (catFill >= 90 ? "#991B1B" : catFill >= 70 ? "#92400E" : "#065F46") + ";\">" + catFill + "%</span></td>" +
            "<td>&mdash;</td>" +
            "<td><strong>D" + cat.totalRevenue.toLocaleString() + "</strong></td>" +
            "<td><span style=\"font-size:12px;color:var(--muted);\">" + catShare + "%</span></td>" +
            "</tr>";

          // Individual type rows
          cat.types.forEach(function (t) {
            var fillPct = t.capacity > 0 ? Math.round((t.sold / t.capacity) * 100) : 0;
            var fillColor = fillPct >= 90 ? "#991B1B" : fillPct >= 70 ? "#92400E" : "#065F46";
            var revenue = t.price * t.sold;
            var share = grandSold > 0 ? Math.round((t.sold / grandSold) * 100) : 0;
            grandTotalTypes++;

            html += "<tr>" +
              "<td></td>" +
              "<td><span style=\"font-size:13px;\">" + escapeHtml(t.name) + "</span></td>" +
              "<td><span style=\"font-weight:600;\">" + t.sold + "</span></td>" +
              "<td>" + t.capacity + "</td>" +
              "<td><span style=\"font-weight:600;color:" + fillColor + ";\">" + fillPct + "%</span></td>" +
              "<td>D" + t.price + "</td>" +
              "<td>D" + revenue.toLocaleString() + "</td>" +
              "<td><span style=\"font-size:12px;color:var(--muted);\">" + share + "%</span></td>" +
              "</tr>";
          });
        });

        // Grand total row
        var grandFill = grandCap > 0 ? Math.round((grandSold / grandCap) * 100) : 0;
        html += "<tr style=\"border-top:2px solid var(--accent);font-weight:700;\">" +
          "<td><strong style=\"color:var(--accent);\">GRAND TOTAL</strong></td>" +
          "<td><span style=\"font-size:12px;color:var(--muted);font-weight:400;\">" + grandTotalTypes + " types</span></td>" +
          "<td>" + grandSold + "</td>" +
          "<td>" + grandCap + "</td>" +
          "<td><span style=\"font-weight:700;color:" + (grandFill >= 90 ? "#991B1B" : grandFill >= 70 ? "#92400E" : "#065F46") + ";\">" + grandFill + "%</span></td>" +
          "<td></td>" +
          "<td>D" + grandRev.toLocaleString() + "</td>" +
          "<td>100%</td>" +
          "</tr>";

        html += "</tbody></table></div>";

        // ─── Revenue distribution bar ───
        if (grandRev > 0 && shownCategories.length > 1) {
          html += "<div style=\"margin-top:20px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;\">" +
            "<h4 style=\"font-size:14px;margin-bottom:12px;\">Revenue Distribution by Category</h4>" +
            "<div style=\"display:flex;flex-direction:column;gap:8px;\">";
          var pieColors = ["#065F46", "#1E40AF", "#92400E", "#991B1B", "#6B7280", "#7C3AED"];
          shownCategories.forEach(function (catKey, idx) {
            var cat = categories[catKey];
            var pct = grandRev > 0 ? Math.round((cat.totalRevenue / grandRev) * 100) : 0;
            if (pct < 1) return;
            var color = pieColors[idx % pieColors.length];
            html += "<div style=\"display:flex;align-items:center;gap:10px;\">" +
              "<span style=\"width:12px;height:12px;border-radius:3px;background:" + color + ";flex-shrink:0;\"></span>" +
              "<span style=\"font-size:13px;flex:1;\">" + escapeHtml(cat.label) + "</span>" +
              "<span style=\"font-size:13px;font-weight:600;\">" + pct + "%</span>" +
              "<span style=\"font-size:13px;color:var(--muted);\">D" + cat.totalRevenue.toLocaleString() + "</span>" +
              "</div>";
          });
          html += "</div></div>";
        }
      }

      container.innerHTML = html;
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed to load inventory: ' +
        escapeHtml(err.message) +
        "</p>";
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   1b. REDEMPTION STATS
   ═══════════════════════════════════════════════════════════════════════════ */

function loadRedemptionStats() {
  var container = document.getElementById("redemption-container");
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading redemption stats...</p>';

  // Fetch all debit transactions from balance_transactions
  adminQuery(
    "/rest/v1/balance_transactions?select=type,amount_delta,source,created_at&order=created_at.desc",
  )
    .then(function (txns) {
      if (!txns || txns.length === 0) {
        container.innerHTML =
          '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No debit transactions yet.</p>';
        return;
      }

      // Filter only debits (negative amount_delta means money out)
      var debits = txns.filter(function (t) {
        return t.type === "debit";
      });
      var totalRedeemed = 0;
      var totalTxns = debits.length;

      debits.forEach(function (t) {
        totalRedeemed += Math.abs(t.amount_delta);
      });

      // Group by source
      var sourceGroups = {};
      debits.forEach(function (t) {
        var src = t.source || "unknown";
        if (!sourceGroups[src]) sourceGroups[src] = { count: 0, total: 0 };
        sourceGroups[src].count++;
        sourceGroups[src].total += Math.abs(t.amount_delta);
      });

      var html = "";
      // Summary stats
      html +=
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">' +
        '<div class="stat-card"><div class="num" style="color:#991B1B;">D' +
        totalRedeemed.toLocaleString() +
        '</div><div class="lbl">Total Redeemed</div></div>' +
        '<div class="stat-card"><div class="num">' +
        totalTxns +
        '</div><div class="lbl">Debit Transactions</div></div>' +
        '<div class="stat-card"><div class="num" style="color:' +
        (totalTxns > 0 ? "#065F46" : "var(--muted)") +
        ';">' +
        (totalTxns > 0
          ? "D" + Math.round(totalRedeemed / totalTxns).toLocaleString()
          : "-") +
        '</div><div class="lbl">Avg per Debit</div></div>' +
        "</div>";

      // Breakdown by source
      if (Object.keys(sourceGroups).length > 1) {
        html +=
          '<div style="overflow-x:auto;margin-bottom:12px;"><table class="app-table"><thead><tr>' +
          "<th>Source</th><th>Transactions</th><th>Total Redeemed</th>" +
          "</tr></thead><tbody>";
        Object.keys(sourceGroups)
          .sort()
          .forEach(function (src) {
            var g = sourceGroups[src];
            html +=
              "<tr>" +
              '<td><span style="text-transform:capitalize;">' +
              escapeHtml(src.replace(/_/g, " ")) +
              "</span></td>" +
              "<td>" +
              g.count +
              "</td>" +
              "<td><strong>D" +
              g.total.toLocaleString() +
              "</strong></td>" +
              "</tr>";
          });
        html += "</tbody></table></div>";
      }

      html +=
        '<p style="font-size:12px;color:var(--muted);text-align:center;">Last updated: ' +
        new Date().toLocaleString() +
        "</p>";

      container.innerHTML = html;
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed to load redemption stats: ' +
        escapeHtml(err.message) +
        "</p>";
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. ORDER MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */

var currentOrderFilter = "all";

function setOrderFilter(status) {
  currentOrderFilter = status;
  document.querySelectorAll(".order-filter-btn").forEach(function (b) {
    b.classList.toggle(
      "order-filter-active",
      b.getAttribute("data-status") === status,
    );
  });
  loadOrders();
}

function loadOrders() {
  var container = document.getElementById("orders-container");
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading orders...</p>';

  var path = "/rest/v1/orders?order=created_at.desc&select=*";
  if (currentOrderFilter !== "all") {
    path += "&status=eq." + currentOrderFilter;
  }

  adminQuery(path)
    .then(function (orders) {
      if (!orders || orders.length === 0) {
        container.innerHTML =
          '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No orders found' +
          (currentOrderFilter !== "all" ? " with this status" : "") +
          ".</p>";
        return;
      }

      var html = "";
          html +=
            '<div style="overflow-x:auto;"><table class="app-table"><thead><tr>' +
            "<th>Order ID</th><th>Email</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th></th>" +
            "</tr></thead><tbody>";
          orders.forEach(function (o) {
            var statusClass =
              "status-" +
              (o.status === "paid"
                ? "approved"
                : o.status === "unpaid"
                  ? "pending"
                  : o.status === "cancelled" || o.status === "refunded"
                    ? "rejected"
                    : "pending");
            var payMethod =
              o.payment_method === "modempay"
                ? "ModemPay"
                : o.payment_method === "wave_transfer"
                  ? "Wave"
                  : "-";
            var isPaid = o.status === "paid";
            var isUnpaid =
              o.status === "unpaid" || o.status === "pending_verification";
            html +=
              "<tr>" +
              '<td><code style="font-size:12px;">#' +
              o.id.slice(0, 8) +
              "</code></td>" +
              '<td><span style="font-size:13px;">' +
              escapeHtml(o.email) +
              "</span></td>" +
              "<td><strong>D" +
              o.total +
              "</strong></td>" +
              '<td><span style="font-size:13px;color:var(--muted);">' +
              payMethod +
              "</span></td>" +
              '<td><span class="status-badge ' +
              statusClass +
              '">' +
              o.status.replace("_", " ") +
              "</span></td>" +
              '<td><span style="font-size:13px;color:var(--muted);">' +
              new Date(o.created_at).toLocaleDateString() +
              "</span></td>" +
              '<td style="vertical-align:middle;">' +
              '<button class="action-btn order-expand-btn" data-order="' +
              o.id +
              '" data-status="' +
              o.status +
              '" style="background:var(--surface);border:1px solid var(--border);color:var(--fg);margin-right:6px;margin-bottom:4px;">View Tickets</button>' +
              (isUnpaid
                ? '<button class="action-btn mark-paid-btn" data-order-id="' +
                  o.id +
                  '" data-email="' +
                  escapeHtml(o.email) +
                  '" title="Mark as paid and create tickets — customer will receive QR codes by email" style="background:#065F46;color:white;margin-right:6px;margin-bottom:4px;">Mark Paid</button>'
                : "") +
              (isPaid
                ? '<button class="action-btn regenerate-tickets-btn" data-order-id="' +
                  o.id +
                  '" data-email="' +
                  escapeHtml(o.email) +
                  '" title="Re-create tickets if this paid order has none" style="background:#92400E;color:white;margin-right:6px;margin-bottom:4px;">Regenerate</button>'
                : "") +
              "</td>" +
              "</tr>";
            // Hidden ticket row — expanded on click
            html +=
              '<tr id="order-tickets-' +
              o.id +
              '" style="display:none;"><td colspan="7" style="padding:0;"><div class="order-tickets-detail">Loading...</div></td></tr>';
          });
          html += "</tbody></table></div>";
          container.innerHTML = html;
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed to load orders: ' +
        escapeHtml(err.message) +
        "</p>";
    });
}

function toggleOrderTickets(orderId) {
  var row = document.getElementById("order-tickets-" + orderId);
  if (!row) return;

  if (row.style.display !== "none") {
    row.style.display = "none";
    return;
  }

  row.style.display = "table-row";
  var detail = row.querySelector(".order-tickets-detail");

  fetchWithAuth(
    SUPABASE_URL +
      "/rest/v1/tickets?order_id=eq." +
      orderId +
      "&select=id,code,type,status,balance,customer_name,customer_email,ticket_types!inner(name,slug,price)",
  )
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to load tickets.");
      return res.json();
    })
    .then(function (tickets) {
      if (!tickets || tickets.length === 0) {
        detail.innerHTML =
          '<p style="padding:16px;color:var(--muted);font-size:13px;">No tickets found for this order.</p>';
        return;
      }
      var h =
        '<div style="padding:12px 16px;background:var(--accent-dim);border-radius:8px;margin:8px;">';
      h +=
        '<table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Code</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Type</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Name</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Status</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Balance</th>' +
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;">Actions</th>' +
        "</tr></thead><tbody>";
      tickets.forEach(function (t) {
        var statusClass =
          "status-" +
          (t.status === "active"
            ? "approved"
            : t.status === "used"
              ? "pending"
              : "rejected");
        var isRevocable = t.status === "active" || t.status === "used";
        h +=
          '<tr><td style="padding:6px 8px;font-family:var(--font-mono);font-size:12px;">' +
          escapeHtml(t.code) +
          "</td>" +
          '<td style="padding:6px 8px;">' +
          escapeHtml(t.ticket_types.name) +
          "</td>" +
          '<td style="padding:6px 8px;font-size:13px;">' +
          escapeHtml(t.customer_name || "-") +
          "</td>" +
          '<td style="padding:6px 8px;"><span class="status-badge ' +
          statusClass +
          '">' +
          t.status +
          "</span></td>" +
          '<td style="padding:6px 8px;font-weight:600;">' +
          (t.type === "activity_credit" ||
          t.type === "food" ||
          t.type === "drinks"
            ? "D" + t.balance
            : "-") +
          "</td>" +
          '<td style="padding:6px 8px;white-space:nowrap;">' +
          '<button class="action-btn ticket-edit-btn" data-id="' +
          t.id +
          '" data-code="' +
          escapeHtml(t.code) +
          '" data-status="' +
          t.status +
          '" data-name="' +
          escapeHtml(t.customer_name || "") +
          '" data-email="' +
          escapeHtml(t.customer_email || "") +
          '" data-balance="' +
          t.balance +
          '" data-type="' +
          t.type +
          '" data-order="' +
          orderId +
          '" style="background:var(--surface);border:1px solid var(--border);color:var(--fg);margin-right:4px;min-width:auto;min-height:auto;padding:4px 10px;font-size:12px;">Edit</button>' +
          (isRevocable
            ? '<button class="action-btn ticket-revoke-btn" data-id="' +
              t.id +
              '" data-code="' +
              escapeHtml(t.code) +
              '" data-order="' +
              orderId +
              '" style="background:#92400E;color:white;margin-right:4px;min-width:auto;min-height:auto;padding:4px 10px;font-size:12px;">Revoke</button>'
            : "") +
          '<button class="action-btn ticket-delete-btn" data-id="' +
          t.id +
          '" data-code="' +
          escapeHtml(t.code) +
          '" style="background:#991B1B;color:white;min-width:auto;min-height:auto;padding:4px 10px;font-size:12px;">Delete</button>' +
          "</td></tr>";
      });
      h += "</tbody></table></div>";
      detail.innerHTML = h;
    })
    .catch(function (err) {
      detail.innerHTML =
        '<p style="padding:16px;color:#DC2626;font-size:13px;">' +
        escapeHtml(err.message) +
        "</p>";
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   2b. TICKET MANAGEMENT: EDIT, REVOKE, DELETE
   ═══════════════════════════════════════════════════════════════════════════ */

function showTicketEditModal(ticketData) {
  // Remove any existing edit modal
  var existing = document.getElementById("ticket-edit-modal");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.id = "ticket-edit-modal";
  overlay.className = "gift-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;";

  overlay.innerHTML =
    '<div class="gift-box" style="text-align:left;max-width:480px;width:90%;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;">' +
    '<div class="gift-badge" style="margin-bottom:12px;">Edit Ticket</div>' +
    '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">' +
    'Ticket <code style="font-size:12px;background:#f0f0f0;padding:2px 6px;border-radius:4px;">' +
    escapeHtml(ticketData.code) +
    "</code>" +
    "</p>" +
    '<form id="ticket-edit-form">' +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Customer Name</label>' +
    '<input type="text" id="edit-ticket-name" value="' +
    escapeHtml(ticketData.name || "") +
    '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Customer Email</label>' +
    '<input type="email" id="edit-ticket-email" value="' +
    escapeHtml(ticketData.email || "") +
    '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Status</label>' +
    '<select id="edit-ticket-status" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    '<option value="active"' +
    (ticketData.status === "active" ? " selected" : "") +
    ">Active</option>" +
    '<option value="used"' +
    (ticketData.status === "used" ? " selected" : "") +
    ">Used</option>" +
    '<option value="exhausted"' +
    (ticketData.status === "exhausted" ? " selected" : "") +
    ">Exhausted</option>" +
    '<option value="revoked"' +
    (ticketData.status === "revoked" ? " selected" : "") +
    ">Revoked</option>" +
    "</select>" +
    "</div>" +
    '<div style="margin-bottom:16px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Balance (D) <span style="color:var(--muted);font-weight:400;">— only for activity credit tickets</span></label>' +
    '<input type="number" id="edit-ticket-balance" value="' +
    ticketData.balance +
    '" min="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button type="button" id="ticket-edit-cancel-btn" class="action-btn" style="background:transparent;border:1.5px solid var(--border);color:var(--fg);min-width:auto;min-height:auto;padding:8px 20px;">Cancel</button>' +
    '<button type="button" id="ticket-edit-save-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;" data-ticket-id="' +
    ticketData.id +
    '" data-order-id="' +
    (ticketData.orderId || "") +
    '">Save Changes</button>' +
    "</div>" +
    "</form>" +
    "</div>";

  document.body.appendChild(overlay);

  // Focus first input
  setTimeout(function () {
    document.getElementById("edit-ticket-name").focus();
  }, 100);

  return overlay;
}

function saveTicketEdit(ticketId, data) {
  var payload = {};
  if (data.name !== undefined) payload.customer_name = data.name;
  if (data.email !== undefined) payload.customer_email = data.email;
  if (data.status !== undefined) payload.status = data.status;
  if (data.balance !== undefined) payload.balance = parseInt(data.balance);

  return fetchWithAuth(
    SUPABASE_URL + "/rest/v1/tickets?id=eq." + encodeURIComponent(ticketId),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    },
  ).then(function (res) {
    if (res.ok || res.status === 204) return true;
    if (res.status === 401 || res.status === 403) {
      // JWT RLS may not cover all fields — fall back to service key
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) throw new Error("Permission denied. Service key required.");
      return fetch(
        SUPABASE_URL + "/rest/v1/tickets?id=eq." + encodeURIComponent(ticketId),
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer " + svcKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(payload),
        },
      ).then(function (r) {
        if (r.ok || r.status === 204) return true;
        throw new Error("Failed to update ticket.");
      });
    }
    throw new Error("Failed to update ticket.");
  });
}

function revokeTicket(ticketId, ticketCode) {
  if (
    !confirm(
      "Revoke ticket " +
        ticketCode +
        "? The ticket will no longer be valid for entry or top-ups.",
    )
  )
    return;

  return fetchWithAuth(
    SUPABASE_URL + "/rest/v1/tickets?id=eq." + encodeURIComponent(ticketId),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "revoked" }),
    },
  ).then(function (res) {
    if (res.ok || res.status === 204) return true;
    if (res.status === 401 || res.status === 403) {
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) throw new Error("Permission denied. Service key required.");
      return fetch(
        SUPABASE_URL + "/rest/v1/tickets?id=eq." + encodeURIComponent(ticketId),
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer " + svcKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ status: "revoked" }),
        },
      ).then(function (r) {
        if (r.ok || r.status === 204) return true;
        throw new Error("Failed to revoke ticket.");
      });
    }
    throw new Error("Failed to revoke ticket.");
  });
}

function deleteTicket(ticketId, ticketCode) {
  if (
    !confirm(
      "Permanently delete ticket " +
        ticketCode +
        "? This action cannot be undone. All balance transaction history will also be deleted.\n\nAn audit record of this deletion will be retained.",
    )
  )
    return;

  // Get the admin email from the session for the audit trail
  var session = getStoredSession();
  var adminEmail = (session && session.user && session.user.email) || "admin";

  // Use the RPC which atomically archives the ticket then deletes it
  return fetchWithAuth(
    SUPABASE_URL + "/rest/v1/rpc/delete_ticket_with_audit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_ticket_id: ticketId,
        p_deleted_by: adminEmail,
      }),
    },
  ).then(function (res) {
    if (res.ok) return true;
    if (res.status === 401 || res.status === 403) {
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) throw new Error("Permission denied. Service key required.");
      return fetch(
        SUPABASE_URL + "/rest/v1/rpc/delete_ticket_with_audit",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + svcKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_ticket_id: ticketId,
            p_deleted_by: adminEmail,
          }),
        },
      ).then(function (r) {
        if (r.ok) return true;
        return r.json().then(function (errBody) {
          throw new Error(errBody.message || "Failed to delete ticket via RPC.");
        });
      });
    }
    return res.json().then(function (errBody) {
      throw new Error(errBody.message || "Failed to delete ticket.");
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. TICKET TYPES EDITOR
   ═══════════════════════════════════════════════════════════════════════════ */

function loadTicketTypes() {
  var container = document.getElementById("ticket-types-container");
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading ticket types...</p>';

  adminQuery("/rest/v1/ticket_types?order=sort_order.asc&select=*")
    .then(function (types) {
      if (!types || types.length === 0) {
        container.innerHTML =
          '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No ticket types configured.</p>';
        return;
      }

      var html =
        '<div style="overflow-x:auto;margin-bottom:16px;"><table class="app-table"><thead><tr>' +
        "<th>Name</th><th>Slug</th><th>Type</th><th>Price</th><th>Capacity</th><th>Sold</th><th>Fee</th><th>Status</th><th>Actions</th>" +
        "</tr></thead><tbody>";
      types.forEach(function (t) {
        var statusClass = t.is_active ? "status-approved" : "status-rejected";
        var statusText = t.is_active ? "Active" : "Inactive";
        html +=
          "<tr>" +
          "<td><strong>" +
          escapeHtml(t.name) +
          "</strong></td>" +
          '<td><code style="font-size:12px;background:#f0f0f0;padding:2px 6px;border-radius:4px;">' +
          escapeHtml(t.slug) +
          "</code></td>" +
          '<td><span style="font-size:13px;color:var(--muted);text-transform:capitalize;">' +
          t.type.replace("_", " ") +
          "</span></td>" +
          "<td><strong>D" +
          t.price +
          "</strong></td>" +
          '<td><span style="font-size:12px;color:var(--muted);">' +
          (t.superadmin_fee_value > 0 && t.superadmin_fee_type === "fixed"
            ? "D" + t.superadmin_fee_value
            : t.superadmin_fee_value > 0 && t.superadmin_fee_type === "percentage"
              ? t.superadmin_fee_value + "%"
              : "—") +
          "</span></td>" +
          "<td>" +
          t.capacity +
          "</td>" +
          "<td>" +
          t.sold +
          "</td>" +
          '<td><span class="status-badge ' +
          statusClass +
          '">' +
          statusText +
          "</span></td>" +
          '<td style="white-space:nowrap;">' +
          '<button class="action-btn ticket-type-edit-btn" data-id="' +
          t.id +
          '" data-name="' +
          escapeHtml(t.name) +
          '" data-slug="' +
          escapeHtml(t.slug) +
          '" data-type="' +
          t.type +
          '" data-price="' +
          t.price +
          '" data-fee-type="' +
          (t.superadmin_fee_type || "fixed") +
          '" data-fee-value="' +
          (t.superadmin_fee_value || 0) +
          '" data-capacity="' +
          t.capacity +
          '" data-sort="' +
          t.sort_order +
          '" style="background:var(--surface);border:1px solid var(--border);color:var(--fg);margin-right:4px;min-width:auto;min-height:auto;padding:4px 10px;font-size:12px;">Edit</button>' +
          '<button class="action-btn ticket-type-toggle-btn" data-id="' +
          t.id +
          '" data-active="' +
          t.is_active +
          '" style="background:#065F46;color:white;margin-right:4px;min-width:auto;min-height:auto;padding:4px 10px;font-size:12px;' +
          (t.is_active ? "" : "opacity:0.5;") +
          '">' +
          (t.is_active ? "Deactivate" : "Activate") +
          "</button>" +
          '<button class="action-btn ticket-type-delete-btn" data-id="' +
          t.id +
          '" data-name="' +
          escapeHtml(t.name) +
          '" style="background:#991B1B;color:white;min-width:auto;min-height:auto;padding:4px 10px;font-size:12px;' +
          (t.sold > 0 ? "opacity:0.4;cursor:not-allowed;" : "") +
          '" title="' +
          (t.sold > 0
            ? "Cannot delete: " + t.sold + " ticket(s) sold"
            : "Delete this ticket type") +
          '">Delete</button>' +
          "</td>" +
          "</tr>";
      });
      html += "</tbody></table></div>";

      // Add new ticket type form
      html +=
        '<h4 style="font-size:15px;margin-bottom:12px;">Add New Ticket Type</h4>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Name</label><input type="text" id="new-ticket-name" placeholder="e.g. VIP Entry" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Slug</label><input type="text" id="new-ticket-slug" placeholder="e.g. vip-entry" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Type</label>' +
        '<select id="new-ticket-type" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
        '<option value="entry">Entry</option><option value="kids_zone">Kids Zone</option><option value="activity_credit">Activity Credit</option><option value="parking">Parking</option><option value="food">Food</option><option value="drinks">Drinks</option></select></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Price (D)</label><input type="number" id="new-ticket-price" value="0" min="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Capacity</label><input type="number" id="new-ticket-capacity" value="100" min="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Sort Order</label><input type="number" id="new-ticket-sort" value="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        (getSession().type === "super-admin" ? '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Superadmin Fee</label><div style="display:flex;gap:4px;"><select id="new-ticket-fee-type" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"><option value="fixed">Fixed (D)</option><option value="percentage">Percentage (%)</option><option value="none">None</option></select><input type="number" id="new-ticket-fee-value" value="0" min="0" style="width:70px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div></div>' : '') +
        '<div style="display:flex;align-items:end;"><button id="add-ticket-type-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Add Ticket Type</button></div>' +
        "</div>";

      container.innerHTML = html;
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed to load ticket types: ' +
        escapeHtml(err.message) +
        "</p>";
    });
}

function toggleTicketTypeActive(id, currentlyActive) {
  var btn = document.querySelector(
    '.ticket-type-toggle-btn[data-id="' + id + '"]',
  );
  if (btn) {
    btn.disabled = true;
    btn.textContent = "...";
  }

  // Try RPC first (works with ticketing_role JWT), fall back to service key
  fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/toggle_ticket_type_active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: id, p_active: !currentlyActive }),
  })
    .then(function (res) {
      if (res.ok) {
        loadTicketTypes();
        if (typeof loadInventory === "function") loadInventory();
        return;
      }
      // RPC may fail if the DB hasn't been migrated — fall back to service key
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) {
        throw new Error("Permission denied or service key required.");
      }
      return fetch(SUPABASE_URL + "/rest/v1/ticket_types?id=eq." + id, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + svcKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ is_active: !currentlyActive }),
      }).then(function (r) {
        if (!r.ok) throw new Error("Failed to update.");
        loadTicketTypes();
        if (typeof loadInventory === "function") loadInventory();
      });
    })
    .catch(function (err) {
      alert("Error: " + err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = currentlyActive ? "Deactivate" : "Activate";
      }
    });
}

function showTicketTypeEditModal(typeData) {
  // Remove any existing edit modal
  var existing = document.getElementById("ticket-type-edit-modal");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.id = "ticket-type-edit-modal";
  overlay.className = "gift-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;";

  overlay.innerHTML =
    '<div class="gift-box" style="text-align:left;max-width:480px;width:90%;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;">' +
    '<div class="gift-badge" style="margin-bottom:12px;">Edit Ticket Type</div>' +
    '<form id="ticket-type-edit-form">' +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Name</label>' +
    '<input type="text" id="edit-type-name" value="' +
    escapeHtml(typeData.name) +
    '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Slug</label>' +
    '<input type="text" id="edit-type-slug" value="' +
    escapeHtml(typeData.slug) +
    '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Type</label>' +
    '<select id="edit-type-select" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    '<option value="entry"' +
    (typeData.type === "entry" ? " selected" : "") +
    ">Entry</option>" +
    '<option value="kids_zone"' +
    (typeData.type === "kids_zone" ? " selected" : "") +
    ">Kids Zone</option>" +
    '<option value="activity_credit"' +
    (typeData.type === "activity_credit" ? " selected" : "") +
    ">Activity Credit</option>" +
    '<option value="parking"' +
    (typeData.type === "parking" ? " selected" : "") +
    ">Parking</option>" +
    '<option value="food"' +
    (typeData.type === "food" ? " selected" : "") +
    ">Food</option>" +
    '<option value="drinks"' +
    (typeData.type === "drinks" ? " selected" : "") +
    ">Drinks</option>" +
    "</select>" +
    "</div>" +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Price (D)</label>' +
    '<input type="number" id="edit-type-price" value="' +
    typeData.price +
    '" min="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Capacity</label>' +
    '<input type="number" id="edit-type-capacity" value="' +
    typeData.capacity +
    '" min="0" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    (getSession().type === "super-admin" ?
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Superadmin Fee</label>' +
    '<div style="display:flex;gap:8px;">' +
    '<select id="edit-type-fee-type" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    '<option value="fixed"' +
    (typeData.feeType === "fixed" ? " selected" : "") +
    '">Fixed (D)</option>' +
    '<option value="percentage"' +
    (typeData.feeType === "percentage" ? " selected" : "") +
    '">Percentage (%)</option>' +
    '<option value="none"' +
    (typeData.feeType === "none" || !typeData.feeType ? " selected" : "") +
    '">None</option>' +
    "</select>" +
    '<input type="number" id="edit-type-fee-value" value="' +
    (typeData.feeValue || 0) +
    '" min="0" style="width:80px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    "</div>" : '') +
    '<div style="margin-bottom:16px;">' +
    '<label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Sort Order</label>' +
    '<input type="number" id="edit-type-sort" value="' +
    typeData.sort +
    '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
    "</div>" +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button type="button" id="ticket-type-edit-cancel-btn" class="action-btn" style="background:transparent;border:1.5px solid var(--border);color:var(--fg);min-width:auto;min-height:auto;padding:8px 20px;">Cancel</button>' +
    '<button type="button" id="ticket-type-edit-save-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;" data-type-id="' +
    typeData.id +
    '">Save Changes</button>' +
    "</div>" +
    "</form>" +
    "</div>";

  document.body.appendChild(overlay);
  requestAnimationFrame(function () {
    overlay.classList.add("open");
    setTimeout(function () {
      document.getElementById("edit-type-name").focus();
    }, 100);
  });
  return overlay;
}

function saveTicketTypeEdit(typeId, data) {
  var payload = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.slug !== undefined) payload.slug = data.slug;
  if (data.type !== undefined) payload.type = data.type;
  if (data.price !== undefined) payload.price = parseInt(data.price);
  if (data.capacity !== undefined) payload.capacity = parseInt(data.capacity);
  if (data.sort !== undefined) payload.sort_order = parseInt(data.sort);
  if (data.feeType !== undefined) {
    if (data.feeType === "none") {
      payload.superadmin_fee_type = "fixed";
      payload.superadmin_fee_value = 0;
    } else {
      payload.superadmin_fee_type = data.feeType;
      payload.superadmin_fee_value = parseInt(data.feeValue) || 0;
    }
  }

  return fetchWithAuth(
    SUPABASE_URL + "/rest/v1/ticket_types?id=eq." + encodeURIComponent(typeId),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    },
  ).then(function (res) {
    if (res.ok || res.status === 204) return true;
    if (res.status === 401 || res.status === 403) {
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) throw new Error("Permission denied. Service key required.");
      return fetch(
        SUPABASE_URL +
          "/rest/v1/ticket_types?id=eq." +
          encodeURIComponent(typeId),
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer " + svcKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(payload),
        },
      ).then(function (r) {
        if (r.ok || r.status === 204) return true;
        throw new Error("Failed to update ticket type.");
      });
    }
    throw new Error("Failed to update ticket type.");
  });
}

function deleteTicketType(typeId, typeName) {
  if (
    !confirm(
      'Delete "' +
        typeName +
        '"? This cannot be undone. If tickets have already been sold for this type, the delete will fail — deactivate it instead.',
    )
  )
    return;

  return fetchWithAuth(
    SUPABASE_URL + "/rest/v1/ticket_types?id=eq." + encodeURIComponent(typeId),
    {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    },
  ).then(function (res) {
    if (res.ok || res.status === 204) return true;
    if (res.status === 401 || res.status === 403) {
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) throw new Error("Permission denied. Service key required.");
      return fetch(
        SUPABASE_URL +
          "/rest/v1/ticket_types?id=eq." +
          encodeURIComponent(typeId),
        {
          method: "DELETE",
          headers: {
            Authorization: "Bearer " + svcKey,
            Prefer: "return=minimal",
          },
        },
      ).then(function (r) {
        if (r.ok || r.status === 204) return true;
        if (r.status === 409)
          throw new Error(
            "Cannot delete: tickets exist for this type. Deactivate it instead.",
          );
        throw new Error("Failed to delete ticket type.");
      });
    }
    if (res.status === 409)
      throw new Error(
        "Cannot delete: tickets exist for this type. Deactivate it instead.",
      );
    throw new Error("Failed to delete ticket type.");
  });
}

function addTicketType() {
  var name = document.getElementById("new-ticket-name").value.trim();
  var slug = document
    .getElementById("new-ticket-slug")
    .value.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  var type = document.getElementById("new-ticket-type").value;
  var price = parseInt(document.getElementById("new-ticket-price").value) || 0;
  var capacity =
    parseInt(document.getElementById("new-ticket-capacity").value) || 0;
  var sortOrder =
    parseInt(document.getElementById("new-ticket-sort").value) || 0;

  if (!name || !slug) {
    alert("Name and slug are required.");
    return;
  }

  var btn = document.getElementById("add-ticket-type-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Adding...";
  }

  function clearForm() {
    document.getElementById("new-ticket-name").value = "";
    document.getElementById("new-ticket-slug").value = "";
    document.getElementById("new-ticket-price").value = "0";
    document.getElementById("new-ticket-capacity").value = "100";
    document.getElementById("new-ticket-sort").value = "0";
    var ftEl = document.getElementById("new-ticket-fee-type");
    var fvEl = document.getElementById("new-ticket-fee-value");
    if (ftEl) ftEl.value = "fixed";
    if (fvEl) fvEl.value = "0";
  }

  // Try RPC first (works with ticketing_role JWT), fall back to service key
  fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/add_ticket_type", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_name: name,
      p_slug: slug,
      p_type: type,
      p_price: price,
      p_capacity: capacity,
      p_sort_order: sortOrder,
      p_superadmin_fee_type: (document.getElementById("new-ticket-fee-type") || {}).value === "none" ? "fixed" : (document.getElementById("new-ticket-fee-type") || {}).value || "fixed",
      p_superadmin_fee_value: (document.getElementById("new-ticket-fee-type") || {}).value === "none" ? 0 : parseInt((document.getElementById("new-ticket-fee-value") || {}).value) || 0,
    }),
  })
    .then(function (res) {
      if (res.ok) {
        clearForm();
        loadTicketTypes();
        if (typeof loadInventory === "function") loadInventory();
        return;
      }
      throw new Error("RPC failed.");
    })
    .catch(function (err) {
      // Fall back to service key method
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) {
        alert("Permission denied. Contact admin.");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Add Ticket Type";
        }
        return;
      }

      return fetch(SUPABASE_URL + "/rest/v1/ticket_types", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + svcKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          name: name,
          slug: slug,
          type: type,
          price: price,
          capacity: capacity,
          sold: 0,
          is_active: true,
          sort_order: sortOrder,
          superadmin_fee_type: (document.getElementById("new-ticket-fee-type") || {}).value === "none" ? "fixed" : (document.getElementById("new-ticket-fee-type") || {}).value || "fixed",
          superadmin_fee_value: (document.getElementById("new-ticket-fee-type") || {}).value === "none" ? 0 : parseInt((document.getElementById("new-ticket-fee-value") || {}).value) || 0,
        }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Failed to add ticket type.");
          clearForm();
          loadTicketTypes();
          if (typeof loadInventory === "function") loadInventory();
        })
        .catch(function (e2) {
          alert("Error: " + e2.message);
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Add Ticket Type";
          }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. TOP-UP BUNDLES MANAGER
   ═══════════════════════════════════════════════════════════════════════════ */

function loadTopUpBundles() {
  var container = document.getElementById("bundles-container");
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading top-up bundles...</p>';

  adminQuery("/rest/v1/top_up_bundles?order=sort_order.asc&select=*")
    .then(function (bundles) {
      if (!bundles) throw new Error("Failed to load bundles.");
      if (!bundles || bundles.length === 0) {
        container.innerHTML =
          '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No top-up bundles configured.</p>';
        return;
      }

      var html =
        '<div style="overflow-x:auto;margin-bottom:16px;"><table class="app-table"><thead><tr>' +
        "<th>Amount</th><th>Status</th><th>Sort Order</th><th>Actions</th>" +
        "</tr></thead><tbody>";
      bundles.forEach(function (b) {
        var statusClass = b.is_active ? "status-approved" : "status-rejected";
        var statusText = b.is_active ? "Active" : "Inactive";
        html +=
          "<tr>" +
          "<td><strong>D" +
          b.amount +
          "</strong></td>" +
          '<td><span class="status-badge ' +
          statusClass +
          '">' +
          statusText +
          "</span></td>" +
          '<td><span style="font-size:13px;color:var(--muted);">' +
          b.sort_order +
          "</span></td>" +
          "<td>" +
          '<button class="action-btn bundle-toggle-btn" data-id="' +
          b.id +
          '" data-active="' +
          b.is_active +
          '" style="background:#065F46;color:white;margin-right:6px;">' +
          (b.is_active ? "Deactivate" : "Activate") +
          "</button>" +
          '<button class="action-btn action-reject bundle-delete-btn" data-id="' +
          b.id +
          '">Delete</button>' +
          "</td>" +
          "</tr>";
      });
      html += "</tbody></table></div>";

      // Add new bundle form
      html +=
        '<div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Amount (D)</label><input type="number" id="new-bundle-amount" value="100" min="50" step="50" style="width:120px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Sort Order</label><input type="number" id="new-bundle-sort" value="0" style="width:80px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<button id="add-bundle-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Add Bundle</button>' +
        "</div>";

      container.innerHTML = html;
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed to load bundles: ' +
        escapeHtml(err.message) +
        "</p>";
    });
}

function toggleBundleActive(id, currentlyActive) {
  var btn = document.querySelector('.bundle-toggle-btn[data-id="' + id + '"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "...";
  }

  fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/toggle_bundle_active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: id, p_active: !currentlyActive }),
  })
    .then(function (res) {
      if (res.ok) {
        loadTopUpBundles();
        return;
      }
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) {
        throw new Error("Permission denied.");
      }
      return fetch(SUPABASE_URL + "/rest/v1/top_up_bundles?id=eq." + id, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + svcKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ is_active: !currentlyActive }),
      }).then(function (r) {
        if (!r.ok) throw new Error("Failed to update.");
        loadTopUpBundles();
      });
    })
    .catch(function (err) {
      alert("Error: " + err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = currentlyActive ? "Deactivate" : "Activate";
      }
    });
}

function deleteBundle(id) {
  if (!confirm("Delete this top-up bundle?")) return;

  var btn = document.querySelector('.bundle-delete-btn[data-id="' + id + '"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "...";
  }

  fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/delete_top_up_bundle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: id }),
  })
    .then(function (res) {
      if (res.ok) {
        loadTopUpBundles();
        return;
      }
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) {
        throw new Error("Permission denied.");
      }
      return fetch(SUPABASE_URL + "/rest/v1/top_up_bundles?id=eq." + id, {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + svcKey,
          Prefer: "return=minimal",
        },
      }).then(function (r) {
        if (!r.ok) throw new Error("Failed to delete.");
        loadTopUpBundles();
      });
    })
    .catch(function (err) {
      alert("Error: " + err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Delete";
      }
    });
}

function addBundle() {
  var amount =
    parseInt(document.getElementById("new-bundle-amount").value) || 0;
  var sortOrder =
    parseInt(document.getElementById("new-bundle-sort").value) || 0;

  if (amount < 50) {
    alert("Minimum bundle amount is D50.");
    return;
  }

  var btn = document.getElementById("add-bundle-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Adding...";
  }

  fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/add_top_up_bundle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_amount: amount, p_sort_order: sortOrder }),
  })
    .then(function (res) {
      if (res.ok) {
        document.getElementById("new-bundle-amount").value = "100";
        document.getElementById("new-bundle-sort").value = "0";
        loadTopUpBundles();
        return;
      }
      throw new Error("RPC failed.");
    })
    .catch(function (err) {
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) {
        alert("Permission denied. Contact admin.");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Add Bundle";
        }
        return;
      }
      return fetch(SUPABASE_URL + "/rest/v1/top_up_bundles", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + svcKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          amount: amount,
          sort_order: sortOrder,
          is_active: true,
        }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Failed to add bundle.");
          document.getElementById("new-bundle-amount").value = "100";
          document.getElementById("new-bundle-sort").value = "0";
          loadTopUpBundles();
        })
        .catch(function (e2) {
          alert("Error: " + e2.message);
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Add Bundle";
          }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. BALANCE CAP SETTING
   ═══════════════════════════════════════════════════════════════════════════ */

function loadBalanceCap() {
  var container = document.getElementById("balance-cap-container");
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading setting...</p>';

  adminQuery("/rest/v1/system_config?key=eq.balance_cap&select=value")
    .then(function (configs) {
      var cap = "5000";
      if (configs && configs.length > 0) {
        cap = configs[0].value || "5000";
      }
      container.innerHTML =
        '<p style="font-size:13px;color:var(--muted);margin-bottom:8px;">Maximum balance per activity credit ticket. Changes apply to all subsequent top-ups.</p>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<label style="font-size:14px;font-weight:500;">Balance Cap: D</label>' +
        '<input type="number" id="balance-cap-input" value="' +
        cap +
        '" min="100" max="50000" style="width:120px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);">' +
        '<button id="save-balance-cap-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Save</button>' +
        '<span id="balance-cap-status" style="font-size:13px;color:#065F46;display:none;">Saved!</span>' +
        "</div>";
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed to load: ' +
        escapeHtml(err.message) +
        "</p>";
    });
}

function saveBalanceCap() {
  var value = document.getElementById("balance-cap-input").value.trim();
  if (!value || parseInt(value) < 100) {
    alert("Minimum cap is D100.");
    return;
  }

  var btn = document.getElementById("save-balance-cap-btn");
  var statusEl = document.getElementById("balance-cap-status");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }
  if (statusEl) {
    statusEl.style.display = "none";
  }

  fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/upsert_balance_cap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_value: String(value) }),
  })
    .then(function (res) {
      if (res.ok) {
        if (statusEl) {
          statusEl.style.display = "inline";
          setTimeout(function () {
            statusEl.style.display = "none";
          }, 3000);
        }
        return;
      }
      throw new Error("RPC failed.");
    })
    .catch(function (err) {
      // Fall back to service key method
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) {
        alert("Permission denied. Contact admin.");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Save";
        }
        return;
      }

      // Upsert: try update first, then insert
      fetch(SUPABASE_URL + "/rest/v1/system_config?key=eq.balance_cap", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + svcKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ value: value }),
      })
        .then(function (res) {
          if (res.ok || res.status === 404) {
            if (statusEl) {
              statusEl.style.display = "inline";
              setTimeout(function () {
                statusEl.style.display = "none";
              }, 3000);
            }
          } else {
            return fetch(SUPABASE_URL + "/rest/v1/system_config", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + svcKey,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                key: "balance_cap",
                value: value,
                description:
                  "Maximum balance per activity credit ticket (in GMD)",
              }),
            }).then(function (res2) {
              if (!res2.ok) throw new Error("Failed to save.");
              if (statusEl) {
                statusEl.style.display = "inline";
                setTimeout(function () {
                  statusEl.style.display = "none";
                }, 3000);
              }
            });
          }
        })
        .catch(function (err2) {
          alert("Error: " + err2.message);
        })
        .then(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Save";
          }
        });
    });
  // Ensure button re-enables even if fetchWithAuth path has no .then after success
  setTimeout(function () {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Save";
    }
  }, 5000);
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. STAFF SCANNER CODES MANAGER
   ═══════════════════════════════════════════════════════════════════════════ */

function loadScannerCodes() {
  var container = document.getElementById("scanner-codes-container");
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading scanner codes...</p>';

  adminQuery("/rest/v1/staff_scanner_codes?order=created_at.desc&select=*")
    .then(function (codes) {
      if (!codes) throw new Error("Failed to load scanner codes.");
      if (!codes || codes.length === 0) {
        container.innerHTML =
          '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No scanner codes issued yet.</p>' +
          '<div style="text-align:center;margin-top:12px;"><button id="issue-scanner-code-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Issue New Code</button></div>';
        return;
      }

      var html =
        '<div style="overflow-x:auto;margin-bottom:16px;"><table class="app-table"><thead><tr>' +
        "<th>Code</th><th>Label</th><th>Permissions</th><th>Status</th><th>Last Used</th><th>Created</th><th>Actions</th>" +
        "</tr></thead><tbody>";
      codes.forEach(function (c) {
        var statusClass = c.is_active ? "status-approved" : "status-rejected";
        var statusText = c.is_active ? "Active" : "Revoked";
        var lastUsed = c.last_used_at
          ? new Date(c.last_used_at).toLocaleDateString()
          : "-";
        html +=
          "<tr>" +
          '<td><code style="font-size:13px;background:#f0f0f0;padding:2px 8px;border-radius:4px;">' +
          escapeHtml(c.code) +
          "</code></td>" +
          "<td>" +
          escapeHtml(c.label || "-") +
          "</td>" +
          '<td><span class="status-badge ' +
          statusClass +
          '">' +
          statusText +
          "</span></td>" +
          '<td><span style="font-size:13px;color:var(--muted);">' +
          lastUsed +
          "</span></td>" +
          '<td><span style="font-size:13px;color:var(--muted);">' +
          new Date(c.created_at).toLocaleDateString() +
          "</span></td>" +
          "<td>" +
          (c.is_active
            ? '<button class="action-btn action-reject revoke-code-btn" data-id="' +
              c.id +
              '">Revoke</button>'
            : '<span style="font-size:13px;color:var(--muted);">Revoked</span>') +
          "</td>" +
          "</tr>";
      });
      html += "</tbody></table></div>";

      // Issue new code form
      html +=
        '<div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
        '<div style="display:flex;flex-direction:column;gap:12px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:end;">' +
        '<div><label style="font-size:13px;font-weight:500;display:block;margin-bottom:4px;">Staff Label/Name</label><input type="text" id="new-scanner-label" placeholder="e.g. Gate Alpha" style="width:200px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:var(--font-body);"></div>' +
        '<button id="issue-scanner-code-btn" class="action-btn action-approve" style="min-width:auto;min-height:auto;padding:8px 20px;">Issue Code</button>' +
        "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding-top:8px;border-top:1px solid var(--border);">' +
        '<label style="font-size:13px;font-weight:600;color:var(--muted);margin-right:8px;">Permissions:</label>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="perm-checkbox" value="gate" checked> Gate</label>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="perm-checkbox" value="debit"> Debit</label>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="perm-checkbox" value="topup"> Top-Up</label>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="perm-checkbox" value="bill"> Bill</label>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" class="perm-checkbox" value="bulk"> Bulk</label>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;border-left:1px solid var(--border);padding-left:12px;"><input type="checkbox" id="perm-universal" value="*"> <strong>Universal</strong> (all modes)</label>' +
        "</div>" +
        "</div>";

      container.innerHTML = html;
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed to load scanner codes: ' +
        escapeHtml(err.message) +
        "</p>";
    });
}

function getSelectedPermissions() {
  var universal = document.getElementById("perm-universal");
  if (universal && universal.checked) return ["*"];
  var perms = [];
  document.querySelectorAll(".perm-checkbox:checked").forEach(function (cb) {
    perms.push(cb.value);
  });
  return perms.length > 0 ? perms : ["*"];
}

function issueScannerCode() {
  var label = document.getElementById("new-scanner-label").value.trim();

  // Generate a random 6-char alphanumeric code
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var code = "";
  for (var i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  var btn = document.getElementById("issue-scanner-code-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Issuing...";
  }

  fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/issue_scanner_code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_code: code,
      p_label: label || "Staff",
      p_permissions: getSelectedPermissions(),
    }),
  })
    .then(function (res) {
      if (res.ok) {
        document.getElementById("new-scanner-label").value = "";
        alert("New staff code issued: " + code);
        loadScannerCodes();
        return;
      }
      throw new Error("RPC failed.");
    })
    .catch(function (err) {
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) {
        alert("Permission denied. Contact admin.");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Issue Code";
        }
        return;
      }
      return fetch(SUPABASE_URL + "/rest/v1/staff_scanner_codes", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + svcKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          code: code,
          label: label || "Staff",
          is_active: true,
          permissions: getSelectedPermissions(),
        }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Failed to issue code.");
          document.getElementById("new-scanner-label").value = "";
          alert("New staff code issued: " + code);
          loadScannerCodes();
        })
        .catch(function (e2) {
          alert("Error: " + e2.message);
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Issue Code";
          }
        });
    });
}

function revokeScannerCode(id) {
  if (
    !confirm(
      "Revoke this scanner code? The staff member will no longer be able to access the scanner page.",
    )
  )
    return;

  var btn = document.querySelector('.revoke-code-btn[data-id="' + id + '"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Revoking...";
  }

  fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/revoke_scanner_code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: id }),
  })
    .then(function (res) {
      if (res.ok) {
        loadScannerCodes();
        return;
      }
      throw new Error("RPC failed.");
    })
    .catch(function (err) {
      var svcKey =
        localStorage.getItem("wf_service_key") ||
        sessionStorage.getItem("wf_service_key");
      if (!svcKey && typeof getServiceKey === "function") {
        svcKey = getServiceKey(true);
      }
      if (!svcKey) {
        alert("Permission denied. Contact admin.");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Revoke";
        }
        return;
      }
      return fetch(SUPABASE_URL + "/rest/v1/staff_scanner_codes?id=eq." + id, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + svcKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ is_active: false }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Failed to revoke code.");
          loadScannerCodes();
        })
        .catch(function (e2) {
          alert("Error: " + e2.message);
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Revoke";
          }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   8b. STAFF ACTIVITY REPORT
   ═══════════════════════════════════════════════════════════════════════════ */

function loadStaffActivity() {
  var container = document.getElementById("staff-activity-container");
  if (!container) return;
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading staff activity...</p>';

  // Fetch all balance transactions with staff codes
  adminQuery(
    "/rest/v1/balance_transactions?select=staff_code,type,amount_delta,source,created_at&order=created_at.desc&staff_code=not.is.null&limit=5000",
  )
    .then(function (txns) {
      if (!txns || txns.length === 0) {
        container.innerHTML =
          '<p style="color:var(--muted);font-size:14px;text-align:center;padding:12px;">No staff-tracked transactions yet. Debits processed from the scan page will appear here.</p>';
        return;
      }

      // Group by staff_code
      var staffGroups = {};
      txns.forEach(function (t) {
        var code = t.staff_code || "unknown";
        if (!staffGroups[code]) {
          staffGroups[code] = {
            debits: 0,
            debitCount: 0,
            topups: 0,
            topupCount: 0,
            sources: {},
          };
        }
        var g = staffGroups[code];
        if (t.type === "debit") {
          g.debits += Math.abs(t.amount_delta);
          g.debitCount++;
        } else if (t.type === "topup") {
          g.topups += Math.abs(t.amount_delta);
          g.topupCount++;
        }
        var src = t.source || "unknown";
        if (!g.sources[src]) g.sources[src] = 0;
        g.sources[src] += Math.abs(t.amount_delta);
      });

      var html =
        '<div style="overflow-x:auto;margin-top:8px;"><table class="app-table" style="font-size:13px;">' +
        "<thead><tr>" +
        "<th>Staff Code</th>" +
        "<th>Total Debits (D)</th>" +
        "<th>Debit Count</th>" +
        "<th>Total Top-Ups (D)</th>" +
        "<th>Top-Up Count</th>" +
        "<th>Combined Total (D)</th>" +
        "</tr></thead><tbody>";

      var codes = Object.keys(staffGroups).sort();
      var grandDebits = 0,
        grandTopups = 0;
      codes.forEach(function (code) {
        var g = staffGroups[code];
        grandDebits += g.debits;
        grandTopups += g.topups;
        html +=
          "<tr>" +
          '<td><code style="font-size:12px;background:#f0f0f0;padding:2px 6px;border-radius:4px;">' +
          escapeHtml(code) +
          "</code></td>" +
          '<td style="font-weight:600;color:#991B1B;">D' +
          g.debits.toLocaleString() +
          "</td>" +
          "<td>" +
          g.debitCount +
          "</td>" +
          '<td style="font-weight:600;color:#065F46;">D' +
          g.topups.toLocaleString() +
          "</td>" +
          "<td>" +
          g.topupCount +
          "</td>" +
          '<td style="font-weight:600;">D' +
          (g.debits + g.topups).toLocaleString() +
          "</td>" +
          "</tr>";
      });

      // Grand total row
      html +=
        '<tr style="border-top:2px solid var(--accent);font-weight:700;">' +
        "<td><strong>GRAND TOTAL</strong></td>" +
        '<td style="color:#991B1B;">D' +
        grandDebits.toLocaleString() +
        "</td>" +
        "<td>" +
        codes.reduce(function (s, c) {
          return s + staffGroups[c].debitCount;
        }, 0) +
        "</td>" +
        '<td style="color:#065F46;">D' +
        grandTopups.toLocaleString() +
        "</td>" +
        "<td>" +
        codes.reduce(function (s, c) {
          return s + staffGroups[c].topupCount;
        }, 0) +
        "</td>" +
        "<td>D" +
        (grandDebits + grandTopups).toLocaleString() +
        "</td>" +
        "</tr>";

      html += "</tbody></table></div>";
      container.innerHTML = html;
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed: ' +
        escapeHtml(err.message) +
        "</p>";
    });
}


/* ═══════════════════════════════════════════════════════════════════════════
   9. SUPERADMIN REVENUE REPORT
   ═══════════════════════════════════════════════════════════════════════════ */

function loadSuperadminReport(startDate, endDate) {
  var container = document.getElementById("superadmin-report-container");
  if (!container) return;
  container.innerHTML =
    '<p style="color:var(--muted);font-size:14px;">Loading superadmin revenue report...</p>';

  _superadminReportCache = []; // reset cache

  // Read dates from DOM if not passed
  if (startDate === undefined) {
    var startEl = document.getElementById("report-start-date");
    startDate = startEl ? startEl.value : "";
  }
  if (endDate === undefined) {
    var endEl = document.getElementById("report-end-date");
    endDate = endEl ? endEl.value : "";
  }

  var hasDateFilter = startDate && endDate;

  adminQuery("/rest/v1/ticket_types?order=sort_order.asc&select=*")
    .then(function (types) {
      if (!types || types.length === 0) {
        container.innerHTML =
          '<p style="color:var(--muted);font-size:14px;text-align:center;padding:20px;">No ticket types configured.</p>';
        return;
      }

      // If date filter is active, query tickets in the date range
      var ticketPromise;
      _superadminOrderCache = [];
      if (hasDateFilter) {
        // Build end date: include full day by appending 23:59:59
        var endDateTime = endDate + "T23:59:59Z";
        var path = "/rest/v1/tickets?select=ticket_type_id,id,order_id,code,customer_email,created_at,ticket_types!inner(name,slug,price),orders!left(payment_method)&created_at=gte." + startDate + "&created_at=lte." + endDateTime + "&order=created_at.desc";
        ticketPromise = adminQuery(path).then(function (tickets) {
          // Count tickets per type and store order-level detail
          var counts = {};
          (tickets || []).forEach(function (tkt) {
            var tid = tkt.ticket_type_id;
            counts[tid] = (counts[tid] || 0) + 1;
            // Store order-level data for CSV export
            _superadminOrderCache.push({
              orderId: tkt.order_id,
              customerEmail: tkt.customer_email,
              ticketCode: tkt.code,
              ticketTypeName: tkt.ticket_types ? tkt.ticket_types.name : "Unknown",
              ticketTypeSlug: tkt.ticket_types ? tkt.ticket_types.slug : "",
              ticketTypePrice: tkt.ticket_types ? tkt.ticket_types.price : 0,
              purchaseDate: tkt.created_at,
              ticketTypeId: tid,
              paymentMethod: tkt.orders ? tkt.orders.payment_method : null,
            });
          });
          return counts;
        });
      } else {
        ticketPromise = Promise.resolve(null);
      }

      return ticketPromise.then(function (ticketCounts) {
        var grandEarnings = 0;
        var grandSold = 0;
        var byFeeType = { fixed: 0, percentage: 0, none: 0 };

        var html =
          '<div style="overflow-x:auto;margin-bottom:16px;"><table class="app-table">' +
          "<thead><tr>" +
          "<th>Ticket Type</th>" +
          "<th>Price</th>" +
          "<th>Sold</th>" +
          "<th>Fee Type</th>" +
          "<th>Fee Value</th>" +
          "<th>Fee per Ticket</th>" +
          "<th>Est. Earnings</th>" +
          "</tr></thead><tbody>";

        types.forEach(function (t) {
          // Determine sold count for this type
          var soldInRange;
          if (hasDateFilter && ticketCounts) {
            soldInRange = ticketCounts[t.id] || 0;
          } else {
            soldInRange = t.sold;
          }

          if (soldInRange === 0 && !hasDateFilter && t.is_active === false) return; // skip inactive with no sales (cumulative only)
          if (soldInRange === 0) return; // skip types with no sales in range

          var feeType = t.superadmin_fee_type || "none";
          var feeVal = t.superadmin_fee_value || 0;
          var feePerTicket = 0;

          if (feeType === "fixed" && feeVal > 0) {
            feePerTicket = feeVal;
          } else if (feeType === "percentage" && feeVal > 0) {
            feePerTicket = Math.round((t.price * feeVal) / 100);
          }

          var earnings = feePerTicket * soldInRange;
          grandEarnings += earnings;
          grandSold += soldInRange;

          var feeTypeLabel = feeType === "fixed" ? "Fixed" : feeType === "percentage" ? "% of Price" : "None";
          var feeValDisplay = feeType === "none" || feeVal === 0 ? "—" : feeType === "percentage" ? feeVal + "%" : "D" + feeVal;
          var feePerDisplay = feePerTicket > 0 ? "D" + feePerTicket : "—";
          var earningDisplay = earnings > 0 ? "D" + earnings.toLocaleString() : "D0";

          if (feeType === "fixed") byFeeType.fixed += earnings;
          else if (feeType === "percentage") byFeeType.percentage += earnings;
          else byFeeType.none += earnings;

          // Cache for CSV export
          _superadminReportCache.push({
            name: t.name,
            price: t.price,
            sold: soldInRange,
            soldTotal: t.sold,
            feeTypeLabel: feeTypeLabel,
            feeValDisplay: feeValDisplay,
            feePerTicket: feePerTicket,
            earnings: earnings,
          });

          html += "<tr>" +
            "<td><strong>" + escapeHtml(t.name) + "</strong></td>" +
            "<td>D" + t.price + "</td>" +
            "<td>" + soldInRange + "</td>" +
            "<td><span style="font-size:13px;color:var(--muted);">" + feeTypeLabel + "</span></td>" +
            "<td><span style="font-size:13px;color:var(--muted);">" + feeValDisplay + "</span></td>" +
            "<td>" + feePerDisplay + "</td>" +
            '<td style="font-weight:600;color:#065F46;">' + earningDisplay + "</td>" +
            "</tr>";
        });

        if (grandSold === 0) {
          html += "<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted);">No ticket sales found" +
            (hasDateFilter ? " in this date range" : "") +
            ".</td></tr>";
        }

        // Grand total row
        html += "<tr style="border-top:2px solid var(--accent);font-weight:700;">" +
          "<td><strong style="color:var(--accent);">TOTAL</strong></td>" +
          "<td></td>" +
          "<td>" + grandSold + "</td>" +
          "<td></td><td></td><td></td>" +
        '<td style="color:#065F46;">D' + grandEarnings.toLocaleString() + "</td>" +
        "</tr>";

      html += "</tbody></table></div>";

      // Period indicator
      var periodText = hasDateFilter
        ? '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Showing sales from <strong>' + startDate + '</strong> to <strong>' + endDate + '</strong>. ' +
          '<a href="#" id="clear-report-filter" style="color:var(--accent);text-decoration:underline;cursor:pointer;">Clear filter</a></p>'
        : '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Showing <strong>all-time</strong> sales (cumulative). Use the date filter above to view a specific period.</p>';

      html = periodText + html;

      // Summary cards
      html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px;">' +
        '<div class="stat-card"><div class="num" style="color:#065F46;">D' + grandEarnings.toLocaleString() + '</div><div class="lbl">Total Est. Superadmin Earnings</div></div>' +
        '<div class="stat-card"><div class="num" style="color:#1E40AF;">D' + (byFeeType.fixed > 0 ? byFeeType.fixed.toLocaleString() : '0') + '</div><div class="lbl">From Fixed Fees</div></div>' +
        '<div class="stat-card"><div class="num" style="color:#7C3AED;">D' + (byFeeType.percentage > 0 ? byFeeType.percentage.toLocaleString() : '0') + '</div><div class="lbl">From %% Fees</div></div>' +
        "</div>" +

      // Payment method breakdown (only available with date filter / order data)
      (hasDateFilter && _superadminOrderCache.length > 0 ? (function() {
        var pmEarnings = {};
        var pmLabels = { modempay: "ModemPay", wave_transfer: "Wave Transfer", wave: "Wave (On-site)", cash: "Cash" };
        var pmOrders = {};
        _superadminOrderCache.forEach(function (tkt) {
          var pm = tkt.paymentMethod || "unpaid";
          if (!pmEarnings[pm]) { pmEarnings[pm] = 0; pmOrders[pm] = {}; }
          pmOrders[pm][tkt.orderId] = true;
        });
        // Calculate earnings for each payment method by matching with fee config
        var feeLookup = {};
        _superadminReportCache.forEach(function (r) {
          feeLookup[r.name] = { feePerTicket: r.feePerTicket };
        });
        _superadminOrderCache.forEach(function (tkt) {
          var feeInfo = feeLookup[tkt.ticketTypeName] || { feePerTicket: 0 };
          var feePerTicketVal = feeInfo.feePerTicket || 0;
          var pm = tkt.paymentMethod || "unpaid";
          pmEarnings[pm] += feePerTicketVal;
        });
        // Build cards in a consistent order
        var pmOrder = ["modempay", "wave_transfer", "wave", "cash", "unpaid"];
        var pmColors = { modempay: "#1E40AF", wave_transfer: "#065F46", wave: "#059669", cash: "#92400E", unpaid: "var(--muted)" };
        var pmHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-top:16px;padding:12px;background:var(--accent-dim);border:1px solid var(--border);border-radius:12px;">' +
          '<div style="grid-column:1/-1;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">By Payment Method</div>';
        pmOrder.forEach(function (pm) {
          if (pmEarnings[pm] && pmEarnings[pm] > 0) {
            var label = pmLabels[pm] || pm.charAt(0).toUpperCase() + pm.slice(1);
            var orderCount = pmOrders[pm] ? Object.keys(pmOrders[pm]).length : 0;
            pmHtml += '<div style="text-align:center;"><div class="num" style="font-size:22px;color:' + pmColors[pm] + ';">D' + pmEarnings[pm].toLocaleString() + '</div><div class="lbl" style="font-size:11px;">' + label + ' (' + orderCount + ' order' + (orderCount !== 1 ? 's' : '') + ')</div></div>';
          }
        });
        pmHtml += "</div>";
        return pmHtml;
      })() : '');

      // ── Order-level detail table (only when date filter active) ──
      html += (hasDateFilter && _superadminOrderCache.length > 0 ? (function() {
        var feeLookup = {};
        _superadminReportCache.forEach(function (r) {
          feeLookup[r.name] = { feePerTicket: r.feePerTicket };
        });
        var detailHtml = '';
        detailHtml += '<details style="margin-top:20px;">' +
          '<summary style="cursor:pointer;font-size:14px;font-weight:600;color:var(--accent);padding:8px 0;">' +
          'Order Details <span style="font-weight:400;font-size:13px;color:var(--muted);">(' + _superadminOrderCache.length + ' tickets)</span></summary>' +
          '<div style="overflow-x:auto;margin-top:8px;"><table class="app-table" style="font-size:13px;"><thead><tr>' +
          '<th>Order ID</th><th>Customer</th><th>Ticket Code</th><th>Type</th><th>Date</th><th>Payment</th><th>Fee/Ticket</th><th>Earnings</th>' +
          '</tr></thead><tbody>';
        var totalFeeEarnings = 0;
        _superadminOrderCache.forEach(function (tkt) {
          var feeInfo = feeLookup[tkt.ticketTypeName] || { feePerTicket: 0 };
          var feePerTicketVal = feeInfo.feePerTicket || 0;
          totalFeeEarnings += feePerTicketVal;
          var pmDisplay = tkt.paymentMethod === "modempay" ? "ModemPay" : tkt.paymentMethod === "wave_transfer" || tkt.paymentMethod === "wave" ? "Wave" : tkt.paymentMethod === "cash" ? "Cash" : "—";
          detailHtml += '<tr>' +
            '<td><code style="font-size:11px;">#' + (tkt.orderId ? tkt.orderId.slice(0, 8) : '—') + '</code></td>' +
            '<td><span style="font-size:12px;">' + escapeHtml(tkt.customerEmail || '—') + '</span></td>' +
            '<td><code style="font-size:11px;background:#f0f0f0;padding:1px 5px;border-radius:3px;">' + escapeHtml(tkt.ticketCode || '') + '</code></td>' +
            '<td>' + escapeHtml(tkt.ticketTypeName) + '</td>' +
            '<td><span style="font-size:12px;color:var(--muted);">' + (tkt.purchaseDate ? tkt.purchaseDate.slice(0, 10) : '') + '</span></td>' +
            '<td><span style="font-size:12px;">' + pmDisplay + '</span></td>' +
            '<td>' + (feePerTicketVal > 0 ? 'D' + feePerTicketVal : '—') + '</td>' +
            '<td style="font-weight:600;color:#065F46;">' + (feePerTicketVal > 0 ? 'D' + feePerTicketVal : 'D0') + '</td>' +
            '</tr>';
        });
        detailHtml += '<tr style="border-top:2px solid var(--accent);font-weight:700;">' +
          '<td colspan="6" style="text-align:right;color:var(--accent);">TOTAL</td>' +
          '<td></td>' +
          '<td style="color:#065F46;">D' + totalFeeEarnings.toLocaleString() + '</td></tr>';
        detailHtml += '</tbody></table></div></details>';
        return detailHtml;
      })() : '');

      container.innerHTML = html;";
    });
    })
    .catch(function (err) {
      container.innerHTML =
        '<p style="color:#DC2626;font-size:14px;">Failed to load: ' +
        escapeHtml(err.message) + "</p>";
    });
}

// ─── Export Superadmin Report CSV ─────────────────────────────────────

var _superadminReportCache = null;
var _superadminOrderCache = null;

function exportSuperadminReportCSV() {
  if (!_superadminReportCache || _superadminReportCache.length === 0) {
    alert("No report data to export. Load the report first.");
    return;
  }

  // Determine date range label for filename and header
  var startEl = document.getElementById("report-start-date");
  var endEl = document.getElementById("report-end-date");
  var startDate = startEl ? startEl.value : "";
  var endDate = endEl ? endEl.value : "";
  var hasFilter = startDate && endDate;
  var dateLabel = hasFilter ? startDate + " to " + endDate : "all-time";

  // CSV header
  var csv = "\uFEFFPeriod: " + dateLabel + "\n";
  csv += "Ticket Type,Price,Sold,Fee Type,Fee Value,Fee per Ticket (D),Est. Earnings (D)\n";

  _superadminReportCache.forEach(function (row) {
    // Escape fields that might contain commas or quotes
    function esc(v) {
      var s = String(v == null ? "" : v);
      if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }
    csv += esc(row.name) + "," +
      esc(row.price) + "," +
      esc(row.sold) + "," +
      esc(row.feeTypeLabel) + "," +
      esc(row.feeValDisplay) + "," +
      esc(row.feePerTicket) + "," +
      esc(row.earnings) + "\n";
  });

  // Add total row
    var totals = _superadminReportCache.reduce(function (acc, r) {
    return { sold: acc.sold + r.sold, earnings: acc.earnings + r.earnings, revenue: acc.revenue + (r.price * r.sold) };
  }, { sold: 0, earnings: 0, revenue: 0 });
  csv += "TOTAL,," + totals.sold + ",,," + totals.earnings + "
";
  csv += "Gross Revenue (with fees),,," + totals.revenue + ",,," + "
";
  csv += "Net Revenue (without fees),,," + (totals.revenue - totals.earnings) + ",,," + "
";
  // —— Order-level detail section
  csv += "\n";
  if (hasFilter && _superadminOrderCache && _superadminOrderCache.length > 0) {
    csv += "Order Details (tickets purchased in this period)\n";
    csv += "Order ID,Customer Email,Ticket Code,Ticket Type,Purchase Date,Payment Method,Fee per Ticket (D),Est. Earnings (D)\n";

    // Build a lookup of fee config per ticket type
    var feeLookup = {};
    _superadminReportCache.forEach(function (r) {
      feeLookup[r.name] = { feePerTicket: r.feePerTicket, feeType: r.feeTypeLabel };
    });

    _superadminOrderCache.forEach(function (tkt) {
      var feeInfo = feeLookup[tkt.ticketTypeName] || { feePerTicket: 0 };
      var feePerTicketVal = feeInfo.feePerTicket || 0;
      var earningsVal = feePerTicketVal;

      function esc(v) {
        var s = String(v == null ? "" : v);
        if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
          return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }

      var pmLabel = "";
      if (tkt.paymentMethod === "modempay") pmLabel = "ModemPay";
      else if (tkt.paymentMethod === "wave_transfer") pmLabel = "Wave Transfer";
      else if (tkt.paymentMethod === "wave") pmLabel = "Wave (On-site)";
      else if (tkt.paymentMethod === "cash") pmLabel = "Cash";
      else pmLabel = "—";

      csv += esc(tkt.orderId) + "," +
        esc(tkt.customerEmail) + "," +
        esc(tkt.ticketCode) + "," +
        esc(tkt.ticketTypeName) + "," +
        esc(tkt.purchaseDate ? tkt.purchaseDate.slice(0, 10) : "") + "," +
        esc(pmLabel) + "," +
        esc(feePerTicketVal > 0 ? "D" + feePerTicketVal : "—") + "," +
        esc(feePerTicketVal > 0 ? "D" + earningsVal : "D0") + "\n";
  } else if (!hasFilter) {
    csv += "Order-level detail is only available when a date filter is applied.\n";
    csv += "Set a date range above the report and click Apply Filter, then export again.\n";
  }

  // Trigger download with date-range-aware filename
  var filename = hasFilter
    ? "superadmin-revenue-" + startDate + "_to_" + endDate + ".csv"
    : "superadmin-revenue-all-time-" + new Date().toISOString().slice(0, 10) + ".csv";
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
/* ═══════════════════════════════════════════════════════════════════════════
   EVENT DELEGATION
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener("click", function (e) {
  // Order filter buttons
  if (e.target.classList.contains("order-filter-btn")) {
    setOrderFilter(e.target.getAttribute("data-status") || "all");
  }

  // Order expand/collapse
  if (e.target.classList.contains("order-expand-btn")) {
    toggleOrderTickets(e.target.getAttribute("data-order"));
  }

  // Ticket type toggle
  if (e.target.classList.contains("ticket-type-toggle-btn")) {
    toggleTicketTypeActive(
      e.target.getAttribute("data-id"),
      e.target.getAttribute("data-active") === "true",
    );
  }

  // Ticket type edit — open modal
  if (e.target.classList.contains("ticket-type-edit-btn")) {
    var btn = e.target;
    showTicketTypeEditModal({
      id: btn.getAttribute("data-id"),
      name: btn.getAttribute("data-name"),
      slug: btn.getAttribute("data-slug"),
      type: btn.getAttribute("data-type"),
      price: btn.getAttribute("data-price"),
      capacity: btn.getAttribute("data-capacity"),
      sort: btn.getAttribute("data-sort"),
      feeType: btn.getAttribute("data-fee-type"),
      feeValue: btn.getAttribute("data-fee-value"),
    });
  }

  // Save ticket type edit
  if (e.target.id === "ticket-type-edit-save-btn") {
    var saveBtn = e.target;
    var typeId = saveBtn.getAttribute("data-type-id");
    if (!typeId) return;

    var feeTypeEl = document.getElementById("edit-type-fee-type");
    var data = {
      name: document.getElementById("edit-type-name").value.trim(),
      slug: document
        .getElementById("edit-type-slug")
        .value.trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-"),
      type: document.getElementById("edit-type-select").value,
      price: document.getElementById("edit-type-price").value,
      capacity: document.getElementById("edit-type-capacity").value,
      sort: document.getElementById("edit-type-sort").value,
      feeType: feeTypeEl ? document.getElementById("edit-type-fee-type").value : "fixed",
      feeValue: feeTypeEl ? document.getElementById("edit-type-fee-value").value : "0",
    };

    if (!data.name || !data.slug) {
      alert("Name and slug are required.");
      return;
    }

    var modal = document.getElementById("ticket-type-edit-modal");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    saveTicketTypeEdit(typeId, data)
      .then(function (success) {
        if (success) {
          if (modal) modal.remove();
          loadTicketTypes();
          if (typeof loadInventory === "function") loadInventory();
        }
      })
      .catch(function (err) {
        alert("Error: " + err.message);
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
      });
  }

  // Cancel ticket type edit modal
  if (e.target.id === "ticket-type-edit-cancel-btn") {
    var modal = document.getElementById("ticket-type-edit-modal");
    if (modal) modal.remove();
  }

  // Dismiss edit modal by clicking overlay
  if (e.target.id === "ticket-type-edit-modal") {
    e.target.remove();
  }

  // Delete ticket type
  if (e.target.classList.contains("ticket-type-delete-btn")) {
    var btn = e.target;
    var typeId = btn.getAttribute("data-id");
    var typeName = btn.getAttribute("data-name");
    if (!typeId) return;

    btn.disabled = true;
    btn.textContent = "...";

    deleteTicketType(typeId, typeName)
      .then(function (success) {
        if (success === true) {
          loadTicketTypes();
          if (typeof loadInventory === "function") loadInventory();
        }
      })
      .catch(function (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.textContent = "Delete";
      });
  }

  // Bundle toggle
  if (e.target.classList.contains("bundle-toggle-btn")) {
    toggleBundleActive(
      e.target.getAttribute("data-id"),
      e.target.getAttribute("data-active") === "true",
    );
  }

  // Bundle delete
  if (e.target.classList.contains("bundle-delete-btn")) {
    deleteBundle(e.target.getAttribute("data-id"));
  }

  // Revoke scanner code
  if (e.target.classList.contains("revoke-code-btn")) {
    revokeScannerCode(e.target.getAttribute("data-id"));
  }

  // Mark an unpaid order as paid and create tickets
  if (e.target.classList.contains("mark-paid-btn")) {
    var btn = e.target;
    var orderId = btn.getAttribute("data-order-id");
    var email = btn.getAttribute("data-email");
    if (!orderId) {
      alert("Missing order ID");
      return;
    }
    if (
      !confirm(
        "Mark order #" +
          orderId.slice(0, 8) +
          " as paid? Tickets will be created and the customer will receive an email with their ticket codes and QR codes.",
      )
    )
      return;

    btn.disabled = true;
    btn.textContent = "Processing...";

    // Step 1: Mark order as paid via confirm-payment endpoint
    var token = getEdgeFunctionToken();
    fetch(SUPABASE_URL + "/functions/v1/ticketing/confirm-payment", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId, payment_method: "cash" }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (result) {
        if (!result.success)
          throw new Error(result.error || "Failed to mark as paid");

        // Step 2: Create tickets via manual_paid webhook trigger
        return fetch(SUPABASE_URL + "/functions/v1/ticketing/webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger: "manual_paid",
            order_id: orderId,
            email: email,
            payment_method: "cash",
          }),
        }).then(function (r2) {
          return r2.json();
        });
      })
      .then(function (result2) {
        var ticketCount = result2.tickets_created || 0;
        var msg = "Order marked as paid!";
        if (ticketCount > 0) {
          msg +=
            " " +
            ticketCount +
            " ticket(s) created. Customer will receive QR codes by email.";
        } else if (result2.status === "already_processed") {
          msg += " Tickets already existed.";
        }
        alert(msg);
        loadOrders();
      })
      .catch(function (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.textContent = "Mark Paid";
      });
    return;
  }

  // Regenerate tickets for paid orders with no tickets
  if (e.target.classList.contains("regenerate-tickets-btn")) {
    var btn = e.target;
    var orderId = btn.getAttribute("data-order-id");
    if (!orderId) {
      alert("Missing order ID");
      return;
    }
    if (
      !confirm(
        "Re-create tickets for order #" +
          orderId.slice(0, 8) +
          "? Only use if this paid order has zero tickets.",
      )
    )
      return;

    btn.disabled = true;
    btn.textContent = "Regenerating...";
    var token = getEdgeFunctionToken();
    fetch(SUPABASE_URL + "/functions/v1/ticketing/regenerate-tickets", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d.success) {
          alert("Success! " + d.tickets_created + " ticket(s) created.");
          loadOrders();
        } else {
          alert("Failed: " + (d.error || "Unknown error"));
          btn.disabled = false;
          btn.textContent = "Regenerate";
        }
      })
      .catch(function (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.textContent = "Regenerate";
      });
    return;
  }


  // Issue scanner code
  if (e.target.id === "issue-scanner-code-btn") {
    issueScannerCode();
  }

  // Export superadmin report CSV
  if (e.target.id === "export-superadmin-csv-btn") {
    exportSuperadminReportCSV();
  }

  // Apply date filter to superadmin report
  if (e.target.id === "apply-report-filter") {
    var sl = document.getElementById("report-start-date");
    var el = document.getElementById("report-end-date");
    var sv = sl ? sl.value : "";
    var ev = el ? el.value : "";
    if (!sv || !ev) { alert("Please select both a start date and an end date."); return; }
    if (sv > ev) { alert("Start date cannot be after end date."); return; }
    loadSuperadminReport(sv, ev);
  }

    // Clear date filter (also handles inline clear link)
  if (e.target.id === "clear-report-filter-btn" || e.target.id === "clear-report-filter") {
    if (e.target.id === "clear-report-filter") e.preventDefault();
    var s2 = document.getElementById("report-start-date");
    var e2 = document.getElementById("report-end-date");
    if (s2) s2.value = "";
    if (e2) e2.value = "";
    loadSuperadminReport();
  }

  // Preset date range buttons
  if (e.target.classList.contains("preset-date-btn")) {
    var range = e.target.getAttribute("data-range");
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    var d = now.getDate();
    var start, end;

    function toDateStr(date) {
      var yy = date.getFullYear();
      var mm = String(date.getMonth() + 1).padStart(2, "0");
      var dd = String(date.getDate()).padStart(2, "0");
      return yy + "-" + mm + "-" + dd;
    }

    if (range === "today") {
      start = toDateStr(now);
      end = toDateStr(now);
    } else if (range === "this-week") {
      // Monday of this week
      var dayOfWeek = now.getDay();
      var diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      var monday = new Date(y, m, d + diffToMon);
      start = toDateStr(monday);
      end = toDateStr(now);
    } else if (range === "this-month") {
      start = y + "-" + String(m + 1).padStart(2, "0") + "-01";
      end = toDateStr(now);
    }

    if (start && end) {
      var sEl = document.getElementById("report-start-date");
      var eEl = document.getElementById("report-end-date");
      if (sEl) sEl.value = start;
      if (eEl) eEl.value = end;
      loadSuperadminReport(start, end);
    }
  }

// Add ticket type
  if (e.target.id === "add-ticket-type-btn") {
    addTicketType();
  }

  // Add bundle
  if (e.target.id === "add-bundle-btn") {
    addBundle();
  }

  // Save balance cap
  if (e.target.id === "save-balance-cap-btn") {
    saveBalanceCap();
  }

  // ─────────── Ticket Management ───────────

  // Edit ticket — open modal
  if (e.target.classList.contains("ticket-edit-btn")) {
    var btn = e.target;
    showTicketEditModal({
      id: btn.getAttribute("data-id"),
      code: btn.getAttribute("data-code"),
      status: btn.getAttribute("data-status"),
      name: btn.getAttribute("data-name"),
      email: btn.getAttribute("data-email"),
      balance: btn.getAttribute("data-balance"),
      type: btn.getAttribute("data-type"),
      orderId: btn.getAttribute("data-order"),
    });
  }

  // Save ticket edit (submit button inside modal)
  if (e.target.id === "ticket-edit-save-btn") {
    e.preventDefault();
    var form = document.getElementById("ticket-edit-form");
    if (!form) return;
    var modal = document.getElementById("ticket-edit-modal");
    var saveBtn = document.getElementById("ticket-edit-save-btn");
    var ticketId = saveBtn ? saveBtn.getAttribute("data-ticket-id") : null;
    var orderId = saveBtn ? saveBtn.getAttribute("data-order-id") : null;
    if (!ticketId) return;

    var data = {
      name: document.getElementById("edit-ticket-name").value.trim(),
      email: document.getElementById("edit-ticket-email").value.trim(),
      status: document.getElementById("edit-ticket-status").value,
      balance:
        parseInt(document.getElementById("edit-ticket-balance").value) || 0,
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    saveTicketEdit(ticketId, data)
      .then(function (success) {
        if (success) {
          if (modal) modal.remove();
          alert("Ticket updated successfully.");
          // Refresh the order tickets view
          if (orderId) toggleOrderTickets(orderId);
        }
      })
      .catch(function (err) {
        alert("Error: " + err.message);
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Changes";
        }
      });
  }

  // Cancel edit modal
  if (e.target.id === "ticket-edit-cancel-btn") {
    var modal = document.getElementById("ticket-edit-modal");
    if (modal) modal.remove();
  }

  // Dismiss edit modal by clicking overlay background
  if (e.target.id === "ticket-edit-modal") {
    e.target.remove();
  }

  // Revoke ticket
  if (e.target.classList.contains("ticket-revoke-btn")) {
    var btn = e.target;
    var ticketId = btn.getAttribute("data-id");
    var ticketCode = btn.getAttribute("data-code");
    var orderId = btn.getAttribute("data-order");

    if (!ticketId) return;
    btn.disabled = true;
    btn.textContent = "Revoking...";

    revokeTicket(ticketId, ticketCode)
      .then(function (success) {
        if (success === true) {
          alert("Ticket " + ticketCode + " revoked.");
          if (orderId) toggleOrderTickets(orderId);
        }
      })
      .catch(function (err) {
        alert("Error: " + err.message);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Revoke";
        }
      });
  }

  // Delete ticket
  if (e.target.classList.contains("ticket-delete-btn")) {
    var btn = e.target;
    var ticketId = btn.getAttribute("data-id");
    var ticketCode = btn.getAttribute("data-code");
    // Find the order ID from the closest order row's data-order
    var orderRow = btn.closest('[id^="order-tickets-"]');
    var orderId = orderRow ? orderRow.id.replace("order-tickets-", "") : null;

    if (!ticketId) return;
    btn.disabled = true;
    btn.textContent = "...";

    deleteTicket(ticketId, ticketCode)
      .then(function (success) {
        if (success === true) {
          alert("Ticket " + ticketCode + " deleted.");
          if (orderId) toggleOrderTickets(orderId);
        }
      })
      .catch(function (err) {
        alert("Error: " + err.message);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Delete";
        }
      });
  }
});

// ─── Helper: proxy Supabase REST queries through Edge Function (bypasses RLS) ──

function adminQuery(path) {
  var token = getEdgeFunctionToken();
  if (!token) {
    return Promise.reject(new Error("Authentication required."));
  }
  return fetch(SUPABASE_URL + "/functions/v1/ticketing/admin-query", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: path }),
  }).then(function (res) {
    if (!res.ok) {
      return res.json().then(function (err) {
        throw new Error(err.error || "Query failed");
      });
    }
    return res.json();
  });
}

// ─── Helper: get auth token for Edge Function calls ───────────────────────────

function getEdgeFunctionToken() {
  // Try JWT first (works with ticketing_role), fall back to service key
  var session = getStoredSession();
  if (session && session.access_token) {
    return session.access_token;
  }
  var svcKey =
    localStorage.getItem("wf_service_key") ||
    sessionStorage.getItem("wf_service_key");
  if (!svcKey && typeof getServiceKey === "function") {
    svcKey = getServiceKey(true);
  }
  return svcKey || "";
}

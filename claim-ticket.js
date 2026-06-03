(function() {
  "use strict";

  var TICKET_FN = SUPABASE_URL + "/functions/v1/ticketing";
  var ANON_H = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };

  var params = new URLSearchParams(window.location.search);
  var code = params.get("code");

  var transferData = null;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  function show(elId) { var el = $(elId); if (el) el.style.display = ""; }
  function hide(elId) { var el = $(elId); if (el) el.style.display = "none"; }

  function escHtml(s) {
    if (!s && s !== 0) return "";
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function maskEmail(email) {
    if (!email || !email.includes("@")) return email || "";
    var parts = email.split("@");
    var name = parts[0];
    var domain = parts[1];
    if (name.length <= 2) return name.charAt(0) + "***@" + domain;
    return name.charAt(0) + "***" + name.charAt(name.length - 1) + "@" + domain;
  }

  function formatDate(isoStr) {
    if (!isoStr) return "";
    try {
      return new Date(isoStr).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    } catch (_) { return isoStr; }
  }

  function hideAllStates() {
    hide("claim-loading");
    hide("claim-form");
    hide("claim-success");
    hide("claim-error");
    hide("claim-claimed");
    hide("claim-expired");
    hide("claim-cancelled");
  }

  function showLoading() { hideAllStates(); show("claim-loading"); }
  function showForm() { hideAllStates(); show("claim-form"); }
  function showSuccess() { hideAllStates(); show("claim-success"); }
  function showErrorState() { hideAllStates(); show("claim-error"); }
  function showAlreadyClaimed() { hideAllStates(); show("claim-claimed"); }
  function showExpired() { hideAllStates(); show("claim-expired"); }
  function showCancelled() { hideAllStates(); show("claim-cancelled"); }

  // ─── Main Logic ─────────────────────────────────────────────────────────────

  function init() {
    if (!code || code.trim().length < 3) {
      var msgEl = $("claim-error-msg");
      if (msgEl) msgEl.textContent = "No transfer code provided. Please check the link you received.";
      showErrorState();
      return;
    }

    // Normalize code
    var normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.indexOf("XF-") !== 0) {
      normalizedCode = "XF-" + normalizedCode.replace(/^XF-?/i, "");
    }

    showLoading();
    checkTransfer(normalizedCode);
  }

  function checkTransfer(transferCode) {
    fetch(TICKET_FN + "/check-transfer", {
      method: "POST",
      headers: ANON_H,
      body: JSON.stringify({ code: transferCode })
    })
    .then(function(res) {
      if (res.status === 404) {
        showErrorWith("Transfer not found. The code may be invalid.");
        return null;
      }
      if (!res.ok) {
        return res.json().then(function(d) {
          throw new Error(d.error || "Failed to check transfer");
        });
      }
      return res.json();
    })
    .then(function(data) {
      if (!data) return;
      if (!data.success) {
        showErrorWith(data.error || "Could not verify this transfer.");
        return;
      }

      transferData = data.transfer || data;
      renderTransfer(transferData);
    })
    .catch(function(err) {
      console.error("[claim-ticket] check error:", err.message || err);
      showErrorWith(err.message || "Network error. Please check your connection and try again.");
    });
  }

  function renderTransfer(transfer) {
    var status = (transfer.status || "pending").toLowerCase();

    // Populate info card
    var typeEl = $("claim-info-type");
    var senderEl = $("claim-info-sender");
    var expiryEl = $("claim-info-expiry");
    var statusBadge = $("claim-info-status");

    if (typeEl) typeEl.textContent = escHtml(transfer.ticket_type || transfer.type || "Ticket");
    if (senderEl) senderEl.textContent = maskEmail(transfer.from_email || transfer.sender_email || "");
    if (expiryEl) {
      var expires = transfer.expires_at || transfer.expiry;
      if (expires) {
        expiryEl.textContent = formatDate(expires);
      } else {
        expiryEl.textContent = "No expiry";
      }
    }

    if (statusBadge) {
      statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      statusBadge.className = "claim-status status-" + status;
    }

    // Route based on status
    if (status === "expired") {
      var expiredEl = $("claim-expired-code");
      if (expiredEl) expiredEl.textContent = escHtml(code ? code.toUpperCase() : "");
      showExpired();
      return;
    }

    if (status === "completed" || status === "claimed") {
      showAlreadyClaimed();
      return;
    }

    if (status === "cancelled") {
      showCancelled();
      return;
    }

    if (status === "pending") {
      var emailInput = $("claim-email");
      if (transfer.to_email && emailInput) {
        emailInput.value = transfer.to_email;
      }
      showForm();
      return;
    }

    showErrorWith("Unknown transfer status: " + escHtml(status));
  }

  function showErrorWith(msg) {
    var msgEl = $("claim-error-msg");
    if (msgEl) msgEl.textContent = msg || "Something went wrong. Please try again.";
    showErrorState();
  }

  // ─── Claim Handler ──────────────────────────────────────────────────────────

  function handleClaim() {
    var email = $("claim-email");
    var name = $("claim-name");
    var claimBtnEl = $("claim-btn");
    var formError = $("claim-form-error");

    if (!email || !name || !claimBtnEl) return;

    var emailVal = email.value.trim().toLowerCase();
    var nameVal = name.value.trim();

    if (!emailVal) {
      showFormError("Please enter your email address.");
      email.focus();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      showFormError("Please enter a valid email address.");
      email.focus();
      return;
    }

    if (!nameVal) {
      showFormError("Please enter your name.");
      name.focus();
      return;
    }

    claimBtnEl.disabled = true;
    claimBtnEl.textContent = "Claiming Ticket\u2026";
    if (formError) formError.style.display = "none";

    var normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.indexOf("XF-") !== 0) {
      normalizedCode = "XF-" + normalizedCode.replace(/^XF-?/i, "");
    }

    fetch(TICKET_FN + "/claim-transfer", {
      method: "POST",
      headers: ANON_H,
      body: JSON.stringify({
        code: normalizedCode,
        email: emailVal,
        name: nameVal
      })
    })
    .then(function(res) {
      if (!res.ok) {
        return res.json().then(function(d) {
          throw new Error(d.error || "Failed to claim ticket");
        });
      }
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.success) {
        throw new Error((data && data.error) || "Failed to claim ticket");
      }

      // Success!
      showSuccess();
      renderSuccess(data);
    })
    .catch(function(err) {
      console.error("[claim-ticket] claim error:", err.message || err);
      showFormError(err.message || "Network error. Please check your connection and try again.");
      claimBtnEl.disabled = false;
      claimBtnEl.textContent = "Claim Ticket";
    });
  }

  function renderSuccess(data) {
    var typeEl = $("claim-success-type");
    var ticketInfo = data.ticket || data;
    var typeName = (ticketInfo.ticket_type && ticketInfo.ticket_type.name) ||
                   ticketInfo.ticket_type ||
                   ticketInfo.type ||
                   "Ticket";

    if (typeEl) typeEl.textContent = escHtml(typeName);

    // Show confetti + gift box
    if (typeof openGiftBox === "function" && typeof giftConfetti === "function") {
      openGiftBox(
        '<div class="gift-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>' +
        '<div class="gift-badge">Claimed!</div>' +
        '<h2>Ticket Claimed Successfully</h2>' +
        '<p>You now have access to your ' + escHtml(typeName) + '.</p>' +
        '<p style="font-size:13px;color:var(--muted);margin-top:12px;">Check your email for details or visit your dashboard to view your tickets.</p>',
        function(box) { giftConfetti(box); }
      );
    }
  }

  function showFormError(msg) {
    var el = $("claim-form-error");
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
    }
  }

  // ─── Event Listeners ────────────────────────────────────────────────────────

  var claimBtnEl = $("claim-btn");
  if (claimBtnEl) {
    claimBtnEl.addEventListener("click", handleClaim);
  }

  var nameEl = $("claim-name");
  var emailEl = $("claim-email");

  if (nameEl) {
    nameEl.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && claimBtnEl && !claimBtnEl.disabled) {
        e.preventDefault();
        handleClaim();
      }
    });
  }

  if (emailEl) {
    emailEl.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && claimBtnEl && !claimBtnEl.disabled) {
        e.preventDefault();
        handleClaim();
      }
    });
  }

  // ─── Bootstrap ──────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

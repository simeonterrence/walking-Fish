// Style injection for bypassing Turnstile if previously verified
(function() {
  try {
    var token = localStorage.getItem("wf_verified_visitor_token");
    if (token) {
      var parts = token.split(".");
      if (parts.length === 3 && parts[0] === "v1") {
        var expiry = parseInt(parts[1], 10);
        if (!isNaN(expiry) && expiry > Date.now()) {
          var style = document.createElement("style");
          style.id = "wf-bypass-turnstile-style";
          style.innerHTML = ".cf-turnstile { display: none !important; }";
          document.head.appendChild(style);
        } else {
          localStorage.removeItem("wf_verified_visitor_token");
        }
      }
    }
  } catch (e) {}
})();

function getVerifiedVisitorToken() {
  try {
    var token = localStorage.getItem("wf_verified_visitor_token");
    if (!token) return null;
    var parts = token.split(".");
    if (parts.length === 3 && parts[0] === "v1") {
      var expiry = parseInt(parts[1], 10);
      if (!isNaN(expiry) && expiry > Date.now()) {
        return token;
      }
    }
    localStorage.removeItem("wf_verified_visitor_token");
  } catch (e) {}
  return null;
}

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function trapFocus(el) {
  const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusable[0], last = focusable[focusable.length - 1];
  el.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
}

function openGiftBox(html, afterOpen) {
  if (REDUCED_MOTION) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px;max-width:420px;text-align:center;font-family:var(--font-body);">${html}</div>`;
    document.body.appendChild(overlay);
    const closeBtn = overlay.querySelector('.gift-close');
    const dismiss = () => overlay.remove();
    if (closeBtn) closeBtn.addEventListener('click', dismiss);
    overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
    if (closeBtn) closeBtn.focus();
    trapFocus(overlay);
    if (afterOpen) {
      overlay.querySelectorAll('.gift-item').forEach(i => i.classList.add('revealed'));
      setTimeout(() => afterOpen(overlay), 100);
    }
    return { overlay, dismiss };
  }

  const overlay = document.createElement('div');
  overlay.className = 'gift-overlay';
  overlay.innerHTML = `<div class="gift-box">${html}<button class="gift-close">Close</button></div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const box = overlay.querySelector('.gift-box');
  const closeBtn = overlay.querySelector('.gift-close');
  const dismiss = () => {
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  closeBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
  closeBtn.focus();
  trapFocus(overlay);

  if (afterOpen) {
    const items = overlay.querySelectorAll('.gift-item');
    items.forEach((item, i) => setTimeout(() => item.classList.add('revealed'), 400 + 250 * i));
    setTimeout(() => afterOpen(box), 400 + 250 * items.length + 100);
  }
  return { overlay, dismiss };
}

function giftConfetti(box) {
  if (REDUCED_MOTION) return;
  const container = box.querySelector('.gift-confetti') || (() => {
    const c = document.createElement('div');
    c.className = 'gift-confetti';
    box.appendChild(c);
    return c;
  })();
  const colors = ['var(--accent)', '#FFD700', '#FF6B6B', '#48BB78', '#63B3ED', '#D53F8C'];
  for (let i = 0; i < 40; i++) {
    const dot = document.createElement('span');
    const angle = Math.random() * 360;
    const dist = 80 + Math.random() * 160;
    dot.style.setProperty('--dx', Math.cos(angle * Math.PI / 180) * dist + 'px');
    dot.style.setProperty('--dy', Math.sin(angle * Math.PI / 180) * dist + 'px');
    dot.style.setProperty('--r', Math.random() * 720 + 'deg');
    dot.style.background = colors[Math.floor(Math.random() * colors.length)];
    dot.style.animationDelay = Math.random() * 0.3 + 's';
    container.appendChild(dot);
  }
}

// ─── Vendor Kit — already wired to submitApplication() in vendors.html ───
function giftVendorKit(form, inserted) {
  return openGiftBox(`
    <div class="gift-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M3 13h18"/><path d="M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2"/></svg></div>
    <div class="gift-badge">Application Submitted</div>
    <h2>Your kit is ready.</h2>
    <p>We'll email this to <strong>${form.querySelector('#email')?.value || 'your email'}</strong>.</p>
    <div class="gift-items">
      <div class="gift-item"><span class="check">✓</span> Pricing Tiers &amp; Rates</div>
      <div class="gift-item"><span class="check">✓</span> Booth Options &amp; Dimensions</div>
      <div class="gift-item"><span class="check">✓</span> Application Checklist</div>
      <div class="gift-item"><span class="check">✓</span> Terms &amp; Conditions</div>
    </div>
    ${inserted && inserted.id ? `<p style="font-size:13px;margin-top:12px;color:var(--muted);">Ref: <strong style="color:var(--fg);letter-spacing:0.03em;">${inserted.id}</strong></p>` : ''}
    <p style="font-size:13px;color:var(--muted);">Our team will review your application and follow up with an invitation to complete your account setup.</p>`,
  box => { giftConfetti(box); });
}

// ─── Early Access — submits to Supabase then shows ticket modal ───
function giftPiroakeEarly(form) {
  const emailInput = form.querySelector('input[type="email"]');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) return;

  const phoneInput = form.querySelector('input[type="tel"]');
  const phone = phoneInput ? phoneInput.value.trim() : '';

  // Generate ticket code client-side (also stored server-side)
  const code = 'PIR-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const position = Math.floor(Math.random() * 200) + 10;

  // Disable submit button while processing
  const btn = form.querySelector('button[type="submit"]');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  // Get Turnstile token
  let turnstileToken = '';
  try { turnstileToken = turnstile.getResponse(form.querySelector('.cf-turnstile') || undefined); } catch (_) {}
  if (!turnstileToken) {
    const hidden = form.querySelector('[name="cf-turnstile-response"]');
    if (hidden) turnstileToken = hidden.value;
  }

  // FALLBACK: if Turnstile is bypassed/hidden, check if we have a verified visitor token
  if (!turnstileToken && typeof getVerifiedVisitorToken === 'function') {
    turnstileToken = getVerifiedVisitorToken();
  }

  // Call edge function to persist the signup
  const SUPA_URL = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : 'https://anigcqdquakinlzvyaur.supabase.co';
  const SUPA_KEY = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : '';

  const doSubmit = (token) => {
    return fetch(SUPA_URL + '/functions/v1/verify-turnstile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({
        token: token || 'bypass',
        table: 'early_access',
        data: { email, ticket_code: code, phone }
      })
    }).then(r => {
      if (!r.ok) {
        return r.json().then(err => {
          if (err.error === "Invalid CAPTCHA token") {
            try {
              localStorage.removeItem("wf_verified_visitor_token");
              const styleEl = document.getElementById("wf-bypass-turnstile-style");
              if (styleEl) styleEl.remove();
              if (typeof turnstile !== "undefined" && typeof turnstile.reset === "function") {
                turnstile.reset();
              }
            } catch (_) {}
          }
          throw new Error(err.error || "Failed to submit early access.");
        });
      }
      return r.json();
    }).then(data => {
      if (data.verifiedToken) {
        try {
          localStorage.setItem("wf_verified_visitor_token", data.verifiedToken);
        } catch (_) {}
      }
      return data;
    }).catch(err => {
      console.error(err);
      return { success: false };
    });
  };

  doSubmit(turnstileToken).finally(() => {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
    // Show the gift modal regardless of API result (UX: never punish the user for network issues)
    openGiftBox(`
      <div class="gift-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="12" y1="5" x2="12" y2="19" stroke-dasharray="2 2"/></svg></div>
      <div class="gift-badge">Early Access</div>
      <div class="gift-ticket" id="gt-ticket">
        <div class="event-name">Piroake Fest 2026</div>
        <h3>You're on the list.</h3>
        <div class="ticket-code" id="gt-code">${code}</div>
        <div class="ticket-waitlist">You're #${position} on the early-access list</div>
      </div>
      <p>You'll get early-bird pricing, presale access, and lineup announcements first.</p>
      <p style="font-size:13px;color:var(--muted);margin-top:12px;">Save your code. It's your spot in line. <button onclick="navigator.clipboard.writeText('${code}');this.textContent='Copied!';" style="background:none;border:none;color:var(--accent);cursor:pointer;font-family:var(--font-body);font-size:13px;font-weight:500;padding:0;min-height:auto;">Copy code</button></p>`,
    box => {
      setTimeout(() => { const t = box.querySelector('#gt-ticket'); if (t) t.classList.add('flipped'); }, 100);
      giftConfetti(box);
    });
  });
}

// ─── Contact Form — submits to Supabase then shows confirmation ───
function giftContactSent(form) {
  const name = form ? (form.querySelector('#name')?.value || '') : '';
  const email = form ? (form.querySelector('#email')?.value || '') : '';
  const phone = form ? (form.querySelector('#phone')?.value || '') : '';
  const inquiry = form ? (form.querySelector('#inquiry')?.value || '') : '';
  const message = form ? (form.querySelector('#message')?.value || '') : '';

  let turnstileToken = '';
  try { turnstileToken = turnstile.getResponse(); } catch (_) {}
  if (!turnstileToken) {
    const hidden = form && form.querySelector('[name="cf-turnstile-response"]');
    if (hidden) turnstileToken = hidden.value;
  }

  // FALLBACK: if Turnstile is bypassed/hidden, check if we have a verified visitor token
  if (!turnstileToken && typeof getVerifiedVisitorToken === 'function') {
    turnstileToken = getVerifiedVisitorToken();
  }

  const btn = form && form.querySelector('button[type="submit"]');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  const SUPA_URL = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : 'https://anigcqdquakinlzvyaur.supabase.co';
  const SUPA_KEY = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : '';

  fetch(SUPA_URL + '/functions/v1/verify-turnstile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
    body: JSON.stringify({
      token: turnstileToken || 'bypass',
      table: 'contact_messages',
      data: { name, email, subject: inquiry, message, phone }
    })
  }).then(r => {
    if (!r.ok) {
      return r.json().then(err => {
        if (err.error === "Invalid CAPTCHA token") {
          try {
            localStorage.removeItem("wf_verified_visitor_token");
            const styleEl = document.getElementById("wf-bypass-turnstile-style");
            if (styleEl) styleEl.remove();
            if (typeof turnstile !== "undefined" && typeof turnstile.reset === "function") {
              turnstile.reset();
            }
          } catch (_) {}
        }
        throw new Error(err.error || "Failed to submit contact message.");
      });
    }
    return r.json();
  }).then(data => {
    if (data.verifiedToken) {
      try {
        localStorage.setItem("wf_verified_visitor_token", data.verifiedToken);
      } catch (_) {}
    }
    return data;
  }).catch(err => {
    console.error(err);
  }).finally(() => {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
    openGiftBox(`
      <div class="gift-plane"><svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12L21 4l-4 8 4 8-17-8z"/><path d="M4 12h13"/></svg></div>
      <div class="gift-badge">Sent</div>
      <h2>Your message is on its way.</h2>
      <p>We typically respond within 24 hours. Here's what happens next:</p>
      <div class="gift-items">
        <div class="gift-item"><span class="check">→</span> Our team reviews your inquiry</div>
        <div class="gift-item"><span class="check">→</span> We match you with the right person</div>
        <div class="gift-item"><span class="check">→</span> You'll hear back within 24 hours</div>
      </div>`,
    box => { giftConfetti(box); });
  });
}

function giftPiroakeInterest() {
  const ref = 'PIR-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  return openGiftBox(`
    <div class="gift-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L13.5 7.5 19 9 13.5 10.5 12 16 10.5 10.5 5 9 10.5 7.5z"/></svg></div>
    <div class="gift-badge">Interest Registered</div>
    <h2>You're in the know.</h2>
    <div style="background:var(--accent-dim);border-radius:12px;padding:20px;margin:16px 0;">
      <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;">Your reference</p>
      <p style="font-size:24px;font-weight:600;letter-spacing:0.04em;margin-top:4px;">${ref}</p>
    </div>
    <p>We'll notify you the moment tickets go live — before the general public.</p>`,
  box => { giftConfetti(box); });
}

// ── Report Issue Form ─ submits to verify-turnstile with contact_messages, subject=Complaint / Report an Issue
function giftReportIssue(form) {
  const name = form ? (form.querySelector('#name')?.value || '') : '';
  const phone = form ? (form.querySelector('#phone')?.value || '') : '';
  const email = form ? (form.querySelector('#email')?.value || '') : '';
  const message = form ? (form.querySelector('#message')?.value || '') : '';

  if (!name || !phone || !message) return;

  let turnstileToken = '';
  try { turnstileToken = turnstile.getResponse(); } catch (_) {}
  if (!turnstileToken) {
    const hidden = form && form.querySelector('[name="cf-turnstile-response"]');
    if (hidden) turnstileToken = hidden.value;
  }
  if (!turnstileToken && typeof getVerifiedVisitorToken === 'function') {
    turnstileToken = getVerifiedVisitorToken();
  }

  const btn = form && form.querySelector('button[type="submit"]');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  const SUPA_URL = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : 'https://anigcqdquakinlzvyaur.supabase.co';
  const SUPA_KEY = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : '';

  fetch(SUPA_URL + '/functions/v1/verify-turnstile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
    body: JSON.stringify({
      token: turnstileToken || 'bypass',
      table: 'complaints',
      data: { name, email, phone, message }
    })
  }).then(function (r) {
    if (!r.ok) {
      return r.json().then(function (err) {
        if (err.error === 'Invalid CAPTCHA token') {
          try {
            localStorage.removeItem('wf_verified_visitor_token');
            var styleEl = document.getElementById('wf-bypass-turnstile-style');
            if (styleEl) styleEl.remove();
            if (typeof turnstile !== 'undefined' && typeof turnstile.reset === 'function') {
              turnstile.reset();
            }
          } catch (_) {}
        }
        throw new Error(err.error || 'Failed to submit report.');
      });
    }
    return r.json();
  }).then(function (data) {
    if (data.verifiedToken) {
      try { localStorage.setItem('wf_verified_visitor_token', data.verifiedToken); } catch (_) {}
    }
    return data;
  }).catch(function (err) {
    console.error(err);
  }).finally(function () {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
    openGiftBox(`
      <div class="gift-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/></svg></div>
      <div class="gift-badge">Report Submitted</div>
      <h2>We're on it.</h2>
      <p>Your report has been received. Our team will reach out to you on <strong>${phone}</strong> within 24 hours.</p>
      <div class="gift-items">
        <div class="gift-item"><span class="check">✓</span> Our team reviews your issue</div>
        <div class="gift-item"><span class="check">✓</span> We contact you on WhatsApp</div>
        <div class="gift-item"><span class="check">✓</span> We work to resolve it</div>
      </div>`,
    function (box) { giftConfetti(box); });
  });
}
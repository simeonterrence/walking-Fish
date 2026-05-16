const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function trapFocus(overlay) {
  const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusable[0], last = focusable[focusable.length - 1];
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
}
function openGiftBox(html, afterEl) {
  if (REDUCED_MOTION) {
    const fallback = document.createElement('div');
    fallback.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;';
    fallback.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px;max-width:420px;text-align:center;font-family:var(--font-body);">${html}</div>`;
    document.body.appendChild(fallback);
    const closeBtn = fallback.querySelector('.gift-close'), dismiss = () => { fallback.remove(); };
    if (closeBtn) closeBtn.addEventListener('click', dismiss);
    fallback.addEventListener('click', e => { if (e.target === fallback) dismiss(); });
    fallback.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
    if (closeBtn) closeBtn.focus();
    trapFocus(fallback);
    if (afterEl) {
      fallback.querySelectorAll('.gift-item').forEach((item) => item.classList.add('revealed'));
      setTimeout(() => afterEl(fallback), 100);
    }
    return { overlay: fallback, dismiss };
  }
  const overlay = document.createElement('div');
  overlay.className = 'gift-overlay';
  overlay.innerHTML = `<div class="gift-box">${html}<button class="gift-close">Close</button></div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const box = overlay.querySelector('.gift-box'), closeBtn = overlay.querySelector('.gift-close');
  const dismiss = () => { overlay.classList.remove('open'); overlay.addEventListener('transitionend', () => overlay.remove(), { once: true }); };
  closeBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
  closeBtn.focus();
  trapFocus(overlay);
  if (afterEl) {
    const items = overlay.querySelectorAll('.gift-item');
    items.forEach((item, i) => { setTimeout(() => item.classList.add('revealed'), 400 + i * 250); });
    setTimeout(() => { afterEl(box); }, 400 + items.length * 250 + 100);
  }
  return { overlay, dismiss };
}
function giftConfetti(box) {
  if (REDUCED_MOTION) return;
  const container = box.querySelector('.gift-confetti') || (() => { const c = document.createElement('div'); c.className = 'gift-confetti'; box.appendChild(c); return c; })();
  const colors = ['var(--accent)', '#FFD700', '#FF6B6B', '#48BB78', '#63B3ED', '#D53F8C'];
  for (let i = 0; i < 40; i++) {
    const dot = document.createElement('span'), angle = Math.random() * 360, dist = 80 + Math.random() * 160;
    dot.style.setProperty('--dx', `${Math.cos(angle * Math.PI / 180) * dist}px`);
    dot.style.setProperty('--dy', `${Math.sin(angle * Math.PI / 180) * dist}px`);
    dot.style.setProperty('--r', `${Math.random() * 720}deg`);
    dot.style.background = colors[Math.floor(Math.random() * colors.length)];
    dot.style.animationDelay = `${Math.random() * 0.3}s`;
    container.appendChild(dot);
  }
}
function giftVendorKit(form, app) {
  const email = form.querySelector('#email')?.value || 'your email';
  const ref = app && app.id ? `<p style="font-size:13px;margin-top:12px;color:var(--muted);">Ref: <strong style="color:var(--fg);letter-spacing:0.03em;">${app.id}</strong></p>` : '';
  const html = `
    <div class="gift-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M3 13h18"/><path d="M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2"/></svg></div>
    <div class="gift-badge">Application Submitted</div>
    <h2>Your kit is ready.</h2>
    <p>We'll email this to <strong>${email}</strong>.</p>
    <div class="gift-items">
      <div class="gift-item"><span class="check">✓</span> Pricing Tiers &amp; Rates</div>
      <div class="gift-item"><span class="check">✓</span> Booth Options &amp; Dimensions</div>
      <div class="gift-item"><span class="check">✓</span> Application Checklist</div>
      <div class="gift-item"><span class="check">✓</span> Terms &amp; Conditions</div>
    </div>
    ${ref}
    <p style="font-size:13px;color:var(--muted);">Our team will review your application and follow up with an invitation to complete your account setup.</p>`;
  return openGiftBox(html, (box) => { giftConfetti(box); });
}
function giftPiroakeEarly(form) {
  const code = 'PIR-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const waitlistNum = Math.floor(Math.random() * 200) + 10;
  const html = `
    <div class="gift-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="12" y1="5" x2="12" y2="19" stroke-dasharray="2 2"/></svg></div>
    <div class="gift-badge">Early Access</div>
    <div class="gift-ticket" id="gt-ticket">
      <div class="event-name">Piroake Fest 2026</div>
      <h3>You're on the list.</h3>
      <div class="ticket-code" id="gt-code">${code}</div>
      <div class="ticket-waitlist">You're #${waitlistNum} on the early-access list</div>
    </div>
    <p>You'll get early-bird pricing, presale access, and lineup announcements first.</p>
    <p style="font-size:13px;color:var(--muted);margin-top:12px;">Save your code — it's your spot in line. <button onclick="navigator.clipboard.writeText('${code}');this.textContent='Copied!';" style="background:none;border:none;color:var(--accent);cursor:pointer;font-family:var(--font-body);font-size:13px;font-weight:500;padding:0;min-height:auto;">Copy code</button></p>`;
  return openGiftBox(html, (box) => {
    setTimeout(() => { const t = box.querySelector('#gt-ticket'); if (t) t.classList.add('flipped'); }, 100);
    giftConfetti(box);
  });
}
function giftPiroakeInterest() {
  const code = 'PIR-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const html = `
    <div class="gift-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L13.5 7.5 19 9 13.5 10.5 12 16 10.5 10.5 5 9 10.5 7.5z"/></svg></div>
    <div class="gift-badge">Interest Registered</div>
    <h2>You're in the know.</h2>
    <div style="background:var(--accent-dim);border-radius:12px;padding:20px;margin:16px 0;">
      <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;">Your reference</p>
      <p style="font-size:24px;font-weight:600;letter-spacing:0.04em;margin-top:4px;">${code}</p>
    </div>
    <p>We'll notify you the moment tickets go live — before the general public.</p>`;
  return openGiftBox(html, (box) => { giftConfetti(box); });
}
function giftContactSent() {
  const html = `
    <div class="gift-plane"><svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12L21 4l-4 8 4 8-17-8z"/><path d="M4 12h13"/></svg></div>
    <div class="gift-badge">Sent</div>
    <h2>Your message is on its way.</h2>
    <p>We typically respond within 24 hours. Here's what happens next:</p>
    <div class="gift-items">
      <div class="gift-item"><span class="check">→</span> Our team reviews your inquiry</div>
      <div class="gift-item"><span class="check">→</span> We match you with the right person</div>
      <div class="gift-item"><span class="check">→</span> You'll hear back within 24 hours</div>
    </div>`;
  return openGiftBox(html, (box) => { giftConfetti(box); });
}

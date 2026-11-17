/**
 * vendor-form.js — Multi-step Piroake Fest 2026 Vendor Application
 * Handles page navigation, validation, team member generation,
 * image compression, review rendering, and final submission.
 */
(function () {
  'use strict';

  var TOTAL_PAGES = 5;
  var currentPage = 1;
  var teamPhotoData = {}; // key: "member-photo-N" / "member-id-N" → base64 data URL
  var logoData = null; // business logo → base64 data URL

  // ── DOM refs ──
  var form, prevBtn, nextBtn, submitBtn, teamSizeInput, teamList;

  document.addEventListener('DOMContentLoaded', function () {
    form = document.getElementById('vendor-form');
    prevBtn = document.getElementById('vf-prev');
    nextBtn = document.getElementById('vf-next');
    submitBtn = document.getElementById('vf-submit');
    teamSizeInput = document.getElementById('vf-teamsize');
    teamList = document.getElementById('vf-team-list');

    if (!form) return;

    // Navigation
    nextBtn.addEventListener('click', function () { goTo(currentPage + 1); });
    prevBtn.addEventListener('click', function () { goTo(currentPage - 1); });

    // Submit
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSubmit();
    });

    // Conditional show/hide
    var extraTags = document.getElementById('vf-extratags');
    if (extraTags) extraTags.addEventListener('change', function () {
      document.getElementById('vf-extratags-why-group').style.display = this.value === 'Yes' ? '' : 'none';
    });
    var appliances = document.getElementById('vf-appliances');
    if (appliances) appliances.addEventListener('change', function () {
      document.getElementById('vf-appliances-list-group').style.display = this.value === 'Yes' ? '' : 'none';
    });

    // Team size change
    if (teamSizeInput) teamSizeInput.addEventListener('change', renderTeamMembers);

    // Business logo upload
    var logoInput = document.getElementById('vf-logo');
    if (logoInput) logoInput.addEventListener('change', handleLogoUpload);

    // Event operations acknowledgement
    var disclaimer = document.getElementById('vf-disclaimer');
    if (disclaimer) disclaimer.addEventListener('change', function () {
      if (!this.checked) return;
      var err = document.getElementById('vf-disclaimer-error');
      if (err) err.style.display = 'none';
      var box = document.getElementById('vf-notice');
      if (box) box.classList.remove('has-error');
    });

    renderTeamMembers();
    updateProgress();
  });

  // ── Team member rendering ──
  function renderTeamMembers() {
    var count = Math.max(1, Math.min(5, parseInt(teamSizeInput.value, 10) || 1));
    teamSizeInput.value = count;
    teamList.innerHTML = '';

    for (var i = 0; i < count; i++) {
      var n = i + 1;
      var div = document.createElement('div');
      div.className = 'vf-team-member';
      div.innerHTML =
        '<h4>Team Member ' + n + (i === 0 ? ' (You)' : '') + '</h4>' +
        '<div class="form-group"><label for="tm-name-' + n + '">Full Name <span style="color:#DC2626;">*</span></label>' +
        '<input type="text" id="tm-name-' + n + '" placeholder="Full name" required></div>' +
        '<div class="form-group"><label for="tm-role-' + n + '">Role <span style="color:#DC2626;">*</span></label>' +
        '<input type="text" id="tm-role-' + n + '" placeholder="e.g. Owner, Chef, Assistant" required></div>' +
        '<div class="form-group"><label for="tm-phone-' + n + '">Phone Number <span style="color:#DC2626;">*</span></label>' +
        '<input type="tel" id="tm-phone-' + n + '" placeholder="+220..." required></div>' +
        '<div class="form-group"><label style="font-weight:600;">Personal Photograph for Tag <span style="color:#DC2626;">*</span></label>' +
        '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">A clear, passport-style photograph of this person\'s face. Do NOT upload an ID card or document — this photo is printed on their vendor tag.</p>' +
        '<div class="vf-id-upload">' +
        '<label class="vf-upload-btn" for="tm-photo-' + n + '">📷 Upload Photograph</label>' +
        '<input type="file" id="tm-photo-' + n + '" accept="image/*" style="display:none;" data-kind="photo" data-idx="' + n + '">' +
        '<img class="vf-id-preview" id="tm-photo-preview-' + n + '" alt="Personal photograph preview">' +
        '<span class="vf-upload-status" id="tm-photo-status-' + n + '" style="font-size:12px;color:var(--muted);"></span>' +
        '</div></div>' +
        '<div class="form-group"><label style="font-weight:600;">Photo ID Document (optional)</label>' +
        '<p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Optional — an image of the ID document (NIN, passport or driver\'s licence) for the organisers\' records.</p>' +
        '<div class="vf-id-upload">' +
        '<label class="vf-upload-btn" for="tm-id-' + n + '">📷 Upload ID Document</label>' +
        '<input type="file" id="tm-id-' + n + '" accept="image/*" style="display:none;" data-kind="id" data-idx="' + n + '">' +
        '<img class="vf-id-preview" id="tm-id-preview-' + n + '" alt="ID document preview">' +
        '<span class="vf-upload-status" id="tm-id-status-' + n + '" style="font-size:12px;color:var(--muted);"></span>' +
        '</div></div>';
      teamList.appendChild(div);

      // Restore existing photo data
      restoreMemberImage(n, 'photo');
      restoreMemberImage(n, 'id');
    }

    // Attach file listeners
    teamList.querySelectorAll('input[type="file"]').forEach(function (inp) {
      inp.addEventListener('change', handleMemberUpload);
    });
  }

  // ── Upload restore / handlers ──
  function restoreMemberImage(n, kind) {
    var data = teamPhotoData['member-' + kind + '-' + n];
    if (!data) return;
    var previewEl = document.getElementById('tm-' + kind + '-preview-' + n);
    var statusEl = document.getElementById('tm-' + kind + '-status-' + n);
    if (previewEl) { previewEl.src = data; previewEl.style.display = 'block'; }
    if (statusEl) statusEl.textContent = '✓ Uploaded';
  }

  function handleMemberUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    var idx = e.target.getAttribute('data-idx');
    var kind = e.target.getAttribute('data-kind');
    var status = document.getElementById('tm-' + kind + '-status-' + idx);
    var preview = document.getElementById('tm-' + kind + '-preview-' + idx);
    if (status) status.textContent = 'Compressing…';

    compressImage(file, 600, 0.6, function (dataUrl) {
      teamPhotoData['member-' + kind + '-' + idx] = dataUrl;
      if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
      if (status) status.textContent = '✓ Uploaded';
      clearValidationError(e.target);
    });
  }

  function handleLogoUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    var status = document.getElementById('vf-logo-status');
    var preview = document.getElementById('vf-logo-preview');
    if (status) status.textContent = 'Compressing…';

    // Preserve PNG transparency for logos; JPEG otherwise
    var mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    compressImage(file, 800, 0.85, function (dataUrl) {
      logoData = dataUrl;
      if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
      if (status) status.textContent = '✓ Uploaded';
      clearValidationError(e.target);
    }, mime);
  }

  function clearValidationError(inputEl) {
    var group = inputEl.closest('.form-group');
    if (!group) return;
    group.classList.remove('has-error');
    var err = group.querySelector('.vf-error');
    if (err) err.style.display = 'none';
  }

  function compressImage(file, maxDim, quality, cb, mime) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          var ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var type = mime || 'image/jpeg';
        cb(canvas.toDataURL(type, type === 'image/png' ? undefined : quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── Page navigation ──
  function goTo(page) {
    if (page < 1 || page > TOTAL_PAGES) return;
    if (page > currentPage && !validatePage(currentPage)) return;

    // If advancing to review page, build summary
    if (page === TOTAL_PAGES) buildReview();

    // Hide current, show target
    var pages = form.querySelectorAll('.vf-page');
    pages.forEach(function (p) { p.style.display = 'none'; });
    var target = form.querySelector('[data-page="' + page + '"]');
    if (target) { target.style.display = ''; target.style.animation = 'none'; target.offsetHeight; target.style.animation = ''; }

    currentPage = page;
    updateProgress();

    // Scroll to form top
    var sect = document.getElementById('apply-section');
    if (sect) sect.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateProgress() {
    // Buttons
    prevBtn.style.display = currentPage > 1 ? '' : 'none';
    nextBtn.style.display = currentPage < TOTAL_PAGES ? '' : 'none';
    submitBtn.style.display = currentPage === TOTAL_PAGES ? '' : 'none';

    // Steps
    var steps = document.querySelectorAll('.vf-progress-step');
    var bars = document.querySelectorAll('.vf-progress-fill');
    steps.forEach(function (step) {
      var s = parseInt(step.getAttribute('data-step'), 10);
      step.classList.toggle('active', s === currentPage);
      step.classList.toggle('done', s < currentPage);
    });
    bars.forEach(function (bar, i) {
      bar.style.width = (i + 1) < currentPage ? '100%' : '0';
    });
  }

  // ── Validation ──
  function validatePage(page) {
    var pageEl = form.querySelector('[data-page="' + page + '"]');
    if (!pageEl) return true;

    // Clear previous errors
    pageEl.querySelectorAll('.has-error').forEach(function (g) { g.classList.remove('has-error'); });
    pageEl.querySelectorAll('.vf-error').forEach(function (e) { e.style.display = 'none'; });

    var valid = true;

    if (page === 1) {
      valid = validateRequired(pageEl, ['vf-email', 'vf-fullname', 'vf-business', 'vf-phone', 'vf-category', 'vf-about', 'vf-sell']);
      // Email format
      var emailEl = document.getElementById('vf-email');
      if (emailEl && emailEl.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value)) {
        markError(emailEl, 'Please enter a valid email address.');
        valid = false;
      }
      // Business logo
      if (!logoData) {
        var logoInput = document.getElementById('vf-logo');
        if (logoInput) {
          var lg = logoInput.closest('.form-group');
          if (lg) {
            lg.classList.add('has-error');
            var le = getOrCreateError(lg);
            le.textContent = 'Please upload your business logo.';
            le.style.display = 'block';
          }
        }
        valid = false;
      }
    }

    if (page === 2) {
      var stall = form.querySelector('input[name="stall"]:checked');
      if (!stall) {
        var grid = pageEl.querySelector('.vf-stall-grid');
        if (grid) {
          var err = getOrCreateError(grid);
          err.textContent = 'Please select a stall option.';
          err.style.display = 'block';
        }
        valid = false;
      }
    }

    if (page === 3) {
      var count = parseInt(teamSizeInput.value, 10) || 1;
      for (var i = 1; i <= count; i++) {
        if (!valField('tm-name-' + i, 'Full name is required.')) valid = false;
        if (!valField('tm-role-' + i, 'Role is required.')) valid = false;
        if (!valField('tm-phone-' + i, 'Phone is required.')) valid = false;
        if (!teamPhotoData['member-photo-' + i]) {
          var photoGroup = document.getElementById('tm-photo-' + i);
          if (photoGroup) {
            var fg = photoGroup.closest('.form-group');
            if (fg) { fg.classList.add('has-error'); var e2 = getOrCreateError(fg); e2.textContent = 'A personal photograph is required.'; e2.style.display = 'block'; }
          }
          valid = false;
        }
      }
    }

    if (page === 4) {
      valid = validateRequired(pageEl, ['vf-extratags', 'vf-appliances', 'vf-power', 'vf-readiness']);
    }

    if (page === 5) {
      var disclaimer = document.getElementById('vf-disclaimer');
      if (disclaimer && !disclaimer.checked) {
        var notice = document.getElementById('vf-notice');
        if (notice) notice.classList.add('has-error');
        var disclaimerErr = document.getElementById('vf-disclaimer-error');
        if (disclaimerErr) disclaimerErr.style.display = 'block';
        disclaimer.focus();
        valid = false;
      }
    }

    return valid;
  }

  function validateRequired(container, ids) {
    var ok = true;
    ids.forEach(function (id) {
      if (!valField(id, 'This field is required.')) ok = false;
    });
    return ok;
  }

  function valField(id, msg) {
    var el = document.getElementById(id);
    if (!el) return true;
    if (!el.value || !el.value.trim()) {
      markError(el, msg);
      return false;
    }
    return true;
  }

  function markError(el, msg) {
    var fg = el.closest('.form-group');
    if (!fg) return;
    fg.classList.add('has-error');
    var err = getOrCreateError(fg);
    err.textContent = msg;
    err.style.display = 'block';
  }

  function getOrCreateError(parent) {
    var err = parent.querySelector('.vf-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'vf-error';
      parent.appendChild(err);
    }
    return err;
  }

  // ── Build review summary ──
  function buildReview() {
    var container = document.getElementById('vf-review-summary');
    if (!container) return;

    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var stallEl = form.querySelector('input[name="stall"]:checked');
    var stall = stallEl ? stallEl.value : '—';
    var count = parseInt(v('vf-teamsize'), 10) || 1;

    var html = '';
    html += sec('Business Info', [
      row('Email', v('vf-email')),
      row('Full Name', v('vf-fullname')),
      row('Business', v('vf-business')),
      row('Business Logo', logoData ? '✓ Uploaded' : '—'),
      row('WhatsApp', v('vf-phone')),
      row('Type', v('vf-category')),
      row('About', v('vf-about')),
      row('Selling', v('vf-sell'))
    ]);

    html += sec('Stall', [row('Selected', stall)]);

    var teamRows = [row('Team Size', count)];
    for (var i = 1; i <= count; i++) {
      teamRows.push(
        row('Member ' + i, v('tm-name-' + i) + ' — ' + v('tm-role-' + i) + ' — ' + v('tm-phone-' + i) +
          (teamPhotoData['member-photo-' + i] ? ' — Photo ✓' : '') +
          (teamPhotoData['member-id-' + i] ? ' — ID ✓' : ''))
      );
    }
    html += sec('Team', teamRows);

    html += sec('Logistics', [
      row('Extra Tags', v('vf-extratags')),
      v('vf-extratags') === 'Yes' ? row('Justification', v('vf-extratags-why')) : '',
      row('Appliances', v('vf-appliances')),
      v('vf-appliances') === 'Yes' ? row('List', v('vf-appliances-list')) : '',
      row('Power', v('vf-power')),
      row('Readiness', v('vf-readiness'))
    ]);

    container.innerHTML = html;
  }

  function sec(title, rows) {
    return '<div class="vf-review-section"><h4>' + title + '</h4>' + rows.filter(Boolean).join('') + '</div>';
  }

  function row(label, val) {
    return '<div class="vf-review-row"><span class="vf-rl">' + label + '</span><span class="vf-rv">' + esc(val || '—') + '</span></div>';
  }

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  // ── Submit ──
  function handleSubmit() {
    if (!validatePage(currentPage)) return;

    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var stallEl = form.querySelector('input[name="stall"]:checked');
    var count = parseInt(v('vf-teamsize'), 10) || 1;

    // Build team members array
    var team = [];
    for (var i = 1; i <= count; i++) {
      team.push({
        name: v('tm-name-' + i),
        role: v('tm-role-' + i),
        phone: v('tm-phone-' + i),
        // Personal photograph printed on the vendor tag (required)
        photo: teamPhotoData['member-photo-' + i] || null,
        // Optional ID document, kept for admin records
        id_photo: teamPhotoData['member-id-' + i] || null
      });
    }

    // Get turnstile token
    var turnstileToken = '';
    try { turnstileToken = turnstile.getResponse(); } catch (_) {}
    if (!turnstileToken) {
      var hidden = form.querySelector('[name="cf-turnstile-response"]');
      if (hidden) turnstileToken = hidden.value;
    }
    if (!turnstileToken && typeof getVerifiedVisitorToken === 'function') {
      turnstileToken = getVerifiedVisitorToken();
    }
    if (!turnstileToken) {
      alert('Please complete the CAPTCHA check.');
      return;
    }

    // Disable submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    submitApplication({
      business: v('vf-business'),
      contactName: v('vf-fullname'),
      email: v('vf-email'),
      phone: v('vf-phone'),
      category: v('vf-category'),
      message: v('vf-about'),
      token: turnstileToken,
      details: {
        business_logo: logoData || null,
        sell_intent: v('vf-sell'),
        stall_preference: stallEl ? stallEl.value : '',
        team_size: String(count),
        team_members: team,
        extra_tags_needed: v('vf-extratags'),
        extra_tags_justification: v('vf-extratags-why'),
        bringing_appliances: v('vf-appliances'),
        appliances_list: v('vf-appliances-list'),
        power_requirements: v('vf-power'),
        readiness_level: v('vf-readiness'),
        payment_reference: v('vf-payment-ref'),
        event_operations_ack: true,
        event_operations_ack_at: new Date().toISOString()
      }
    }).then(function () {
      if (typeof giftVendorKit === 'function') {
        giftVendorKit(form, { id: 'submitted' });
      }
    }).catch(function (err) {
      console.error(err);
      alert('Submission failed: ' + (err.message || 'Please try again.'));
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Application';
    });
  }

})();

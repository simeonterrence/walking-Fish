/**
 * vendor-form.js — Multi-step Piroake Fest 2026 Vendor Application
 * Handles page navigation, validation, team member generation,
 * image compression, review rendering, and final submission.
 */
(function () {
  'use strict';

  var TOTAL_PAGES = 5;
  var currentPage = 1;
  var teamPhotoData = {}; // key: "team-photo-N" → base64 data URL

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
        '<div class="form-group"><label>Photo ID <span style="color:#DC2626;">*</span></label>' +
        '<div class="vf-id-upload">' +
        '<label class="vf-upload-btn" for="tm-photo-' + n + '">📷 Upload ID</label>' +
        '<input type="file" id="tm-photo-' + n + '" accept="image/*" style="display:none;" data-idx="' + n + '">' +
        '<img class="vf-id-preview" id="tm-preview-' + n + '" alt="ID preview">' +
        '<span class="vf-upload-status" id="tm-status-' + n + '" style="font-size:12px;color:var(--muted);"></span>' +
        '</div></div>';
      teamList.appendChild(div);

      // Restore existing photo data
      var previewEl = document.getElementById('tm-preview-' + n);
      if (teamPhotoData['team-photo-' + n] && previewEl) {
        previewEl.src = teamPhotoData['team-photo-' + n];
        previewEl.style.display = 'block';
        var statusEl = document.getElementById('tm-status-' + n);
        if (statusEl) statusEl.textContent = '✓ Uploaded';
      }
    }

    // Attach file listeners
    teamList.querySelectorAll('input[type="file"]').forEach(function (inp) {
      inp.addEventListener('change', handlePhotoUpload);
    });
  }

  // ── Photo upload + client-side compression ──
  function handlePhotoUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    var idx = e.target.getAttribute('data-idx');
    var status = document.getElementById('tm-status-' + idx);
    var preview = document.getElementById('tm-preview-' + idx);
    if (status) status.textContent = 'Compressing…';

    compressImage(file, 600, 0.6, function (dataUrl) {
      teamPhotoData['team-photo-' + idx] = dataUrl;
      if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
      if (status) status.textContent = '✓ Uploaded';
    });
  }

  function compressImage(file, maxDim, quality, cb) {
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
        cb(canvas.toDataURL('image/jpeg', quality));
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
        if (!teamPhotoData['team-photo-' + i]) {
          var photoGroup = document.getElementById('tm-photo-' + i);
          if (photoGroup) {
            var fg = photoGroup.closest('.form-group');
            if (fg) { fg.classList.add('has-error'); var e2 = getOrCreateError(fg); e2.textContent = 'Photo ID is required.'; e2.style.display = 'block'; }
          }
          valid = false;
        }
      }
    }

    if (page === 4) {
      valid = validateRequired(pageEl, ['vf-extratags', 'vf-appliances', 'vf-power', 'vf-readiness']);
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
      row('WhatsApp', v('vf-phone')),
      row('Type', v('vf-category')),
      row('About', v('vf-about')),
      row('Selling', v('vf-sell'))
    ]);

    html += sec('Stall', [row('Selected', stall)]);

    var teamRows = [row('Team Size', count)];
    for (var i = 1; i <= count; i++) {
      teamRows.push(row('Member ' + i, v('tm-name-' + i) + ' — ' + v('tm-role-' + i) + ' — ' + v('tm-phone-' + i)));
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
        id_photo: teamPhotoData['team-photo-' + i] || null
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
        sell_intent: v('vf-sell'),
        stall_preference: stallEl ? stallEl.value : '',
        team_size: String(count),
        team_members: team,
        extra_tags_needed: v('vf-extratags'),
        extra_tags_justification: v('vf-extratags-why'),
        bringing_appliances: v('vf-appliances'),
        appliances_list: v('vf-appliances-list'),
        power_requirements: v('vf-power'),
        readiness_level: v('vf-readiness')
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

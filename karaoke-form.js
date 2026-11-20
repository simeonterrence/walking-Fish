/**
 * karaoke-form.js — Piroake Fest Gen Z vs Millennials Karaoke Competition.
 * Submits to the verify-turnstile Edge Function (table: karaoke_registrations),
 * which validates the Cloudflare Turnstile token, stores the entry and sends
 * the admin + contestant emails.
 */
(function () {
  'use strict';

  var WHATSAPP_NUMBER = '2207865201';

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('karaoke-form');
    if (!form) return;

    updateTypeUI();

    form.querySelectorAll('input[name="registration_type"]').forEach(function (radio) {
      radio.addEventListener('change', updateTypeUI);
    });

    form.addEventListener('input', function (e) {
      var fg = e.target.closest ? e.target.closest('.form-group') : null;
      if (fg) {
        fg.classList.remove('has-error');
        var err = fg.querySelector('.k-error');
        if (err) err.style.display = 'none';
      }
    });

    form.addEventListener('change', function (e) {
      var fieldset = e.target.closest ? e.target.closest('.k-fieldset') : null;
      if (fieldset) {
        fieldset.classList.remove('has-error');
        var err = fieldset.querySelector('.k-error');
        if (err) err.style.display = 'none';
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSubmit(form);
    });
  });

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function selected(name) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : '';
  }

  function isGroup() {
    return selected('registration_type') === 'Group';
  }

  function updateTypeUI() {
    var group = isGroup();
    var nameLabel = document.getElementById('k-name-label-text');
    var nameInput = document.getElementById('k-name');
    var groupSizeGroup = document.getElementById('k-group-size-group');
    var groupSizeInput = document.getElementById('k-group-size');
    if (nameLabel) nameLabel.textContent = group ? '2. Group Name' : '2. Full Name';
    if (nameInput) {
      nameInput.placeholder = group ? 'Your group or crew name' : 'Your full name';
      nameInput.setAttribute('autocomplete', group ? 'organization' : 'name');
    }
    if (groupSizeGroup) groupSizeGroup.style.display = group ? '' : 'none';
    if (!group && groupSizeInput) {
      groupSizeInput.value = '';
      var fg = groupSizeInput.closest('.form-group');
      if (fg) {
        fg.classList.remove('has-error');
        var err = fg.querySelector('.k-error');
        if (err) err.style.display = 'none';
      }
    }
  }

  function clearErrors() {
    document.querySelectorAll('#karaoke-form .has-error').forEach(function (el) {
      el.classList.remove('has-error');
    });
    document.querySelectorAll('#karaoke-form .k-error').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  function markErrorById(id, errId, msg) {
    var el = document.getElementById(id);
    var err = document.getElementById(errId);
    if (el) {
      var fg = el.closest('.form-group');
      if (fg) fg.classList.add('has-error');
    }
    if (err) {
      err.textContent = msg;
      err.style.display = 'block';
    }
  }

  function markGroupError(groupId, errId, msg) {
    var group = document.getElementById(groupId);
    var err = document.getElementById(errId);
    if (group) group.classList.add('has-error');
    if (err) {
      err.textContent = msg;
      err.style.display = 'block';
    }
  }

  function validate() {
    clearErrors();
    var ok = true;
    var firstFocus = null;

    if (!selected('registration_type')) {
      markGroupError('k-type-fieldset', 'k-type-error', 'Please choose Individual or Group.');
      ok = false;
      firstFocus = firstFocus || document.getElementById('k-type-individual');
    }

    if (!val('k-name')) {
      markErrorById('k-name', 'k-name-error', isGroup() ? 'Please enter your group name.' : 'Please enter your full name.');
      ok = false;
      firstFocus = firstFocus || document.getElementById('k-name');
    }

    if (isGroup()) {
      var size = val('k-group-size');
      if (size && (isNaN(Number(size)) || Number(size) < 2 || Number(size) > 20)) {
        markErrorById('k-group-size', 'k-group-size-error', 'Group size must be between 2 and 20.');
        ok = false;
        firstFocus = firstFocus || document.getElementById('k-group-size');
      }
    }

    if (!selected('generation')) {
      markGroupError('k-generation-group', 'k-generation-error', 'Please choose your generation.');
      ok = false;
      firstFocus = firstFocus || document.getElementById('k-gen-z');
    }

    if (!selected('genre')) {
      markGroupError('k-genre-group', 'k-genre-error', 'Please pick a music genre.');
      ok = false;
      firstFocus = firstFocus || document.getElementById('k-genre-afrobeats');
    }

    var email = val('k-email');
    if (!email) {
      markErrorById('k-email', 'k-email-error', 'Please enter your email address.');
      ok = false;
      firstFocus = firstFocus || document.getElementById('k-email');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      markErrorById('k-email', 'k-email-error', 'Please enter a valid email address.');
      ok = false;
      firstFocus = firstFocus || document.getElementById('k-email');
    }

    if (!val('k-phone')) {
      markErrorById('k-phone', 'k-phone-error', 'Please enter your WhatsApp number so we can confirm your slot.');
      ok = false;
      firstFocus = firstFocus || document.getElementById('k-phone');
    }

    if (!ok && firstFocus && typeof firstFocus.focus === 'function') {
      firstFocus.focus();
    }

    return ok;
  }

  function getTurnstileToken(form) {
    var token = '';
    try { token = turnstile.getResponse(); } catch (_) {}
    if (!token) {
      var hidden = form.querySelector('[name="cf-turnstile-response"]');
      if (hidden) token = hidden.value;
    }
    if (!token && typeof getVerifiedVisitorToken === 'function') {
      token = getVerifiedVisitorToken();
    }
    return token;
  }

  function buildWhatsAppLink(name, generation) {
    var text = 'Hi Walking-Fish! I registered for the Piroake Fest Karaoke Competition'
      + (name ? ' — ' + name : '')
      + (generation ? ' (' + generation + ')' : '')
      + '. Looking forward to my slot!';
    return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text);
  }

  function handleSubmit(form) {
    if (!validate()) return;

    var token = getTurnstileToken(form);
    var turnstileError = document.getElementById('k-turnstile-error');
    if (!token) {
      if (turnstileError) turnstileError.style.display = 'block';
      return;
    }
    if (turnstileError) turnstileError.style.display = 'none';

    var submitBtn = document.getElementById('k-submit');
    var origText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    var type = selected('registration_type');
    var name = val('k-name');
    var generation = selected('generation');
    var genre = selected('genre');
    var email = val('k-email');
    var phone = val('k-phone');

    var data = {
      registration_type: type,
      name: name,
      generation: generation,
      genre: genre,
      email: email,
      phone: phone
    };

    if (type === 'Group' && val('k-group-size')) {
      data.group_size = Number(val('k-group-size'));
    }

    fetch(SUPABASE_URL + '/functions/v1/verify-turnstile', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        // Edge Functions require an Authorization header (platform JWT check).
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: token,
        table: 'karaoke_registrations',
        data: data
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          if (err.error === 'Invalid CAPTCHA token') {
            try {
              localStorage.removeItem('wf_verified_visitor_token');
              if (typeof turnstile !== 'undefined' && typeof turnstile.reset === 'function') {
                turnstile.reset();
              }
            } catch (_) {}
          }
          throw new Error(err.error || 'Failed to submit registration.');
        });
      }
      return res.json();
    }).then(function (result) {
      if (result.verifiedToken) {
        try { localStorage.setItem('wf_verified_visitor_token', result.verifiedToken); } catch (_) {}
      }
      showSuccess(form, { name: name, type: type, generation: generation, genre: genre, phone: phone });
    }).catch(function (err) {
      alert('Registration failed: ' + (err.message || 'Please check your connection and try again.'));
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    });
  }

  function showSuccess(form, entry) {
    var success = document.getElementById('k-success-message');
    var successText = document.getElementById('k-success-text');
    var details = document.getElementById('k-success-details');
    var waBtn = document.getElementById('k-success-whatsapp');

    if (successText) {
      successText.textContent = 'Thanks ' + entry.name + '! Your ' + entry.generation
        + ' entry is in. We\'ll confirm your slot and set time on WhatsApp at ' + entry.phone + '.';
    }

    if (details) {
      details.textContent = '';
      [entry.type, entry.generation, entry.genre].forEach(function (value) {
        if (!value) return;
        var chip = document.createElement('span');
        chip.className = 'k-success-chip';
        chip.textContent = value;
        details.appendChild(chip);
      });
    }

    if (waBtn) {
      waBtn.href = buildWhatsAppLink(entry.name, entry.generation);
    }

    form.style.display = 'none';
    if (success) {
      success.classList.add('show');
      var reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      success.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }
})();

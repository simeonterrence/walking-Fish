/**
 * open-mic-form.js — Open Mic Saturday signup form.
 * Submits to the verify-turnstile Edge Function using the existing
 * `contact_messages` table (subject: "Open Mic Signup — <TALENT>"),
 * so no DB migration is needed and admin email notifications work today.
 */
(function () {
  'use strict';

  var EVENT_LABEL = 'Open Mic — Saturday, September 19, 2026';
  var WHATSAPP_NUMBER = '2207865201';
  var BEATS_BUCKET = 'open-mic-beats';
  var MAX_BEAT_BYTES = 15 * 1024 * 1024;
  var AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'aac', 'flac', 'wma', 'opus'];

  var beatFile = null;

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('openmic-form');
    if (!form) return;

    var otherGroup = document.getElementById('om-talent-other-group');
    var projSpecGroup = document.getElementById('om-proj-spec-group');
    var beatInput = document.getElementById('om-beat-file');
    var beatDropzone = document.getElementById('om-beat-dropzone');
    var beatRemoveBtn = document.getElementById('om-beat-remove');

    // Show/hide the "describe your talent" field for OTHER TALENT
    form.querySelectorAll('input[name="talent"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        var isOther = document.getElementById('talent-other').checked;
        otherGroup.style.display = isOther ? '' : 'none';
        clearTalentError();
      });
    });

    // Show/hide the "what should we show?" field when projection is Yes
    form.querySelectorAll('input[name="projection"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        var wantsProjection = document.getElementById('proj-yes').checked;
        projSpecGroup.style.display = wantsProjection ? '' : 'none';
        clearProjError();
      });
    });

    // Beat file picker: tap or drag-and-drop (same pattern as volunteer resume)
    if (beatDropzone && beatInput) {
      beatDropzone.addEventListener('click', function (e) {
        if (e.target !== beatRemoveBtn && !beatRemoveBtn.contains(e.target)) {
          beatInput.click();
        }
      });

      beatInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) {
          processBeatFile(e.target.files[0]);
        }
      });

      ['dragenter', 'dragover'].forEach(function (eventName) {
        beatDropzone.addEventListener(eventName, function (e) {
          e.preventDefault();
          e.stopPropagation();
          beatDropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(function (eventName) {
        beatDropzone.addEventListener(eventName, function (e) {
          e.preventDefault();
          e.stopPropagation();
          beatDropzone.classList.remove('dragover');
        });
      });

      beatDropzone.addEventListener('drop', function (e) {
        var dt = e.dataTransfer;
        if (dt.files && dt.files[0]) {
          processBeatFile(dt.files[0]);
        }
      });
    }

    if (beatRemoveBtn) {
      beatRemoveBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearBeatFile();
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSubmit(form);
    });
  });

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function selectedTalent() {
    var checked = document.querySelector('input[name="talent"]:checked');
    return checked ? checked.value : '';
  }

  function clearTalentError() {
    var group = document.getElementById('om-talent-group');
    var err = document.getElementById('om-talent-error');
    if (group) group.classList.remove('has-error');
    if (err) err.style.display = 'none';
  }

  function selectedProjection() {
    var checked = document.querySelector('input[name="projection"]:checked');
    return checked ? checked.value : '';
  }

  function clearProjError() {
    var group = document.getElementById('om-proj-group');
    var err = document.getElementById('om-proj-error');
    if (group) group.classList.remove('has-error');
    if (err) err.style.display = 'none';
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

  function markErrorById(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    var fg = el.closest('.form-group');
    if (fg) fg.classList.add('has-error');
    var parent = fg || el.parentElement;
    var err = parent.querySelector('.om-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'om-error';
      err.setAttribute('role', 'alert');
      parent.appendChild(err);
    }
    err.textContent = msg;
    err.style.display = 'block';
  }

  function validate(form) {
    var ok = true;

    form.querySelectorAll('.has-error').forEach(function (el) { el.classList.remove('has-error'); });
    form.querySelectorAll('.om-error').forEach(function (el) { el.style.display = 'none'; });

    if (!val('om-name')) {
      markErrorById('om-name', 'Please enter your name.');
      ok = false;
    }

    var talent = selectedTalent();
    if (!talent) {
      markGroupError('om-talent-group', 'om-talent-error', 'Please pick your talent.');
      ok = false;
    } else if (talent === 'OTHER TALENT' && !val('om-talent-other-text')) {
      markErrorById('om-talent-other-text', 'Please describe your talent.');
      ok = false;
    }

    var projection = selectedProjection();
    if (!projection) {
      markGroupError('om-proj-group', 'om-proj-error', 'Please tell us if you want anything on the big screen.');
      ok = false;
    } else if (projection === 'Yes' && !val('om-proj-spec')) {
      markErrorById('om-proj-spec', 'Please describe what we should show on screen.');
      ok = false;
    }

    if (!val('om-phone')) {
      markErrorById('om-phone', 'Please enter your WhatsApp number so we can confirm your slot.');
      ok = false;
    }

    var email = val('om-email');
    if (!email) {
      markErrorById('om-email', 'Please enter your email address.');
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      markErrorById('om-email', 'Please enter a valid email address.');
      ok = false;
    }

    var beat = val('om-beat');
    if (beat && !/^https?:\/\/.+\..+/.test(beat)) {
      markErrorById('om-beat', 'That link looks incomplete — it should start with http(s)://. You can also send it on WhatsApp after signup.');
      ok = false;
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

  function buildWhatsAppLink(name, talent) {
    var text = 'Hi Walking-Fish! I signed up for the Open Mic this Saturday'
      + (name ? ' — ' + name : '')
      + (talent ? ' (' + talent + ')' : '')
      + '. Here is my beat / request: ';
    return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text);
  }

  function showBeatError(msg) {
    var err = document.getElementById('om-beat-error');
    if (err) {
      err.textContent = msg;
      err.style.display = 'block';
    }
    var box = document.getElementById('om-beat-dropzone');
    if (box) box.closest('.form-group').classList.add('has-error');
  }

  function clearBeatError() {
    var err = document.getElementById('om-beat-error');
    if (err) err.style.display = 'none';
    var box = document.getElementById('om-beat-dropzone');
    if (box) box.closest('.form-group').classList.remove('has-error');
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function processBeatFile(file) {
    if (!file) return;
    clearBeatError();

    var ext = (file.name.split('.').pop() || '').toLowerCase();
    var isAudio = (file.type && file.type.indexOf('audio/') === 0) ||
      AUDIO_EXTENSIONS.indexOf(ext) !== -1;
    if (!isAudio) {
      showBeatError('That file is not audio. Please choose an MP3, WAV, M4A or similar.');
      clearBeatFile();
      return;
    }

    if (file.size > MAX_BEAT_BYTES) {
      showBeatError('That file is over 15MB. Please use a smaller file, a link, or WhatsApp.');
      clearBeatFile();
      return;
    }

    beatFile = file;
    document.getElementById('om-beat-filename').textContent = file.name;
    document.getElementById('om-beat-filesize').textContent = formatBytes(file.size);
    document.getElementById('om-beat-prompt').style.display = 'none';
    document.getElementById('om-beat-fileinfo').style.display = 'flex';
  }

  function clearBeatFile() {
    beatFile = null;
    var input = document.getElementById('om-beat-file');
    if (input) input.value = '';
    var prompt = document.getElementById('om-beat-prompt');
    if (prompt) prompt.style.display = '';
    var info = document.getElementById('om-beat-fileinfo');
    if (info) info.style.display = 'none';
  }

  function sanitizeFileName(name) {
    return (name || 'beat')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'beat';
  }

  // Uploads the beat to Supabase Storage, resolves with { url, name }.
  function uploadBeatFile() {
    var ext = (beatFile.name.split('.').pop() || 'mp3').toLowerCase();
    var path = 'open-mic/' + Date.now() + '-' + sanitizeFileName(beatFile.name) + '.' + ext;
    var url = SUPABASE_URL + '/storage/v1/object/' + BEATS_BUCKET + '/' + path;

    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': beatFile.type || 'audio/mpeg'
      },
      body: beatFile
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          throw new Error(err.message || 'Beat upload failed (status ' + res.status + ').');
        });
      }
      return res.json();
    }).then(function () {
      return {
        url: SUPABASE_URL + '/storage/v1/object/public/' + BEATS_BUCKET + '/' + path,
        name: beatFile.name
      };
    });
  }

  function handleSubmit(form) {
    if (!validate(form)) {
      var firstError = form.querySelector('.has-error input, .has-error textarea');
      if (firstError && typeof firstError.focus === 'function') firstError.focus();
      return;
    }

    var token = getTurnstileToken(form);
    if (!token) {
      alert('Please complete the CAPTCHA check.');
      return;
    }

    var submitBtn = document.getElementById('om-submit');
    var origHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;

    // If a beat file was picked, upload it first, then submit the signup.
    if (beatFile) {
      submitBtn.textContent = 'Uploading beat…';
      uploadBeatFile().then(function (uploaded) {
        doSubmit({ url: uploaded.url, name: uploaded.name });
      }).catch(function (err) {
        showBeatError('Beat upload failed (' + (err.message || 'connection error') + '). Please retry, or sign up and send the beat on WhatsApp instead.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      });
      return;
    }

    doSubmit(null);

    function doSubmit(uploadedBeat) {
      var beatLink = val('om-beat');
      var beatLine;
      if (uploadedBeat) {
        beatLine = uploadedBeat.url + ' (' + uploadedBeat.name + ')';
      } else {
        beatLine = beatLink || '— (will send on WhatsApp)';
      }

      var name = val('om-name');
      var talent = selectedTalent();
      var talentDetail = talent === 'OTHER TALENT' ? val('om-talent-other-text') : '';
      var talentLabel = talentDetail ? talent + ' — ' + talentDetail : talent;
      var projection = selectedProjection();
      var projectionLine = projection === 'Yes'
        ? 'Yes: ' + val('om-proj-spec')
        : 'No';

      var messageLines = [
        EVENT_LABEL,
        'Talent: ' + talentLabel,
        'Stage name: ' + (val('om-stage') || '—'),
        'Performance: ' + (val('om-performance') || '—'),
        'Beat / track: ' + beatLine,
        'On-screen projection: ' + projectionLine,
        '',
        'Requests for a successful performance:',
        val('om-requests') || '—'
      ];

      var payload = {
        token: token,
        table: 'contact_messages',
        data: {
          name: name,
          email: val('om-email'),
          phone: val('om-phone'),
          subject: 'Open Mic Signup — ' + talentLabel,
          message: messageLines.join('\n')
        }
      };

      submitBtn.textContent = 'Claiming your slot…';

      fetch(SUPABASE_URL + '/functions/v1/verify-turnstile', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
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
          throw new Error(err.error || 'Failed to submit signup.');
        });
      }
      return res.json();
    }).then(function (data) {
      if (data.verifiedToken) {
        try { localStorage.setItem('wf_verified_visitor_token', data.verifiedToken); } catch (_) {}
      }
      var waLink = buildWhatsAppLink(name, talentLabel);
      var preBtn = document.getElementById('om-beat-whatsapp');
      var successBtn = document.getElementById('om-success-whatsapp');
      if (preBtn) preBtn.href = waLink;
      if (successBtn) successBtn.href = waLink;
      var successText = document.getElementById('om-success-text');
      if (successText) {
        successText.innerHTML = 'Thanks <strong></strong>! Your <strong></strong> slot for the Open Mic this Saturday is requested. We\'ll confirm your set time on WhatsApp at <strong></strong>.';
        var strongs = successText.querySelectorAll('strong');
        if (strongs[0]) strongs[0].textContent = name;
        if (strongs[1]) strongs[1].textContent = talentLabel;
        if (strongs[2]) strongs[2].textContent = val('om-phone');
      }
      form.style.display = 'none';
      var successEl = document.getElementById('om-success-message');
      if (successEl) {
        successEl.style.display = 'block';
        successEl.classList.add('show');
        var reduceMotion = window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        successEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }).catch(function (err) {
      alert('Signup failed: ' + (err.message || 'Please check your connection and try again.'));
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origHtml;
    });
    }
  }
})();

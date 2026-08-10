/**
 * volunteer-form.js — PIROAKE Games Night Series Volunteer Application Form
 * Handles form validation, resume reader & base64 conversion, Turnstile CAPTCHA verification,
 * and submission to Edge Function (verify-turnstile -> volunteer_applications table).
 */
(function () {
  'use strict';

  var form, submitBtn, resumeInput, resumeDropzone, resumePrompt, resumeFileInfo, fileNameEl, fileSizeEl, removeResumeBtn;
  var priorExpSelect, expDetailsGroup;
  var resumeDataUrl = null;
  var resumeFileName = '';

  document.addEventListener('DOMContentLoaded', function () {
    form = document.getElementById('volunteer-form');
    if (!form) return;

    submitBtn = document.getElementById('vol-submit');
    resumeInput = document.getElementById('vol-resume');
    resumeDropzone = document.getElementById('vol-resume-dropzone');
    resumePrompt = document.getElementById('vol-resume-prompt');
    resumeFileInfo = document.getElementById('vol-resume-fileinfo');
    fileNameEl = document.getElementById('vol-filename');
    fileSizeEl = document.getElementById('vol-filesize');
    removeResumeBtn = document.getElementById('vol-remove-resume');
    priorExpSelect = document.getElementById('vol-prior-exp');
    expDetailsGroup = document.getElementById('vol-exp-details-group');

    // Toggle prior experience details text area
    if (priorExpSelect) {
      priorExpSelect.addEventListener('change', function () {
        expDetailsGroup.style.display = this.value === 'Yes' ? '' : 'none';
      });
    }

    // File input handlers
    if (resumeDropzone && resumeInput) {
      resumeDropzone.addEventListener('click', function (e) {
        if (e.target !== removeResumeBtn && !removeResumeBtn.contains(e.target)) {
          resumeInput.click();
        }
      });

      resumeInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) {
          processResumeFile(e.target.files[0]);
        }
      });

      // Drag & drop
      ['dragenter', 'dragover'].forEach(function (eventName) {
        resumeDropzone.addEventListener(eventName, function (e) {
          e.preventDefault();
          e.stopPropagation();
          resumeDropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(function (eventName) {
        resumeDropzone.addEventListener(eventName, function (e) {
          e.preventDefault();
          e.stopPropagation();
          resumeDropzone.classList.remove('dragover');
        });
      });

      resumeDropzone.addEventListener('drop', function (e) {
        var dt = e.dataTransfer;
        if (dt.files && dt.files[0]) {
          processResumeFile(dt.files[0]);
        }
      });
    }

    if (removeResumeBtn) {
      removeResumeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearResumeFile();
      });
    }

    // Form submit
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleFormSubmit();
    });
  });

  function processResumeFile(file) {
    if (!file) return;

    // Check size limit 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('Resume file size must be less than 5MB.');
      clearResumeFile();
      return;
    }

    resumeFileName = file.name;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);

    var reader = new FileReader();
    reader.onload = function (e) {
      resumeDataUrl = e.target.result;
      resumePrompt.style.display = 'none';
      resumeFileInfo.style.display = 'flex';
      var errEl = document.getElementById('vol-resume-error');
      if (errEl) errEl.style.display = 'none';
    };
    reader.onerror = function () {
      alert('Failed to read file. Please try selecting your resume again.');
      clearResumeFile();
    };
    reader.readAsDataURL(file);
  }

  function clearResumeFile() {
    resumeDataUrl = null;
    resumeFileName = '';
    if (resumeInput) resumeInput.value = '';
    if (resumePrompt) resumePrompt.style.display = '';
    if (resumeFileInfo) resumeFileInfo.style.display = 'none';
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function validateForm() {
    var valid = true;

    // Clear previous errors
    form.querySelectorAll('.has-error').forEach(function (el) { el.classList.remove('has-error'); });
    form.querySelectorAll('.vol-error').forEach(function (el) { el.style.display = 'none'; });

    function req(id, msg) {
      var el = document.getElementById(id);
      if (!el || !el.value || !el.value.trim()) {
        markError(el, msg);
        valid = false;
      }
    }

    req('vol-fullname', 'Full name is required.');
    req('vol-address', 'Physical address is required.');
    req('vol-email', 'Email address is required.');
    req('vol-phone', 'Contact phone or WhatsApp number is required.');
    req('vol-prior-exp', 'Please select if you have prior event experience.');
    req('vol-skills', 'Please list your skills or strengths.');
    req('vol-motivation', 'Please tell us why you would like to volunteer.');

    // Email format check
    var emailEl = document.getElementById('vol-email');
    if (emailEl && emailEl.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
      markError(emailEl, 'Please enter a valid email address.');
      valid = false;
    }

    // Resume check
    if (!resumeDataUrl) {
      var errBox = document.getElementById('vol-resume-error');
      if (errBox) {
        errBox.textContent = 'Please upload your resume (PDF, DOC, or image).';
        errBox.style.display = 'block';
      }
      valid = false;
    }

    // Confirmation check
    var confirmCb = document.getElementById('vol-confirm');
    if (confirmCb && !confirmCb.checked) {
      var cErr = document.getElementById('vol-confirm-error');
      if (cErr) {
        cErr.textContent = 'You must confirm that your information is accurate.';
        cErr.style.display = 'block';
      }
      valid = false;
    }

    return valid;
  }

  function markError(el, msg) {
    if (!el) return;
    var fg = el.closest('.form-group');
    if (fg) fg.classList.add('has-error');
    var parent = fg || el.parentElement;
    var err = parent.querySelector('.vol-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'vol-error';
      parent.appendChild(err);
    }
    err.textContent = msg;
    err.style.display = 'block';
  }

  function handleFormSubmit() {
    if (!validateForm()) return;

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

    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };

    var payload = {
      token: turnstileToken,
      table: 'volunteer_applications',
      data: {
        full_name: v('vol-fullname'),
        address: v('vol-address'),
        email: v('vol-email'),
        phone: v('vol-phone'),
        prior_experience: v('vol-prior-exp'),
        prior_experience_details: v('vol-prior-exp') === 'Yes' ? v('vol-exp-details') : '',
        skills: v('vol-skills'),
        resume_url: resumeDataUrl,
        resume_filename: resumeFileName,
        motivation: v('vol-motivation'),
        extra_info: v('vol-extra'),
        confirmation: true,
        status: 'pending'
      }
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Application…';

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
          throw new Error(err.error || 'Failed to submit volunteer application.');
        });
      }
      return res.json();
    }).then(function (data) {
      if (data.verifiedToken) {
        try { localStorage.setItem('wf_verified_visitor_token', data.verifiedToken); } catch (_) {}
      }
      // Show success message
      form.style.display = 'none';
      var successEl = document.getElementById('vol-success-message');
      if (successEl) successEl.style.display = 'block';

      if (typeof giftVendorKit === 'function') {
        giftVendorKit(form, { id: 'submitted' });
      }
    }).catch(function (err) {
      console.error(err);
      alert('Submission failed: ' + (err.message || 'Please check your connection and try again.'));
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Volunteer Application';
    });
  }

})();

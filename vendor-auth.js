/* ============================================
   Vendor Auth — Supabase Auth + REST API module
   Replaces localStorage-based auth with Supabase.
   Async-first: all data functions return Promises.
   ============================================ */

// ---------- JWT helpers ----------
function decodeJWT(token) {
  try {
    var payload = token.split('.')[1];
    var decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

function getStoredSession() {
  try { return JSON.parse(sessionStorage.getItem('wf_session')) || {}; } catch { return {}; }
}

function setStoredSession(data) {
  sessionStorage.setItem('wf_session', JSON.stringify(data));
}

function clearStoredSession() {
  sessionStorage.removeItem('wf_session');
}

// ---------- Auth headers ----------
function anonHeaders() {
  return { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
}

function authHeaders() {
  var s = getStoredSession();
  var t = s.access_token || '';
  return { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' };
}

// ---------- Session ----------
function setSession(type, data) {
  var s = getStoredSession();
  s.type = type;
  s.data = data;
  setStoredSession(s);
}

function clearSession() {
  var s = getStoredSession();
  if (s.access_token) {
    fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + s.access_token }
    }).catch(function () {});
  }
  clearStoredSession();
}

function getSession() {
  return getStoredSession();
}

// ---------- Supabase Auth login ----------
function authLogin(email, password) {
  return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ email: email, password: password })
  }).then(function (r) {
    if (!r.ok) return Promise.reject({ code: r.status, message: 'Invalid email or password.' });
    return r.json();
  }).then(function (data) {
    var claims = decodeJWT(data.access_token);
    var role = claims && claims.app_metadata && claims.app_metadata.role;
    var session = {
      type: role === 'admin_role' ? 'admin' : role === 'vendor_role' ? 'vendor' : null,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: claims ? claims.exp : null,
      user: data.user,
      role: role
    };
    setStoredSession(session);
    return session;
  });
}

// ---------- Application CRUD ----------
function submitApplication(data) {
  return fetch(SUPABASE_URL + '/rest/v1/vendor_applications', {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({
      business_name: data.business,
      contact_name: data.contactName,
      email: data.email,
      category: data.category,
      message: data.message
    })
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to submit application.'));
    return r.json();
  });
}

function getApplications() {
  return fetch(SUPABASE_URL + '/rest/v1/vendor_applications?order=created_at.desc', {
    headers: authHeaders()
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to load applications.'));
    return r.json();
  });
}

function updateApplicationStatus(appId, status) {
  return fetch(SUPABASE_URL + '/rest/v1/vendor_applications?id=eq.' + encodeURIComponent(appId), {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: status })
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to update application.'));
    return r.json();
  });
}

// ---------- Invite tokens ----------
function generateInviteToken(applicationId, email, businessName, contactName, category, tempPassword) {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var raw = new Uint8Array(16);
  window.crypto.getRandomValues(raw);
  var tokenStr = 'inv_';
  for (var i = 0; i < 16; i++) tokenStr += chars[raw[i] % chars.length];

  var expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return fetch(SUPABASE_URL + '/rest/v1/invite_tokens', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      application_id: applicationId,
      email: email,
      token: tokenStr,
      business_name: businessName || '',
      contact_name: contactName || '',
      category: category || '',
      temp_password: tempPassword || null,
      expires_at: expiresAt
    })
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to generate invite.'));
    return r.json();
  }).then(function () {
    return tokenStr; // return the token string for the invite URL
  });
}

function generateTempPassword() {
  var pwChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  var raw = new Uint8Array(12);
  window.crypto.getRandomValues(raw);
  var pw = '';
  for (var i = 0; i < raw.length; i++) pw += pwChars[raw[i] % pwChars.length];
  return pw;
}

function preCreateVendorUser(serviceKey, email, tempPassword) {
  return fetch(SUPABASE_URL + '/auth/v1/admin/users', {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email,
      password: tempPassword,
      email_confirm: true,
      app_metadata: { role: 'vendor_role' }
    })
  }).then(function (r) {
    if (!r.ok) return r.json().then(function (e) { throw new Error(e.msg || 'Failed to create user.'); });
    return r.json();
  });
}

function validateInviteToken(tokenStr) {
  return fetch(SUPABASE_URL + '/rest/v1/invite_tokens?token=eq.' + encodeURIComponent(tokenStr) + '&used=eq.false&select=id,token,application_id,email,business_name,contact_name,category,temp_password,expires_at', {
    headers: anonHeaders()
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to validate token.'));
    return r.json();
  }).then(function (tokens) {
    return tokens.length > 0 ? tokens[0] : null;
  });
}

function markTokenUsed(tokenId) {
  return fetch(SUPABASE_URL + '/rest/v1/rpc/mark_token_used', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ token_id: tokenId })
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to mark token used.'));
    return r.json();
  });
}

// ---------- Vendor profiles ----------
function registerVendor(applicationId, businessInfo, email, tempPassword) {
  // 1. Log in with temp password
  return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ email: email, password: tempPassword })
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Setup link expired. Contact the admin.'));
    return r.json();
  }).then(function (authData) {
    // 2. Store session so authHeaders() works for subsequent calls
    var claims = decodeJWT(authData.access_token);
    setStoredSession({
      type: 'vendor',
      access_token: authData.access_token,
      refresh_token: authData.refresh_token,
      user: authData.user,
      role: claims && claims.app_metadata && claims.app_metadata.role
    });

    // 3. Create vendor profile
    return fetch(SUPABASE_URL + '/rest/v1/vendor_profiles', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + authData.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_user_id: authData.user.id,
        business_name: businessInfo.business_name,
        contact_name: businessInfo.contact_name,
        email: email,
        category: businessInfo.category,
        application_id: applicationId
      })
    }).then(function (r) {
      if (!r.ok) return Promise.reject(new Error('Failed to create vendor profile.'));
      return r.json();
    }).then(function () {
      return authData;
    });
  });
}

function changeVendorPassword(newPassword) {
  // Uses current authHeaders() session — call AFTER markTokenUsed
  var session = getStoredSession();
  var token = session.access_token || '';
  return fetch(SUPABASE_URL + '/auth/v1/user', {
    method: 'PUT',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password: newPassword })
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to set password.'));
    return r.json();
  });
}

function getVendorUsers() {
  return fetch(SUPABASE_URL + '/rest/v1/vendor_profiles?order=created_at.desc', {
    headers: authHeaders()
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to load vendors.'));
    return r.json();
  });
}

function getVendorById(id) {
  return fetch(SUPABASE_URL + '/rest/v1/vendor_profiles?id=eq.' + encodeURIComponent(id), {
    headers: authHeaders()
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to load vendor.'));
    return r.json();
  }).then(function (profiles) {
    return profiles.length > 0 ? profiles[0] : null;
  });
}

// ---------- Application stats ----------
function getApplicationStats() {
  return getApplications().then(function (apps) {
    return {
      total: apps.length,
      pending: apps.filter(function (a) { return a.status === 'pending'; }).length,
      approved: apps.filter(function (a) { return a.status === 'approved'; }).length,
      rejected: apps.filter(function (a) { return a.status === 'rejected'; }).length
    };
  });
}

// ---------- Account deletion ----------
function deleteVendorAccount(profileId) {
  return fetch(SUPABASE_URL + '/rest/v1/vendor_profiles?id=eq.' + encodeURIComponent(profileId), {
    method: 'DELETE',
    headers: authHeaders()
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to delete account.'));
    clearSession();
    return true;
  });
}

function adminDeleteVendor(authUserId) {
  var svcKey = sessionStorage.getItem('wf_service_key');
  if (!svcKey) return Promise.reject(new Error('Service key required. Enter it on the login page.'));
  return fetch(SUPABASE_URL + '/auth/v1/admin/users/' + encodeURIComponent(authUserId), {
    method: 'DELETE',
    headers: {
      'apikey': svcKey,
      'Authorization': 'Bearer ' + svcKey
    }
  }).then(function (r) {
    if (!r.ok) return Promise.reject(new Error('Failed to delete vendor user.'));
    return true;
  });
}

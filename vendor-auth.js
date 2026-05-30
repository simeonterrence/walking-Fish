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

function decodeJWT(e) {
  try {
    var t = e.split(".")[1],
      n = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(n);
  } catch (e) {
    return null;
  }
}

function getStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem("wf_session")) || {};
  } catch (e) {
    return {};
  }
}

function setStoredSession(e) {
  sessionStorage.setItem("wf_session", JSON.stringify(e));
}

function clearStoredSession() {
  sessionStorage.removeItem("wf_session");
}

function anonHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
  };
}

function authHeaders() {
  var e = getStoredSession().access_token || "";
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: "Bearer " + e,
    "Content-Type": "application/json"
  };
}

function refreshSession() {
  var session = getStoredSession();
  if (!session || !session.refresh_token) {
    return Promise.reject(new Error("No active session to refresh."));
  }
  return fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({
      refresh_token: session.refresh_token
    })
  }).then(function (res) {
    if (!res.ok) {
      clearStoredSession();
      throw new Error("Session expired. Please log in again.");
    }
    return res.json();
  }).then(function (data) {
    var jwt = decodeJWT(data.access_token);
    var role = jwt && jwt.app_metadata && jwt.app_metadata.role;
    var updatedSession = {
      type: "admin_role" === role ? "admin" : "vendor_role" === role ? "vendor" : "ticketing_role" === role ? "ticketing" : null,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: jwt ? jwt.exp : null,
      user: data.user,
      role: role
    };
    setStoredSession(updatedSession);
    return updatedSession;
  });
}

function fetchWithAuth(url, options) {
  options = options || {};
  options.headers = options.headers || {};

  var session = getStoredSession();
  if (session && session.expires_at) {
    var now = Math.floor(Date.now() / 1000);
    if (session.expires_at - now < 300) { // less than 5 minutes left
      return refreshSession().then(function(newSession) {
        options.headers["Authorization"] = "Bearer " + newSession.access_token;
        options.headers["apikey"] = SUPABASE_ANON_KEY;
        return fetch(url, options);
      }).catch(function(err) {
        console.error("Auto token refresh failed:", err);
        var token = getStoredSession().access_token || "";
        options.headers["Authorization"] = "Bearer " + token;
        options.headers["apikey"] = SUPABASE_ANON_KEY;
        return fetch(url, options);
      });
    }
  }

  var token = session.access_token || "";
  options.headers["Authorization"] = "Bearer " + token;
  options.headers["apikey"] = SUPABASE_ANON_KEY;
  return fetch(url, options);
}

function setSession(e, t) {
  var n = getStoredSession();
  n.type = e;
  n.data = t;
  setStoredSession(n);
}

function clearSession() {
  var e = getStoredSession();
  e.access_token && fetch(SUPABASE_URL + "/auth/v1/logout", {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + e.access_token
    }
  }).catch(function () {}), clearStoredSession();
}

function getSession() {
  return getStoredSession();
}

function authLogin(e, t) {
  return fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({
      email: e,
      password: t
    })
  }).then(function (e) {
    return e.ok ? e.json() : Promise.reject({
      code: e.status,
      message: "Invalid email or password."
    });
  }).then(function (e) {
    var t = decodeJWT(e.access_token),
      n = t && t.app_metadata && t.app_metadata.role,
      r = {
        type: "admin_role" === n ? "admin" : "vendor_role" === n ? "vendor" : "ticketing_role" === n ? "ticketing" : null,
        access_token: e.access_token,
        refresh_token: e.refresh_token,
        expires_at: t ? t.exp : null,
        user: e.user,
        role: n
      };
    return setStoredSession(r), r;
  });
}

function submitApplication(e) {
  return fetch(SUPABASE_URL + "/functions/v1/verify-turnstile", {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({
      token: e.token,
      table: "vendor_applications",
      data: {
        business_name: e.business,
        contact_name: e.contactName,
        email: e.email,
        phone: e.phone,
        category: e.category,
        message: e.message,
        details: e.details
      }
    })
  }).then(function (res) {
    if (!res.ok) {
      return res.json().then(function (err) {
        if (err.error === "Invalid CAPTCHA token") {
          try {
            localStorage.removeItem("wf_verified_visitor_token");
            var styleEl = document.getElementById("wf-bypass-turnstile-style");
            if (styleEl) styleEl.remove();
            if (typeof turnstile !== "undefined" && typeof turnstile.reset === "function") {
              turnstile.reset();
            }
          } catch (_) {}
        }
        throw new Error(err.error || "Failed to submit application.");
      });
    }
    return res.json();
  }).then(function (data) {
    if (data.verifiedToken) {
      try {
        localStorage.setItem("wf_verified_visitor_token", data.verifiedToken);
      } catch (_) {}
    }
    return data;
  });
}

function getApplications() {
  return fetchWithAuth(SUPABASE_URL + "/rest/v1/vendor_applications?order=created_at.desc", {
    method: "GET"
  }).then(function (e) {
    return e.ok ? e.json() : Promise.reject(new Error("Failed to load applications."));
  });
}

function updateApplicationStatus(e, t) {
  return fetchWithAuth(SUPABASE_URL + "/rest/v1/vendor_applications?id=eq." + encodeURIComponent(e), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      status: t
    })
  }).then(function (e) {
    if (e.ok) {
      if (e.status === 204) return null;
      return e.text().then(function (t) { return t ? JSON.parse(t) : null; }).catch(function () { return null; });
    }
    return e.text().then(function (txt) {
      var msg = "Failed to update application.";
      try {
        var err = JSON.parse(txt);
        if (err && err.message) msg += " (" + err.message + ")";
      } catch (ex) {}
      return Promise.reject(new Error(msg));
    });
  });
}

function generateInviteToken(e, t, n, r, o, a) {
  var s = "abcdefghijklmnopqrstuvwxyz0123456789",
    i = new Uint8Array(16);
  window.crypto.getRandomValues(i);
  for (var c = "inv_", d = 0; d < 16; d++) c += s[i[d] % 36];
  var u = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return fetchWithAuth(SUPABASE_URL + "/rest/v1/invite_tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      application_id: e,
      email: t,
      token: c,
      business_name: n || "",
      contact_name: r || "",
      category: o || "",
      temp_password: a || null,
      expires_at: u
    })
  }).then(function (e) {
    if (e.ok) {
      if (e.status === 204) return null;
      return e.text().then(function (t) { return t ? JSON.parse(t) : null; }).catch(function () { return null; });
    }
    return e.text().then(function (txt) {
      var msg = "Failed to generate invite.";
      try {
        var err = JSON.parse(txt);
        if (err && err.message) msg += " (" + err.message + ")";
        else if (err && err.error_description) msg += " (" + err.error_description + ")";
      } catch (ex) {}
      return Promise.reject(new Error(msg));
    });
  }).then(function () {
    return c;
  });
}

function generateTempPassword() {
  var e = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%",
    t = new Uint8Array(12);
  window.crypto.getRandomValues(t);
  for (var n = "", r = 0; r < t.length; r++) n += e[t[r] % 67];
  return n;
}

function preCreateVendorUser(e, t, n) {
  return fetch(SUPABASE_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      apikey: e,
      Authorization: "Bearer " + e,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: t,
      password: n,
      email_confirm: !0,
      app_metadata: {
        role: "vendor_role"
      }
    })
  }).then(function (r) {
    if (r.status === 422 || r.status === 400) {
      // User already exists — find them by email and update their password to the new temp password
      return fetch(SUPABASE_URL + "/auth/v1/admin/users?email=" + encodeURIComponent(t), {
        headers: {
          apikey: e,
          Authorization: "Bearer " + e
        }
      }).then(function (res) {
        if (!res.ok) throw new Error("Failed to look up user by email.");
        return res.json();
      }).then(function (data) {
        var users = data.users || data || [];
        var targetUser = null;
        for (var i = 0; i < users.length; i++) {
          if ((users[i].email || "").toLowerCase() === t.toLowerCase()) {
            targetUser = users[i];
            break;
          }
        }
        if (!targetUser) {
          throw new Error("User exists but could not be located in Auth.");
        }
        // Update the password so it matches the new invite token
        return fetch(SUPABASE_URL + "/auth/v1/admin/users/" + encodeURIComponent(targetUser.id), {
          method: "PUT",
          headers: {
            apikey: e,
            Authorization: "Bearer " + e,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password: n,
            email_confirm: true,
            app_metadata: { role: "vendor_role" }
          })
        }).then(function (r2) {
          if (!r2.ok) throw new Error("Failed to update pre-existing user password.");
          return r2.text().then(function (txt) { return txt ? JSON.parse(txt) : null; }).catch(function () { return null; });
        });
      });
    }
    if (r.ok) {
      if (r.status === 204) return null;
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; }).catch(function () { return null; });
    }
    return r.text().then(function (txt) {
      var msg = "Failed to pre-create user.";
      try {
        var err = JSON.parse(txt);
        if (err && err.message) msg += " (" + err.message + ")";
        else if (err && err.msg) msg += " (" + err.msg + ")";
        else if (err && err.error_description) msg += " (" + err.error_description + ")";
      } catch (ex) {}
      return Promise.reject(new Error(msg));
    });
  });
}

function validateInviteToken(e) {
  return fetch(SUPABASE_URL + "/rest/v1/invite_tokens?token=eq." + encodeURIComponent(e) + "&used=eq.false&select=id,token,application_id,email,business_name,contact_name,category,temp_password,expires_at", {
    headers: anonHeaders()
  }).then(function (e) {
    return e.ok ? e.json() : Promise.reject(new Error("Failed to validate token."));
  }).then(function (e) {
    return e.length > 0 ? e[0] : null;
  });
}

function markTokenUsed(e) {
  return fetchWithAuth(SUPABASE_URL + "/rest/v1/rpc/mark_token_used", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token_id: e
    })
  }).then(function (e) {
    if (!e.ok) return Promise.reject(new Error("Failed to mark token used."));
    return e.text().then(function (txt) {
      return txt ? JSON.parse(txt) : null;
    }).catch(function () { return null; });
  });
}

function registerVendor(e, t, n, r) {
  return fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({
      email: n,
      password: r
    })
  }).then(function (e) {
    if (e.ok) return e.json();
    return e.text().then(function (txt) {
      var msg = "Account setup failed. Please ask the admin to regenerate your invite link.";
      try {
        var err = JSON.parse(txt);
        // 400 with invalid_grant = password mismatch (admin needs to regenerate invite)
        if (err && err.error === "invalid_grant") {
          msg = "Your invite link is no longer valid. Please ask the admin to send a new one.";
        } else if (err && err.error_description) {
          msg += " (" + err.error_description + ")";
        } else if (err && err.message) {
          msg += " (" + err.message + ")";
        }
      } catch (ex) {}
      return Promise.reject(new Error(msg));
    });
  }).then(function (r) {
    var o = decodeJWT(r.access_token);
    return setStoredSession({
      type: "vendor",
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      expires_at: o ? o.exp : null,
      user: r.user,
      role: o && o.app_metadata && o.app_metadata.role
    }), fetch(SUPABASE_URL + "/rest/v1/vendor_profiles", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + r.access_token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        auth_user_id: r.user.id,
        business_name: t.business_name,
        contact_name: t.contact_name,
        email: n,
        category: t.category,
        application_id: e
      })
    }).then(function (e) {
      // 201 = created (empty body), 200 = returned row — both are success
      // 409 = conflict (profile already exists) — treat as success
      if (e.ok || e.status === 409) {
        return e.text().then(function (txt) {
          return txt ? JSON.parse(txt) : null;
        }).catch(function () { return null; });
      }
      return e.text().then(function (txt) {
        var msg = "Failed to create vendor profile.";
        try {
          var err = JSON.parse(txt);
          if (err && err.message) msg += " (" + err.message + ")";
        } catch (ex) {}
        return Promise.reject(new Error(msg));
      });
    }).then(function () {
      return r;
    });
  });
}

function changeVendorPassword(e) {
  var t = getStoredSession().access_token || "";
  return fetch(SUPABASE_URL + "/auth/v1/user", {
    method: "PUT",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + t,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      password: e
    })
  }).then(function (e) {
    if (e.ok) {
      return e.text().then(function (txt) {
        return txt ? JSON.parse(txt) : null;
      }).catch(function () { return null; });
    }
    return e.text().then(function (txt) {
      var msg = "Failed to set password.";
      try {
        var err = JSON.parse(txt);
        if (err && err.message) msg += " (" + err.message + ")";
      } catch (ex) {}
      return Promise.reject(new Error(msg));
    });
  });
}

function getVendorUsers() {
  return fetchWithAuth(SUPABASE_URL + "/rest/v1/vendor_profiles?order=created_at.desc", {
    method: "GET"
  }).then(function (e) {
    return e.ok ? e.json() : Promise.reject(new Error("Failed to load vendors."));
  });
}

function getVendorById(e) {
  return fetchWithAuth(SUPABASE_URL + "/rest/v1/vendor_profiles?id=eq." + encodeURIComponent(e), {
    method: "GET"
  }).then(function (e) {
    return e.ok ? e.json() : Promise.reject(new Error("Failed to load vendor."));
  }).then(function (e) {
    return e.length > 0 ? e[0] : null;
  });
}

function getApplicationStats() {
  return getApplications().then(function (e) {
    return {
      total: e.length,
      pending: e.filter(function (e) {
        return "pending" === e.status;
      }).length,
      approved: e.filter(function (e) {
        return "approved" === e.status;
      }).length,
      rejected: e.filter(function (e) {
        return "rejected" === e.status;
      }).length
    };
  });
}

function deleteVendorAccount(e) {
  return fetchWithAuth(SUPABASE_URL + "/rest/v1/vendor_profiles?id=eq." + encodeURIComponent(e), {
    method: "DELETE"
  }).then(function (e) {
    return e.ok ? (clearSession(), !0) : Promise.reject(new Error("Failed to delete account."));
  });
}

function adminDeleteVendor(e) {
  var t = localStorage.getItem("wf_service_key") || sessionStorage.getItem("wf_service_key");
  return t ? fetch(SUPABASE_URL + "/auth/v1/admin/users/" + encodeURIComponent(e), {
    method: "DELETE",
    headers: {
      apikey: t,
      Authorization: "Bearer " + t
    }
  }).then(function (e) {
    return !e.ok && Promise.reject(new Error("Failed to delete vendor user."));
  }) : Promise.reject(new Error("Service key required. Enter it on the login page."));
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAGIC LINK CALLBACK HANDLER
   Parses Supabase Auth session from URL hash (magic link redirect) and
   redirects to the appropriate dashboard based on user role.
   ═══════════════════════════════════════════════════════════════════════════ */

function handleMagicLinkCallback() {
  var hash = window.location.hash;
  if (!hash || hash.indexOf('access_token') === -1) return false;

  var h = hash.charAt(0) === '#' ? hash.substring(1) : hash;
  var params = new URLSearchParams(h);
  var accessToken = params.get('access_token');
  var refreshToken = params.get('refresh_token');

  if (!accessToken) return false;

  try {
    var payload = JSON.parse(atob(accessToken.split('.')[1]));
    var role = payload && payload.app_metadata && payload.app_metadata.role;
    var session = {
      type: role === 'admin_role' ? 'admin' : role === 'vendor_role' ? 'vendor' : role === 'ticketing_role' ? 'ticketing' : null,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: payload ? payload.exp : null,
      user: { id: payload.sub, email: payload.email },
      role: role
    };

    setStoredSession(session);

    /* Clean the hash from the URL */
    window.history.replaceState({}, document.title, window.location.pathname);

    /* Redirect based on role */
    if (role === 'admin_role') {
      window.location.href = '/admin';
    } else if (role === 'vendor_role') {
      /* Fetch vendor profile to set session data */
      fetch(SUPABASE_URL + '/rest/v1/vendor_profiles?auth_user_id=eq.' + encodeURIComponent(payload.sub) + '&select=id,business_name,email,category,status,created_at', {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        }
      }).then(function(r) { return r.json(); }).then(function(profiles) {
        var profile = profiles && profiles.length > 0 ? profiles[0] : null;
        var s = getStoredSession();
        s.data = profile || {};
        setStoredSession(s);
        window.location.href = '/vendor-dashboard';
      }).catch(function() {
        window.location.href = '/vendor-dashboard';
      });
    } else if (role === 'ticketing_role') {
      window.location.href = '/admin-tickets';
    } else {
      /* Unknown role — likely a ticket customer. Save session for tickets.js and redirect to ticket dashboard */
      sessionStorage.setItem('wf_ticket_session', JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken
      }));
      window.location.href = '/tickets';
    }

    return true;
  } catch (e) {
    console.error('[vendor-auth] magic link parse error:', e);
    return false;
  }
}

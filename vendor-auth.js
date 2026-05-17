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
        type: "admin_role" === n ? "admin" : "vendor_role" === n ? "vendor" : null,
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
        category: e.category,
        message: e.message
      }
    })
  }).then(function (res) {
    if (!res.ok) {
      return res.json().then(function (err) {
        throw new Error(err.error || "Failed to submit application.");
      });
    }
    return res.json();
  });
}

function getApplications() {
  return fetch(SUPABASE_URL + "/rest/v1/vendor_applications?order=created_at.desc", {
    headers: authHeaders()
  }).then(function (e) {
    return e.ok ? e.json() : Promise.reject(new Error("Failed to load applications."));
  });
}

function updateApplicationStatus(e, t) {
  return fetch(SUPABASE_URL + "/rest/v1/vendor_applications?id=eq." + encodeURIComponent(e), {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({
      status: t
    })
  }).then(function (e) {
    if (e.ok) return e.json();
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
  var u = new Date(Date.now() + 6048e5).toISOString();
  return fetch(SUPABASE_URL + "/rest/v1/invite_tokens", {
    method: "POST",
    headers: authHeaders(),
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
    if (e.ok) return e.json();
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
  }).then(function (e) {
    if (e.status === 422 || e.status === 400) {
      return null; // Gracefully proceed if user already exists
    }
    if (e.ok) return e.json();
    return e.text().then(function (txt) {
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
  return fetch(SUPABASE_URL + "/rest/v1/rpc/mark_token_used", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      token_id: e
    })
  }).then(function (e) {
    return e.ok ? e.json() : Promise.reject(new Error("Failed to mark token used."));
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
    return e.ok ? e.json() : Promise.reject(new Error("Setup link expired. Contact the admin."));
  }).then(function (r) {
    var o = decodeJWT(r.access_token);
    return setStoredSession({
      type: "vendor",
      access_token: r.access_token,
      refresh_token: r.refresh_token,
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
      return e.ok ? e.json() : Promise.reject(new Error("Failed to create vendor profile."));
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
    return e.ok ? e.json() : Promise.reject(new Error("Failed to set password."));
  });
}

function getVendorUsers() {
  return fetch(SUPABASE_URL + "/rest/v1/vendor_profiles?order=created_at.desc", {
    headers: authHeaders()
  }).then(function (e) {
    return e.ok ? e.json() : Promise.reject(new Error("Failed to load vendors."));
  });
}

function getVendorById(e) {
  return fetch(SUPABASE_URL + "/rest/v1/vendor_profiles?id=eq." + encodeURIComponent(e), {
    headers: authHeaders()
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
  return fetch(SUPABASE_URL + "/rest/v1/vendor_profiles?id=eq." + encodeURIComponent(e), {
    method: "DELETE",
    headers: authHeaders()
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
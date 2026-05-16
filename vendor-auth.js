/* ============================================
   Vendor Auth — shared auth & localStorage logic
   ============================================ */

// ---------- Seed admin if not exists ----------
(function seed() {
  if (!localStorage.getItem('adminUsers')) {
    const admins = [
      { email: 'admin@walkingfish.gm', password: btoa('admin123') }
    ];
    localStorage.setItem('adminUsers', JSON.stringify(admins));
  }
})();

// ---------- Session ----------
function setSession(type, data) {
  sessionStorage.setItem('wf_session', JSON.stringify({ type: type || null, data: data || null }));
}
function clearSession() {
  sessionStorage.removeItem('wf_session');
}
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('wf_session')) || {}; } catch { return {}; }
}

// ---------- Application CRUD ----------
function getApplications() {
  try { return JSON.parse(localStorage.getItem('vendorApplications')) || []; } catch { return []; }
}
function saveApplications(apps) {
  localStorage.setItem('vendorApplications', JSON.stringify(apps));
}
function submitApplication(data) {
  const apps = getApplications();
  const app = {
    id: 'app_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    business: data.business,
    contactName: data.contactName,
    email: data.email,
    category: data.category,
    message: data.message,
    status: 'pending', // pending | approved | rejected
    createdAt: new Date().toISOString()
  };
  apps.push(app);
  saveApplications(apps);
  return app;
}
function updateApplicationStatus(appId, status) {
  const apps = getApplications();
  const app = apps.find(a => a.id === appId);
  if (app) { app.status = status; saveApplications(apps); }
  return app;
}

// ---------- Invite tokens ----------
function getInviteTokens() {
  try { return JSON.parse(localStorage.getItem('inviteTokens')) || []; } catch { return []; }
}
function saveInviteTokens(tokens) {
  localStorage.setItem('inviteTokens', JSON.stringify(tokens));
}
function generateInviteToken(applicationId, email) {
  const tokens = getInviteTokens();
  // Remove any existing tokens for this app
  const filtered = tokens.filter(t => t.applicationId !== applicationId);
  const token = {
    id: 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    applicationId: applicationId,
    email: email,
    used: false,
    createdAt: new Date().toISOString()
  };
  filtered.push(token);
  saveInviteTokens(filtered);
  return token;
}
function validateInviteToken(tokenId) {
  const tokens = getInviteTokens();
  return tokens.find(t => t.id === tokenId && !t.used) || null;
}
function markTokenUsed(tokenId) {
  const tokens = getInviteTokens();
  const token = tokens.find(t => t.id === tokenId);
  if (token) { token.used = true; saveInviteTokens(tokens); }
}

// ---------- Vendor users (approved + password set) ----------
function getVendorUsers() {
  try { return JSON.parse(localStorage.getItem('vendorUsers')) || []; } catch { return []; }
}
function saveVendorUsers(users) {
  localStorage.setItem('vendorUsers', JSON.stringify(users));
}
function registerVendor(applicationId, email, password) {
  const apps = getApplications();
  const app = apps.find(a => a.id === applicationId);
  if (!app) return null;

  const users = getVendorUsers();
  const vendor = {
    id: 'ven_' + Date.now().toString(36),
    business: app.business,
    email: email,
    password: btoa(password), // base64 for demo (no real backend)
    applicationId: applicationId,
    category: app.category,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  users.push(vendor);
  saveVendorUsers(users);
  return vendor;
}
function authenticateVendor(email, password) {
  const users = getVendorUsers();
  return users.find(u => u.email === email && u.password === btoa(password)) || null;
}
function authenticateAdmin(email, password) {
  try {
    const admins = JSON.parse(localStorage.getItem('adminUsers')) || [];
    return admins.find(a => a.email === email && a.password === btoa(password)) || null;
  } catch { return null; }
}
function getVendorById(id) {
  const users = getVendorUsers();
  return users.find(u => u.id === id) || null;
}

// ---------- Application counts ----------
function getApplicationStats() {
  const apps = getApplications();
  return {
    total: apps.length,
    pending: apps.filter(a => a.status === 'pending').length,
    approved: apps.filter(a => a.status === 'approved').length,
    rejected: apps.filter(a => a.status === 'rejected').length
  };
}

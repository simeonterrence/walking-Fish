// Admin photo management: loaded on admin.html only
// Service key is set via login form (sessionStorage) or falls back to a
// prompt. NEVER hardcode service_role keys in source files.
function getServiceKey() {
  return sessionStorage.getItem('wf_service_key') || prompt('Enter Supabase service role key (from Project Settings → API):');
}
const STORAGE_BUCKET = 'site-photos';

async function api(path, options) {
  var res = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + getServiceKey(), ...(options ? options.headers : {}) }
  });
  if (!res.ok) { var txt = await res.text(); throw new Error(txt); }
  if (res.status === 204) return;
  return res.json();
}

async function loadPhotos() {
  var list = document.getElementById('photo-list');
  list.innerHTML = '<p style="color:var(--muted);">Loading photos...</p>';
  try {
    var photos = await api('/rest/v1/site_images?order=section.asc,position.asc&select=*');
    if (!photos.length) { list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px;">No photos uploaded yet.</p>'; return; }
    var html = '', currentSection = '';
    photos.forEach(function(p) {
      var url = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + p.file_path;
      if (p.section !== currentSection) { currentSection = p.section; html += '<h3 style="margin:24px 0 12px;text-transform:capitalize;">' + p.section + '</h3><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">'; }
      html += '<div style="position:relative;border:1px solid var(--border);border-radius:8px;overflow:hidden;aspect-ratio:1;">' +
        '<img src="' + url + '" alt="' + p.alt_text + '" style="width:100%;height:100%;object-fit:cover;">' +
        '<button onclick="deletePhoto(\'' + p.id + '\')" style="position:absolute;top:4px;right:4px;background:#DC2626;color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;min-width:auto;min-height:auto;">&times;</button>' +
        '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:11px;padding:4px 8px;">' + p.position + '</div></div>';
    });
    list.innerHTML = html;
  } catch (e) { list.innerHTML = '<p style="color:#DC2626;">Failed to load photos: ' + e.message + '</p>'; }
}

async function uploadPhoto() {
  var file = document.getElementById('photo-file').files[0];
  if (!file) return alert('Select a photo first.');
  if (file.size > 10 * 1024 * 1024) return alert('File too large. Max size is 10MB.');
  var ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  if (!ALLOWED.includes(file.type)) return alert('File type not allowed. Use JPEG, PNG, or WebP.');
  var section = document.getElementById('photo-section').value;
  var position = parseInt(document.getElementById('photo-position').value) || 0;
  var alt = document.getElementById('photo-alt').value || file.name;
  var ext = file.name.split('.').pop();
  var fileName = section + '/' + Date.now() + '.' + ext;

  var btn = document.getElementById('upload-btn');
  btn.disabled = true; btn.textContent = 'Uploading...';

  try {
    // Upload to Storage
    var uploadRes = await fetch(SUPABASE_URL + '/storage/v1/object/' + STORAGE_BUCKET + '/' + fileName, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getServiceKey() },
      body: file
    });
    if (!uploadRes.ok) throw new Error('Upload failed: ' + (await uploadRes.text()));

    // Insert DB record
    await api('/rest/v1/site_images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ section: section, position: position, file_path: fileName, alt_text: alt })
    });

    document.getElementById('photo-form').reset();
    loadPhotos();
    alert('Photo uploaded!');
  } catch (e) { alert('Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Upload'; }
}

async function deletePhoto(id) {
  if (!confirm('Delete this photo?')) return;
  try {
    // Get file_path before deleting
    var photos = await api('/rest/v1/site_images?id=eq.' + id + '&select=file_path');
    if (photos.length) {
      var fp = photos[0].file_path;
      // Delete from storage
      await fetch(SUPABASE_URL + '/storage/v1/object/' + STORAGE_BUCKET + '/' + fp, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + getServiceKey() }
      });
    }
    // Delete DB record
    await api('/rest/v1/site_images?id=eq.' + id, { method: 'DELETE' });
    loadPhotos();
  } catch (e) { alert('Error: ' + e.message); }
}

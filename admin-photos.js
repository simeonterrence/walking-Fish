// ─────────────────────────────────────────────────────
// Admin Photo Management  —  admin-photos.js
// Features: collapsible section accordions, drag-and-drop
// reordering, inline editing, bulk upload, undo delete
// ─────────────────────────────────────────────────────

var STORAGE_BUCKET = 'site-photos';

// Get the JWT access token from the stored session
function getAccessToken() {
  try {
    var session = JSON.parse(sessionStorage.getItem('wf_session'));
    return session && session.access_token ? session.access_token : null;
  } catch (e) { return null; }
}

// Fallback: service key from localStorage (for backward compatibility)
function getServiceKey() {
  return localStorage.getItem('wf_service_key') || sessionStorage.getItem('wf_service_key') || null;
}

// ─── State ────────────────────────────────────────────
var _photos = [];             // cached photo records
var _dragId = null;           // photo id being dragged
var _deletedToast = null;     // { timer, ids, section } for undo

// ─── API helper ───────────────────────────────────────
async function api(path, options) {
  var method = (options && options.method) || 'GET';
  var headers = { apikey: SUPABASE_ANON_KEY };
  if (options && options.headers) Object.assign(headers, options.headers);

  // Prefer JWT session (works with RLS), fall back to service key
  var token = getAccessToken() || getServiceKey();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  var res = await fetch(SUPABASE_URL + path, Object.assign({}, options, { headers: headers }));
  if (!res.ok) { var txt = await res.text(); throw new Error(txt); }
  try { return await res.json(); } catch (e) { return; }
}

// ─── Load & Render ────────────────────────────────────
async function loadPhotos() {
  var list = document.getElementById('photo-list');
  list.innerHTML = '<div class="photo-skeleton"><div></div><div></div><div></div><div></div><div></div><div></div></div>';
  try {
    _photos = await api('/rest/v1/site_images?order=section.asc,position.asc&select=*');
    renderPhotos();
  } catch (e) {
    list.innerHTML = '<p style="color:#DC2626;">Failed to load photos: ' + e.message + '</p>';
  }
}

function renderPhotos() {
  var list = document.getElementById('photo-list');
  if (!_photos.length) {
    list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:60px 20px;">No photos uploaded yet. Switch to the <strong>Upload</strong> tab to add some.</p>';
    return;
  }

  // Group by section
  var groups = {};
  _photos.forEach(function(p) {
    if (!groups[p.section]) groups[p.section] = [];
    groups[p.section].push(p);
  });

  var sectionNames = Object.keys(groups).sort();
  var html = '';
  sectionNames.forEach(function(section) {
    var photos = groups[section];
    var isExpanded = localStorage.getItem('photo-section-' + section) !== 'collapsed';
    html += '<div class="photo-section' + (isExpanded ? '' : ' collapsed') + '" data-section-name="' + escapeHtml(section) + '">';
    html += '<button class="photo-section-header" onclick="togglePhotoSection(this)" aria-expanded="' + (isExpanded ? 'true' : 'false') + '">';
    html +=   '<span class="photo-section-title"><span class="section-icon"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span> ' + escapeHtml(section) + '</span>';
    html +=   '<span class="photo-section-count">' + photos.length + ' photo' + (photos.length !== 1 ? 's' : '') + '</span>';
    html += '</button>';
    html += '<div class="photo-section-body"' + (isExpanded ? '' : ' style="display:none;"') + '>';
    html +=   '<div class="photo-grid" data-section="' + escapeHtml(section) + '">';
    photos.forEach(function(p, i) {
      html += renderPhotoItem(p, i);
    });
    html +=   '</div></div></div>';
  });
  list.innerHTML = html;
}

function renderPhotoItem(p, idx) {
  var url = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + p.file_path;
  return '<div class="photo-grid-item" draggable="true" data-photo-id="' + p.id + '" data-section="' + escapeHtml(p.section) + '" data-pos="' + p.position + '" data-idx="' + idx + '">' +
    '<div class="photo-drag-handle" title="Drag to reorder"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/></svg></div>' +
    '<img src="' + url + '" alt="' + escapeHtml(p.alt_text || '') + '" loading="lazy">' +
    '<div class="photo-item-overlay">' +
      '<button class="photo-item-edit" data-id="' + p.id + '" title="Edit details"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>' +
      '<button class="photo-item-del" data-id="' + p.id + '" title="Delete photo"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
    '</div>' +
    '<div class="photo-item-footer">' +
      '<span class="photo-pos-badge">#' + p.position + '</span>' +
      '<span class="photo-alt-text">' + escapeHtml(truncate(p.alt_text || 'no alt', 18)) + '</span>' +
    '</div>' +
  '</div>';
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function escapeHtml(str) {
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

// ─── Section Accordion ────────────────────────────────
function togglePhotoSection(header) {
  var section = header.closest('.photo-section');
  var body = section.querySelector('.photo-section-body');
  var isCollapsed = section.classList.toggle('collapsed');
  body.style.display = isCollapsed ? 'none' : '';
  header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  // Use data-section-name attribute (not textContent) to avoid Unicode issues
  var sectionName = section.getAttribute('data-section-name');
  if (sectionName) {
    localStorage.setItem('photo-section-' + sectionName, isCollapsed ? 'collapsed' : 'expanded');
  }
}

// ─── Drag & Drop Reorder ──────────────────────────────
document.addEventListener('dragstart', function(e) {
  var item = e.target.closest('.photo-grid-item');
  if (!item) return;
  _dragId = item.getAttribute('data-photo-id');
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _dragId);
});

document.addEventListener('dragend', function(e) {
  var item = e.target.closest('.photo-grid-item');
  if (item) item.classList.remove('dragging');
  document.querySelectorAll('.photo-grid-item.drag-over').forEach(function(el) {
    el.classList.remove('drag-over');
  });
  _dragId = null;
});

document.addEventListener('dragover', function(e) {
  var dropItem = e.target.closest('.photo-grid-item');
  if (!dropItem || !_dragId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.photo-grid-item.drag-over').forEach(function(el) {
    el.classList.remove('drag-over');
  });
  dropItem.classList.add('drag-over');
});

document.addEventListener('drop', function(e) {
  e.preventDefault();
  var dropItem = e.target.closest('.photo-grid-item');
  if (!dropItem || !_dragId) return;
  dropItem.classList.remove('drag-over');

  var dragId = _dragId;
  if (dragId === dropItem.getAttribute('data-photo-id')) return;

  // Get the grid
  var grid = dropItem.closest('.photo-grid');
  if (!grid) return;
  var items = Array.from(grid.querySelectorAll('.photo-grid-item'));
  var dragEl = grid.querySelector('[data-photo-id="' + dragId + '"]');
  if (!dragEl) return;

  // Reorder DOM
  var dropIndex = items.indexOf(dropItem);
  var dragIndex = items.indexOf(dragEl);
  if (dragIndex < dropIndex) {
    dropItem.parentNode.insertBefore(dragEl, dropItem.nextSibling);
  } else {
    dropItem.parentNode.insertBefore(dragEl, dropItem);
  }

  // Update positions in DB
  var updatedItems = Array.from(grid.querySelectorAll('.photo-grid-item'));
  var section = grid.getAttribute('data-section');
  var promises = [];
  updatedItems.forEach(function(el, i) {
    var id = el.getAttribute('data-photo-id');
    var newPos = i + 1;
    el.setAttribute('data-pos', newPos);
    promises.push(
      api('/rest/v1/site_images?id=eq.' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ position: newPos })
      }).catch(function() {})
    );
    // Update local cache
    var photo = _photos.find(function(p) { return p.id === id; });
    if (photo) photo.position = newPos;
  });

  Promise.all(promises).then(function() {
    showToast('Positions updated for ' + section, 'success');
  });
});

// ─── Inline Edit Modal ────────────────────────────────
document.addEventListener('click', function(e) {
  var editBtn = e.target.closest('.photo-item-edit');
  if (editBtn) {
    var id = editBtn.getAttribute('data-id');
    showEditModal(id);
    return;
  }

  var delBtn = e.target.closest('.photo-item-del');
  if (delBtn) {
    var id = delBtn.getAttribute('data-id');
    deletePhoto(id);
    return;
  }

  // Lightbox: click on thumbnail image (not drag handle, not overlay buttons)
  var img = e.target.closest('.photo-grid-item img');
  if (img && !e.target.closest('.photo-drag-handle') && !e.target.closest('.photo-item-overlay')) {
    var item = img.closest('.photo-grid-item');
    if (item) openLightbox(item.getAttribute('data-photo-id'));
    return;
  }
});

// ─── Lightbox ──────────────────────────────────────────
var _lightboxPhotos = [];

function openLightbox(id) {
  // Find photos in the same section as the clicked photo
  var photo = _photos.find(function(p) { return p.id === id; });
  if (!photo) return;
  _lightboxPhotos = _photos.filter(function(p) { return p.section === photo.section; }).sort(function(a, b) { return a.position - b.position; });
  var overlay = document.getElementById('photo-lightbox');
  if (!overlay) return;
  overlay.setAttribute('data-current-id', id);
  updateLightboxImage();
  overlay.classList.add('open');
  document.addEventListener('keydown', lightboxKeydown);
}

function closeLightbox() {
  var overlay = document.getElementById('photo-lightbox');
  if (overlay) overlay.classList.remove('open');
  _lightboxPhotos = [];
  document.removeEventListener('keydown', lightboxKeydown);
}

function navigateLightbox(dir) {
  var overlay = document.getElementById('photo-lightbox');
  if (!overlay || !_lightboxPhotos.length) return;
  var currentId = overlay.getAttribute('data-current-id');
  var _ids = _lightboxPhotos.map(function(p) { return p.id; });
  var idx = _ids.indexOf(currentId);
  if (idx === -1) return;
  var newIdx = (idx + dir + _lightboxPhotos.length) % _lightboxPhotos.length;
  overlay.setAttribute('data-current-id', _lightboxPhotos[newIdx].id);
  updateLightboxImage();
}

function updateLightboxImage() {
  var overlay = document.getElementById('photo-lightbox');
  if (!overlay || !_lightboxPhotos.length) return;
  var currentId = overlay.getAttribute('data-current-id');
  var photo = _lightboxPhotos.find(function(p) { return p.id === currentId; });
  if (!photo) return;
  var imgEl = document.getElementById('photo-lightbox-img');
  var infoEl = document.getElementById('photo-lightbox-info');
  imgEl.src = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + photo.file_path;
  imgEl.alt = photo.alt_text || '';
  var idx = _lightboxPhotos.indexOf(photo);
  infoEl.textContent = (photo.alt_text || 'no alt') + '  —  ' + photo.section + ' #' + photo.position + '  (' + (idx + 1) + '/' + _lightboxPhotos.length + ')';
}

function lightboxKeydown(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
}

function showEditModal(id) {
  var photo = _photos.find(function(p) { return p.id === id; });
  if (!photo) return;
  var overlay = document.getElementById('photo-edit-overlay');
  if (!overlay) return;
  overlay.setAttribute('data-id', id);
  document.getElementById('edit-section').value = photo.section;
  document.getElementById('edit-position').value = photo.position;
  document.getElementById('edit-alt').value = photo.alt_text || '';
  document.getElementById('edit-preview').innerHTML =
    '<img src="' + SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + photo.file_path + '" alt="">';
  document.getElementById('edit-file-name').textContent = 'Current: ' + photo.file_path.split('/').pop();
  overlay.classList.add('open');
}

function closeEditModal() {
  var overlay = document.getElementById('photo-edit-overlay');
  if (overlay) overlay.classList.remove('open');
}

async function saveEdit() {
  var overlay = document.getElementById('photo-edit-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  var id = overlay.getAttribute('data-id');
  var section = document.getElementById('edit-section').value;
  var position = parseInt(document.getElementById('edit-position').value) || 0;
  var alt = document.getElementById('edit-alt').value || '';
  var btn = document.getElementById('edit-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await api('/rest/v1/site_images?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ section: section, position: position, alt_text: alt })
    });
    overlay.classList.remove('open');
    showToast('Photo updated', 'success');
    loadPhotos();
  } catch (e) {
    alert('Error: ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = 'Save';
}

// ─── Delete with Undo ─────────────────────────────────
function deletePhoto(id) {
  var item = document.querySelector('.photo-grid-item[data-photo-id="' + id + '"]');
  if (item) {
    item.style.opacity = '0.3';
    item.style.pointerEvents = 'none';
  }
  showUndoToast(id);
}

function showUndoToast(deleteId) {
  // Cancel previous pending undo
  if (_deletedToast) {
    clearTimeout(_deletedToast.timer);
    // If previous photos haven't been confirmed, merge them
    if (_deletedToast.ids.length) {
      _deletedToast.ids.push(deleteId);
      // Reset timer
      _deletedToast.timer = setTimeout(function() {
        confirmDelete(_deletedToast.ids);
        _deletedToast = null;
      }, 8000);
      updateUndoToastUI(_deletedToast);
      return;
    }
  }

  var ids = [deleteId];
  _deletedToast = {
    ids: ids,
    timer: setTimeout(function() {
      confirmDelete(ids);
      _deletedToast = null;
    }, 8000)
  };

  showUndoToastUI(ids);
}

function showUndoToastUI(ids) {
  var existing = document.getElementById('photo-undo-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'photo-undo-toast';
  toast.className = 'photo-undo-toast';
  toast.innerHTML = '<span class="undo-toast-msg">Photo' + (ids.length > 1 ? 's' : '') + ' will be deleted <strong>soon</strong></span>' +
    '<button class="undo-toast-btn" onclick="undoDelete()">Undo</button>' +
    '<button class="undo-toast-close" onclick="cancelUndoToast()"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
  document.body.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(function() {
    toast.classList.add('open');
  });
}

function updateUndoToastUI(toastState) {
  var toast = document.getElementById('photo-undo-toast');
  if (toast) {
    var msg = toast.querySelector('.undo-toast-msg');
    if (msg) {
      msg.innerHTML = 'Photo' + (toastState.ids.length > 1 ? 's' : '') + ' will be deleted <strong>soon</strong>';
    }
  }
}

function cancelUndoToast() {
  if (_deletedToast) {
    clearTimeout(_deletedToast.timer);
    _deletedToast = null;
  }
  var toast = document.getElementById('photo-undo-toast');
  if (toast) toast.remove();
  // Restore items
  document.querySelectorAll('.photo-grid-item[style*="opacity: 0.3"]').forEach(function(el) {
    el.style.opacity = '';
    el.style.pointerEvents = '';
  });
}

function undoDelete() {
  if (_deletedToast) {
    clearTimeout(_deletedToast.timer);
    var ids = _deletedToast.ids;
    _deletedToast = null;
    // Restore items
    ids.forEach(function(id) {
      var item = document.querySelector('.photo-grid-item[data-photo-id="' + id + '"]');
      if (item) {
        item.style.opacity = '';
        item.style.pointerEvents = '';
      }
    });
    showToast('Delete cancelled', 'success');
  }
  var toast = document.getElementById('photo-undo-toast');
  if (toast) toast.remove();
}

async function confirmDelete(ids) {
  var toast = document.getElementById('photo-undo-toast');
  if (toast) toast.remove();
  try {
    var token = getAccessToken() || getServiceKey();
    if (!token) throw new Error('Not authenticated. Please sign in as admin.');

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var photo = _photos.find(function(p) { return p.id === id; });
      if (photo) {
        // Delete from storage
        await fetch(SUPABASE_URL + '/storage/v1/object/' + STORAGE_BUCKET + '/' + photo.file_path, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token }
        }).catch(function() {});
        // Delete DB record
        await api('/rest/v1/site_images?id=eq.' + id, { method: 'DELETE' });
      }
    }
    showToast('Deleted ' + ids.length + ' photo' + (ids.length > 1 ? 's' : ''), 'success');
    loadPhotos();
  } catch (e) {
    showToast('Error deleting: ' + e.message, 'error');
    loadPhotos();
  }
}

// ─── Toast system (for undo + status messages) ────────
function showToast(msg, type) {
  var existing = document.querySelector('.photo-action-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.className = 'photo-action-toast ' + (type || '');
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(function() {
    toast.classList.add('open');
  });
  setTimeout(function() {
    toast.classList.remove('open');
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
  }, 3000);
}

// ─── Upload (single + bulk) ───────────────────────────
async function uploadPhoto() {
  var files = document.getElementById('photo-file').files;
  if (!files || !files.length) return alert('Select at least one photo first.');
  var section = document.getElementById('photo-section').value;
  var startPos = parseInt(document.getElementById('photo-position').value) || 0;

  // Validate each file
  var ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  for (var i = 0; i < files.length; i++) {
    if (files[i].size > 10 * 1024 * 1024) return alert('"' + files[i].name + '" is too large. Max 10MB.');
    if (!ALLOWED.includes(files[i].type)) return alert('"' + files[i].name + '" is not allowed. Use JPEG, PNG, or WebP.');
  }

  var btn = document.getElementById('upload-btn');
  btn.disabled = true;
  btn.textContent = files.length > 1 ? 'Uploading 0/' + files.length + '…' : 'Uploading…';
  var allAltTexts = document.getElementById('photo-alt').value;

  // Get current max position for this section (to auto-increment if position is 0)
  if (startPos === 0) {
    var sectionPhotos = _photos.filter(function(p) { return p.section === section; });
    if (sectionPhotos.length) {
      startPos = Math.max.apply(Math, sectionPhotos.map(function(p) { return p.position; })) + 1;
    } else {
      startPos = 1;
    }
  }

  try {
    var token = getAccessToken() || getServiceKey();
    if (!token) throw new Error('Not authenticated. Please sign in as admin.');

    var uploaded = 0;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var alt = allAltTexts || file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      var ext = file.name.split('.').pop();
      var fileName = section + '/' + Date.now() + '-' + i + '.' + ext;

      // Upload to Storage
      var uploadRes = await fetch(SUPABASE_URL + '/storage/v1/object/' + STORAGE_BUCKET + '/' + fileName, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: file
      });
      if (!uploadRes.ok) throw new Error('Failed to upload ' + file.name + ': ' + (await uploadRes.text()));

      // Insert DB record
      await api('/rest/v1/site_images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ section: section, position: startPos + i, file_path: fileName, alt_text: alt })
      });
      uploaded++;

      if (files.length > 1) {
        btn.textContent = 'Uploading ' + uploaded + '/' + files.length + '…';
      }
    }

    document.getElementById('photo-file').value = '';
    document.getElementById('photo-position').value = '0';
    document.getElementById('photo-alt').value = '';
    loadPhotos();
    var msg = uploaded > 1 ? uploaded + ' photos uploaded to ' + section : 'Photo uploaded';
    showToast(msg, 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = files.length > 1 ? 'Upload All' : 'Upload';
}

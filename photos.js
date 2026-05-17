// photos.js: fetches site photos from Supabase and displays them on public pages
(function() {
  var CONTAINER_SELECTOR = '[data-photos]';
  var containers = document.querySelectorAll(CONTAINER_SELECTOR);
  if (!containers.length) return;

  var ANON_HEADERS = { apikey: SUPABASE_ANON_KEY };

  containers.forEach(function(container) {
    var section = container.getAttribute('data-photos');
    if (!section) return;

    fetch(SUPABASE_URL + '/rest/v1/site_images?section=eq.' + section + '&order=position.asc&select=file_path,alt_text,position', {
      headers: ANON_HEADERS
    })
    .then(function(r) {
      if (!r.ok) throw new Error('Failed to load');
      return r.json();
    })
    .then(function(photos) {
      if (!photos.length) return;
      var items = container.querySelectorAll('.gallery-item, .partner-logo');
      photos.forEach(function(photo, i) {
        if (i >= items.length) return;
        var item = items[i];
        var url = SUPABASE_URL + '/storage/v1/object/public/site-photos/' + photo.file_path;
        // Replace placeholder text with image
        item.innerHTML = '<img src="' + url + '" alt="' + (photo.alt_text || '') + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;">';
        item.style.background = 'none';
      });
    })
    .catch(function() { /* silently keep placeholders */ });
  });
})();

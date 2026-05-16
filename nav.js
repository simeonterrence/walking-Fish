document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function() {
      var open = links.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', function(e) {
      if (e.target.tagName === 'A' && window.innerWidth < 769) {
        links.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
  var page = window.location.pathname.split('/').pop().replace(/\.html$/, '') || '/';
  document.querySelectorAll('nav .nav-links a').forEach(function(a) {
    if (a.getAttribute('href') === page) a.setAttribute('aria-current', 'page');
  });
});

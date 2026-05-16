document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  var menuToggle = document.querySelector('#menu-toggle');

  function toggleMenu(forceState) {
    if (!links) return;
    var open = typeof forceState === 'boolean' ? forceState : links.classList.toggle('nav-open');
    
    if (menuToggle) {
      menuToggle.classList.toggle('active', open);
      menuToggle.setAttribute('aria-expanded', String(open));
    }
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
    }
    
    // Accessibility: prevent scrolling when menu is open
    document.body.style.overflow = open ? 'hidden' : '';
  }

  if (menuToggle && links) {
    menuToggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });
  }

  if (toggle && links) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });
  }

  // Close menu when clicking outside or on a link
  document.addEventListener('click', function(e) {
    if (links && links.classList.contains('nav-open')) {
      if (!links.contains(e.target) && !menuToggle?.contains(e.target) && !toggle?.contains(e.target)) {
        toggleMenu(false);
      }
    }
  });

  if (links) {
    links.addEventListener('click', function(e) {
      if (e.target.tagName === 'A') {
        toggleMenu(false);
      }
    });
  }

  // Reveal sections with entrance animation
  document.querySelectorAll('.section-reveal').forEach(function(el) {
    el.classList.add('revealed');
  });

  // Active state for top nav
  var path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === '/') path = 'index.html';
  
  document.querySelectorAll('.nav-links a').forEach(function(a) {
    var href = a.getAttribute('href');
    if (href === path || (path === 'index.html' && href === '/')) {
      a.setAttribute('aria-current', 'page');
    }
  });
});

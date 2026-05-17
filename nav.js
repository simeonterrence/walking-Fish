document.addEventListener("DOMContentLoaded", function() {
  var toggleBtn = document.querySelector(".nav-toggle");
  var navLinks = document.querySelector(".nav-links");
  var menuToggle = document.querySelector("#menu-toggle");

  function toggleMenu(forceState) {
    if (navLinks) {
      var isOpen = typeof forceState === "boolean" ? forceState : navLinks.classList.toggle("nav-open");
      if (menuToggle) {
        menuToggle.classList.toggle("active", isOpen);
        menuToggle.setAttribute("aria-expanded", String(isOpen));
      }
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-expanded", String(isOpen));
      }
      document.body.style.overflow = isOpen ? "hidden" : "";
    }
  }

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });
  }

  if (toggleBtn && navLinks) {
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });
  }

  document.addEventListener("click", function(e) {
    if (navLinks && navLinks.classList.contains("nav-open")) {
      if (!navLinks.contains(e.target) && 
          (!menuToggle || !menuToggle.contains(e.target)) && 
          (!toggleBtn || !toggleBtn.contains(e.target))) {
        toggleMenu(false);
      }
    }
  });

  if (navLinks) {
    navLinks.addEventListener("click", function(e) {
      if (e.target.tagName === "A") {
        toggleMenu(false);
      }
    });
  }

  document.querySelectorAll(".section-reveal").forEach(function(el) {
    el.classList.add("revealed");
  });

  var currentPath = window.location.pathname;
  document.querySelectorAll(".nav-links a").forEach(function(link) {
    var href = link.getAttribute("href");
    if (href === currentPath) {
      link.setAttribute("aria-current", "page");
    }
  });

  // Dynamic Auth State & Header/Navbar Cleanups
  var session = null;
  try {
    session = JSON.parse(sessionStorage.getItem("wf_session"));
  } catch (err) {}

  var isDashboard = currentPath.indexOf("/admin") !== -1 || currentPath.indexOf("/vendor-dashboard") !== -1;

  if (isDashboard) {
    // 1. Inside dashboard pages: clean up the workspace by hiding marketing/public links
    if (navLinks) {
      var publicLinks = navLinks.querySelectorAll("a:not(.nav-cta), details");
      publicLinks.forEach(function(link) {
        link.style.display = "none";
      });
      var cta = navLinks.querySelector(".nav-cta");
      if (cta) {
        cta.style.display = "none"; // Dashboards have their own Sign Out controls
      }
    }
    // Hide mobile burger toggles and bottom consumer tabs in the back-office views
    if (toggleBtn) {
      toggleBtn.style.display = "none";
    }
    var bottomTabs = document.querySelector(".bottom-tabs");
    if (bottomTabs) {
      bottomTabs.style.display = "none";
    }
  } else if (session && session.type) {
    // 2. On public pages, if a user is logged in, dynamically change "Sign In" to "Dashboard" / "Admin Panel"
    var cta = document.querySelector(".nav-links .nav-cta");
    if (cta) {
      if (session.type === "admin") {
        cta.textContent = "Admin Panel";
        cta.setAttribute("href", "/admin");
        cta.setAttribute("aria-label", "Go to admin panel");
      } else if (session.type === "vendor") {
        cta.textContent = "Dashboard";
        cta.setAttribute("href", "/vendor-dashboard");
        cta.setAttribute("aria-label", "Go to vendor dashboard");
      }
    }
  }
});
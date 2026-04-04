/**
 * KayeArnold Portfolio — main.js
 * Handles: theme toggle, mobile navigation, active link tracking.
 */

/* ================================================================
   THEME TOGGLE
   Persists the user's choice to localStorage.
   Defaults to "dark" on first visit.
================================================================ */
const HTML      = document.documentElement;
const toggleBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

/**
 * Apply a theme class to <html> and update the toggle icon + aria-label.
 * @param {'dark'|'light'} t
 */
function applyTheme(t) {
  HTML.classList.remove('dark', 'light');
  HTML.classList.add(t);

  const isDark = t === 'dark';
  themeIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
  toggleBtn.setAttribute(
    'aria-label',
    isDark ? 'Switch to light theme' : 'Switch to dark theme'
  );

  try { localStorage.setItem('ka-theme', t); } catch (_) { /* private browsing */ }
}

// Restore saved preference or fall back to dark
(function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('ka-theme') || 'dark'; } catch (_) {}
  applyTheme(saved);
})();

// Toggle on button click
toggleBtn.addEventListener('click', () =>
  applyTheme(HTML.classList.contains('dark') ? 'light' : 'dark')
);

/* ================================================================
   MOBILE NAVIGATION
   Hamburger → ✕ animation, drawer open/close,
   closes on: outside click, Escape key, link tap, resize.
================================================================ */
const hamburger = document.getElementById('hamburger');
const drawer    = document.getElementById('mobile-drawer');
let   navOpen   = false;

function openMenu() {
  navOpen = true;
  hamburger.classList.add('open');
  hamburger.setAttribute('aria-expanded', 'true');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.addEventListener('keydown', onEsc);
}

function closeMenu() {
  navOpen = false;
  hamburger.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', onEsc);
}

/** Expose closeMenu globally so inline onclick="closeMenu()" in HTML works. */
window.closeMenu = closeMenu;

function onEsc(e) {
  if (e.key === 'Escape') closeMenu();
}

hamburger.addEventListener('click', () => navOpen ? closeMenu() : openMenu());

// Close when user clicks anywhere outside the nav/drawer
document.addEventListener('click', (e) => {
  if (navOpen && !hamburger.contains(e.target) && !drawer.contains(e.target)) {
    closeMenu();
  }
});

// Close when viewport expands past mobile breakpoint
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768 && navOpen) closeMenu();
});

/* ================================================================
   ACTIVE NAV LINK — Intersection Observer
   Updates both desktop and mobile links as sections scroll into view.
================================================================ */
const sections = document.querySelectorAll('section[id]');
const dLinks   = document.querySelectorAll('.nav-link');
const mLinks   = document.querySelectorAll('.mob-link');

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const targetHref = '#' + entry.target.id;
      [...dLinks, ...mLinks].forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === targetHref);
      });
    }
  });
}, { rootMargin: '-35% 0px -60% 0px' });

sections.forEach((s) => sectionObserver.observe(s));

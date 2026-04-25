(function () {
  var KEY = "site_theme_mode";
  var root = document.documentElement;
  /** Page chrome — must match styles.css :root / [data-theme="dark"] --bg */
  var BG_PAGE_LIGHT = "#f5f5f4";
  var BG_PAGE_DARK = "#09090b";

  function pageBackground(mode) {
    return mode === "dark" ? BG_PAGE_DARK : BG_PAGE_LIGHT;
  }

  function syncThemeColorMeta(mode) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", pageBackground(mode));
  }

  function applyTheme(mode) {
    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    root.style.backgroundColor = pageBackground(mode);
    syncThemeColorMeta(mode);
  }

  function getSavedTheme() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function saveTheme(mode) {
    try {
      localStorage.setItem(KEY, mode);
    } catch (e) {}
  }

  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  var SUN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var MOON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function updateToggleState(btn, mode) {
    var dark = mode === "dark";
    btn.classList.toggle("theme-toggle--dark", dark);
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", dark ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      dark ? "Switch to light mode" : "Switch to dark mode"
    );
    btn.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
  }

  function mountToggle() {
    if (document.querySelector(".theme-toggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.innerHTML =
      '<span class="theme-toggle__icon theme-toggle__icon--sun" aria-hidden="true">' +
      SUN_SVG +
      "</span>" +
      '<span class="theme-toggle__icon theme-toggle__icon--moon" aria-hidden="true">' +
      MOON_SVG +
      "</span>";
    var mode = currentTheme();
    updateToggleState(btn, mode);
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
      updateToggleState(btn, next);
    });
    document.body.appendChild(btn);
  }

  function refreshToggleLabel() {
    var btn = document.querySelector(".theme-toggle");
    if (btn) updateToggleState(btn, currentTheme());
  }

  function initialMode() {
    return getSavedTheme() === "dark" ? "dark" : "light";
  }

  applyTheme(initialMode());

  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    var mode = e.newValue === "dark" ? "dark" : "light";
    applyTheme(mode);
    refreshToggleLabel();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      applyTheme(initialMode());
      mountToggle();
    });
  } else {
    applyTheme(initialMode());
    mountToggle();
  }
})();

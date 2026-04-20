(function () {
  var KEY = "site_theme_mode";
  var root = document.documentElement;
  /** Default app shell (admin / portal) — must match styles.css --bg */
  var BG_PAGE_LIGHT = "#f5f6f8";
  var BG_PAGE_DARK = "#0f1115";
  /** Resin marketing homepage (index) — must match resin.css --rh-bg light/dark */
  var RESIN_BG_LIGHT = "#e8e4dc";
  var RESIN_BG_DARK = "#171511";

  function isResinMarketing() {
    return root.getAttribute("data-marketing") === "resin";
  }

  function pageBackground(mode) {
    var dark = mode === "dark";
    if (isResinMarketing()) {
      return dark ? RESIN_BG_DARK : RESIN_BG_LIGHT;
    }
    return dark ? BG_PAGE_DARK : BG_PAGE_LIGHT;
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

  function updateLabel(btn, mode) {
    btn.textContent = mode === "dark" ? "Dark" : "Light";
    btn.setAttribute(
      "aria-label",
      mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
    btn.setAttribute("title", mode === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }

  function mountToggle() {
    if (document.querySelector(".theme-toggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    var mode = currentTheme();
    updateLabel(btn, mode);
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
      updateLabel(btn, next);
    });
    document.body.appendChild(btn);
  }

  function refreshToggleLabel() {
    var btn = document.querySelector(".theme-toggle");
    if (btn) updateLabel(btn, currentTheme());
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

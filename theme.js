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

  function applyTheme(mode) {
    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    root.style.backgroundColor = pageBackground(mode);
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

  applyTheme(getSavedTheme() === "dark" ? "dark" : "light");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      applyTheme(getSavedTheme() === "dark" ? "dark" : "light");
      mountToggle();
    });
  } else {
    applyTheme(getSavedTheme() === "dark" ? "dark" : "light");
    mountToggle();
  }
})();

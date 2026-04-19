(function () {
  var KEY = "site_theme_mode";
  var root = document.documentElement;

  function applyTheme(mode) {
    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
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
    document.addEventListener("DOMContentLoaded", mountToggle);
  } else {
    mountToggle();
  }
})();

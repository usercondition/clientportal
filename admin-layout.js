(function () {
  var root = document.documentElement;
  var openBtn = document.getElementById("admin-drawer-open");
  var backdrop = document.getElementById("admin-drawer-backdrop");
  var sidebar = document.getElementById("admin-sidebar");

  function setOpen(on) {
    document.body.classList.toggle("admin-app--nav-open", on);
    if (openBtn) openBtn.setAttribute("aria-expanded", on ? "true" : "false");
    if (backdrop) backdrop.hidden = !on;
    if (on) {
      root.style.overflow = "hidden";
    } else {
      root.style.overflow = "";
    }
  }

  function toggle() {
    setOpen(!document.body.classList.contains("admin-app--nav-open"));
  }

  if (openBtn) {
    openBtn.addEventListener("click", function () {
      toggle();
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("admin-app--nav-open")) {
      setOpen(false);
    }
  });

  window.addEventListener(
    "resize",
    function () {
      if (window.matchMedia("(min-width: 901px)").matches) {
        setOpen(false);
      }
    },
    { passive: true }
  );

  if (sidebar) {
    sidebar.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var link = t.closest("a.admin-nav-item");
      if (link && window.matchMedia("(max-width: 900px)").matches) {
        setOpen(false);
      }
    });
  }
})();

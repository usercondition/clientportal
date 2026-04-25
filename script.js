(function () {
  var nav = document.getElementById("site-nav");
  var toggle = document.querySelector(".nav-toggle");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  if (!nav || !toggle) return;

  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var onIndex = page === "" || page === "index.html";
  var baseIndex = onIndex ? "" : "index.html";
  var hash = String(location.hash || "").toLowerCase();

  var menu = [
    { label: "Home", href: "index.html", match: ["index.html"] },
    {
      label: "Shop",
      href: "shop.html",
      match: ["shop.html", "dm-stash.html", "shop-checkout.html"],
      children: [
        { label: "All Catalog", href: "shop.html", match: ["shop.html"] },
        { label: "DM Stash", href: "dm-stash.html", match: ["dm-stash.html"] },
        { label: "Checkout", href: "shop-checkout.html", match: ["shop-checkout.html"] },
      ],
    },
    {
      label: "Custom Jobs",
      href: baseIndex + "#services",
      sectionMatch: ["#gallery", "#services", "#process", "#quality"],
      children: [
        { label: "Featured Work", href: baseIndex + "#gallery", sectionMatch: ["#gallery"] },
        { label: "Services", href: baseIndex + "#services", sectionMatch: ["#services"] },
        { label: "Process", href: baseIndex + "#process", sectionMatch: ["#process"] },
        { label: "Quality", href: baseIndex + "#quality", sectionMatch: ["#quality"] },
      ],
    },
    { label: "Contact", href: baseIndex + "#contact", sectionMatch: ["#contact"] },
  ];

  function itemIsActive(item) {
    var fileMatch = Array.isArray(item.match) && item.match.indexOf(page) >= 0;
    var hashMatch = onIndex && Array.isArray(item.sectionMatch) && item.sectionMatch.indexOf(hash) >= 0;
    if (fileMatch || hashMatch) return true;
    if (!Array.isArray(item.children)) return false;
    return item.children.some(function (c) {
      var cf = Array.isArray(c.match) && c.match.indexOf(page) >= 0;
      var ch = onIndex && Array.isArray(c.sectionMatch) && c.sectionMatch.indexOf(hash) >= 0;
      return cf || ch;
    });
  }

  function renderMenu() {
    var ul = document.createElement("ul");
    ul.className = "nav-list";

    menu.forEach(function (item, idx) {
      var li = document.createElement("li");
      li.className = "nav-item";
      var active = itemIsActive(item);
      if (active) li.classList.add("is-active");

      var main = document.createElement("a");
      main.href = item.href;
      main.textContent = item.label;
      main.className = "nav-link";
      if (active) main.setAttribute("aria-current", "page");
      li.appendChild(main);

      if (Array.isArray(item.children) && item.children.length) {
        li.classList.add("nav-item--has-sub");
        var subId = "nav-sub-" + idx;
        var subToggle = document.createElement("button");
        subToggle.type = "button";
        subToggle.className = "nav-subtoggle";
        subToggle.setAttribute("aria-expanded", active ? "true" : "false");
        subToggle.setAttribute("aria-controls", subId);
        subToggle.setAttribute("aria-label", "Toggle " + item.label + " submenu");
        subToggle.textContent = "+";
        li.appendChild(subToggle);

        var sub = document.createElement("ul");
        sub.className = "nav-submenu";
        sub.id = subId;
        if (!active) sub.hidden = true;

        item.children.forEach(function (child) {
          var cLi = document.createElement("li");
          var cA = document.createElement("a");
          cA.href = child.href;
          cA.className = "nav-sublink";
          cA.textContent = child.label;
          var childActive = itemIsActive(child);
          if (childActive) {
            cLi.classList.add("is-active");
            cA.setAttribute("aria-current", "page");
          }
          cLi.appendChild(cA);
          sub.appendChild(cLi);
        });
        li.appendChild(sub);
      }

      ul.appendChild(li);
    });

    nav.innerHTML = "";
    nav.appendChild(ul);
  }

  renderMenu();

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  toggle.addEventListener("click", function () {
    setOpen(!nav.classList.contains("is-open"));
  });

  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      setOpen(false);
    });
  });

  nav.querySelectorAll(".nav-subtoggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var targetId = btn.getAttribute("aria-controls");
      if (!targetId) return;
      var sub = document.getElementById(targetId);
      if (!sub) return;
      var expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", expanded ? "false" : "true");
      btn.textContent = expanded ? "+" : "−";
      sub.hidden = expanded;
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  document.addEventListener("click", function (e) {
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    setOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 721px)").matches) setOpen(false);
  });
})();

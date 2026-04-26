(function () {
  var shell = document.querySelector(".marketing-shell");
  var nav = document.getElementById("site-nav");
  var toggle = document.querySelector(".site-topbar .nav-toggle");
  var backdrop = document.querySelector(".site-sidebar-backdrop");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  if (!nav) return;

  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var menu = [
    {
      label: "Home",
      href: "index.html",
      match: [
        "index.html",
        "home-recent-prints.html",
        "home-what-we-take-on.html",
        "home-files-to-finished-prints.html",
        "home-what-good-means-here.html",
        "home-clear-communication-reliable-output.html",
        "home-request-a-quote.html",
      ],
      children: [
        { label: "Recent Prints", href: "home-recent-prints.html", match: ["home-recent-prints.html"] },
        { label: "Services", href: "home-what-we-take-on.html", match: ["home-what-we-take-on.html"] },
        { label: "Process", href: "home-files-to-finished-prints.html", match: ["home-files-to-finished-prints.html"] },
        { label: "Standards", href: "home-what-good-means-here.html", match: ["home-what-good-means-here.html"] },
        {
          label: "Reliability",
          href: "home-clear-communication-reliable-output.html",
          match: ["home-clear-communication-reliable-output.html"],
        },
        { label: "Quote", href: "home-request-a-quote.html", match: ["home-request-a-quote.html"] },
      ],
    },
    {
      label: "Shop",
      href: "shop.html",
      match: ["shop.html", "dm-stash.html", "greytide.html", "redmakers.html", "rafail-ft-pring.html", "epic-miniatures.html", "mar-fil.html", "shop-checkout.html"],
      children: [
        { label: "Catalog", href: "shop.html#catalog", match: ["shop.html", "dm-stash.html", "greytide.html", "redmakers.html", "rafail-ft-pring.html", "epic-miniatures.html", "mar-fil.html"] },
        { label: "Checkout", href: "shop-checkout.html", match: ["shop-checkout.html"] },
      ],
    },
    {
      label: "Custom Jobs",
      href: "home-what-we-take-on.html",
      match: [
        "home-what-we-take-on.html",
        "home-files-to-finished-prints.html",
        "home-what-good-means-here.html",
        "home-clear-communication-reliable-output.html",
      ],
      children: [
        { label: "Services", href: "home-what-we-take-on.html", match: ["home-what-we-take-on.html"] },
        { label: "Process", href: "home-files-to-finished-prints.html", match: ["home-files-to-finished-prints.html"] },
        { label: "Quality", href: "home-what-good-means-here.html", match: ["home-what-good-means-here.html"] },
        {
          label: "Clear Communication, Reliable Output",
          href: "home-clear-communication-reliable-output.html",
          match: ["home-clear-communication-reliable-output.html"],
        },
      ],
    },
    { label: "Contact", href: "home-request-a-quote.html", match: ["home-request-a-quote.html"] },
  ];

  var menuIcons = {
    Home: '<svg viewBox="0 0 24 24"><path d="M3.5 10.5 12 3l8.5 7.5"></path><path d="M6 9.8V20h12V9.8"></path></svg>',
    "Recent Prints": '<svg viewBox="0 0 24 24"><path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8L12 3Z"></path></svg>',
    Standards: '<svg viewBox="0 0 24 24"><path d="m4 12 5 5 11-11"></path></svg>',
    Reliability: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>',
    Quote: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>',
    Shop: '<svg viewBox="0 0 24 24"><path d="M4 8h16l-1.4 11H5.4L4 8Z"></path><path d="M9 8a3 3 0 0 1 6 0"></path></svg>',
    Catalog: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z"></path><path d="M8 7h8M8 11h8M8 15h6"></path></svg>',
    Checkout: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M3 10h18M7 14h3"></path></svg>',
    "Custom Jobs": '<svg viewBox="0 0 24 24"><path d="m3 12 4-4 4 4-4 4-4-4Zm10-8h8v8h-8V4Zm0 8h8v8h-8v-8Z"></path></svg>',
    "Featured Work": '<svg viewBox="0 0 24 24"><path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8L12 3Z"></path></svg>',
    Services: '<svg viewBox="0 0 24 24"><path d="m14.5 4.5 5 5-10 10H4.5v-5l10-10Z"></path><path d="m13 6 5 5"></path></svg>',
    Process: '<svg viewBox="0 0 24 24"><path d="M4 6h8l-2.5 3M20 18h-8l2.5-3"></path><path d="M12 9v6"></path></svg>',
    Quality: '<svg viewBox="0 0 24 24"><path d="m4 12 5 5 11-11"></path></svg>',
    Contact: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>',
  };

  function appendLabelWithIcon(el, label) {
    var iconSvg = menuIcons[label];
    if (iconSvg) {
      var icon = document.createElement("span");
      icon.className = "nav-tree__icon ui-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = iconSvg;
      el.appendChild(icon);
    }
    var text = document.createElement("span");
    text.className = "nav-tree__text";
    text.textContent = label;
    el.appendChild(text);
  }

  function itemIsActive(item) {
    var fileMatch = Array.isArray(item.match) && item.match.indexOf(page) >= 0;
    if (fileMatch) return true;
    if (!Array.isArray(item.children)) return false;
    return item.children.some(function (c) {
      var cf = Array.isArray(c.match) && c.match.indexOf(page) >= 0;
      return cf;
    });
  }

  function renderMenuTree() {
    nav.classList.add("site-nav", "site-nav--tree");
    var ul = document.createElement("ul");
    ul.className = "nav-tree";

    menu.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "nav-tree__item nav-item";
      var active = itemIsActive(item);
      if (active) li.classList.add("is-active");

      if (Array.isArray(item.children) && item.children.length) {
        li.classList.add("nav-tree__item--branch", "nav-item--has-sub");
        var row = document.createElement("div");
        row.className = "nav-tree__row";
        var main = document.createElement("a");
        main.href = item.href;
        main.className = "nav-tree__link nav-link";
        appendLabelWithIcon(main, item.label);
        if (active) main.setAttribute("aria-current", "page");
        row.appendChild(main);
        li.appendChild(row);

        var sub = document.createElement("ul");
        sub.className = "nav-tree__nested";
        item.children.forEach(function (child) {
          var cLi = document.createElement("li");
          cLi.className = "nav-tree__leaf";
          var cA = document.createElement("a");
          cA.href = child.href;
          cA.className = "nav-tree__sublink nav-sublink";
          appendLabelWithIcon(cA, child.label);
          var childActive = itemIsActive(child);
          if (childActive) {
            cLi.classList.add("is-active");
            cA.setAttribute("aria-current", "page");
          }
          cLi.appendChild(cA);
          sub.appendChild(cLi);
        });
        li.appendChild(sub);
      } else {
        var link = document.createElement("a");
        link.href = item.href;
        link.className = "nav-tree__link nav-link";
        appendLabelWithIcon(link, item.label);
        if (active) {
          link.setAttribute("aria-current", "page");
        }
        li.appendChild(link);
      }

      ul.appendChild(li);
    });

    nav.innerHTML = "";
    nav.appendChild(ul);
  }

  /** Legacy horizontal header (no marketing shell). */
  function renderMenuHorizontal() {
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

  if (shell) {
    renderMenuTree();
  } else {
    renderMenuHorizontal();
  }

  function setSidebarOpen(open) {
    if (!shell) return;
    shell.classList.toggle("is-sidebar-open", open);
    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    document.body.classList.toggle("is-marketing-nav-open", Boolean(open));
    if (backdrop) {
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
  }

  function setHorizontalNavOpen(open) {
    nav.classList.toggle("is-open", open);
    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      if (shell) {
        setSidebarOpen(!shell.classList.contains("is-sidebar-open"));
      } else {
        setHorizontalNavOpen(!nav.classList.contains("is-open"));
      }
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setSidebarOpen(false);
    });
  }

  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (shell && window.matchMedia("(max-width: 900px)").matches) {
        setSidebarOpen(false);
      }
      if (!shell) {
        setHorizontalNavOpen(false);
      }
    });
  });

  if (!shell) {
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
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      setSidebarOpen(false);
      setHorizontalNavOpen(false);
    }
  });

  document.addEventListener("click", function (e) {
    if (shell) return;
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(e.target) || (toggle && toggle.contains(e.target))) return;
    setHorizontalNavOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 721px)").matches) {
      setHorizontalNavOpen(false);
    }
    if (window.matchMedia("(min-width: 901px)").matches) {
      setSidebarOpen(false);
    }
  });
})();

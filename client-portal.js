(function () {
  if (!window.Portal) return;

  var p = Portal.getProfile();
  if (!p) return;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function formatTime(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return iso;
    }
  }

  var fn = typeof p.firstName === "string" ? p.firstName : "";
  var ln = typeof p.lastName === "string" ? p.lastName : "";
  if ((!fn || !ln) && p.name) {
    var parts = String(p.name).trim().split(/\s+/);
    if (!fn) fn = parts[0] || "";
    if (!ln) ln = parts.slice(1).join(" ") || "";
  }

  var greet = document.getElementById("portal-greeting");
  if (greet) greet.textContent = fn ? "Welcome, " + fn : "Welcome";

  var dl = document.getElementById("portal-info-dl");
  if (dl) {
    var rows = [];
    rows.push(
      "<div><dt>First name</dt><dd>" + esc(fn || "—") + "</dd></div>",
      "<div><dt>Last name</dt><dd>" + esc(ln || "—") + "</dd></div>"
    );
    if (p.zip && !(p.address && p.address.line1)) {
      rows.push("<div><dt>ZIP (sign-in)</dt><dd>" + esc(String(p.zip)) + "</dd></div>");
    }
    if (p.email) rows.push("<div><dt>Email</dt><dd>" + esc(p.email) + "</dd></div>");
    if (p.phone) rows.push("<div><dt>Phone</dt><dd>" + esc(p.phone) + "</dd></div>");
    if (p.address && p.address.line1) {
      rows.push(
        "<div><dt>Shipping / home address</dt><dd>" +
          esc(Portal.formatAddress(p.address)) +
          "</dd></div>"
      );
    }
    dl.innerHTML = rows.join("");
  }

  function renderOrders() {
    var orders = Portal.getOrders();
    var curEl = document.getElementById("portal-orders-current");
    var pastEl = document.getElementById("portal-orders-past");
    var curEmpty = document.getElementById("portal-orders-current-empty");
    var pastEmpty = document.getElementById("portal-orders-past-empty");
    var current = orders.filter(function (o) {
      return o.phase === "current";
    });
    var past = orders.filter(function (o) {
      return o.phase === "past";
    });

    function card(o) {
      return (
        '<li><article class="portal-order-card">' +
        '<p class="portal-order-id">' +
        esc(o.id) +
        "</p>" +
        '<p class="portal-order-title">' +
        esc(o.title) +
        "</p>" +
        '<p class="portal-order-meta">' +
        esc(o.summary) +
        "</p>" +
        '<p class="portal-order-meta">' +
        esc(o.dateLabel) +
        "</p>" +
        '<p class="portal-order-total">' +
        esc(o.total) +
        "</p>" +
        "</article></li>"
      );
    }

    if (curEl) {
      curEl.innerHTML = current.map(card).join("");
      if (curEmpty) curEmpty.hidden = current.length > 0;
    }
    if (pastEl) {
      pastEl.innerHTML = past.map(card).join("");
      if (pastEmpty) pastEmpty.hidden = past.length > 0;
    }
  }

  var firstMessageRender = true;

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function renderMessages() {
    var thread = document.getElementById("portal-thread");
    if (!thread) return;
    var messages = Portal.getMessages();
    thread.innerHTML = messages
      .map(function (m) {
        var isClient = m.from === "client";
        return (
          '<div class="portal-bubble portal-bubble--' +
          (isClient ? "client" : "admin") +
          '">' +
          esc(m.body) +
          "<time>" +
          esc(formatTime(m.at)) +
          "</time></div>"
        );
      })
      .join("");
    if (!firstMessageRender) {
      thread.querySelectorAll(".portal-bubble").forEach(function (el) {
        el.style.animation = "none";
      });
      var all = thread.querySelectorAll(".portal-bubble");
      var last = all[all.length - 1];
      if (last) last.classList.add("portal-bubble--fresh");
    }
    firstMessageRender = false;

    var scrollToEnd = function () {
      if (prefersReducedMotion()) {
        thread.scrollTop = thread.scrollHeight;
      } else {
        thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
      }
    };
    window.requestAnimationFrame(scrollToEnd);
  }

  renderOrders();
  renderMessages();

  if (window.MessageBus && typeof MessageBus.onMessagesUpdated === "function") {
    MessageBus.onMessagesUpdated(function () {
      renderMessages();
    });
  }

  var form = document.getElementById("portal-compose");
  var input = document.getElementById("portal-msg-input");
  if (form && input) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var t = String(input.value || "").trim();
      if (!t) return;
      Portal.appendClientMessage(t);
      input.value = "";
      renderMessages();
    });
  }

  var signOut = document.getElementById("portal-sign-out");
  if (signOut) {
    signOut.addEventListener("click", function () {
      Portal.clearSession();
      location.href = "client-flow.html";
    });
  }
})();

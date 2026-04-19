(function () {
  if (!window.Portal) return;

  var p = Portal.getProfile();
  if (!p) return;

  var seenMessageIds = new Set();
  var baseTitle = document.title;

  function showAppToast(text) {
    var host = document.getElementById("app-toast-host");
    if (!host) return;
    var el = document.createElement("div");
    el.className = "app-toast";
    el.setAttribute("role", "status");
    el.textContent = text;
    host.appendChild(el);
    window.setTimeout(function () {
      el.remove();
    }, 5200);
  }

  function maybeBrowserNotify(title, body) {
    if (typeof Notification !== "function" || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body: body });
    } catch (e) {}
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderAttachmentsHtml(attachments) {
    if (!attachments || !attachments.length) return "";
    var parts = attachments.map(function (a) {
      var href = esc(a.url || "");
      var name = esc(a.name || "file");
      var isImg = a.kind === "image" || (a.mime && String(a.mime).indexOf("image/") === 0);
      if (isImg) {
        return (
          '<a class="portal-msg-img-wrap" href="' +
          href +
          '" target="_blank" rel="noopener noreferrer">' +
          '<img src="' +
          href +
          '" alt="" loading="lazy" decoding="async" />' +
          "</a>"
        );
      }
      return (
        '<a class="portal-msg-file" href="' +
        href +
        '" target="_blank" rel="noopener noreferrer">' +
        name +
        "</a>"
      );
    });
    return '<div class="portal-msg-attachments">' + parts.join("") + "</div>";
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

  async function renderOrders() {
    var orders = [];
    try {
      orders = await Portal.getOrders();
    } catch (e) {
      orders = [];
    }
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

  var notifyBtn = document.getElementById("portal-enable-notify");
  if (notifyBtn) {
    notifyBtn.addEventListener("click", function () {
      if (typeof Notification === "undefined") {
        showAppToast("This browser does not support notifications.");
        return;
      }
      Notification.requestPermission()
        .then(function (perm) {
          if (perm === "granted") showAppToast("Desktop notifications enabled.");
          else showAppToast("Notifications were not enabled.");
        })
        .catch(function () {
          showAppToast("Could not request notification permission.");
        });
    });
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  async function renderMessages() {
    var thread = document.getElementById("portal-thread");
    if (!thread) return;
    var messages = [];
    try {
      messages = await Portal.getMessages();
    } catch (e) {
      messages = [];
    }

    var hadSeen = seenMessageIds.size > 0;
    messages.forEach(function (m) {
      if (seenMessageIds.has(m.id)) return;
      seenMessageIds.add(m.id);
      if (hadSeen && m.from === "admin") {
        showAppToast("New reply from staff");
        maybeBrowserNotify("Client portal", "You have a new reply from staff.");
        if (document.title === baseTitle) {
          document.title = "(!) " + baseTitle;
          window.setTimeout(function () {
            document.title = baseTitle;
          }, 4000);
        }
      }
    });

    thread.innerHTML = messages
      .map(function (m) {
        var isClient = m.from === "client";
        var bodyText = String(m.body || "").trim();
        var bodyHtml = bodyText ? esc(bodyText) : "";
        var attHtml = renderAttachmentsHtml(m.attachments);
        return (
          '<div class="portal-bubble portal-bubble--' +
          (isClient ? "client" : "admin") +
          '">' +
          (bodyHtml ? "<p class=\"portal-bubble-text\">" + bodyHtml + "</p>" : "") +
          attHtml +
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
  setInterval(renderMessages, 3000);

  var form = document.getElementById("portal-compose");
  var input = document.getElementById("portal-msg-input");
  var fileInput = document.getElementById("portal-msg-files");
  var fileHint = document.getElementById("portal-msg-file-hint");
  if (fileInput && fileHint) {
    fileInput.addEventListener("change", function () {
      var n = fileInput.files ? fileInput.files.length : 0;
      fileHint.textContent = n ? n + " file" + (n === 1 ? "" : "s") + " selected" : "";
    });
  }
  if (form && input) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var t = String(input.value || "").trim();
      var files = fileInput && fileInput.files ? fileInput.files : null;
      if (!t && (!files || !files.length)) return;
      try {
        await Portal.appendClientMessage(t, files);
      } catch (err) {
        showAppToast((err && err.message) || "Could not send message.");
        return;
      }
      input.value = "";
      if (fileInput) fileInput.value = "";
      if (fileHint) fileHint.textContent = "";
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

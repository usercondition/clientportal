(function () {
  var listEl = document.getElementById("admin-inbox-list");
  var emptyEl = document.getElementById("admin-inbox-empty");
  var chatWrap = document.getElementById("admin-inbox-chat");
  var threadEl = document.getElementById("admin-inbox-thread");
  var nameEl = document.getElementById("admin-inbox-client-name");
  var emailEl = document.getElementById("admin-inbox-client-email");
  var form = document.getElementById("admin-inbox-form");
  var replyInput = document.getElementById("admin-inbox-reply");
  var logoutBtn = document.getElementById("admin-inbox-logout");
  var notifyPermBtn = document.getElementById("admin-enable-notify");

  /** @type {string | null} */
  var selectedThreadId = null;

  /** @type {Record<string, { updatedAt: string; preview: string; lastFrom: string }>} */
  var threadListSnapshot = {};

  /** @type {Record<string, Set<string | number>>} */
  var seenThreadMessageIdsByThread = {};

  var baseTitle = document.title;

  function seenSetForThread(threadId) {
    if (!threadId) return new Set();
    if (!seenThreadMessageIdsByThread[threadId]) {
      seenThreadMessageIdsByThread[threadId] = new Set();
    }
    return seenThreadMessageIdsByThread[threadId];
  }

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

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return iso;
    }
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  async function requestJson(url, options) {
    var res = await fetch(url, options || {});
    var payload = null;
    try {
      payload = await res.json();
    } catch (e) {}
    if (!res.ok) throw new Error((payload && payload.error) || "Request failed.");
    return payload;
  }

  async function renderList() {
    if (!listEl) return;
    var rows = [];
    try {
      var payload = await requestJson("/api/admin/inbox");
      rows = payload.threads || [];
    } catch (e) {
      rows = [];
    }

    var hadSnapshot = Object.keys(threadListSnapshot).length > 0;
    var nextSnap = {};
    rows.forEach(function (r) {
      nextSnap[r.threadId] = {
        updatedAt: String(r.updatedAt || ""),
        preview: r.preview || "",
        lastFrom: r.lastFrom || "",
      };
    });
    if (hadSnapshot) {
      rows.forEach(function (r) {
        var prev = threadListSnapshot[r.threadId];
        if (!prev) return;
        var changed =
          prev.updatedAt !== nextSnap[r.threadId].updatedAt ||
          prev.preview !== nextSnap[r.threadId].preview;
        if (changed && r.lastFrom === "client" && r.threadId !== selectedThreadId) {
          showAppToast("New message — " + r.clientLabel);
          maybeBrowserNotify("Admin inbox", "New message from " + r.clientLabel);
          if (document.title === baseTitle) {
            document.title = "(!) " + baseTitle;
            window.setTimeout(function () {
              document.title = baseTitle;
            }, 4000);
          }
        }
      });
    }
    threadListSnapshot = nextSnap;

    listEl.innerHTML = rows
      .map(function (r) {
        var active = r.threadId === selectedThreadId ? " is-active" : "";
        return (
          '<li><button type="button" class="admin-inbox-item' +
          active +
          '" data-key="' +
          esc(r.threadId) +
          '">' +
          '<p class="admin-inbox-item-name">' +
          esc(r.clientLabel) +
          "</p>" +
          '<p class="admin-inbox-item-preview">' +
          esc(r.preview || "(no messages)") +
          "</p>" +
          '<p class="admin-inbox-item-meta">' +
          esc(formatTime(r.updatedAt)) +
          "</p>" +
          "</button></li>"
        );
      })
      .join("");

    if (rows.length === 0) {
      listEl.innerHTML =
        '<li><p style="padding:0.75rem 1rem;color:var(--text-muted);font-size:0.9rem;margin:0">No conversations yet. Client messages will appear here.</p></li>';
    }

    listEl.querySelectorAll(".admin-inbox-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-key");
        if (k) selectThread(k);
      });
    });
    return rows;
  }

  async function renderThread() {
    if (!threadEl || !nameEl || !emailEl || !emptyEl || !chatWrap) return;
    if (!selectedThreadId) {
      emptyEl.hidden = false;
      chatWrap.hidden = true;
      threadEl.innerHTML = "";
      return;
    }

    var payload;
    try {
      payload = await requestJson("/api/admin/threads/" + encodeURIComponent(selectedThreadId) + "/messages");
    } catch (e) {
      selectedThreadId = null;
      renderList();
      renderThread();
      return;
    }
    var t = payload.thread;
    var messages = payload.messages || [];

    var seenSet = seenSetForThread(selectedThreadId);
    var hadMsgs = seenSet.size > 0;
    messages.forEach(function (m) {
      if (seenSet.has(m.id)) return;
      seenSet.add(m.id);
      if (hadMsgs && m.from === "client") {
        showAppToast("New message from client");
        maybeBrowserNotify("Admin inbox", "New client message in this thread.");
      }
    });

    emptyEl.hidden = true;
    chatWrap.hidden = false;
    nameEl.textContent = t.clientLabel || "Client";
    emailEl.textContent = t.clientEmail ? t.clientEmail : "";

    threadEl.innerHTML = messages
      .map(function (m) {
        var isAdmin = m.from === "admin";
        return (
          '<div class="admin-inbox-bubble admin-inbox-bubble--' +
          (isAdmin ? "admin" : "client") +
          '">' +
          esc(m.body) +
          "<time>" +
          esc(formatTime(m.at)) +
          "</time></div>"
        );
      })
      .join("");

    var scrollEnd = function () {
      if (prefersReducedMotion()) {
        threadEl.scrollTop = threadEl.scrollHeight;
      } else {
        threadEl.scrollTo({ top: threadEl.scrollHeight, behavior: "smooth" });
      }
    };
    window.requestAnimationFrame(scrollEnd);
  }

  function selectThread(threadId) {
    selectedThreadId = threadId;
    renderList();
    renderThread();
    if (replyInput) replyInput.focus();
  }

  (async function init() {
    var rows = await renderList();
    if (rows.length && !selectedThreadId) {
      selectThread(rows[0].threadId);
    } else {
      renderThread();
    }
  })();
  setInterval(function () {
    renderList();
    if (selectedThreadId) renderThread();
  }, 3000);

  if (form && replyInput) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!selectedThreadId) return;
      var text = String(replyInput.value || "").trim();
      if (!text) return;
      try {
        await requestJson("/api/admin/threads/" + encodeURIComponent(selectedThreadId) + "/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
      } catch (err) {
        return;
      }
      replyInput.value = "";
      renderList();
      renderThread();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      if (window.AdminAuth) AdminAuth.clearAdminSession();
      location.href = "admin-login.html";
    });
  }

  if (notifyPermBtn) {
    notifyPermBtn.addEventListener("click", function () {
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
})();

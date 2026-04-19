(function () {
  var listEl = document.getElementById("admin-inbox-list");
  var emptyEl = document.getElementById("admin-inbox-empty");
  var chatWrap = document.getElementById("admin-inbox-chat");
  var threadEl = document.getElementById("admin-inbox-thread");
  var nameEl = document.getElementById("admin-inbox-client-name");
  var emailEl = document.getElementById("admin-inbox-client-email");
  var form = document.getElementById("admin-inbox-form");
  var replyInput = document.getElementById("admin-inbox-reply");
  var adminFileInput = document.getElementById("admin-inbox-files");
  var adminFileHint = document.getElementById("admin-inbox-file-hint");
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

  var ADMIN_NOTIFY_STORAGE = "admin_notify_ui_enabled";

  function isInAppNotifyEnabled() {
    try {
      var v = localStorage.getItem(ADMIN_NOTIFY_STORAGE);
      if (v === null || v === undefined) return true;
      return v === "1" || v === "true";
    } catch (e) {
      return true;
    }
  }

  function setInAppNotifyEnabled(on) {
    try {
      localStorage.setItem(ADMIN_NOTIFY_STORAGE, on ? "1" : "0");
    } catch (e) {}
  }

  function maybeBrowserNotify(title, body) {
    if (typeof Notification !== "function" || Notification.permission !== "granted") return;
    if (!isInAppNotifyEnabled()) return;
    try {
      new Notification(title, { body: body });
    } catch (e) {}
  }

  function syncAdminNotifyButton(btn) {
    if (!btn) return;
    btn.classList.remove("admin-topbar-btn--muted");
    btn.removeAttribute("aria-pressed");
    btn.removeAttribute("title");
    if (typeof Notification === "undefined") {
      btn.textContent = "Alerts not supported";
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
    var perm = Notification.permission;
    if (perm === "denied") {
      btn.textContent = "Alerts blocked";
      btn.title = "Allow notifications for this site in your browser settings.";
      btn.classList.add("admin-topbar-btn--muted");
      return;
    }
    if (perm === "default") {
      btn.textContent = "Desktop alerts";
      btn.setAttribute("aria-pressed", "false");
      return;
    }
    if (isInAppNotifyEnabled()) {
      btn.textContent = "Turn off alerts";
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.textContent = "Desktop alerts";
      btn.setAttribute("aria-pressed", "false");
    }
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
          '<a class="admin-inbox-img-wrap" href="' +
          href +
          '" target="_blank" rel="noopener noreferrer">' +
          '<img src="' +
          href +
          '" alt="" loading="lazy" decoding="async" />' +
          "</a>"
        );
      }
      return (
        '<a class="admin-inbox-file-link" href="' +
        href +
        '" target="_blank" rel="noopener noreferrer">' +
        name +
        "</a>"
      );
    });
    return '<div class="admin-inbox-attachments">' + parts.join("") + "</div>";
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

  async function postThreadMessage(threadId, text, fileList) {
    var url = "/api/admin/threads/" + encodeURIComponent(threadId) + "/messages";
    var bodyText = String(text || "").trim();
    var files =
      fileList && fileList.length ? Array.prototype.slice.call(fileList) : [];
    if (!bodyText && files.length === 0) return;

    if (files.length > 0) {
      var fd = new FormData();
      fd.append("body", bodyText);
      for (var i = 0; i < files.length; i++) {
        fd.append("files", files[i]);
      }
      var res = await fetch(url, { method: "POST", body: fd });
      var raw = "";
      try {
        raw = await res.text();
      } catch (e) {
        raw = "";
      }
      var payload = null;
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch (e) {
          payload = null;
        }
      }
      if (!res.ok) {
        throw new Error((payload && payload.error) || "Upload failed.");
      }
      return payload;
    }

    return requestJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: bodyText }),
    });
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
        '<li><p class="admin-list-placeholder">No conversations yet. Client messages will appear here.</p></li>';
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
        var bodyText = String(m.body || "").trim();
        var bodyHtml = bodyText ? esc(bodyText) : "";
        var attHtml = renderAttachmentsHtml(m.attachments);
        return (
          '<div class="admin-inbox-bubble admin-inbox-bubble--' +
          (isAdmin ? "admin" : "client") +
          '">' +
          (bodyHtml ? "<p class=\"admin-inbox-bubble-text\">" + bodyHtml + "</p>" : "") +
          attHtml +
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

  if (adminFileInput && adminFileHint) {
    adminFileInput.addEventListener("change", function () {
      var n = adminFileInput.files ? adminFileInput.files.length : 0;
      adminFileHint.textContent = n ? n + " file" + (n === 1 ? "" : "s") + " selected" : "";
    });
  }

  if (form && replyInput) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!selectedThreadId) return;
      var text = String(replyInput.value || "").trim();
      var files = adminFileInput && adminFileInput.files ? adminFileInput.files : null;
      if (!text && (!files || !files.length)) return;
      try {
        await postThreadMessage(selectedThreadId, text, files);
      } catch (err) {
        showAppToast((err && err.message) || "Could not send reply.");
        return;
      }
      replyInput.value = "";
      if (adminFileInput) adminFileInput.value = "";
      if (adminFileHint) adminFileHint.textContent = "";
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
    syncAdminNotifyButton(notifyPermBtn);
    notifyPermBtn.addEventListener("click", function () {
      if (typeof Notification === "undefined") {
        showAppToast("This browser does not support notifications.");
        return;
      }
      var perm = Notification.permission;
      if (perm === "denied") {
        showAppToast("Unblock notifications for this site in your browser settings.");
        return;
      }
      if (perm === "default") {
        Notification.requestPermission()
          .then(function (p) {
            if (p === "granted") {
              setInAppNotifyEnabled(true);
              showAppToast("Desktop alerts enabled.");
            } else {
              showAppToast("Alerts were not enabled.");
            }
            syncAdminNotifyButton(notifyPermBtn);
          })
          .catch(function () {
            showAppToast("Could not request notification permission.");
            syncAdminNotifyButton(notifyPermBtn);
          });
        return;
      }
      if (isInAppNotifyEnabled()) {
        setInAppNotifyEnabled(false);
        showAppToast("Desktop alerts are off. Turn them back on here anytime.");
      } else {
        setInAppNotifyEnabled(true);
        showAppToast("Desktop alerts are on.");
      }
      syncAdminNotifyButton(notifyPermBtn);
    });
  }
})();

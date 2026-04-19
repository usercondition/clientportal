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

  /** @type {string | null} */
  var selectedThreadId = null;

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
})();

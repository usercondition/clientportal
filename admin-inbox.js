(function () {
  if (!window.MessageBus) return;

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
  var selectedKey = null;

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

  function renderList() {
    if (!listEl) return;
    var rows = MessageBus.getInboxList();
    listEl.innerHTML = rows
      .map(function (r) {
        var active = r.profileKey === selectedKey ? " is-active" : "";
        return (
          '<li><button type="button" class="admin-inbox-item' +
          active +
          '" data-key="' +
          esc(r.profileKey) +
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
        '<li><p style="padding:0.75rem 1rem;color:var(--text-muted);font-size:0.9rem;margin:0">No conversations yet. When a client sends a message from their portal, it appears here.</p></li>';
    }

    listEl.querySelectorAll(".admin-inbox-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-key");
        if (k) selectThread(k);
      });
    });
  }

  function renderThread() {
    if (!threadEl || !nameEl || !emailEl || !emptyEl || !chatWrap) return;
    if (!selectedKey) {
      emptyEl.hidden = false;
      chatWrap.hidden = true;
      threadEl.innerHTML = "";
      return;
    }

    var t = MessageBus.getThread(selectedKey);
    if (!t) {
      selectedKey = null;
      renderList();
      renderThread();
      return;
    }

    emptyEl.hidden = true;
    chatWrap.hidden = false;
    nameEl.textContent = t.clientLabel || "Client";
    emailEl.textContent = t.clientEmail ? t.clientEmail : "";

    threadEl.innerHTML = (t.messages || [])
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

  function selectThread(key) {
    selectedKey = key;
    renderList();
    renderThread();
    if (replyInput) replyInput.focus();
  }

  renderList();
  renderThread();

  var rows = MessageBus.getInboxList();
  if (rows.length && !selectedKey) {
    selectThread(rows[0].profileKey);
  }

  MessageBus.onMessagesUpdated(function () {
    renderList();
    renderThread();
  });

  if (form && replyInput) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!selectedKey) return;
      var text = String(replyInput.value || "").trim();
      if (!text) return;
      MessageBus.appendAdminMessage(selectedKey, text);
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

(function () {
  var banner = document.getElementById("admin-mp-banner");
  var listEl = document.getElementById("admin-mp-list");
  var detailHead = document.getElementById("admin-mp-detail-head");
  var msgsEl = document.getElementById("admin-mp-msgs");
  var logoutBtn = document.getElementById("admin-logout");

  /** @type {string | null} */
  var selectedId = null;

  function showBanner(text) {
    if (!banner) return;
    banner.textContent = text || "";
    banner.hidden = !text;
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderList(threads) {
    if (!listEl) return;
    if (!threads || !threads.length) {
      listEl.innerHTML =
        '<p class="admin-mp__empty">No threads yet. Enable the server flag and token, install the extension, then sync from your marketplace inbox tab.</p>';
      return;
    }
    listEl.innerHTML = threads
      .map(function (t) {
        var active = t.id === selectedId ? " admin-mp__item--active" : "";
        return (
          '<button type="button" class="admin-mp__item' +
          active +
          '" data-id="' +
          esc(t.id) +
          '">' +
          '<p class="admin-mp__item-title">' +
          esc(t.buyerName || "Buyer") +
          "</p>" +
          '<p class="admin-mp__item-meta">' +
          esc(t.snippet || t.threadId || "") +
          "</p></button>"
        );
      })
      .join("");
    listEl.querySelectorAll("[data-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (id) loadThread(id);
      });
    });
  }

  function renderDetail(thread, messages) {
    if (!detailHead || !msgsEl) return;
    if (!thread) {
      detailHead.innerHTML = "";
      msgsEl.innerHTML = '<p class="admin-mp__empty">Select a conversation.</p>';
      return;
    }
    detailHead.innerHTML =
      "<h2>" +
      esc(thread.buyerName || "Thread") +
      "</h2>" +
      "<p>Platform: " +
      esc(thread.platform || "") +
      " · ID: " +
      esc(thread.threadId || "") +
      "</p>";
    if (!messages || !messages.length) {
      msgsEl.innerHTML = '<p class="admin-mp__empty">No messages stored for this thread.</p>';
      return;
    }
    msgsEl.innerHTML = messages
      .map(function (m) {
        return (
          '<div class="admin-mp__bubble">' +
          '<div class="admin-mp__bubble-from">' +
          esc(m.senderLabel || "—") +
          " · " +
          esc(m.sentAt ? String(m.sentAt).slice(0, 19) : "") +
          "</div>" +
          '<div class="admin-mp__bubble-body">' +
          esc(m.body || "") +
          "</div></div>"
        );
      })
      .join("");
  }

  function loadThread(id) {
    selectedId = id;
    renderList(window.__adminMpThreads || []);
    fetch("/api/admin/marketplace/threads/" + encodeURIComponent(id) + "/messages")
      .then(function (r) {
        if (r.status === 404) {
          showBanner("Marketplace sync is disabled on the server (set MARKETPLACE_SYNC_ENABLED=true).");
          return null;
        }
        return r.json().then(function (j) {
          if (r.status === 503 && j && j.migrationNeeded) {
            showBanner(j.error || "Run npm run db:migrate to create marketplace tables.");
            return null;
          }
          if (!r.ok) throw new Error((j && j.error) || "Load failed");
          return j;
        });
      })
      .then(function (data) {
        if (!data) return;
        renderDetail(data.thread, data.messages);
      })
      .catch(function (e) {
        showBanner(e.message || "Could not load messages.");
      });
  }

  function loadList() {
    showBanner("");
    fetch("/api/admin/marketplace/threads?limit=200")
      .then(function (r) {
        if (r.status === 404) {
          showBanner(
            "Marketplace sync is disabled. Set MARKETPLACE_SYNC_ENABLED=true and MARKETPLACE_SYNC_TOKEN on the server, redeploy, then reload."
          );
          renderList([]);
          renderDetail(null, []);
          return null;
        }
        return r.json().then(function (j) {
          if (r.status === 503 && j && j.migrationNeeded) {
            return { __migration: j };
          }
          if (!r.ok) throw new Error((j && j.error) || "Load failed");
          return j;
        });
      })
      .then(function (data) {
        if (!data) return;
        if (data.__migration) {
          showBanner(
            (data.__migration.error ||
              "Apply database migration 003.") +
              " Railway: open the Web service → Shell → run npm run db:migrate with DATABASE_URL set."
          );
          renderList([]);
          renderDetail(null, []);
          return;
        }
        if (data.databaseConnected === false) {
          showBanner("Database not configured — connect DATABASE_URL to load synced threads.");
        }
        window.__adminMpThreads = data.threads || [];
        renderList(data.threads || []);
        if (selectedId) {
          var still = (data.threads || []).some(function (t) {
            return t.id === selectedId;
          });
          if (still) loadThread(selectedId);
          else {
            selectedId = null;
            renderDetail(null, []);
          }
        } else {
          renderDetail(null, []);
        }
      })
      .catch(function (e) {
        showBanner(e.message || "Could not load threads.");
        renderList([]);
      });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      if (window.AdminAuth) AdminAuth.clearAdminSession();
      location.href = "admin-login.html";
    });
  }

  loadList();
  window.setInterval(loadList, 45_000);
})();

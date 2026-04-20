(function () {
  var banner = document.getElementById("admin-mp-banner");
  var listEl = document.getElementById("admin-mp-list");
  var detailHead = document.getElementById("admin-mp-detail-head");
  var msgsEl = document.getElementById("admin-mp-msgs");
  var logoutBtn = document.getElementById("admin-logout");
  var purgeBtn = document.getElementById("admin-mp-purge");

  /** @type {string | null} */
  var selectedId = null;
  /** When false, message panel shows only the newest row per thread. */
  var showFullMarketplaceHistory = false;
  /** @type {any[] | null} */
  var cachedThreadMessages = null;

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
          '" role="listitem">' +
          '<span class="admin-mp__avatar" aria-hidden="true"></span>' +
          '<span class="admin-mp__item-text">' +
          '<p class="admin-mp__item-title">' +
          esc(t.buyerName || "Buyer") +
          "</p>" +
          '<p class="admin-mp__item-meta">' +
          esc(t.snippet || t.threadId || "") +
          "</p></span></button>"
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

  function messageSortTime(m) {
    var raw = m && (m.sentAt || m.at || m.createdAt);
    var t = raw ? Date.parse(String(raw)) : NaN;
    return Number.isFinite(t) ? t : 0;
  }

  /** Match server / extension: transcript order first, then timestamp. */
  function stableSortMessages(messages) {
    if (!messages || !messages.length) return [];
    return messages.slice().sort(function (a, b) {
      var sa = Number(a.sortOrder);
      var sb = Number(b.sortOrder);
      var hasA = Number.isFinite(sa);
      var hasB = Number.isFinite(sb);
      if (hasA && hasB && sa !== sb) return sa - sb;
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      var ta = messageSortTime(a);
      var tb = messageSortTime(b);
      if (ta !== tb) return ta - tb;
      return String(a.messageId || a.id || "").localeCompare(String(b.messageId || b.id || ""));
    });
  }

  function isOutgoingBubble(m) {
    if (m.isOutgoing === true || m.direction === "out" || m.direction === "outgoing") return true;
    if (m.isOutgoing === false) return false;
    var lab = String(m.senderLabel || "").toLowerCase().trim();
    if (lab === "you" || /^you[,.]/.test(lab)) return true;
    if (/^(your reply|your message|seller|shop)\b/.test(lab)) return true;
    return false;
  }

  /** Newest single message (by transcript position or time). */
  function pickLatestMessagesOnly(messages) {
    if (!messages || !messages.length) return [];
    var sorted = stableSortMessages(messages);
    return [sorted[sorted.length - 1]];
  }

  function renderMessageBubbles(messages) {
    var ordered = stableSortMessages(messages);
    return (
      '<div class="admin-mp__transcript">' +
      ordered
        .map(function (m) {
          var out = isOutgoingBubble(m);
          var mod = out ? " admin-mp__bubble--out" : " admin-mp__bubble--in";
          return (
            '<div class="admin-mp__bubble' +
            mod +
            '">' +
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
        .join("") +
      "</div>"
    );
  }

  function renderDetail(thread, messages) {
    if (!detailHead || !msgsEl) return;
    if (!thread) {
      detailHead.innerHTML = "";
      msgsEl.innerHTML = '<p class="admin-mp__empty">Select a conversation.</p>';
      cachedThreadMessages = null;
      return;
    }
    cachedThreadMessages = messages && messages.length ? stableSortMessages(messages) : [];
    detailHead.innerHTML =
      "<h2>" +
      esc(thread.buyerName || "Thread") +
      "</h2>" +
      "<p>Platform: " +
      esc(thread.platform || "") +
      " · ID: " +
      esc(thread.threadId || "") +
      "</p>";
    if (!cachedThreadMessages.length) {
      msgsEl.innerHTML = '<p class="admin-mp__empty">No messages stored for this thread.</p>';
      return;
    }
    var total = cachedThreadMessages.length;
    var toShow = showFullMarketplaceHistory ? cachedThreadMessages : pickLatestMessagesOnly(cachedThreadMessages);
    var toolbar = "";
    if (total > 1) {
      if (showFullMarketplaceHistory) {
        toolbar =
          '<div class="admin-mp__msg-toolbar">' +
          "<span>Showing all " +
          total +
          ' messages.</span> <button type="button" id="admin-mp-toggle-history">Show latest only</button></div>';
      } else {
        toolbar =
          '<div class="admin-mp__msg-toolbar">' +
          "<span>Showing <strong>latest message</strong> only (" +
          total +
          ' in thread).</span> <button type="button" id="admin-mp-toggle-history">Show full history</button></div>';
      }
    }
    msgsEl.innerHTML = toolbar + renderMessageBubbles(toShow);
    var toggleBtn = document.getElementById("admin-mp-toggle-history");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        showFullMarketplaceHistory = !showFullMarketplaceHistory;
        renderDetail(thread, cachedThreadMessages);
      });
    }
  }

  function loadThread(id) {
    selectedId = id;
    showFullMarketplaceHistory = false;
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

  if (purgeBtn) {
    purgeBtn.addEventListener("click", function () {
      var tok = window.prompt(
        "Paste MARKETPLACE_SYNC_TOKEN (same value as in extension options and Railway). All synced Marketplace threads and messages will be permanently deleted:"
      );
      if (tok == null || !String(tok).trim()) return;
      if (
        !window.confirm(
          "Delete ALL Marketplace sync data from the database? This cannot be undone."
        )
      ) {
        return;
      }
      fetch("/api/admin/marketplace/purge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + String(tok).trim(),
        },
        body: JSON.stringify({ confirm: true }),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) throw new Error((j && j.error) || "Purge failed");
            return j;
          });
        })
        .then(function (j) {
          showBanner("Removed " + (j.deletedThreads != null ? j.deletedThreads : "?") + " synced thread(s). Reloading list.");
          selectedId = null;
          loadList();
        })
        .catch(function (e) {
          showBanner(e.message || "Purge failed.");
        });
    });
  }

  loadList();
  window.setInterval(loadList, 45_000);
})();

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
  var logoutBtn = document.getElementById("admin-logout");
  var notifyPermBtn = document.getElementById("admin-enable-notify");
  var showArchivedEl = document.getElementById("admin-show-archived");
  var threadArchiveToggleBtn = document.getElementById("admin-thread-archive-toggle");
  var trackerDoNowEl = document.getElementById("tracker-do-now");
  var trackerFollowUpEl = document.getElementById("tracker-follow-up");
  var trackerPendingEl = document.getElementById("tracker-pending");
  var trackerTodoEl = document.getElementById("tracker-todo");

  /** @type {string | null} */
  var selectedThreadId = null;

  /** When true, GET /api/admin/inbox includes archived conversations. */
  var includeArchived = false;

  /** @type {Record<string, { updatedAt: string; preview: string; lastFrom: string; archived?: boolean }>} */
  var threadListSnapshot = {};
  var latestThreads = [];
  var latestOrders = [];

  /** @type {Record<string, Set<string | number>>} */
  var seenThreadMessageIdsByThread = {};
  var latestInboxRows = [];
  /** @type {{ thread: any; messages: any[] } | null} */
  var lastSelectedThreadPayload = null;
  var adminPollTimer = null;
  var inboxPollInFlight = false;
  var adminSendInFlight = false;

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

  function notifyBtnLabelEl(btn) {
    return btn ? btn.querySelector(".admin-inbox-notify-btn__label") : null;
  }

  function syncAdminNotifyButton(btn) {
    if (!btn) return;
    var lab = notifyBtnLabelEl(btn);
    btn.classList.remove("admin-inbox-notify-btn--muted");
    btn.removeAttribute("aria-pressed");
    btn.removeAttribute("title");
    if (typeof Notification === "undefined") {
      if (lab) lab.textContent = "Alerts Not Supported";
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
    var perm = Notification.permission;
    if (perm === "denied") {
      if (lab) lab.textContent = "Alerts Blocked";
      btn.title = "Allow notifications for this site in your browser settings.";
      btn.classList.add("admin-inbox-notify-btn--muted");
      return;
    }
    if (perm === "default") {
      if (lab) lab.textContent = "Desktop Alerts";
      btn.setAttribute("aria-pressed", "false");
      return;
    }
    if (isInAppNotifyEnabled()) {
      if (lab) lab.textContent = "Turn Off Alerts";
      btn.setAttribute("aria-pressed", "true");
    } else {
      if (lab) lab.textContent = "Desktop Alerts";
      btn.setAttribute("aria-pressed", "false");
    }
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function listItemHtml(text, meta, empty) {
    var cls = "admin-tracker-item" + (empty ? " admin-tracker-item--empty" : "");
    return (
      '<li class="' +
      cls +
      '">' +
      esc(text || "No items") +
      (meta ? '<span class="admin-tracker-item__meta">' + esc(meta) + "</span>" : "") +
      "</li>"
    );
  }

  function renderTrackerList(el, items) {
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = listItemHtml("No items", "", true);
      return;
    }
    el.innerHTML = items
      .slice(0, 6)
      .map(function (x) {
        return listItemHtml(x.text, x.meta, false);
      })
      .join("");
  }

  function dateMs(value) {
    var ts = Date.parse(value || "");
    return Number.isFinite(ts) ? ts : 0;
  }

  function ageHoursFrom(value) {
    var ts = dateMs(value);
    if (!ts) return 0;
    return Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
  }

  function urgencyLabel(score) {
    if (score >= 95) return "Urgent";
    if (score >= 70) return "High";
    if (score >= 45) return "Medium";
    return "Low";
  }

  function pushRanked(bucket, item) {
    bucket.push(item);
  }

  function hasPriorityKeywords(text) {
    var s = String(text || "").toLowerCase();
    if (!s) return false;
    return /(rush|urgent|asap|priority|deadline|expedite|critical)/.test(s);
  }

  function cap(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function mapRankedItems(items) {
    return (items || [])
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return Number(b.tieBreaker || 0) - Number(a.tieBreaker || 0);
      })
      .map(function (item) {
        var urgency = urgencyLabel(item.score);
        return {
          text: item.text,
          meta: urgency + " · " + item.meta,
        };
      });
  }

  function buildTrackerBuckets(threads, orders) {
    var doNow = [];
    var followUp = [];
    var pending = [];
    var todo = [];
    var openOrdersByClient = {};

    (orders || []).forEach(function (o) {
      var status = String(o.status || "");
      if (status === "fulfilled" || status === "cancelled") return;
      var key = String(o.clientName || "").toLowerCase();
      if (!key) return;
      openOrdersByClient[key] = (openOrdersByClient[key] || 0) + 1;
    });

    (threads || []).forEach(function (t) {
      var unread = Number(t.unreadCount || 0);
      var ageHours = ageHoursFrom(t.updatedAt);
      var stale = ageHours >= 24;
      var veryStale = ageHours >= 72;
      var priorityThread = hasPriorityKeywords(t.preview || "");
      var clientOrderLoad = openOrdersByClient[String(t.clientLabel || "").toLowerCase()] || 0;
      var oldestBias = cap(Math.floor(ageHours / 12), 0, 18);
      if (t.archived) return;
      if (unread > 0) {
        pushRanked(doNow, {
          text: "Reply to " + (t.clientLabel || "client"),
          meta:
            (unread > 1 ? unread + " unread messages" : "1 unread message") +
            (stale ? " · stale thread" : "") +
            (priorityThread ? " · priority signal" : ""),
          score:
            66 +
            Math.min(24, unread * 7) +
            (stale ? 8 : 0) +
            (veryStale ? 8 : 0) +
            (priorityThread ? 12 : 0) +
            Math.min(8, clientOrderLoad * 2) +
            oldestBias,
          tieBreaker: ageHours,
        });
      } else if (t.lastFrom === "admin") {
        pushRanked(followUp, {
          text: "Follow up with " + (t.clientLabel || "client"),
          meta:
            stale
              ? "Awaiting client response · over 24h"
              : "Awaiting client response",
          score: 44 + (stale ? 16 : 0) + (veryStale ? 10 : 0) + oldestBias,
          tieBreaker: ageHours,
        });
      } else if (ageHours >= 36) {
        pushRanked(todo, {
          text: "Check dormant thread for " + (t.clientLabel || "client"),
          meta: "No recent activity",
          score: 34 + oldestBias,
          tieBreaker: ageHours,
        });
      }
    });

    (orders || []).forEach(function (o) {
      var status = String(o.status || "");
      var orderAgeHours = ageHoursFrom(o.submittedAt || o.createdAt);
      var orderStale = orderAgeHours >= 24;
      var orderVeryStale = orderAgeHours >= 72;
      var orderPrioritySignal =
        hasPriorityKeywords(o.title || "") || hasPriorityKeywords(o.summaryPreview || "");
      var oldestOrderBias = cap(Math.floor(orderAgeHours / 24), 0, 16);
      if (status === "submitted") {
        pushRanked(doNow, {
          text: "Review new order " + o.orderNumber,
          meta:
            (o.clientName || "Client") +
            (orderStale ? " · waiting over 24h" : "") +
            (orderPrioritySignal ? " · priority request" : ""),
          score:
            72 +
            (orderStale ? 14 : 0) +
            (orderVeryStale ? 12 : 0) +
            (orderPrioritySignal ? 14 : 0) +
            oldestOrderBias,
          tieBreaker: orderAgeHours,
        });
      } else if (status === "awaiting_client") {
        pushRanked(followUp, {
          text: "Request update on " + o.orderNumber,
          meta: (o.clientName || "Client") + (orderAgeHours >= 72 ? " · no client update 3d+" : ""),
          score: 42 + (orderAgeHours >= 72 ? 20 : 0) + oldestOrderBias,
          tieBreaker: orderAgeHours,
        });
      } else if (status === "in_progress") {
        pushRanked(pending, {
          text: "Continue " + o.orderNumber,
          meta: (o.clientName || "Client") + (orderAgeHours >= 120 ? " · long-running" : ""),
          score: 36 + (orderAgeHours >= 120 ? 16 : 0) + (orderPrioritySignal ? 8 : 0) + oldestOrderBias,
          tieBreaker: orderAgeHours,
        });
      } else if (status === "draft") {
        pushRanked(todo, {
          text: "Finalize draft " + o.orderNumber,
          meta: o.clientName || "Client",
          score: 40 + oldestOrderBias,
          tieBreaker: orderAgeHours,
        });
      } else if (status === "cancelled") {
        pushRanked(todo, {
          text: "Clean up cancelled " + o.orderNumber,
          meta: "Delete from orders list when confirmed",
          score: 38 + oldestOrderBias,
          tieBreaker: orderAgeHours,
        });
      }
    });

    if (todo.length === 0 && pending.length > 0) {
      pushRanked(todo, {
        text: "Create progress updates",
        meta: "Keep clients informed on active jobs",
        score: 36,
        tieBreaker: 0,
      });
    }

    return {
      doNow: mapRankedItems(doNow),
      followUp: mapRankedItems(followUp),
      pending: mapRankedItems(pending),
      todo: mapRankedItems(todo),
    };
  }

  function renderWorkflowTracker() {
    var buckets = buildTrackerBuckets(latestThreads, latestOrders);
    renderTrackerList(trackerDoNowEl, buckets.doNow);
    renderTrackerList(trackerFollowUpEl, buckets.followUp);
    renderTrackerList(trackerPendingEl, buckets.pending);
    renderTrackerList(trackerTodoEl, buckets.todo);
  }

  async function fetchAdminOrders() {
    try {
      var payload = await requestJson("/api/admin/orders");
      latestOrders = payload && payload.orders ? payload.orders : [];
      renderWorkflowTracker();
    } catch (_e) {}
  }

  function renderAttachmentsHtml(attachments) {
    if (!attachments || !attachments.length) return "";
    var parts = attachments.map(function (a) {
      var href = esc(a.url || "");
      var name = esc(a.name || "file");
      var isImg = a.kind === "image" || (a.mime && String(a.mime).indexOf("image/") === 0);
      if (isImg) {
        return (
          '<a class="admin-msg__thumb" href="' +
          href +
          '" target="_blank" rel="noopener noreferrer">' +
          '<img src="' +
          href +
          '" alt="" loading="lazy" decoding="async" />' +
          "</a>"
        );
      }
      return (
        '<a class="admin-msg__file" href="' +
        href +
        '" target="_blank" rel="noopener noreferrer">' +
        name +
        "</a>"
      );
    });
    return '<div class="admin-msg__attachments">' + parts.join("") + "</div>";
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

  async function patchThreadMessage(threadId, messageId, action) {
    var url =
      "/api/admin/threads/" +
      encodeURIComponent(threadId) +
      "/messages/" +
      encodeURIComponent(messageId);
    return requestJson(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action }),
    });
  }

  async function patchThreadArchive(threadId, action) {
    var url = "/api/admin/threads/" + encodeURIComponent(threadId);
    return requestJson(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action }),
    });
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
    var rows = latestInboxRows.slice();
    try {
      var qs = includeArchived ? "?includeArchived=1" : "";
      var payload = await requestJson("/api/admin/inbox" + qs);
      rows = payload.threads || [];
      latestInboxRows = rows.slice();
      latestThreads = rows.slice();
      renderWorkflowTracker();
    } catch (e) {
      if (latestInboxRows.length === 0) {
        rows = [];
      }
    }

    var hadSnapshot = Object.keys(threadListSnapshot).length > 0;
    var nextSnap = {};
    rows.forEach(function (r) {
      nextSnap[r.threadId] = {
        updatedAt: String(r.updatedAt || ""),
        preview: r.preview || "",
        lastFrom: r.lastFrom || "",
        unreadCount: Number(r.unreadCount || 0),
        archived: Boolean(r.archived),
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
        var unread = Number(r.unreadCount || 0);
        var archivedChip = r.archived
          ? '<span class="admin-inbox-unread" aria-label="Archived" title="Archived">Archived</span>'
          : "";
        var badge =
          unread > 0
            ? '<span class="admin-inbox-unread" aria-label="' +
              esc(unread + " unread") +
              '">' +
              (unread > 99 ? "99+" : String(unread)) +
              "</span>"
            : "";
        return (
          '<li><button type="button" class="admin-inbox-item' +
          active +
          '" data-key="' +
          esc(r.threadId) +
          '">' +
          '<span class="admin-inbox-item__row">' +
          '<span class="admin-inbox-item__name">' +
          esc(r.clientLabel) +
          "</span>" +
          archivedChip +
          badge +
          "</span>" +
          '<span class="admin-inbox-item__preview">' +
          esc(r.preview || "(no messages)") +
          "</span>" +
          '<span class="admin-inbox-item__time">' +
          esc(formatTime(r.updatedAt)) +
          "</span>" +
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

    var payload = null;
    try {
      payload = await requestJson(
        "/api/admin/threads/" + encodeURIComponent(selectedThreadId) + "/messages"
      );
      lastSelectedThreadPayload = payload;
    } catch (e) {
      if (!lastSelectedThreadPayload) {
        selectedThreadId = null;
        renderList();
        renderThread();
        return;
      }
      payload = lastSelectedThreadPayload;
      showAppToast("Live refresh paused. Showing last synced thread.");
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
    if (threadArchiveToggleBtn) {
      threadArchiveToggleBtn.textContent = t.archived ? "Unarchive conversation" : "Archive conversation";
      threadArchiveToggleBtn.setAttribute("data-thread-archived", t.archived ? "1" : "0");
    }

    threadEl.innerHTML = messages
      .map(function (m) {
        var isAdmin = m.from === "admin";
        var bodyText = String(m.body || "").trim();
        var bodyHtml = bodyText ? esc(bodyText) : "";
        var attHtml = renderAttachmentsHtml(m.attachments);
        var who = isAdmin ? "You" : "Client";
        var rowCls = "admin-msg admin-msg--" + (isAdmin ? "admin" : "client");
        if (!isAdmin && m.archived) rowCls += " admin-msg--archived";
        var actions = "";
        if (!isAdmin) {
          actions =
            '<div class="admin-msg__actions">' +
            '<button type="button" class="admin-msg__btn admin-msg__btn--danger" data-msg-action="delete" data-msg-id="' +
            esc(String(m.id)) +
            '">Delete</button>' +
            "</div>";
        }
        return (
          '<article class="' +
          rowCls +
          '" data-message-id="' +
          esc(String(m.id)) +
          '">' +
          '<div class="admin-msg__shell">' +
          '<div class="admin-msg__meta">' +
          '<span class="admin-msg__role">' +
          esc(who) +
          "</span>" +
          '<time class="admin-msg__time" datetime="' +
          esc(String(m.at || "")) +
          '">' +
          esc(formatTime(m.at)) +
          "</time>" +
          "</div>" +
          '<div class="admin-msg__content">' +
          (bodyHtml ? '<p class="admin-msg__text">' + bodyHtml + "</p>" : "") +
          attHtml +
          "</div>" +
          actions +
          "</div></article>"
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
    lastSelectedThreadPayload = null;
    renderList();
    renderThread();
    if (replyInput) replyInput.focus();
  }

  if (threadEl) {
    threadEl.addEventListener("click", async function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var act = t.getAttribute("data-msg-action");
      var mid = t.getAttribute("data-msg-id");
      if (!act || !mid || !selectedThreadId) return;
      ev.preventDefault();
      try {
        await patchThreadMessage(selectedThreadId, mid, act);
        showAppToast(act === "delete" ? "Message deleted." : "Message updated.");
        await renderList();
        await renderThread();
      } catch (err) {
        showAppToast((err && err.message) || "Could not update message.");
      }
    });
  }

  if (showArchivedEl) {
    showArchivedEl.addEventListener("change", function () {
      includeArchived = Boolean(showArchivedEl.checked);
      if (!includeArchived && selectedThreadId) {
        var active = threadListSnapshot[selectedThreadId];
        if (active && active.archived) {
          selectedThreadId = null;
          renderThread();
        }
      }
      renderList();
      if (selectedThreadId) renderThread();
    });
  }

  if (threadArchiveToggleBtn) {
    threadArchiveToggleBtn.addEventListener("click", async function () {
      if (!selectedThreadId) return;
      var archivedNow = threadArchiveToggleBtn.getAttribute("data-thread-archived") === "1";
      var nextAction = archivedNow ? "restore" : "archive";
      try {
        await patchThreadArchive(selectedThreadId, nextAction);
        showAppToast(archivedNow ? "Conversation unarchived." : "Conversation archived.");
        await renderList();
        if (!includeArchived && nextAction === "archive") {
          selectedThreadId = null;
          renderThread();
          return;
        }
        await renderThread();
      } catch (err) {
        showAppToast((err && err.message) || "Could not update conversation archive state.");
      }
    });
  }

  (async function init() {
    await fetchAdminOrders();
    var rows = await renderList();
    if (rows.length && !selectedThreadId) {
      selectThread(rows[0].threadId);
    } else {
      renderThread();
    }
  })();
  function queueAdminPoll(delayMs) {
    if (adminPollTimer) window.clearTimeout(adminPollTimer);
    adminPollTimer = window.setTimeout(async function () {
      if (inboxPollInFlight) {
        queueAdminPoll(1500);
        return;
      }
      inboxPollInFlight = true;
      try {
        await renderList();
        if (selectedThreadId) await renderThread();
      } finally {
        inboxPollInFlight = false;
        queueAdminPoll(document.hidden ? 10000 : 3000);
      }
    }, delayMs);
  }
  queueAdminPoll(3000);
  document.addEventListener("visibilitychange", function () {
    queueAdminPoll(document.hidden ? 10000 : 500);
  });
  setInterval(fetchAdminOrders, 10000);

  if (adminFileInput && adminFileHint) {
    adminFileInput.addEventListener("change", function () {
      var n = adminFileInput.files ? adminFileInput.files.length : 0;
      adminFileHint.textContent = n ? n + " file" + (n === 1 ? "" : "s") + " selected" : "";
    });
  }

  if (form && replyInput) {
    var sendBtn =
      typeof form.querySelector === "function" ? form.querySelector('button[type="submit"]') : null;
    var sendBtnDefaultLabel = sendBtn ? sendBtn.textContent : "Send reply";
    function setAdminComposeSendingState(on) {
      adminSendInFlight = !!on;
      if (sendBtn) {
        sendBtn.disabled = adminSendInFlight;
        sendBtn.textContent = adminSendInFlight ? "Sending..." : sendBtnDefaultLabel;
        sendBtn.setAttribute("aria-busy", adminSendInFlight ? "true" : "false");
      }
      if (replyInput) replyInput.disabled = adminSendInFlight;
      if (adminFileInput) adminFileInput.disabled = adminSendInFlight;
    }
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (adminSendInFlight) return;
      if (!selectedThreadId) return;
      var text = String(replyInput.value || "").trim();
      var files = adminFileInput && adminFileInput.files ? adminFileInput.files : null;
      if (!text && (!files || !files.length)) return;
      setAdminComposeSendingState(true);
      try {
        await postThreadMessage(selectedThreadId, text, files);
      } catch (err) {
        showAppToast((err && err.message) || "Could not send reply.");
        setAdminComposeSendingState(false);
        return;
      }
      replyInput.value = "";
      if (adminFileInput) adminFileInput.value = "";
      if (adminFileHint) adminFileHint.textContent = "";
      try {
        await renderList();
        await renderThread();
      } finally {
        setAdminComposeSendingState(false);
      }
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

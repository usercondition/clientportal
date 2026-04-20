(function () {
  var listEl = document.getElementById("admin-orders-list");
  var listEmpty = document.getElementById("admin-orders-list-empty");
  var emptyDetail = document.getElementById("admin-orders-empty");
  var detailWrap = document.getElementById("admin-orders-detail");
  var dbBanner = document.getElementById("admin-orders-db-banner");

  var detailNum = document.getElementById("admin-orders-detail-num");
  var detailTitle = document.getElementById("admin-orders-detail-title");
  var detailClient = document.getElementById("admin-orders-detail-client");
  var detailMoney = document.getElementById("admin-orders-money");
  var detailSummary = document.getElementById("admin-orders-summary");
  var detailTimeline = document.getElementById("admin-orders-timeline");
  var statusSelect = document.getElementById("admin-orders-status");
  var saveBtn = document.getElementById("admin-orders-save-status");
  var cancelBtn = document.getElementById("admin-orders-cancel-order");

  /** @type {string | null} */
  var selectedOrderNum = null;

  /** @type {Array<{ orderNumber: string }>} */
  var lastListSnapshot = [];

  function formatUsdFromCents(cents) {
    if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return "—";
    var n = Number(cents) / 100;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
    } catch (e) {
      return n >= 0 ? "$" + n.toFixed(2) : "—";
    }
  }

  function formatInt(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
    try {
      return new Intl.NumberFormat(undefined).format(Number(n));
    } catch (e) {
      return String(n);
    }
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
      return iso || "";
    }
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

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function badgeClass(status) {
    var known = {
      draft: "admin-orders-item__badge--draft",
      submitted: "admin-orders-item__badge--submitted",
      in_progress: "admin-orders-item__badge--in_progress",
      awaiting_client: "admin-orders-item__badge--awaiting_client",
      fulfilled: "admin-orders-item__badge--fulfilled",
      cancelled: "admin-orders-item__badge--cancelled",
    };
    return known[status] || "";
  }

  function setMetrics(m, connected) {
    var ids = [
      ["metric-o-new", m ? formatInt(m.newRequests) : "—"],
      ["metric-o-inprog", m ? formatInt(m.inProgress) : "—"],
      ["metric-o-await", m ? formatInt(m.awaitingClient) : "—"],
      ["metric-o-open", m ? formatInt(m.openPipeline) : "—"],
      ["metric-o-pipeline", m ? formatUsdFromCents(m.pipelineValueCents) : "—"],
      ["metric-o-fulfilled", m ? formatInt(m.fulfilledMtd) : "—"],
      ["metric-o-cancelled", m ? formatInt(m.cancelledMtd) : "—"],
      ["metric-o-7d", m ? formatInt(m.ordersCreated7d) : "—"],
    ];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i][0]);
      if (el) el.textContent = ids[i][1];
    }
    if (dbBanner) {
      dbBanner.hidden = Boolean(connected);
      dbBanner.textContent = connected
        ? ""
        : "Database not configured or unreachable — connect DATABASE_URL to load orders.";
    }
  }

  function renderList(orders) {
    lastListSnapshot = orders || [];
    if (!listEl) return;
    if (!orders || !orders.length) {
      listEl.innerHTML = "";
      if (listEmpty) listEmpty.hidden = false;
      return;
    }
    if (listEmpty) listEmpty.hidden = true;
    listEl.innerHTML = orders
      .map(function (o) {
        var active = selectedOrderNum && o.orderNumber === selectedOrderNum ? " is-active" : "";
        var bcls = badgeClass(o.status);
        var badgeExtra = bcls ? " " + bcls : "";
        return (
          '<li><button type="button" class="admin-orders-item' +
          active +
          '" data-order="' +
          esc(o.orderNumber) +
          '">' +
          '<span class="admin-orders-item__top">' +
          '<span class="admin-orders-item__num">' +
          esc(o.orderNumber) +
          "</span>" +
          '<span class="admin-orders-item__badge' +
          badgeExtra +
          '">' +
          esc(o.statusLabel || o.status) +
          "</span>" +
          "</span>" +
          '<span class="admin-orders-item__title">' +
          esc(o.title) +
          "</span>" +
          '<span class="admin-orders-item__meta">' +
          esc(o.clientName) +
          " · " +
          esc(o.summaryPreview || "") +
          "</span>" +
          "</button></li>"
        );
      })
      .join("");
  }

  function renderDetail(data) {
    if (!data || !data.order) return;
    var o = data.order;
    var c = data.client || {};
    if (detailNum) detailNum.textContent = o.orderNumber || "";
    if (detailTitle) detailTitle.textContent = o.title || "—";
    var email = c.email ? String(c.email) : "";
    var name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Client";
    if (detailClient) {
      detailClient.innerHTML =
        esc(name) +
        (email
          ? ' · <a href="mailto:' + esc(email) + '">' + esc(email) + "</a>"
          : "");
    }
    if (detailMoney) {
      detailMoney.innerHTML =
        "<span><strong>Total</strong> " +
        esc(o.total || formatUsdFromCents(o.totalCents)) +
        "</span>" +
        "<span>Subtotal " +
        esc(formatUsdFromCents(o.subtotalCents)) +
        "</span>" +
        "<span>Tax " +
        esc(formatUsdFromCents(o.taxCents)) +
        "</span>" +
        "<span>Shipping " +
        esc(formatUsdFromCents(o.shippingCents)) +
        "</span>";
    }
    if (detailSummary) detailSummary.textContent = o.summary || "(No summary)";
    if (statusSelect) statusSelect.value = o.status || "submitted";

    if (cancelBtn) {
      cancelBtn.disabled = o.status === "cancelled" || o.status === "fulfilled";
    }
    if (saveBtn && statusSelect) {
      var locked = o.status === "cancelled" || o.status === "fulfilled";
      saveBtn.disabled = locked;
      statusSelect.disabled = locked;
    }

    if (detailTimeline) {
      var tl = data.timeline || [];
      detailTimeline.innerHTML = tl
        .map(function (t) {
          return (
            "<li>" +
            "<time>" +
            esc(formatTime(t.createdAt)) +
            "</time>" +
            "<strong>" +
            esc(t.label || t.code) +
            "</strong>" +
            (t.details
              ? "<p>" + esc(t.details) + "</p>"
              : "") +
            '<span class="by">' +
            esc(t.createdBy || "system") +
            "</span>" +
            "</li>"
          );
        })
        .join("");
    }

    if (emptyDetail) emptyDetail.hidden = true;
    if (detailWrap) detailWrap.hidden = false;
  }

  function showEmptyDetail() {
    if (emptyDetail) emptyDetail.hidden = false;
    if (detailWrap) detailWrap.hidden = true;
  }

  async function fetchListPayload() {
    var res = await fetch("/api/admin/orders");
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.error || "Failed to load orders.");
    return data;
  }

  async function fetchDetail(orderNumber) {
    var res = await fetch("/api/admin/orders/" + encodeURIComponent(orderNumber));
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.error || "Could not load order.");
    return data;
  }

  async function patchStatus(orderNumber, status) {
    var res = await fetch("/api/admin/orders/" + encodeURIComponent(orderNumber), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status }),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.error || "Update failed.");
    return data;
  }

  async function selectOrder(orderNumber) {
    selectedOrderNum = orderNumber || null;
    renderList(lastListSnapshot);
    if (!orderNumber) {
      showEmptyDetail();
      return;
    }
    try {
      var data = await fetchDetail(orderNumber);
      renderDetail(data);
    } catch (err) {
      showAppToast((err && err.message) || "Could not load order.");
      showEmptyDetail();
    }
  }

  async function refreshAll() {
    try {
      var data = await fetchListPayload();
      setMetrics(data.metrics, data.databaseConnected);
      renderList(data.orders || []);
      if (selectedOrderNum) {
        var still = (data.orders || []).some(function (o) {
          return o.orderNumber === selectedOrderNum;
        });
        if (still) {
          try {
            var d = await fetchDetail(selectedOrderNum);
            renderDetail(d);
          } catch (_e) {
            selectedOrderNum = null;
            showEmptyDetail();
          }
        } else {
          selectedOrderNum = null;
          showEmptyDetail();
        }
      }
    } catch (err) {
      setMetrics(null, false);
      showAppToast((err && err.message) || "Could not refresh orders.");
    }
  }

  if (listEl) {
    listEl.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".admin-orders-item");
      if (!btn) return;
      var num = btn.getAttribute("data-order");
      if (!num) return;
      selectOrder(num);
    });
  }

  if (saveBtn && statusSelect) {
    saveBtn.addEventListener("click", async function () {
      if (!selectedOrderNum) return;
      saveBtn.disabled = true;
      try {
        var data = await patchStatus(selectedOrderNum, statusSelect.value);
        renderDetail(data);
        showAppToast("Status updated.");
        var listData = await fetchListPayload();
        setMetrics(listData.metrics, listData.databaseConnected);
        renderList(listData.orders || []);
      } catch (err) {
        showAppToast((err && err.message) || "Could not save.");
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  if (cancelBtn && statusSelect) {
    cancelBtn.addEventListener("click", async function () {
      if (!selectedOrderNum) return;
      if (!window.confirm("Mark order " + selectedOrderNum + " as cancelled? The client will be notified by email if SMTP is configured.")) {
        return;
      }
      cancelBtn.disabled = true;
      try {
        statusSelect.value = "cancelled";
        var data = await patchStatus(selectedOrderNum, "cancelled");
        renderDetail(data);
        showAppToast("Order cancelled.");
        var listData = await fetchListPayload();
        setMetrics(listData.metrics, listData.databaseConnected);
        renderList(listData.orders || []);
      } catch (err) {
        showAppToast((err && err.message) || "Could not cancel.");
      } finally {
        cancelBtn.disabled = false;
      }
    });
  }

  refreshAll();
  window.setInterval(refreshAll, 5000);
})();

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
  var quoteItemsHost = document.getElementById("admin-orders-quote-items");
  var quoteTax = document.getElementById("admin-orders-quote-tax");
  var quoteShipping = document.getElementById("admin-orders-quote-shipping");
  var saveQuoteBtn = document.getElementById("admin-orders-save-quote");
  var quotePanel = document.getElementById("admin-orders-quote");
  var quoteAcceptedPanel = document.getElementById("admin-orders-quote-accepted");
  var quoteAcceptedItems = document.getElementById("admin-orders-quote-accepted-items");
  var quoteAcceptedMeta = document.getElementById("admin-orders-quote-accepted-meta");
  var statusSelect = document.getElementById("admin-orders-status");
  var saveBtn = document.getElementById("admin-orders-save-status");
  var cancelBtn = document.getElementById("admin-orders-cancel-order");
  var deleteBtn = document.getElementById("admin-orders-delete-order");

  /** @type {string | null} */
  var selectedOrderNum = null;

  /** @type {Array<{ orderNumber: string }>} */
  var lastListSnapshot = [];
  var isQuoteEditing = false;
  var isQuoteDirty = false;

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

  function formatPaymentMethod(code) {
    var key = String(code || "").trim();
    var m = {
      paypal: "PayPal",
      venmo: "Venmo",
      zelle: "Zelle",
      cash_app: "Cash App",
    };
    if (!key) return "";
    return m[key] || key.replace(/_/g, " ");
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
      var payLine = "";
      if (o.paymentMethod) {
        payLine =
          "<span><strong>Payment</strong> " +
          esc(formatPaymentMethod(o.paymentMethod)) +
          (Number(o.paymentFeeCents || 0) > 0
            ? " (fee " + esc(formatUsdFromCents(o.paymentFeeCents)) + ")"
            : "") +
          "</span>";
      }
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
        "</span>" +
        payLine;
    }
    if (detailSummary) detailSummary.textContent = o.summary || "(No summary)";
    renderQuoteSection(data);
    if (statusSelect) statusSelect.value = o.status || "submitted";

    if (cancelBtn) {
      cancelBtn.disabled = o.status === "cancelled" || o.status === "fulfilled";
    }
    if (deleteBtn) {
      deleteBtn.disabled = o.status !== "cancelled";
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

  function renderAcceptedQuote(data) {
    if (!quoteAcceptedItems || !quoteAcceptedMeta) return;
    var o = data.order || {};
    var items = data.quoteItems || [];
    if (!items.length) {
      quoteAcceptedItems.innerHTML = '<p class="admin-orders-quote__empty">No line items on file.</p>';
    } else {
      quoteAcceptedItems.innerHTML = items
        .map(function (it) {
          var lineCents = it.isIncluded
            ? Math.round(Number(it.quantityApproved || 0) * Number(it.unitPriceCents || 0))
            : 0;
          return (
            '<div class="admin-orders-quote__row admin-orders-quote__row--readonly">' +
            "<div><strong>" +
            esc(it.description || "Item") +
            "</strong>" +
            (it.unit
              ? '<div class="admin-orders-quote-readonly-sub">' + esc(it.unit) + "</div>"
              : "") +
            "</div>" +
            '<span class="admin-orders-quote-readonly-val">' +
            esc(String(it.quantityApproved || 0)) +
            "</span>" +
            '<span class="admin-orders-quote-readonly-val">' +
            esc(formatUsdFromCents(lineCents)) +
            "</span>" +
            '<span class="admin-orders-quote-readonly-val">' +
            (it.isIncluded ? "Yes" : "No") +
            "</span>" +
            "</div>"
          );
        })
        .join("");
    }
    var bits = [];
    if (o.paymentMethod) {
      bits.push("<strong>Payment</strong> " + esc(formatPaymentMethod(o.paymentMethod)));
    }
    if (Number(o.paymentFeeCents || 0) > 0) {
      bits.push("Fee " + esc(formatUsdFromCents(o.paymentFeeCents)));
    }
    if (o.clientRevisionAt) {
      bits.push("Confirmed " + esc(formatTime(o.clientRevisionAt)));
    }
    quoteAcceptedMeta.innerHTML = bits.length ? "<p>" + bits.join(" · ") + "</p>" : "";
  }

  function renderQuoteSection(data) {
    var o = data.order || {};
    var locked = Boolean(o.quoteBuilderLocked);
    if (locked) {
      isQuoteDirty = false;
      isQuoteEditing = false;
    }
    if (quoteAcceptedPanel) quoteAcceptedPanel.hidden = !locked;
    if (quotePanel) quotePanel.hidden = locked;
    if (locked) {
      renderAcceptedQuote(data);
    } else {
      renderQuoteEditor(data);
    }
    var wfLocked = o.status === "cancelled" || o.status === "fulfilled";
    var quoteLocked = locked;
    if (quoteTax) quoteTax.disabled = wfLocked || quoteLocked;
    if (quoteShipping) quoteShipping.disabled = wfLocked || quoteLocked;
    if (saveQuoteBtn) saveQuoteBtn.disabled = wfLocked || quoteLocked;
  }

  async function patchQuote(orderNumber, payload) {
    var res = await fetch("/api/admin/orders/" + encodeURIComponent(orderNumber) + "/quote", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.error || "Quote update failed.");
    return data;
  }

  function renderQuoteEditor(data) {
    if (!quoteItemsHost || !data) return;
    if (!data.quoteItems) return;
    if (isQuoteDirty) return;
    var items = data.quoteItems || [];
    quoteItemsHost.innerHTML = items
      .map(function (it) {
        return (
          '<div class="admin-orders-quote__row" data-quote-item-id="' +
          esc(it.id) +
          '" data-quote-requested="' +
          esc(String(it.quantityRequested || 1)) +
          '" data-quote-unit="' +
          esc(it.unit || "") +
          '" data-quote-desc="' +
          esc(it.description || "Item") +
          '">' +
          '<div><strong>' +
          esc(it.description) +
          "</strong><div style='font-size:.72rem;color:var(--text-muted)'>Requested " +
          esc(String(it.quantityRequested)) +
          (it.unit ? " " + esc(it.unit) : "") +
          "</div></div>" +
          '<input type="number" min="0" value="' +
          esc(String(it.quantityApproved || 0)) +
          '" data-quote-qty />' +
          '<input type="number" min="0" step="0.01" value="' +
          esc((Number(it.unitPriceCents || 0) / 100).toFixed(2)) +
          '" data-quote-price />' +
          '<label><input type="checkbox" data-quote-inc ' +
          (it.isIncluded ? "checked" : "") +
          "/> Include</label>" +
          "</div>"
        );
      })
      .join("");
    if (quoteTax) quoteTax.value = (Number(data.order.taxCents || 0) / 100).toFixed(2);
    if (quoteShipping) quoteShipping.value = (Number(data.order.shippingCents || 0) / 100).toFixed(2);
  }

  function quoteInputHasFocus() {
    if (!quoteItemsHost) return false;
    var ae = document.activeElement;
    return Boolean(ae && quoteItemsHost.contains(ae));
  }

  async function deleteCancelledOrder(orderNumber) {
    var res = await fetch("/api/admin/orders/" + encodeURIComponent(orderNumber), {
      method: "DELETE",
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.error || "Delete failed.");
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
            if (!isQuoteEditing && !quoteInputHasFocus()) {
              var d = await fetchDetail(selectedOrderNum);
              renderDetail(d);
            }
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
      if (selectedOrderNum === num) {
        selectedOrderNum = null;
        renderList(lastListSnapshot);
        showEmptyDetail();
        return;
      }
      selectOrder(num);
    });
  }

  if (saveBtn && statusSelect) {
    saveBtn.addEventListener("click", async function () {
      if (!selectedOrderNum) return;
      saveBtn.disabled = true;
      try {
        await patchStatus(selectedOrderNum, statusSelect.value);
        showAppToast("Status updated.");
        var listData = await fetchListPayload();
        setMetrics(listData.metrics, listData.databaseConnected);
        renderList(listData.orders || []);
        await selectOrder(selectedOrderNum);
      } catch (err) {
        showAppToast((err && err.message) || "Could not save.");
      } finally {
        if (saveBtn && statusSelect) {
          var st = statusSelect.value;
          saveBtn.disabled = st === "cancelled" || st === "fulfilled";
        }
      }
    });
  }

  if (saveQuoteBtn) {
    if (quoteItemsHost) {
      quoteItemsHost.addEventListener("focusin", function () {
        isQuoteEditing = true;
      });
      quoteItemsHost.addEventListener("focusout", function () {
        window.setTimeout(function () {
          isQuoteEditing = quoteInputHasFocus();
        }, 0);
      });
      quoteItemsHost.addEventListener("input", function () {
        isQuoteDirty = true;
      });
      quoteItemsHost.addEventListener("change", function () {
        isQuoteDirty = true;
      });
    }
    if (quoteTax) {
      quoteTax.addEventListener("input", function () {
        isQuoteDirty = true;
      });
    }
    if (quoteShipping) {
      quoteShipping.addEventListener("input", function () {
        isQuoteDirty = true;
      });
    }
    saveQuoteBtn.addEventListener("click", async function () {
      if (!selectedOrderNum || !quoteItemsHost) return;
      var rows = Array.prototype.slice.call(quoteItemsHost.querySelectorAll("[data-quote-item-id]"));
      var items = rows.map(function (row) {
        var qtyEl = row.querySelector("[data-quote-qty]");
        var priceEl = row.querySelector("[data-quote-price]");
        var incEl = row.querySelector("[data-quote-inc]");
        var requested = Math.max(
          1,
          Math.floor(Number(row.getAttribute("data-quote-requested") || "1"))
        );
        var qtyApproved = Math.max(0, Math.floor(Number(qtyEl && qtyEl.value ? qtyEl.value : 0)));
        return {
          id: row.getAttribute("data-quote-item-id"),
          description: row.getAttribute("data-quote-desc") || "Item",
          quantityRequested: requested,
          quantityApproved: Math.min(qtyApproved, requested),
          unitPriceCents: Math.max(0, Math.round(Number(priceEl && priceEl.value ? priceEl.value : 0) * 100)),
          isIncluded: Boolean(incEl && incEl.checked),
          unit: row.getAttribute("data-quote-unit") || "",
          adminNote: "",
        };
      });
      saveQuoteBtn.disabled = true;
      try {
        await patchQuote(selectedOrderNum, {
          items: items,
          taxCents: Math.round(Number(quoteTax && quoteTax.value ? quoteTax.value : 0) * 100),
          shippingCents: Math.round(Number(quoteShipping && quoteShipping.value ? quoteShipping.value : 0) * 100),
        });
        showAppToast("Quote sent to client.");
        isQuoteDirty = false;
        isQuoteEditing = false;
        await selectOrder(selectedOrderNum);
        var listData = await fetchListPayload();
        setMetrics(listData.metrics, listData.databaseConnected);
        renderList(listData.orders || []);
      } catch (err) {
        showAppToast((err && err.message) || "Could not save quote.");
      } finally {
        if (saveQuoteBtn && statusSelect) {
          var wf = statusSelect.value === "cancelled" || statusSelect.value === "fulfilled";
          var qb = quotePanel && quotePanel.hidden;
          saveQuoteBtn.disabled = wf || qb;
        }
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
        await patchStatus(selectedOrderNum, "cancelled");
        showAppToast("Order cancelled.");
        var listData = await fetchListPayload();
        setMetrics(listData.metrics, listData.databaseConnected);
        renderList(listData.orders || []);
        await selectOrder(selectedOrderNum);
      } catch (err) {
        showAppToast((err && err.message) || "Could not cancel.");
      } finally {
        cancelBtn.disabled = false;
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async function () {
      if (!selectedOrderNum) return;
      var deletingNum = selectedOrderNum;
      var active = lastListSnapshot.find(function (o) {
        return o.orderNumber === deletingNum;
      });
      if (!active || active.status !== "cancelled") {
        showAppToast("Only cancelled orders can be deleted.");
        return;
      }
      if (
        !window.confirm(
          "Delete cancelled order " + deletingNum + "? This permanently removes it from the admin list."
        )
      ) {
        return;
      }
      deleteBtn.disabled = true;
      try {
        await deleteCancelledOrder(deletingNum);
        selectedOrderNum = null;
        showEmptyDetail();
        showAppToast("Cancelled order deleted.");
        var listData = await fetchListPayload();
        setMetrics(listData.metrics, listData.databaseConnected);
        renderList(listData.orders || []);
      } catch (err) {
        showAppToast((err && err.message) || "Could not delete order.");
      } finally {
        deleteBtn.disabled = false;
      }
    });
  }

  refreshAll();
  window.setInterval(refreshAll, 5000);
})();

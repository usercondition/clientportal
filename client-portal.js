(function () {
  if (!window.Portal) return;

  var p = Portal.getProfile();
  if (!p) return;

  var seenMessageIds = new Set();
  var baseTitle = document.title;
  var mobileChatMq =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 899px)")
      : null;

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

  try {
    var sp = new URLSearchParams(window.location.search);
    if (sp.get("order") === "submitted") {
      showAppToast("Your order request was submitted.");
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", "client-portal.html");
      }
    }
  } catch (e) {}

  var PORTAL_NOTIFY_STORAGE = "portal_notify_ui_enabled";

  function isInAppNotifyEnabled() {
    try {
      var v = localStorage.getItem(PORTAL_NOTIFY_STORAGE);
      if (v === null || v === undefined) return true;
      return v === "1" || v === "true";
    } catch (e) {
      return true;
    }
  }

  function setInAppNotifyEnabled(on) {
    try {
      localStorage.setItem(PORTAL_NOTIFY_STORAGE, on ? "1" : "0");
    } catch (e) {}
  }

  function maybeBrowserNotify(title, body) {
    if (typeof Notification !== "function" || Notification.permission !== "granted") return;
    if (!isInAppNotifyEnabled()) return;
    try {
      new Notification(title, { body: body });
    } catch (e) {}
  }

  function syncPortalNotifyButton(btn) {
    if (!btn) return;
    btn.classList.remove("portal-inline-btn--muted");
    btn.removeAttribute("aria-pressed");
    btn.removeAttribute("title");
    if (typeof Notification === "undefined") {
      btn.textContent = "Notifications not supported";
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
    var perm = Notification.permission;
    if (perm === "denied") {
      btn.textContent = "Notifications blocked (browser)";
      btn.title = "Allow notifications for this site in your browser settings, then reload.";
      btn.classList.add("portal-inline-btn--muted");
      return;
    }
    if (perm === "default") {
      btn.textContent = "Enable desktop notifications";
      btn.setAttribute("aria-pressed", "false");
      return;
    }
    if (isInAppNotifyEnabled()) {
      btn.textContent = "Disable desktop notifications";
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.textContent = "Enable desktop notifications";
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

  var chatPanel = document.getElementById("portal-messages-panel");
  var chatOpenBtn = document.getElementById("portal-chat-open");
  var chatCloseBtn = document.getElementById("portal-chat-close");
  var chatBackdrop = document.getElementById("portal-chat-backdrop");
  var chatInput = document.getElementById("portal-msg-input");
  var messagePollTimer = null;
  var messageRenderInFlight = false;
  var MESSAGE_POLL_MS_ACTIVE = 3000;
  var MESSAGE_POLL_MS_HIDDEN = 12000;
  var lockedPageScrollY = 0;
  var lastSuccessfulMessages = [];
  var hadMessageRefreshError = false;

  var quoteDialog = document.getElementById("portal-quote-dialog");
  var quoteForm = document.getElementById("portal-quote-form");
  var quoteItemsHost = document.getElementById("portal-quote-items");
  var quoteMeta = document.getElementById("portal-quote-meta");
  var quoteTotals = document.getElementById("portal-quote-totals");
  var quoteWarn = document.getElementById("portal-quote-warn");
  var quoteSubmit = document.getElementById("portal-quote-submit");
  var quoteFeeAckWrap = document.getElementById("portal-quote-fee-ack");
  var quoteFeeAckCb = document.getElementById("portal-quote-fee-ack-cb");
  var paymentNextDialog = document.getElementById("portal-payment-next-dialog");
  var paymentNextTitle = document.getElementById("portal-payment-next-title");
  var paymentNextBody = document.getElementById("portal-payment-next-body");
  var paymentNextTotal = document.getElementById("portal-payment-next-total");
  var paymentNextLink = document.getElementById("portal-payment-next-link");
  var paymentNextDone = document.getElementById("portal-payment-next-done");
  var activeQuoteOrderNumber = "";

  function getChatThreadEl() {
    return document.getElementById("portal-thread");
  }

  function scrollChatThreadToEnd() {
    var thread = getChatThreadEl();
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }

  function lockPageScrollForMobileChat() {
    if (!document.body) return;
    if (document.body.classList.contains("portal-body--chat-locked")) return;
    lockedPageScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add("portal-body--chat-locked");
    document.body.style.position = "fixed";
    document.body.style.top = -lockedPageScrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }

  function unlockPageScrollForMobileChat() {
    if (!document.body) return;
    if (!document.body.classList.contains("portal-body--chat-locked")) return;
    document.body.classList.remove("portal-body--chat-locked");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, lockedPageScrollY || 0);
  }

  function setMobileChatOpen(on) {
    if (!mobileChatMq || !mobileChatMq.matches) return;
    if (!chatPanel) return;
    document.body.classList.toggle("portal-body--chat-view", !!on);
    if (on) {
      lockPageScrollForMobileChat();
    } else {
      unlockPageScrollForMobileChat();
    }
    if (chatOpenBtn) chatOpenBtn.setAttribute("aria-expanded", on ? "true" : "false");
    chatPanel.hidden = !on;
    if (on) {
      chatPanel.removeAttribute("aria-hidden");
    } else {
      chatPanel.setAttribute("aria-hidden", "true");
    }
    if (on && chatInput) {
      window.setTimeout(function () {
        try {
          chatInput.focus({ preventScroll: true });
        } catch (_e) {
          chatInput.focus();
        }
        window.requestAnimationFrame(function () {
          scrollChatThreadToEnd();
        });
      }, 120);
    } else if (!on && chatInput && document.activeElement === chatInput) {
      chatInput.blur();
    }
  }

  function syncMobileChatState() {
    var isMobile = Boolean(mobileChatMq && mobileChatMq.matches);
    if (!isMobile) {
      document.body.classList.remove("portal-body--chat-view");
      unlockPageScrollForMobileChat();
      if (chatBackdrop) chatBackdrop.hidden = true;
      if (chatOpenBtn) chatOpenBtn.setAttribute("aria-expanded", "false");
      if (chatPanel) {
        chatPanel.hidden = false;
        chatPanel.removeAttribute("aria-hidden");
      }
      return;
    }
    var open = document.body.classList.contains("portal-body--chat-view");
    if (chatPanel) {
      chatPanel.hidden = !open;
      if (open) {
        chatPanel.removeAttribute("aria-hidden");
      } else {
        chatPanel.setAttribute("aria-hidden", "true");
      }
    }
    if (open) {
      lockPageScrollForMobileChat();
    } else {
      unlockPageScrollForMobileChat();
    }
    if (chatBackdrop) chatBackdrop.hidden = true;
    if (chatOpenBtn) chatOpenBtn.setAttribute("aria-expanded", open ? "true" : "false");
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

    function orderItem(o) {
      var st = esc(o.statusLabel || "");
      var payPm = o.paymentMethod ? String(o.paymentMethod).trim() : "";
      var payLabel = payPm
        ? {
            paypal: "PayPal",
            venmo: "Venmo",
            zelle: "Zelle",
            cash_app: "Cash App",
          }[payPm] || payPm.replace(/_/g, " ")
        : "";
      var payHint =
        payLabel && !o.quoteEditable
          ? '<p class="portal-order-meta">Payment on file: ' + esc(payLabel) + ".</p>"
          : "";
      var cancelBtn = o.cancellable
        ? '<button type="button" class="btn btn-ghost portal-order-cancel-btn" data-order-number="' +
          esc(o.id) +
          '">Cancel order</button>'
        : "";
      return (
        '<li><details class="portal-order-disclosure">' +
        '<summary class="portal-order-summary">' +
        '<span class="portal-order-summary__main">' +
        '<span class="portal-order-summary__id">' +
        esc(o.id) +
        "</span>" +
        '<span class="portal-order-summary__chevron" aria-hidden="true"></span>' +
        "</span>" +
        '<span class="portal-order-summary__status">' +
        st +
        "</span>" +
        "</summary>" +
        '<div class="portal-order-expanded">' +
        '<p class="portal-order-title">' +
        esc(o.title) +
        "</p>" +
        '<div class="portal-order-body">' +
        esc(o.summary) +
        "</div>" +
        '<p class="portal-order-meta">' +
        esc(o.dateLabel) +
        "</p>" +
        '<p class="portal-order-total">Total: ' +
        esc(o.total) +
        "</p>" +
        payHint +
        (o.quoteEditable
          ? '<button type="button" class="btn btn-primary portal-order-review-btn" data-review-order="' +
            esc(o.id) +
            '">Review quote</button>'
          : "") +
        (cancelBtn ? '<div class="portal-order-actions">' + cancelBtn + "</div>" : "") +
        "</div>" +
        "</details></li>"
      );
    }

    if (curEl) {
      curEl.innerHTML = current.map(orderItem).join("");
      if (curEmpty) curEmpty.hidden = current.length > 0;
    }
    if (pastEl) {
      pastEl.innerHTML = past.map(orderItem).join("");
      if (pastEmpty) pastEmpty.hidden = past.length > 0;
    }
  }

  var ordersPanel = document.querySelector(".portal-panel--orders");
  if (ordersPanel) {
    ordersPanel.addEventListener("click", function (e) {
      var reviewBtn = e.target && e.target.closest && e.target.closest("[data-review-order]");
      if (reviewBtn) {
        e.preventDefault();
        var reviewOrderNum = reviewBtn.getAttribute("data-review-order");
        if (reviewOrderNum) openQuoteDialog(reviewOrderNum);
        return;
      }
      var btn = e.target && e.target.closest && e.target.closest(".portal-order-cancel-btn");
      if (!btn) return;
      e.preventDefault();
      var num = btn.getAttribute("data-order-number");
      if (!num || !window.Portal) return;
      if (!window.confirm("Cancel order " + num + "? This cannot be undone from the portal.")) return;
      btn.disabled = true;
      Portal.cancelOrder(num)
        .then(function () {
          showAppToast("Order cancelled.");
          return renderOrders();
        })
        .catch(function (err) {
          btn.disabled = false;
          showAppToast((err && err.message) || "Could not cancel order.");
        });
    });
  }

  function methodFeeBps(method) {
    return method === "paypal" || method === "venmo" ? 400 : 0;
  }

  function openPaymentNextDialog(summary, paymentHints) {
    if (!paymentNextDialog || !paymentNextTitle || !paymentNextBody || !paymentNextTotal || !paymentNextDone) return;
    paymentNextTitle.textContent =
      (paymentHints && paymentHints.headline) || "Next: complete your payment";
    var steps = (paymentHints && paymentHints.steps) || [];
    paymentNextBody.innerHTML = steps
      .map(function (s) {
        return "<p>" + esc(String(s)) + "</p>";
      })
      .join("");
    paymentNextTotal.textContent = summary && summary.total ? "Amount due: " + String(summary.total) : "";
    if (paymentNextLink) paymentNextLink.innerHTML = "";
    var payUrl = paymentHints && paymentHints.payUrl;
    if (payUrl && paymentNextLink) {
      var a = document.createElement("a");
      a.href = payUrl;
      a.className = "btn btn-primary portal-payment-next__open";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = (paymentHints && paymentHints.payLinkLabel) || "Open payment page";
      paymentNextLink.appendChild(a);
    }
    var onDone = function () {
      paymentNextDialog.close();
      paymentNextDone.removeEventListener("click", onDone);
    };
    paymentNextDone.addEventListener("click", onDone);
    paymentNextDialog.showModal();
  }

  function readDialogItems() {
    if (!quoteItemsHost) return [];
    var rows = Array.prototype.slice.call(quoteItemsHost.querySelectorAll("[data-quote-item-id]"));
    return rows.map(function (row) {
      var id = row.getAttribute("data-quote-item-id");
      var inc = row.querySelector("[data-quote-inc]");
      var qty = row.querySelector("[data-quote-qty]");
      return {
        id: id,
        isIncluded: Boolean(inc && inc.checked),
        quantityApproved: Number(qty && qty.value ? qty.value : 0),
      };
    });
  }

  function recalcQuoteTotals() {
    if (!quoteForm || !quoteTotals || !quoteItemsHost) return;
    var methodEl = quoteForm.querySelector('input[name="paymentMethod"]:checked');
    var method = methodEl ? methodEl.value : "";
    var taxCents = Math.max(0, Math.floor(Number(quoteForm.dataset.quoteTaxCents || 0)));
    var shipCents = Math.max(0, Math.floor(Number(quoteForm.dataset.quoteShippingCents || 0)));
    var lineSubtotal = 0;
    var rows = Array.prototype.slice.call(quoteItemsHost.querySelectorAll("[data-quote-item-id]"));
    rows.forEach(function (row) {
      var included = row.querySelector("[data-quote-inc]");
      var qtyEl = row.querySelector("[data-quote-qty]");
      var unitCents = Number(row.getAttribute("data-unit-cents") || 0);
      var maxQty = Number(row.getAttribute("data-max-qty") || 0);
      var qty = Math.max(0, Math.min(Number(qtyEl && qtyEl.value ? qtyEl.value : 0), maxQty));
      if (qtyEl) {
        qtyEl.value = String(Math.floor(qty));
        qtyEl.disabled = !(included && included.checked);
      }
      if (included && included.checked) lineSubtotal += Math.floor(qty) * unitCents;
    });
    var feeBps = methodFeeBps(method);
    var fee = Math.round((lineSubtotal * feeBps) / 10000);
    var grand = lineSubtotal + fee + taxCents + shipCents;
    if (quoteWarn) {
      quoteWarn.hidden = feeBps <= 0;
      if (!quoteWarn.hidden) {
        quoteWarn.textContent =
          "PayPal and Venmo include a 4% processing fee. The fee is included in the estimated total below.";
      }
    }
    if (quoteFeeAckWrap && quoteFeeAckCb) {
      var needAck = feeBps > 0;
      quoteFeeAckWrap.hidden = !needAck;
      if (!needAck) quoteFeeAckCb.checked = false;
    }
    quoteTotals.setAttribute("aria-live", "polite");
    quoteTotals.style.whiteSpace = "pre-line";
    var parts = [];
    parts.push("Line items $" + (lineSubtotal / 100).toFixed(2));
    if (fee > 0) parts.push("Processing fee (4%) $" + (fee / 100).toFixed(2));
    if (taxCents > 0) parts.push("Estimated tax $" + (taxCents / 100).toFixed(2));
    if (shipCents > 0) parts.push("Shipping $" + (shipCents / 100).toFixed(2));
    parts.push("Estimated amount due $" + (grand / 100).toFixed(2));
    quoteTotals.textContent = parts.join("\n");
    if (quoteSubmit) quoteSubmit.disabled = lineSubtotal <= 0 || !method;
  }

  async function openQuoteDialog(orderNumber) {
    if (!quoteDialog || !quoteItemsHost || !window.Portal) return;
    try {
      var detail = await Portal.getOrderDetail(orderNumber);
      activeQuoteOrderNumber = orderNumber;
      if (quoteForm) {
        quoteForm.dataset.quoteTaxCents = String(Number(detail.order.taxCents || 0));
        quoteForm.dataset.quoteShippingCents = String(Number(detail.order.shippingCents || 0));
      }
      if (quoteFeeAckCb) quoteFeeAckCb.checked = false;
      quoteItemsHost.innerHTML = (detail.quoteItems || [])
        .map(function (item) {
          var unit = item.unit ? " / " + esc(item.unit) : "";
          return (
            '<div class="portal-quote-row" data-quote-item-id="' +
            esc(item.id) +
            '" data-unit-cents="' +
            esc(String(item.unitPriceCents || 0)) +
            '" data-max-qty="' +
            esc(String(item.quantityApproved || 0)) +
            '">' +
            '<label><input type="checkbox" data-quote-inc ' +
            (item.isIncluded ? "checked" : "") +
            "/> " +
            esc(item.description) +
            "</label>" +
            '<div><input type="number" min="0" max="' +
            esc(String(item.quantityApproved || 0)) +
            '" value="' +
            esc(String(item.quantityApproved || 0)) +
            '" data-quote-qty /> @ $' +
            esc((Number(item.unitPriceCents || 0) / 100).toFixed(2)) +
            unit +
            "</div></div>"
          );
        })
        .join("");
      if (quoteMeta) {
        quoteMeta.textContent = orderNumber + " • Quote version " + (detail.order.quoteVersion || 1);
      }
      var selectedMethod = detail.order.paymentMethod || "";
      Array.prototype.slice
        .call(quoteForm.querySelectorAll('input[name="paymentMethod"]'))
        .forEach(function (el) {
          el.checked = el.value === selectedMethod;
        });
      recalcQuoteTotals();
      quoteDialog.showModal();
    } catch (err) {
      showAppToast((err && err.message) || "Could not load quote.");
    }
  }

  if (quoteItemsHost) {
    quoteItemsHost.addEventListener("input", recalcQuoteTotals);
    quoteItemsHost.addEventListener("change", recalcQuoteTotals);
  }
  if (quoteForm) {
    quoteForm.addEventListener("change", function (e) {
      var t = e.target;
      if (t && t.name === "paymentMethod") {
        if (quoteFeeAckCb) quoteFeeAckCb.checked = false;
        recalcQuoteTotals();
      }
    });
    quoteForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!activeQuoteOrderNumber || !window.Portal) return;
      var methodEl = quoteForm.querySelector('input[name="paymentMethod"]:checked');
      var method = methodEl ? methodEl.value : "";
      if (!method) {
        showAppToast("Select a payment method.");
        return;
      }
      var needFeeAck = methodFeeBps(method) > 0;
      if (needFeeAck && quoteFeeAckCb && !quoteFeeAckCb.checked) {
        showAppToast("Please confirm you understand the 4% processing fee for this payment method.");
        return;
      }
      var ack = !needFeeAck || Boolean(quoteFeeAckCb && quoteFeeAckCb.checked);
      if (quoteSubmit) quoteSubmit.disabled = true;
      try {
        var reviewRes = await Portal.submitQuoteReview(activeQuoteOrderNumber, {
          paymentMethod: method,
          acknowledgedFee: ack,
          items: readDialogItems(),
        });
        quoteDialog.close();
        showAppToast("Quote confirmed. We received your selection.");
        await renderOrders();
        if (reviewRes && reviewRes.summary && reviewRes.paymentHints) {
          openPaymentNextDialog(reviewRes.summary, reviewRes.paymentHints);
        }
      } catch (err) {
        showAppToast((err && err.message) || "Could not submit quote selection.");
      } finally {
        if (quoteSubmit) quoteSubmit.disabled = false;
      }
    });
  }

  var firstMessageRender = true;
  var lastMessageRenderSig = "";

  var notifyBtn = document.getElementById("portal-enable-notify");
  if (notifyBtn) {
    syncPortalNotifyButton(notifyBtn);
    notifyBtn.addEventListener("click", function () {
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
              showAppToast("Desktop notifications enabled.");
            } else {
              showAppToast("Notifications were not enabled.");
            }
            syncPortalNotifyButton(notifyBtn);
          })
          .catch(function () {
            showAppToast("Could not request notification permission.");
            syncPortalNotifyButton(notifyBtn);
          });
        return;
      }
      if (isInAppNotifyEnabled()) {
        setInAppNotifyEnabled(false);
        showAppToast("Desktop notifications are off. Turn them back on here anytime.");
      } else {
        setInAppNotifyEnabled(true);
        showAppToast("Desktop notifications are on.");
      }
      syncPortalNotifyButton(notifyBtn);
    });
  }

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function isNearBottom(el) {
    if (!el) return true;
    var remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    return remaining <= 48;
  }

  async function renderMessages() {
    if (messageRenderInFlight) return;
    messageRenderInFlight = true;
    try {
      var thread = document.getElementById("portal-thread");
      if (!thread) return;
      var shouldStickToBottom = firstMessageRender || isNearBottom(thread);
      var messages = lastSuccessfulMessages.slice();
      try {
        messages = await Portal.getMessages();
        lastSuccessfulMessages = messages.slice();
        hadMessageRefreshError = false;
      } catch (e) {
        if (!hadMessageRefreshError && lastSuccessfulMessages.length > 0) {
          showAppToast("Live refresh paused. Showing last synced messages.");
        }
        hadMessageRefreshError = true;
      }

      var renderSig = messages
        .map(function (m) {
          var attachmentCount = Array.isArray(m.attachments) ? m.attachments.length : 0;
          return [
            String(m.id || ""),
            String(m.at || ""),
            String(m.from || ""),
            String(m.body || ""),
            String(attachmentCount),
          ].join("|");
        })
        .join("||");
      var hasChanged = renderSig !== lastMessageRenderSig;
      if (!hasChanged) return;
      lastMessageRenderSig = renderSig;

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

      if (shouldStickToBottom) {
        var scrollToEnd = function () {
          var isMobile = Boolean(mobileChatMq && mobileChatMq.matches);
          if (prefersReducedMotion() || isMobile) {
            thread.scrollTop = thread.scrollHeight;
          } else {
            thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
          }
        };
        window.requestAnimationFrame(scrollToEnd);
      }
    } finally {
      messageRenderInFlight = false;
    }
  }

  function queueNextMessagePoll() {
    if (messagePollTimer) window.clearTimeout(messagePollTimer);
    var delay = document.hidden ? MESSAGE_POLL_MS_HIDDEN : MESSAGE_POLL_MS_ACTIVE;
    messagePollTimer = window.setTimeout(function () {
      renderMessages()
        .catch(function () {})
        .finally(function () {
          queueNextMessagePoll();
        });
    }, delay);
  }

  renderOrders();
  renderMessages();
  queueNextMessagePoll();
  document.addEventListener("visibilitychange", function () {
    queueNextMessagePoll();
  });

  syncMobileChatState();
  if (chatOpenBtn) {
    chatOpenBtn.addEventListener("click", function () {
      setMobileChatOpen(true);
    });
  }
  if (chatCloseBtn) {
    chatCloseBtn.addEventListener("click", function () {
      setMobileChatOpen(false);
    });
  }
  if (chatBackdrop) {
    chatBackdrop.addEventListener("click", function () {
      setMobileChatOpen(false);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!document.body.classList.contains("portal-body--chat-view")) return;
    setMobileChatOpen(false);
  });
  if (mobileChatMq) {
    if (typeof mobileChatMq.addEventListener === "function") {
      mobileChatMq.addEventListener("change", syncMobileChatState);
    } else if (typeof mobileChatMq.addListener === "function") {
      mobileChatMq.addListener(syncMobileChatState);
    }
  }

  var resizeChatTid;
  function scheduleSyncChatLayout() {
    window.clearTimeout(resizeChatTid);
    resizeChatTid = window.setTimeout(function () {
      syncMobileChatState();
      if (document.body.classList.contains("portal-body--chat-view")) {
        scrollChatThreadToEnd();
      }
    }, 120);
  }
  window.addEventListener("orientationchange", scheduleSyncChatLayout);
  window.addEventListener("resize", scheduleSyncChatLayout);
  if (chatInput) {
    chatInput.addEventListener("focus", function () {
      window.setTimeout(function () {
        scrollChatThreadToEnd();
      }, 140);
    });
  }

  var form = document.getElementById("portal-compose");
  var input = document.getElementById("portal-msg-input");
  var fileInput = document.getElementById("portal-msg-files");
  var fileHint = document.getElementById("portal-msg-file-hint");
  var sendBtn =
    form && typeof form.querySelector === "function"
      ? form.querySelector('button[type="submit"]')
      : null;
  var sendBtnDefaultLabel = sendBtn ? sendBtn.textContent : "";
  var sendingMessage = false;

  function setComposeSendingState(on) {
    sendingMessage = !!on;
    if (sendBtn) {
      sendBtn.disabled = sendingMessage;
      sendBtn.setAttribute("aria-busy", sendingMessage ? "true" : "false");
      sendBtn.textContent = sendingMessage ? "Sending..." : sendBtnDefaultLabel;
    }
    if (fileInput) fileInput.disabled = sendingMessage;
  }

  if (fileInput && fileHint) {
    fileInput.addEventListener("change", function () {
      var n = fileInput.files ? fileInput.files.length : 0;
      fileHint.textContent = n ? n + " file" + (n === 1 ? "" : "s") + " selected" : "";
    });
  }
  if (form && input) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (sendingMessage) return;
      var t = String(input.value || "").trim();
      var files = fileInput && fileInput.files ? fileInput.files : null;
      if (!t && (!files || !files.length)) return;
      setComposeSendingState(true);
      try {
        try {
          await Portal.appendClientMessage(t, files);
        } catch (err) {
          showAppToast((err && err.message) || "Could not send message.");
          return;
        }
        input.value = "";
        if (fileInput) fileInput.value = "";
        if (fileHint) fileHint.textContent = "";
        await renderMessages();
        window.requestAnimationFrame(function () {
          scrollChatThreadToEnd();
        });
        try {
          input.focus({ preventScroll: true });
        } catch (_e) {
          input.focus();
        }
        if (mobileChatMq && mobileChatMq.matches) {
          showAppToast("Message sent.");
        }
      } finally {
        setComposeSendingState(false);
      }
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

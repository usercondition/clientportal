(function () {
  if (!window.Portal) return;

  var form = document.getElementById("order-request-form");
  var errEl = document.getElementById("order-form-error");
  var submitBtn = document.getElementById("order-submit");
  var neededInput = document.getElementById("order-needed");
  var lineItemsHost = document.getElementById("order-line-items");
  var addItemBtn = document.getElementById("order-add-item");

  var signOut = document.getElementById("portal-sign-out");
  if (signOut) {
    signOut.addEventListener("click", function () {
      Portal.clearSession();
      location.href = "client-flow.html";
    });
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
    errEl.hidden = !msg;
  }

  function todayISODate() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  if (neededInput) {
    neededInput.min = todayISODate();
  }

  if (form) {
    form.addEventListener("input", function () {
      showError("");
    });
    form.addEventListener("change", function () {
      showError("");
    });
  }

  if (!form) return;

  function createLineItemRow(seed) {
    if (!lineItemsHost) return;
    var row = document.createElement("div");
    row.className = "portal-line-items__row";
    row.setAttribute("data-line-item-row", "1");
    row.innerHTML =
      '<div class="portal-line-items__row-top">' +
      '<span class="portal-line-items__index">Item</span>' +
      '<button type="button" class="btn btn-ghost portal-line-items__remove" data-remove-line-item>Remove</button>' +
      "</div>" +
      '<div class="portal-line-items__inline">' +
      '<textarea class="portal-field__textarea portal-line-items__desc" data-line-item-description rows="2" placeholder="Description (part name, specs)" maxlength="1200"></textarea>' +
      '<label class="portal-line-items__mini-label portal-line-items__mini-label--qty">' +
      '<span>Qty</span>' +
      '<input class="portal-field__input portal-line-items__qty" type="number" min="1" max="100000" step="1" inputmode="numeric" data-line-item-qty />' +
      "</label>" +
      '<label class="portal-line-items__mini-label portal-line-items__mini-label--unit">' +
      '<span>Unit</span>' +
      '<input class="portal-field__input portal-line-items__unit" type="text" maxlength="40" placeholder="e.g. pcs" data-line-item-unit />' +
      "</label>" +
      "</div>";
    lineItemsHost.appendChild(row);
    if (seed) {
      var d = row.querySelector("[data-line-item-description]");
      var q = row.querySelector("[data-line-item-qty]");
      var u = row.querySelector("[data-line-item-unit]");
      if (d) d.value = String(seed.description || "");
      if (q && Number.isFinite(seed.quantity)) q.value = String(seed.quantity);
      if (u) u.value = String(seed.unit || "");
    }
    syncLineItemLabels();
  }

  function syncLineItemLabels() {
    if (!lineItemsHost) return;
    var rows = lineItemsHost.querySelectorAll("[data-line-item-row]");
    rows.forEach(function (row, idx) {
      var lab = row.querySelector(".portal-line-items__index");
      if (lab) lab.textContent = "Item " + (idx + 1);
      var rm = row.querySelector("[data-remove-line-item]");
      if (rm) rm.hidden = rows.length <= 1;
    });
  }

  function readLineItems() {
    if (!lineItemsHost) return [];
    var rows = Array.prototype.slice.call(lineItemsHost.querySelectorAll("[data-line-item-row]"));
    return rows
      .map(function (row) {
        var descEl = row.querySelector("[data-line-item-description]");
        var qtyEl = row.querySelector("[data-line-item-qty]");
        var unitEl = row.querySelector("[data-line-item-unit]");
        var description = String((descEl && descEl.value) || "").trim();
        var qRaw = qtyEl ? qtyEl.value : "";
        var quantity = qRaw === "" ? NaN : Number(qRaw);
        var unit = String((unitEl && unitEl.value) || "").trim();
        return { description: description, quantity: quantity, unit: unit };
      })
      .filter(function (x) {
        return x.description || Number.isFinite(x.quantity) || x.unit;
      });
  }

  if (lineItemsHost) {
    createLineItemRow();
    lineItemsHost.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.hasAttribute("data-remove-line-item")) {
        e.preventDefault();
        var row = t.closest("[data-line-item-row]");
        if (row) row.remove();
        if (!lineItemsHost.querySelector("[data-line-item-row]")) createLineItemRow();
        syncLineItemLabels();
      }
    });
  }
  if (addItemBtn) {
    addItemBtn.addEventListener("click", function () {
      createLineItemRow();
      var rows = lineItemsHost ? lineItemsHost.querySelectorAll("[data-line-item-row]") : [];
      var last = rows.length ? rows[rows.length - 1] : null;
      var input = last ? last.querySelector("[data-line-item-description]") : null;
      if (input) input.focus();
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("");

    var fd = new FormData(form);
    var title = String(fd.get("title") || "").trim();
    var serviceType = String(fd.get("serviceType") || "").trim();
    var description = String(fd.get("description") || "").trim();
    var lineItems = readLineItems();
    var dimensions = String(fd.get("dimensions") || "").trim();
    var materialPreference = String(fd.get("materialPreference") || "").trim();
    var intendedUse = String(fd.get("intendedUse") || "").trim();
    var neededBy = String(fd.get("neededBy") || "").trim();
    var referenceUrl = String(fd.get("referenceUrl") || "").trim();
    var rushRequested = fd.get("rushRequested") === "on";
    var shippingPreference = String(fd.get("shippingPreference") || "").trim();
    var specialInstructions = String(fd.get("specialInstructions") || "").trim();
    var confirmAccuracy = fd.get("confirmAccuracy") === "on";

    if (title.length < 3) {
      showError("Enter a project title (at least 3 characters).");
      return;
    }
    if (!serviceType) {
      showError("Select a service type.");
      return;
    }
    if (description.length < 10) {
      showError("Description must be at least 10 characters.");
      return;
    }
    if (!lineItems.length) {
      showError("Add at least one line item.");
      return;
    }
    var hasBadLine = lineItems.some(function (item) {
      return item.description.length < 2 || !Number.isFinite(item.quantity) || item.quantity < 1 || item.quantity > 100000;
    });
    if (hasBadLine) {
      showError("Each line item needs a description and quantity (1–100,000).");
      return;
    }
    if (!materialPreference) {
      showError("Select a material / finish preference.");
      return;
    }
    if (!intendedUse) {
      showError("Select an intended use.");
      return;
    }
    if (!shippingPreference) {
      showError("Select shipping / delivery.");
      return;
    }
    if (!confirmAccuracy) {
      showError("Confirm that your request details are accurate.");
      return;
    }
    if (referenceUrl) {
      try {
        var u = new URL(referenceUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          showError("Reference link must start with http:// or https://.");
          return;
        }
      } catch (ex) {
        showError("Reference link is not a valid URL.");
        return;
      }
    }
    if (neededBy && neededBy < todayISODate()) {
      showError("Needed-by date cannot be in the past.");
      return;
    }

    var payload = {
      title: title,
      serviceType: serviceType,
      description: description,
      lineItems: lineItems.map(function (item) {
        return {
          description: item.description,
          quantity: Math.floor(item.quantity),
          unit: item.unit || undefined,
        };
      }),
      dimensions: dimensions || undefined,
      materialPreference: materialPreference,
      intendedUse: intendedUse,
      neededBy: neededBy || undefined,
      referenceUrl: referenceUrl || undefined,
      rushRequested: rushRequested,
      shippingPreference: shippingPreference,
      specialInstructions: specialInstructions || undefined,
      confirmAccuracy: true,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    try {
      await Portal.submitOrderRequest(payload);
      location.href = "client-portal.html?order=submitted";
    } catch (err) {
      showError((err && err.message) || "Could not submit. Try again.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit request";
      }
    }
  });
})();

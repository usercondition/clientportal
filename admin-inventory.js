(function () {
  var rowsEl = document.getElementById("inventory-rows");
  var searchEl = document.getElementById("inventory-search");
  var countEl = document.getElementById("inventory-count");
  var feedbackEl = document.getElementById("inventory-feedback");
  var reseedBtn = document.getElementById("inventory-reseed");
  var modalEl = document.getElementById("admin-image-modal");
  var modalImg = document.getElementById("admin-image-modal-img");
  var modalClose = document.getElementById("admin-image-modal-close");
  if (!rowsEl) return;

  var catalogSource = "html";
  /** @type {Array<any>} */
  var allItems = [];
  var visibleItems = [];

  function fmt(v) {
    return "$" + Number(v || 0).toFixed(2);
  }

  function esc(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showFeedback(text, isError) {
    if (!feedbackEl) return;
    feedbackEl.hidden = !text;
    feedbackEl.textContent = text || "";
    feedbackEl.style.borderColor = isError
      ? "color-mix(in srgb, var(--sem-danger) 40%, var(--border))"
      : "color-mix(in srgb, var(--accent-hot) 35%, var(--border))";
  }

  function stockLabel(it) {
    if (it.stockQty == null || it.stockQty === "") return "∞";
    return String(it.stockQty);
  }

  function render() {
    if (!visibleItems.length) {
      rowsEl.innerHTML = '<tr><td colspan="10">No items match this search.</td></tr>';
      if (countEl) countEl.textContent = "0 items";
      return;
    }
    var html = visibleItems
      .map(function (it) {
        var thumb = it.image
          ? '<button type="button" class="admin-inventory-thumb-wrap" data-action="preview" data-src="' +
            esc(it.image) +
            '" data-title="' +
            esc(it.name) +
            '" aria-label="Preview ' +
            esc(it.name) +
            '">' +
            '<img class="admin-inventory-thumb" src="' +
            esc(it.image) +
            '" alt="' +
            esc(it.name) +
            ' thumbnail" loading="lazy" decoding="async" />' +
            "</button>"
          : '<span class="admin-inventory-thumb-wrap admin-inventory-thumb--empty" aria-hidden="true">N/A</span>';
        var activeChecked = it.active !== false ? " checked" : "";
        return (
          '<tr data-sku="' +
          it.sku +
          '">' +
          "<td>" +
          thumb +
          "</td>" +
          "<td><strong>" +
          it.sku +
          "</strong></td>" +
          "<td>" +
          esc(it.name) +
          "</td>" +
          "<td>" +
          esc(it.vendor) +
          "</td>" +
          "<td>" +
          fmt(it.basePrice) +
          "</td>" +
          '<td class="cell-live-price">' +
          fmt(it.price) +
          "</td>" +
          '<td><input class="admin-inventory-stock" type="number" min="0" step="1" value="' +
          (it.stockQty == null ? "" : esc(String(it.stockQty))) +
          '" placeholder="∞" aria-label="Stock for ' +
          it.sku +
          '" /></td>' +
          '<td><label class="admin-inventory-active"><input type="checkbox" class="admin-inventory-active-input"' +
          activeChecked +
          ' aria-label="Active listing for ' +
          it.sku +
          '" /> Active</label></td>' +
          '<td><input class="admin-inventory-price" type="number" min="0" step="0.01" value="' +
          Number(it.price).toFixed(2) +
          '" aria-label="Edit price for ' +
          it.sku +
          '" /></td>' +
          '<td><div class="admin-inventory-actions"><button class="admin-inventory-btn" data-action="save">Save</button><button class="admin-inventory-btn admin-inventory-btn--ghost" data-action="reset">Reset price</button></div></td>' +
          "</tr>"
        );
      })
      .join("");
    rowsEl.innerHTML = html;
    if (countEl) {
      countEl.textContent =
        visibleItems.length +
        " item" +
        (visibleItems.length === 1 ? "" : "s") +
        " · " +
        (catalogSource === "postgres" ? "Postgres catalog" : "HTML fallback");
    }
  }

  function applyFilter() {
    var q = String((searchEl && searchEl.value) || "")
      .toLowerCase()
      .trim();
    if (!q) {
      visibleItems = allItems.slice();
    } else {
      visibleItems = allItems.filter(function (it) {
        return (it.sku + " " + it.name + " " + it.vendor).toLowerCase().indexOf(q) >= 0;
      });
    }
    render();
  }

  function loadInventory() {
    showFeedback("", false);
    fetch("/api/admin/shop-items", { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("Failed to load shop inventory.");
        return r.json();
      })
      .then(function (payload) {
        catalogSource = payload && payload.source ? payload.source : "html";
        allItems = Array.isArray(payload.items) ? payload.items : [];
        applyFilter();
      })
      .catch(function (err) {
        rowsEl.innerHTML = '<tr><td colspan="10">Could not load inventory.</td></tr>';
        showFeedback(err && err.message ? err.message : "Could not load inventory.", true);
      });
  }

  function patchItem(sku, body) {
    return fetch("/api/admin/shop-items/" + encodeURIComponent(sku), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error((data && data.error) || "Failed to update item.");
        return data;
      });
    });
  }

  function openPreview(src, title) {
    if (!modalEl || !modalImg || !src) return;
    modalImg.src = src;
    modalImg.alt = title ? title + " preview" : "Inventory preview";
    modalEl.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closePreview() {
    if (!modalEl || !modalImg) return;
    modalEl.hidden = true;
    modalImg.src = "";
    document.body.style.overflow = "";
  }

  rowsEl.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var previewBtn = target.closest("button[data-action='preview']");
    if (previewBtn) {
      openPreview(previewBtn.getAttribute("data-src"), previewBtn.getAttribute("data-title"));
      return;
    }

    var btn = target.closest("button[data-action]");
    if (!btn) return;
    var tr = btn.closest("tr[data-sku]");
    if (!tr) return;
    var sku = tr.getAttribute("data-sku");
    var priceInput = tr.querySelector(".admin-inventory-price");
    var stockInput = tr.querySelector(".admin-inventory-stock");
    var activeInput = tr.querySelector(".admin-inventory-active-input");
    if (!sku || !priceInput) return;
    var action = btn.getAttribute("data-action");
    var rowItem = allItems.find(function (it) {
      return it.sku === sku;
    });
    if (!rowItem) return;

    if (action === "reset") {
      btn.disabled = true;
      patchItem(sku, { price: null })
        .then(function (res) {
          if (typeof res.price === "number") rowItem.price = res.price;
          else rowItem.price = rowItem.basePrice;
          rowItem.overridePrice = rowItem.price !== rowItem.basePrice ? rowItem.price : null;
          priceInput.value = Number(rowItem.price).toFixed(2);
          var liveCell = tr.querySelector(".cell-live-price");
          if (liveCell) liveCell.textContent = fmt(rowItem.price);
          showFeedback("Reset " + sku + " to base price " + fmt(rowItem.price) + ".", false);
        })
        .catch(function (err) {
          showFeedback(err && err.message ? err.message : "Failed to reset price.", true);
        })
        .finally(function () {
          btn.disabled = false;
        });
      return;
    }
    if (action !== "save") return;

    var nextPrice = Number(priceInput.value);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      showFeedback("Enter a valid non-negative price.", true);
      return;
    }
    var stockRaw = stockInput ? String(stockInput.value).trim() : "";
    var stockQty = stockRaw === "" ? null : Math.floor(Number(stockRaw));
    if (stockQty != null && (!Number.isFinite(stockQty) || stockQty < 0)) {
      showFeedback("Stock must be empty (unlimited) or a non-negative whole number.", true);
      return;
    }
    var active = activeInput ? !!activeInput.checked : true;

    btn.disabled = true;
    patchItem(sku, {
      price: Math.round(nextPrice * 100) / 100,
      stockQty: stockQty,
      active: active,
    })
      .then(function (res) {
        if (typeof res.price === "number") rowItem.price = res.price;
        if (res.stockQty !== undefined) rowItem.stockQty = res.stockQty;
        if (typeof res.active === "boolean") rowItem.active = res.active;
        rowItem.overridePrice = rowItem.price !== rowItem.basePrice ? rowItem.price : null;
        var liveCell = tr.querySelector(".cell-live-price");
        if (liveCell) liveCell.textContent = fmt(rowItem.price);
        priceInput.value = Number(rowItem.price).toFixed(2);
        if (stockInput) stockInput.value = rowItem.stockQty == null ? "" : String(rowItem.stockQty);
        showFeedback("Updated " + sku + ".", false);
      })
      .catch(function (err) {
        showFeedback(err && err.message ? err.message : "Failed to update item.", true);
      })
      .finally(function () {
        btn.disabled = false;
      });
  });

  if (reseedBtn) {
    reseedBtn.addEventListener("click", function () {
      if (
        !window.confirm(
          "Re-import all vendor HTML listings into Postgres? This updates names, images, and base prices. Custom live prices are preserved unless you changed base in HTML."
        )
      ) {
        return;
      }
      reseedBtn.disabled = true;
      showFeedback("Re-importing catalog…", false);
      fetch("/api/admin/shop/reseed?force=true", { method: "POST", headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json().then(function (data) {
            if (!r.ok) throw new Error((data && data.error) || "Re-import failed.");
            return data;
          });
        })
        .then(function (data) {
          showFeedback("Catalog re-imported (" + (data.total || "?") + " products).", false);
          loadInventory();
        })
        .catch(function (err) {
          showFeedback(err && err.message ? err.message : "Re-import failed.", true);
        })
        .finally(function () {
          reseedBtn.disabled = false;
        });
    });
  }

  if (modalClose) modalClose.addEventListener("click", closePreview);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modalEl && !modalEl.hidden) closePreview();
  });

  if (searchEl) searchEl.addEventListener("input", applyFilter);
  loadInventory();
})();

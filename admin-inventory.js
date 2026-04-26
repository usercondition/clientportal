(function () {
  var rowsEl = document.getElementById("inventory-rows");
  var searchEl = document.getElementById("inventory-search");
  var countEl = document.getElementById("inventory-count");
  var feedbackEl = document.getElementById("inventory-feedback");
  if (!rowsEl) return;

  /** @type {Array<{sku:string,name:string,vendor:string,image?:string,basePrice:number,price:number,overridePrice:number|null}>} */
  var allItems = [];
  var visibleItems = [];

  function fmt(v) {
    return "$" + Number(v || 0).toFixed(2);
  }

  function showFeedback(text, isError) {
    if (!feedbackEl) return;
    feedbackEl.hidden = !text;
    feedbackEl.textContent = text || "";
    feedbackEl.style.borderColor = isError
      ? "color-mix(in srgb, var(--sem-danger) 40%, var(--border))"
      : "color-mix(in srgb, var(--accent-hot) 35%, var(--border))";
  }

  function render() {
    if (!visibleItems.length) {
      rowsEl.innerHTML = '<tr><td colspan="8">No items match this search.</td></tr>';
      if (countEl) countEl.textContent = "0 items";
      return;
    }
    var html = visibleItems
      .map(function (it) {
        return (
          '<tr data-sku="' +
          it.sku +
          '">' +
          '<td><div class="admin-inventory-thumb-wrap">' +
          (it.image
            ? '<img class="admin-inventory-thumb" src="' + it.image + '" alt="' + it.name + ' thumbnail" loading="lazy" decoding="async" />'
            : '<span class="admin-inventory-thumb admin-inventory-thumb--empty" aria-hidden="true">N/A</span>') +
          "</div></td>" +
          "<td><strong>" +
          it.sku +
          "</strong></td>" +
          "<td>" +
          it.name +
          "</td>" +
          "<td>" +
          it.vendor +
          "</td>" +
          "<td>" +
          fmt(it.basePrice) +
          "</td>" +
          '<td class="cell-live-price">' +
          fmt(it.price) +
          "</td>" +
          '<td><input class="admin-inventory-price" type="number" min="0" step="0.01" value="' +
          Number(it.price).toFixed(2) +
          '" aria-label="Edit price for ' +
          it.sku +
          '" /></td>' +
          '<td><div class="admin-inventory-actions"><button class="admin-inventory-btn" data-action="save">Save</button><button class="admin-inventory-btn admin-inventory-btn--ghost" data-action="reset">Reset</button></div></td>' +
          "</tr>"
        );
      })
      .join("");
    rowsEl.innerHTML = html;
    if (countEl) {
      countEl.textContent = visibleItems.length + " item" + (visibleItems.length === 1 ? "" : "s");
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
        allItems = Array.isArray(payload.items) ? payload.items : [];
        applyFilter();
      })
      .catch(function (err) {
        rowsEl.innerHTML = '<tr><td colspan="8">Could not load inventory.</td></tr>';
        showFeedback(err && err.message ? err.message : "Could not load inventory.", true);
      });
  }

  function patchPrice(sku, price) {
    return fetch("/api/admin/shop-items/" + encodeURIComponent(sku), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ price: price }),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error((data && data.error) || "Failed to update price.");
        return data;
      });
    });
  }

  rowsEl.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var btn = target.closest("button[data-action]");
    if (!btn) return;
    var tr = btn.closest("tr[data-sku]");
    if (!tr) return;
    var sku = tr.getAttribute("data-sku");
    var input = tr.querySelector(".admin-inventory-price");
    if (!sku || !input) return;
    var action = btn.getAttribute("data-action");
    var rowItem = allItems.find(function (it) {
      return it.sku === sku;
    });
    if (!rowItem) return;

    if (action === "reset") {
      input.value = Number(rowItem.price).toFixed(2);
      return;
    }

    if (action !== "save") return;
    var nextPrice = Number(input.value);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      showFeedback("Enter a valid non-negative price.", true);
      return;
    }
    btn.disabled = true;
    patchPrice(sku, Math.round(nextPrice * 100) / 100)
      .then(function (res) {
        var updated = typeof res.price === "number" ? res.price : nextPrice;
        rowItem.price = Math.round(updated * 100) / 100;
        rowItem.overridePrice = rowItem.price;
        var liveCell = tr.querySelector(".cell-live-price");
        if (liveCell) liveCell.textContent = fmt(rowItem.price);
        input.value = Number(rowItem.price).toFixed(2);
        showFeedback("Updated " + sku + " to " + fmt(rowItem.price) + ".", false);
      })
      .catch(function (err) {
        showFeedback(err && err.message ? err.message : "Failed to update price.", true);
      })
      .finally(function () {
        btn.disabled = false;
      });
  });

  if (searchEl) searchEl.addEventListener("input", applyFilter);
  loadInventory();
})();

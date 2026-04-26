/* Shop catalog behavior: vendor pages + all-vendors mixed page. */
(function () {
  var CART_KEY = "shop_cart_v1";
  var grid = document.getElementById("shop-grid");
  var empty = document.getElementById("shop-empty");
  var resultsCount = document.getElementById("shop-results-count");
  var search = document.getElementById("shop-search");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".rh-shop-chip"));
  var vendorFilter = document.getElementById("shop-filter-vendor");
  var categoryFilter = document.getElementById("shop-filter-category");
  var isMixPage = !!(vendorFilter && categoryFilter);
  var cartCountTop = document.getElementById("shop-cart-count-top");
  var cartSubtotalTop = document.getElementById("shop-cart-subtotal-top");
  if (!grid) return;

  var currentFilter = "all";
  /** @type {Array<{sku:string,name:string,price:number,category:string,vendor:string,vendorLabel:string,image:string,searchText:string}>} */
  var allItems = [];
  /** @type {Record<string, { sku: string; name: string; price: number; qty: number }>} */
  var cart = loadCart();

  function normalizedText(v) {
    return String(v || "").toLowerCase().trim();
  }

  function formatMoney(v) {
    return "$" + Number(v || 0).toFixed(2);
  }

  function cartItems() {
    return Object.keys(cart)
      .map(function (k) {
        return cart[k];
      })
      .filter(function (it) {
        return it && it.qty > 0;
      });
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems()));
    } catch (_e) {}
  }

  function notifyCartChanged() {
    try {
      document.dispatchEvent(new CustomEvent("shop-cart-changed"));
    } catch (_e) {}
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (!raw) return {};
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return {};
      return arr.reduce(function (acc, it) {
        if (!it || typeof it !== "object") return acc;
        var sku = normalizedText(it.sku).toUpperCase();
        var qty = Math.max(1, Math.floor(Number(it.qty || 1)));
        var price = Math.max(0, Number(it.price || 0));
        if (!sku) return acc;
        acc[sku] = {
          sku: sku,
          name: String(it.name || "Mini item"),
          price: Number.isFinite(price) ? price : 0,
          qty: qty,
        };
        return acc;
      }, /** @type {Record<string, { sku: string; name: string; price: number; qty: number }>} */ ({}));
    } catch (_e) {
      return {};
    }
  }

  function syncCartTop() {
    var items = cartItems();
    if (!items.length) {
      if (cartCountTop) cartCountTop.textContent = "0 items";
      if (cartSubtotalTop) cartSubtotalTop.textContent = "$0.00 subtotal";
      return;
    }
    var subtotal = 0;
    var qty = items.reduce(function (sum, it) {
      subtotal += it.price * it.qty;
      return sum + it.qty;
    }, 0);
    if (cartCountTop) cartCountTop.textContent = qty + (qty === 1 ? " item" : " items");
    if (cartSubtotalTop) cartSubtotalTop.textContent = formatMoney(subtotal) + " subtotal";
  }

  function optionMarkup(value, label) {
    return '<option value="' + value + '">' + label + "</option>";
  }

  function shuffled(items) {
    var arr = items.slice();
    for (var i = arr.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function applyCardPrice(btn, price) {
    if (!btn) return;
    var clean = Number.isFinite(price) ? Math.max(0, price) : 0;
    btn.setAttribute("data-price", String(clean));
    var card = btn.closest ? btn.closest(".rh-shop-card") : null;
    if (!card) return;
    var priceEl = card.querySelector(".rh-shop-meta strong");
    if (priceEl) priceEl.textContent = formatMoney(clean);
  }

  function syncCartPricesFromButtons() {
    var btns = Array.prototype.slice.call(grid.querySelectorAll(".rh-shop-add"));
    btns.forEach(function (btn) {
      var sku = normalizedText(btn.getAttribute("data-sku")).toUpperCase();
      if (!sku || !cart[sku]) return;
      var livePrice = Number(btn.getAttribute("data-price") || 0);
      if (Number.isFinite(livePrice) && livePrice >= 0) cart[sku].price = Math.round(livePrice * 100) / 100;
    });
  }

  function updateStaticVisible() {
    var q = normalizedText(search && search.value);
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".rh-shop-card"));
    var file = String((location && location.pathname) || "")
      .split("/")
      .pop()
      .toLowerCase();
    var expectedSkuPrefix = file === "greytide.html"
      ? "GTS-"
      : file === "dm-stash.html"
        ? "DMS-"
        : file === "redmakers.html"
          ? "RM-"
          : file === "rafail-ft-pring.html"
            ? "RFP-"
            : file === "epic-miniatures.html"
              ? "EM-"
              : file === "mar-fil.html"
                ? "MF-"
                : "";
    var visible = 0;
    cards.forEach(function (card) {
      var cat = normalizedText(card.getAttribute("data-cat"));
      var hay = normalizedText(card.getAttribute("data-search"));
      var catOk = currentFilter === "all" || cat.split(/\s+/).indexOf(currentFilter) >= 0;
      var qOk = !q || hay.indexOf(q) >= 0;
      var btn = card.querySelector(".rh-shop-add");
      var sku = btn ? String(btn.getAttribute("data-sku") || "").toUpperCase() : "";
      var skuOk = !expectedSkuPrefix || sku.indexOf(expectedSkuPrefix) === 0;
      var show = catOk && qOk && skuOk;
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (empty) empty.hidden = visible !== 0;
    if (resultsCount) resultsCount.textContent = "Showing " + visible + (visible === 1 ? " item" : " items");
  }

  function applyStaticPriceOverrides() {
    fetch("/api/shop/price-overrides", { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("Failed to load price overrides.");
        return r.json();
      })
      .then(function (payload) {
        var overrides = payload && payload.overrides && typeof payload.overrides === "object" ? payload.overrides : {};
        var btns = Array.prototype.slice.call(grid.querySelectorAll(".rh-shop-add"));
        btns.forEach(function (btn) {
          var sku = normalizedText(btn.getAttribute("data-sku")).toUpperCase();
          if (!sku || !Object.prototype.hasOwnProperty.call(overrides, sku)) return;
          var p = Number(overrides[sku]);
          if (!Number.isFinite(p) || p < 0) return;
          applyCardPrice(btn, Math.round(p * 100) / 100);
        });
        syncCartPricesFromButtons();
        saveCart();
        syncCartTop();
        notifyCartChanged();
      })
      .catch(function () {});
  }

  function populateMixFilters(items) {
    if (vendorFilter) {
      var vendors = Array.from(new Set(items.map(function (item) { return item.vendor; }))).filter(Boolean).sort();
      var vendorLabels = {};
      items.forEach(function (item) {
        if (item.vendor && item.vendorLabel && !vendorLabels[item.vendor]) vendorLabels[item.vendor] = item.vendorLabel;
      });
      vendorFilter.innerHTML = optionMarkup("all", "All vendors");
      vendors.forEach(function (v) {
        vendorFilter.insertAdjacentHTML("beforeend", optionMarkup(v, vendorLabels[v] || v));
      });
    }
    if (categoryFilter) {
      var cats = Array.from(new Set(items.map(function (item) { return item.category; }))).filter(Boolean).sort();
      categoryFilter.innerHTML = optionMarkup("all", "All categories");
      cats.forEach(function (c) {
        categoryFilter.insertAdjacentHTML("beforeend", optionMarkup(c, c));
      });
    }
  }

  function mixVisibleItems() {
    var q = normalizedText(search && search.value);
    var vendor = normalizedText(vendorFilter && vendorFilter.value) || "all";
    var category = normalizedText(categoryFilter && categoryFilter.value) || "all";
    return allItems.filter(function (item) {
      if (vendor !== "all" && normalizedText(item.vendor) !== vendor) return false;
      if (category !== "all" && normalizedText(item.category) !== category) return false;
      if (!q) return true;
      var hay = normalizedText((item.searchText || "") + " " + item.name + " " + item.sku + " " + (item.vendorLabel || item.vendor || ""));
      return hay.indexOf(q) >= 0;
    });
  }

  function mixCardMarkup(item) {
    var img = item.image
      ? '<img src="' + item.image + '" alt="' + item.name + ' miniature" width="800" height="800" loading="lazy" decoding="async" />'
      : "";
    return (
      '<article class="rh-shop-card" data-cat="' + item.category + '" data-search="' + (item.searchText || "") + '">' +
      '<div class="rh-shop-card__thumb">' + img + '<span class="rh-shop-badge">In stock</span></div>' +
      '<div class="rh-shop-card__body"><h3>' + item.name + "</h3><p>" + (item.vendorLabel || item.vendor) +
      ' licensed release. High-detail resin print fulfilled by Steindahl 3D Group.</p><div class="rh-shop-meta"><strong>' +
      formatMoney(item.price) + "</strong><span>SKU: " + item.sku + '</span></div><button type="button" class="rh-btn rh-btn--ghost rh-shop-add" data-sku="' +
      item.sku + '" data-name="' + item.name + '" data-price="' + item.price + '">Add to cart</button></div></article>'
    );
  }

  function renderMix() {
    var items = mixVisibleItems();
    if (resultsCount) resultsCount.textContent = "Showing " + items.length + (items.length === 1 ? " item" : " items");
    if (empty) empty.hidden = items.length !== 0;
    grid.innerHTML = items.map(function (item) { return mixCardMarkup(item); }).join("");
  }

  function loadMixListings() {
    fetch("/api/shop/mix-listings", { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("Could not load mixed vendor listings.");
        return r.json();
      })
      .then(function (payload) {
        allItems = shuffled(Array.isArray(payload.items) ? payload.items : []);
        populateMixFilters(allItems);
        renderMix();
      })
      .catch(function () {
        if (resultsCount) resultsCount.textContent = "Showing 0 items";
        if (empty) {
          empty.hidden = false;
          empty.textContent = "Could not load listings right now. Please try again in a moment.";
        }
      });
  }

  grid.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest(".rh-shop-add");
    if (!btn) return;
    var sku = normalizedText(btn.getAttribute("data-sku")).toUpperCase();
    if (!sku) return;
    var price = Number(btn.getAttribute("data-price") || 0);
    if (!cart[sku]) {
      cart[sku] = {
        sku: sku,
        name: String(btn.getAttribute("data-name") || "Mini item").trim(),
        price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : 0,
        qty: 0,
      };
    }
    cart[sku].price = Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : cart[sku].price;
    cart[sku].qty += 1;
    saveCart();
    syncCartTop();
    notifyCartChanged();
  });

  if (search) search.addEventListener("input", isMixPage ? renderMix : updateStaticVisible);

  if (isMixPage) {
    if (vendorFilter) vendorFilter.addEventListener("change", renderMix);
    if (categoryFilter) categoryFilter.addEventListener("change", renderMix);
    loadMixListings();
  } else {
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        currentFilter = normalizedText(chip.getAttribute("data-filter")) || "all";
        chips.forEach(function (el) {
          var active = el === chip;
          el.classList.toggle("is-active", active);
          el.setAttribute("aria-selected", active ? "true" : "false");
        });
        updateStaticVisible();
      });
    });
    applyStaticPriceOverrides();
    updateStaticVisible();
  }

  syncCartTop();
  notifyCartChanged();
})();

/* Shop catalog behavior: mixed vendor feed, filters, and cart. */
(function () {
  var CART_KEY = "shop_cart_v1";
  var grid = document.getElementById("shop-grid");
  var empty = document.getElementById("shop-empty");
  var resultsCount = document.getElementById("shop-results-count");
  var search = document.getElementById("shop-search");
  var vendorFilter = document.getElementById("shop-filter-vendor");
  var categoryFilter = document.getElementById("shop-filter-category");
  var cartCountTop = document.getElementById("shop-cart-count-top");
  var cartSubtotalTop = document.getElementById("shop-cart-subtotal-top");
  if (!grid) return;

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

  function populateFilters(items) {
    if (vendorFilter) {
      var vendors = Array.from(
        new Set(
          items.map(function (item) {
            return item.vendor;
          })
        )
      )
        .filter(Boolean)
        .sort();
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
      var cats = Array.from(
        new Set(
          items.map(function (item) {
            return item.category;
          })
        )
      )
        .filter(Boolean)
        .sort();
      categoryFilter.innerHTML = optionMarkup("all", "All categories");
      cats.forEach(function (c) {
        categoryFilter.insertAdjacentHTML("beforeend", optionMarkup(c, c));
      });
    }
  }

  function visibleItems() {
    var q = normalizedText(search && search.value);
    var vendor = normalizedText(vendorFilter && vendorFilter.value) || "all";
    var category = normalizedText(categoryFilter && categoryFilter.value) || "all";
    return allItems.filter(function (item) {
      if (vendor !== "all" && normalizedText(item.vendor) !== vendor) return false;
      if (category !== "all" && normalizedText(item.category) !== category) return false;
      if (!q) return true;
      var hay = normalizedText(
        (item.searchText || "") + " " + item.name + " " + item.sku + " " + (item.vendorLabel || item.vendor || "")
      );
      return hay.indexOf(q) >= 0;
    });
  }

  function cardMarkup(item) {
    var img = item.image
      ? '<img src="' + item.image + '" alt="' + item.name + ' miniature" width="800" height="800" loading="lazy" decoding="async" />'
      : "";
    return (
      '<article class="rh-shop-card" data-cat="' +
      item.category +
      '" data-search="' +
      (item.searchText || "") +
      '">' +
      '<div class="rh-shop-card__thumb">' +
      img +
      '<span class="rh-shop-badge">In stock</span>' +
      "</div>" +
      '<div class="rh-shop-card__body">' +
      "<h3>" +
      item.name +
      "</h3>" +
      "<p>" +
      (item.vendorLabel || item.vendor) +
      " licensed release. High-detail resin print fulfilled by Steindahl 3D Group." +
      "</p>" +
      '<div class="rh-shop-meta"><strong>' +
      formatMoney(item.price) +
      "</strong><span>SKU: " +
      item.sku +
      "</span></div>" +
      '<button type="button" class="rh-btn rh-btn--ghost rh-shop-add" data-sku="' +
      item.sku +
      '" data-name="' +
      item.name +
      '" data-price="' +
      item.price +
      '">Add to cart</button>' +
      "</div>" +
      "</article>"
    );
  }

  function render() {
    var items = visibleItems();
    if (resultsCount) {
      resultsCount.textContent = "Showing " + items.length + (items.length === 1 ? " item" : " items");
    }
    if (empty) empty.hidden = items.length !== 0;
    if (!items.length) {
      grid.innerHTML = "";
      return;
    }
    grid.innerHTML = items
      .map(function (item) {
        return cardMarkup(item);
      })
      .join("");
  }

  function loadMixListings() {
    fetch("/api/shop/mix-listings", { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("Could not load mixed vendor listings.");
        return r.json();
      })
      .then(function (payload) {
        allItems = Array.isArray(payload.items) ? payload.items : [];
        populateFilters(allItems);
        render();
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
        price: Number.isFinite(price) && price > 0 ? price : 0,
        qty: 0,
      };
    }
    cart[sku].price = Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : cart[sku].price;
    cart[sku].qty += 1;
    saveCart();
    syncCartTop();
    notifyCartChanged();
  });

  if (search) search.addEventListener("input", render);
  if (vendorFilter) vendorFilter.addEventListener("change", render);
  if (categoryFilter) categoryFilter.addEventListener("change", render);

  loadMixListings();
  syncCartTop();
  notifyCartChanged();
})();

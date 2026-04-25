/* Shop catalog behavior (filters/search/sort + persistent cart). */
(function () {
  var CART_KEY = "shop_cart_v1";
  var chips = Array.prototype.slice.call(document.querySelectorAll(".rh-shop-chip"));
  var search = document.getElementById("shop-search");
  var sort = document.getElementById("shop-sort");
  var grid = document.getElementById("shop-grid");
  var empty = document.getElementById("shop-empty");
  var resultsCount = document.getElementById("shop-results-count");
  var addButtons = Array.prototype.slice.call(document.querySelectorAll(".rh-shop-add"));
  var cartCountTop = document.getElementById("shop-cart-count-top");
  var cartSubtotalTop = document.getElementById("shop-cart-subtotal-top");
  if (!chips.length || !grid) return;

  var currentFilter = "all";
  /** @type {Record<string, { sku: string; name: string; price: number; qty: number }>} */
  var cart = loadCart();

  function normalizedText(v) {
    return String(v || "").toLowerCase().trim();
  }

  function updateVisible() {
    var q = normalizedText(search && search.value);
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".rh-shop-card"));
    var mode = normalizedText(sort && sort.value) || "featured";
    cards.forEach(function (card, i) {
      if (!card.hasAttribute("data-index")) card.setAttribute("data-index", String(i));
    });
    cards.sort(function (a, b) {
      var ai = Number(a.getAttribute("data-index") || "0");
      var bi = Number(b.getAttribute("data-index") || "0");
      if (mode === "price_low") {
        var ap = Number((a.querySelector(".rh-shop-add") || {}).getAttribute && a.querySelector(".rh-shop-add").getAttribute("data-price")) || 0;
        var bp = Number((b.querySelector(".rh-shop-add") || {}).getAttribute && b.querySelector(".rh-shop-add").getAttribute("data-price")) || 0;
        return ap - bp || ai - bi;
      }
      if (mode === "price_high") {
        var ap2 = Number((a.querySelector(".rh-shop-add") || {}).getAttribute && a.querySelector(".rh-shop-add").getAttribute("data-price")) || 0;
        var bp2 = Number((b.querySelector(".rh-shop-add") || {}).getAttribute && b.querySelector(".rh-shop-add").getAttribute("data-price")) || 0;
        return bp2 - ap2 || ai - bi;
      }
      if (mode === "name_asc") {
        var an = normalizedText((a.querySelector("h3") || {}).textContent);
        var bn = normalizedText((b.querySelector("h3") || {}).textContent);
        return an.localeCompare(bn) || ai - bi;
      }
      return ai - bi;
    });
    cards.forEach(function (c) {
      grid.appendChild(c);
    });
    var visible = 0;
    cards.forEach(function (card) {
      var cat = normalizedText(card.getAttribute("data-cat"));
      var hay = normalizedText(card.getAttribute("data-search"));
      var catOk = currentFilter === "all" || cat.split(/\s+/).indexOf(currentFilter) >= 0;
      var qOk = !q || hay.indexOf(q) >= 0;
      var show = catOk && qOk;
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (empty) empty.hidden = visible !== 0;
    if (resultsCount) {
      resultsCount.textContent = "Showing " + visible + (visible === 1 ? " item" : " items");
    }
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

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var next = normalizedText(chip.getAttribute("data-filter")) || "all";
      currentFilter = next;
      chips.forEach(function (el) {
        var active = el === chip;
        el.classList.toggle("is-active", active);
        el.setAttribute("aria-selected", active ? "true" : "false");
      });
      updateVisible();
    });
  });

  addButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
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
      cart[sku].qty += 1;
      saveCart();
      syncCartTop();
      notifyCartChanged();
    });
  });

  if (search) search.addEventListener("input", updateVisible);
  if (sort) sort.addEventListener("change", updateVisible);
  updateVisible();
  syncCartTop();
  notifyCartChanged();
})();

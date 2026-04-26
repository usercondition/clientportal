/* Syncs shared cart summary in the top bar (localStorage shop_cart_v1). */
(function () {
  var CART_KEY = "shop_cart_v1";
  var meta = document.getElementById("site-cart-nav-meta");
  var link = document.getElementById("site-cart-nav");
  var label = link ? link.querySelector(".site-cart-nav__label") : null;
  var countEl = link ? link.querySelector(".site-cart-nav__count") : null;
  if (!meta && !link) return;

  if (label && !countEl) {
    countEl = document.createElement("span");
    countEl.className = "site-cart-nav__count";
    countEl.textContent = "0";
    label.appendChild(countEl);
  }

  function formatMoney(v) {
    return "$" + Number(v || 0).toFixed(2);
  }

  function loadItems() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .map(function (it) {
          if (!it || typeof it !== "object") return null;
          var qty = Math.max(1, Math.floor(Number(it.qty || 1)));
          var price = Math.max(0, Number(it.price || 0));
          return { qty: qty, price: Number.isFinite(price) ? price : 0 };
        })
        .filter(Boolean);
    } catch (_e) {
      return [];
    }
  }

  function sync() {
    var items = loadItems();
    var qty = 0;
    var sub = 0;
    items.forEach(function (it) {
      qty += it.qty;
      sub += it.qty * it.price;
    });
    var hasItems = qty > 0;
    if (meta) {
      meta.textContent = hasItems ? "Full cart" : "Empty cart";
    }
    if (countEl) {
      countEl.textContent = String(qty);
      countEl.classList.toggle("is-empty", !hasItems);
    }
    if (link) {
      link.classList.toggle("is-full", hasItems);
      link.classList.toggle("is-empty", !hasItems);
      link.setAttribute(
        "aria-label",
        hasItems ? "Cart full, " + qty + " items, " + formatMoney(sub) : "Cart empty, 0 items"
      );
    }
  }

  sync();
  window.addEventListener("storage", function (e) {
    if (e.key === CART_KEY) sync();
  });
  document.addEventListener("shop-cart-changed", sync);
})();

/* Syncs shared cart summary in the top bar (localStorage shop_cart_v1). */
(function () {
  var CART_KEY = "shop_cart_v1";
  var meta = document.getElementById("site-cart-nav-meta");
  var link = document.getElementById("site-cart-nav");
  if (!meta && !link) return;

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
    if (meta) {
      meta.textContent = qty ? qty + (qty === 1 ? " item" : " items") + " · " + formatMoney(sub) : "Empty · " + formatMoney(0);
    }
    if (link) {
      link.setAttribute("aria-label", qty ? "Cart, " + qty + " items, " + formatMoney(sub) : "Cart, empty");
    }
  }

  sync();
  window.addEventListener("storage", function (e) {
    if (e.key === CART_KEY) sync();
  });
  document.addEventListener("shop-cart-changed", sync);
})();

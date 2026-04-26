/* Shop catalog behavior (filters/search/sort + persistent cart). */
(function () {
  var CART_KEY = "shop_cart_v1";
  var chips = Array.prototype.slice.call(document.querySelectorAll(".rh-shop-chip"));
  var search = document.getElementById("shop-search");
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
  updateVisible();
  syncCartTop();
  notifyCartChanged();
})();

(function () {
  var imageEl = document.getElementById("sampler-image");
  var titleEl = document.getElementById("sampler-title");
  var descEl = document.getElementById("sampler-description");
  var vendorEl = document.getElementById("sampler-vendor");
  var posEl = document.getElementById("sampler-position");
  var linkEl = document.getElementById("sampler-link");
  var prevBtn = document.getElementById("sampler-prev");
  var nextBtn = document.getElementById("sampler-next");
  if (!imageEl || !titleEl || !descEl || !vendorEl || !posEl || !linkEl) return;

  var samplers = [
    { title: "Ahznagol Aberrant Guards", vendor: "DM Stash", image: "https://drive.google.com/thumbnail?id=11vtmHYX6Y-lSUD6W1PcJzgZboV2zvAjt&sz=w1200", href: "dm-stash.html" },
    { title: "Grey Tide Featured Set", vendor: "Grey Tide Studio", image: "assets/greytide-logo.png", href: "greytide.html" },
    { title: "REDMAKERS Featured Set", vendor: "REDMAKERS", image: "assets/redmakers-logo-new.png", href: "redmakers.html" },
    { title: "Rafail ft. PRiNG Featured Set", vendor: "Rafail ft. PRiNG", image: "assets/rafail-ft-pring-banner.png", href: "rafail-ft-pring.html" },
    { title: "EPIC Miniatures Featured Set", vendor: "EPIC Miniatures", image: "assets/epic-miniatures-logo.png", href: "epic-miniatures.html" },
    { title: "Mar-Fil Featured Set", vendor: "Mar-Fil", image: "assets/mar-fil-logo.png", href: "mar-fil.html" },
  ];
  for (var i = samplers.length - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = samplers[i];
    samplers[i] = samplers[j];
    samplers[j] = t;
  }

  var idx = 0;
  var timer = null;
  function render() {
    var item = samplers[idx];
    imageEl.src = item.image;
    imageEl.alt = item.title + " sampler";
    titleEl.textContent = item.title;
    descEl.textContent = "Random sampler highlight from " + item.vendor + ".";
    vendorEl.textContent = item.vendor;
    posEl.textContent = String(idx + 1) + " / " + String(samplers.length);
    linkEl.href = item.href;
    linkEl.textContent = "Open " + item.vendor + " page";
  }
  function next(step) {
    idx = (idx + step + samplers.length) % samplers.length;
    render();
  }
  function restartAuto() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      next(1);
    }, 4500);
  }

  if (prevBtn) prevBtn.addEventListener("click", function () { next(-1); restartAuto(); });
  if (nextBtn) nextBtn.addEventListener("click", function () { next(1); restartAuto(); });
  render();
  restartAuto();
})();

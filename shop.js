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

  function applyCardPrice(btn, price) {
    if (!btn) return;
    var clean = Number.isFinite(price) ? Math.max(0, price) : 0;
    btn.setAttribute("data-price", String(clean));
    var card = btn.closest ? btn.closest(".rh-shop-card") : null;
    if (!card) return;
    var priceEl = card.querySelector(".rh-shop-meta strong");
    if (priceEl) priceEl.textContent = formatMoney(clean);
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

  function syncCartPricesFromButtons() {
    addButtons.forEach(function (btn) {
      var sku = normalizedText(btn.getAttribute("data-sku")).toUpperCase();
      if (!sku || !cart[sku]) return;
      var livePrice = Number(btn.getAttribute("data-price") || 0);
      if (Number.isFinite(livePrice) && livePrice >= 0) {
        cart[sku].price = Math.round(livePrice * 100) / 100;
      }
    });
  }

  function applyPriceOverrides() {
    fetch("/api/shop/price-overrides", { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("Failed to load shop pricing.");
        return r.json();
      })
      .then(function (payload) {
        var overrides = payload && payload.overrides && typeof payload.overrides === "object" ? payload.overrides : {};
        addButtons.forEach(function (btn) {
          var sku = normalizedText(btn.getAttribute("data-sku")).toUpperCase();
          if (!sku) return;
          if (!Object.prototype.hasOwnProperty.call(overrides, sku)) return;
          var nextPrice = Number(overrides[sku]);
          if (!Number.isFinite(nextPrice) || nextPrice < 0) return;
          applyCardPrice(btn, Math.round(nextPrice * 100) / 100);
        });
        syncCartPricesFromButtons();
        saveCart();
        syncCartTop();
        notifyCartChanged();
      })
      .catch(function () {
        /* keep base card prices if overrides endpoint is unavailable */
      });
  }

  var imageModal = null;
  var imageModalImg = null;
  var imageModalClose = null;

  function ensureImageModal() {
    if (imageModal) return;
    var wrap = document.createElement("div");
    wrap.className = "rh-image-modal";
    wrap.setAttribute("hidden", "hidden");
    wrap.innerHTML =
      '<button type="button" class="rh-image-modal__backdrop" aria-label="Close image preview"></button>' +
      '<figure class="rh-image-modal__figure"><img class="rh-image-modal__img" src="" alt="Listing preview" /></figure>' +
      '<button type="button" class="rh-image-modal__close" aria-label="Close image preview">Close</button>';
    document.body.appendChild(wrap);
    imageModal = wrap;
    imageModalImg = wrap.querySelector(".rh-image-modal__img");
    imageModalClose = wrap.querySelector(".rh-image-modal__close");
    var backdrop = wrap.querySelector(".rh-image-modal__backdrop");
    if (backdrop) backdrop.addEventListener("click", closeImageModal);
    if (imageModalClose) imageModalClose.addEventListener("click", closeImageModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && imageModal && !imageModal.hasAttribute("hidden")) {
        closeImageModal();
      }
    });
  }

  function openImageModal(src, alt) {
    if (!src) return;
    ensureImageModal();
    if (!imageModal || !imageModalImg) return;
    imageModalImg.src = src;
    imageModalImg.alt = alt ? String(alt) : "Listing preview";
    imageModal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeImageModal() {
    if (!imageModal || !imageModalImg) return;
    imageModal.setAttribute("hidden", "hidden");
    imageModalImg.src = "";
    document.body.style.overflow = "";
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

  grid.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var img = target.closest(".rh-shop-card__thumb img");
    if (!img) return;
    openImageModal(img.getAttribute("src"), img.getAttribute("alt"));
  });

  if (search) search.addEventListener("input", updateVisible);
  applyPriceOverrides();
  updateVisible();
  syncCartTop();
  notifyCartChanged();
})();

/* Dedicated checkout page behavior (cart rendering + Stripe session redirect). */
(function () {
  var CART_KEY = "shop_cart_v1";
  var cartList = document.getElementById("shop-cart-list");
  var cartTotal = document.getElementById("shop-cart-total");
  var cartCountTop = document.getElementById("shop-cart-count-top");
  var cartSubtotalTop = document.getElementById("shop-cart-subtotal-top");
  var checkoutForm = document.getElementById("shop-checkout-form");
  var checkoutStatus = document.getElementById("shop-checkout-status");
  var checkoutSubmit = document.getElementById("shop-checkout-submit");
  if (!cartList || !cartTotal || !checkoutForm) return;

  /** @type {Record<string, { sku: string; name: string; price: number; qty: number }>} */
  var cart = loadCart();

  function normalizedText(v) {
    return String(v || "").trim();
  }

  function formatMoney(v) {
    return "$" + Number(v || 0).toFixed(2);
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (!raw) return {};
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return {};
      return arr.reduce(function (acc, it) {
        if (!it || typeof it !== "object") return acc;
        var sku = String(it.sku || "").trim().toUpperCase();
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

  function cartItems() {
    return Object.keys(cart)
      .map(function (k) {
        return cart[k];
      })
      .filter(function (it) {
        return it && it.qty > 0;
      });
  }

  function persistCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems()));
    } catch (_e) {}
  }

  function notifyCartChanged() {
    try {
      document.dispatchEvent(new CustomEvent("shop-cart-changed"));
    } catch (_e) {}
  }

  function setCheckoutStatus(message, kind) {
    if (!checkoutStatus) return;
    checkoutStatus.textContent = message || "";
    checkoutStatus.classList.remove("is-error", "is-success");
    if (kind === "error") checkoutStatus.classList.add("is-error");
    if (kind === "success") checkoutStatus.classList.add("is-success");
  }

  function setSubmitting(on) {
    if (!checkoutSubmit) return;
    checkoutSubmit.disabled = !!on;
    checkoutSubmit.textContent = on ? "Redirecting..." : "Continue to secure checkout";
  }

  function renderCart() {
    var items = cartItems();
    if (!items.length) {
      cartList.innerHTML = '<p class="rh-shop-cart-empty">Your cart is empty. Add minis from the shop catalog.</p>';
      cartTotal.textContent = "Estimated subtotal: $0.00";
      if (cartCountTop) cartCountTop.textContent = "0 items";
      if (cartSubtotalTop) cartSubtotalTop.textContent = "$0.00 subtotal";
      notifyCartChanged();
      return;
    }
    var subtotal = 0;
    var qty = 0;
    cartList.innerHTML = items
      .map(function (it) {
        subtotal += it.price * it.qty;
        qty += it.qty;
        return (
          '<div class="rh-shop-cart-row" data-sku="' +
          it.sku +
          '">' +
          '<div><strong>' +
          it.name +
          "</strong><br/><span>SKU: " +
          it.sku +
          " · " +
          formatMoney(it.price) +
          ' each</span></div>' +
          '<div class="rh-shop-cart-row__qty">' +
          '<button type="button" class="rh-shop-cart-qty" data-action="dec" data-sku="' +
          it.sku +
          '">−</button>' +
          '<span>' +
          it.qty +
          '</span><button type="button" class="rh-shop-cart-qty" data-action="inc" data-sku="' +
          it.sku +
          '">+</button>' +
          '<button type="button" class="rh-shop-cart-remove" data-action="remove" data-sku="' +
          it.sku +
          '">Remove</button>' +
          "</div></div>"
        );
      })
      .join("");
    cartTotal.textContent = "Estimated subtotal: " + formatMoney(subtotal);
    if (cartCountTop) cartCountTop.textContent = qty + (qty === 1 ? " item" : " items");
    if (cartSubtotalTop) cartSubtotalTop.textContent = formatMoney(subtotal) + " subtotal";
    notifyCartChanged();
  }

  cartList.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest && e.target.closest("button[data-action][data-sku]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    var sku = String(btn.getAttribute("data-sku") || "").trim().toUpperCase();
    var item = cart[sku];
    if (!item) return;
    if (action === "inc") item.qty += 1;
    if (action === "dec") item.qty = Math.max(1, item.qty - 1);
    if (action === "remove") delete cart[sku];
    persistCart();
    renderCart();
  });

  function updateStatusFromQuery() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var state = String(params.get("checkout") || "").trim().toLowerCase();
      if (state === "success") {
        Object.keys(cart).forEach(function (k) {
          delete cart[k];
        });
        persistCart();
        renderCart();
        setCheckoutStatus("Payment successful. Thank you for your order!", "success");
      } else if (state === "cancelled") {
        setCheckoutStatus("Checkout was cancelled. You can try again whenever you are ready.", "error");
      }
    } catch (_e) {}
  }

  checkoutForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var items = cartItems();
    if (!items.length) {
      setCheckoutStatus("Your cart is empty. Add items from the catalog first.", "error");
      return;
    }

    var fd = new FormData(checkoutForm);
    var name = normalizedText(fd.get("name"));
    var email = normalizedText(fd.get("email"));
    if (name.length < 2) {
      setCheckoutStatus("Please enter your name.", "error");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCheckoutStatus("Please enter a valid email.", "error");
      return;
    }
    setCheckoutStatus("");
    setSubmitting(true);
    try {
      var resp = await fetch("/api/shop/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: name,
            email: email,
            phone: normalizedText(fd.get("phone")),
            shippingRegion: normalizedText(fd.get("shippingRegion")),
          },
          notes: normalizedText(fd.get("notes")),
          items: items.map(function (it) {
            return { sku: it.sku, name: it.name, quantity: it.qty, unitPrice: it.price };
          }),
        }),
      });
      var data = null;
      try {
        data = await resp.json();
      } catch (_e) {}
      if (!resp.ok) {
        setCheckoutStatus((data && data.error) || "Could not submit checkout. Please try again.", "error");
        return;
      }
      if (!data || !data.url) {
        setCheckoutStatus("Checkout session was created but no redirect URL was returned.", "error");
        return;
      }
      window.location.href = data.url;
    } catch (_err) {
      setCheckoutStatus("Could not reach the server. Please try again shortly.", "error");
    } finally {
      setSubmitting(false);
    }
  });

  updateStatusFromQuery();
  renderCart();
})();

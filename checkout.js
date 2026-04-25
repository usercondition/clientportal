/* Dedicated checkout page behavior (cart rendering + submission + payment links). */
(function () {
  var CART_KEY = "shop_cart_v1";
  var cartList = document.getElementById("shop-cart-list");
  var cartTotal = document.getElementById("shop-cart-total");
  var cartCountTop = document.getElementById("shop-cart-count-top");
  var cartSubtotalTop = document.getElementById("shop-cart-subtotal-top");
  var checkoutForm = document.getElementById("shop-checkout-form");
  var checkoutStatus = document.getElementById("shop-checkout-status");
  var checkoutSubmit = document.getElementById("shop-checkout-submit");
  var paymentNext = document.getElementById("shop-payment-next");
  var paymentLinks = document.getElementById("shop-payment-links");
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
    checkoutSubmit.textContent = on ? "Submitting..." : "Submit purchase request";
  }

  function renderCart() {
    var items = cartItems();
    if (!items.length) {
      cartList.innerHTML = '<p class="rh-shop-cart-empty">Your cart is empty. Add minis from the shop catalog.</p>';
      cartTotal.textContent = "Estimated subtotal: $0.00";
      if (cartCountTop) cartCountTop.textContent = "0 items";
      if (cartSubtotalTop) cartSubtotalTop.textContent = "$0.00 subtotal";
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
    var paymentMethod = normalizedText(fd.get("paymentMethod"));
    if (name.length < 2) {
      setCheckoutStatus("Please enter your name.", "error");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCheckoutStatus("Please enter a valid email.", "error");
      return;
    }
    if (!paymentMethod) {
      setCheckoutStatus("Please choose a payment method.", "error");
      return;
    }

    setCheckoutStatus("");
    if (paymentNext) paymentNext.hidden = true;
    if (paymentLinks) paymentLinks.innerHTML = "";
    setSubmitting(true);
    try {
      var resp = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: name,
            email: email,
            phone: normalizedText(fd.get("phone")),
            shippingRegion: normalizedText(fd.get("shippingRegion")),
          },
          paymentMethod: paymentMethod,
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

      Object.keys(cart).forEach(function (k) {
        delete cart[k];
      });
      persistCart();
      renderCart();
      checkoutForm.reset();
      setCheckoutStatus("Purchase request submitted. Complete payment below.", "success");

      if (paymentNext && paymentLinks && data && data.paymentOptions) {
        var options = data.paymentOptions || {};
        var selected = data.selectedMethod || "";
        var preferred = options[selected] ? [selected] : [];
        var ordered = preferred.concat(["paypal", "venmo", "cash_app"].filter(function (m) { return preferred.indexOf(m) < 0; }));
        var labels = { paypal: "Pay with PayPal", venmo: "Pay with Venmo", cash_app: "Pay with Cash App" };
        paymentLinks.innerHTML = ordered
          .filter(function (m) {
            return options[m] && String(options[m]).trim();
          })
          .map(function (m) {
            return (
              '<a class="rh-btn rh-btn--ghost" href="' +
              String(options[m]).replace(/"/g, "&quot;") +
              '" target="_blank" rel="noopener noreferrer">' +
              labels[m] +
              "</a>"
            );
          })
          .join("");
        paymentNext.hidden = paymentLinks.innerHTML.length === 0;
      }
    } catch (_err) {
      setCheckoutStatus("Could not reach the server. Please try again shortly.", "error");
    } finally {
      setSubmitting(false);
    }
  });

  renderCart();
})();

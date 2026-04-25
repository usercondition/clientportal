(function () {
  var chips = Array.prototype.slice.call(document.querySelectorAll(".rh-shop-chip"));
  var search = document.getElementById("shop-search");
  var grid = document.getElementById("shop-grid");
  var empty = document.getElementById("shop-empty");
  var addButtons = Array.prototype.slice.call(document.querySelectorAll(".rh-shop-add"));
  var cartList = document.getElementById("shop-cart-list");
  var cartTotal = document.getElementById("shop-cart-total");
  var checkoutForm = document.getElementById("shop-checkout-form");
  var checkoutStatus = document.getElementById("shop-checkout-status");
  var checkoutSubmit = document.getElementById("shop-checkout-submit");
  if (!chips.length || !grid) return;

  var currentFilter = "all";
  /** @type {Record<string, { sku: string; name: string; price: number; qty: number }>} */
  var cart = {};

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

  function renderCart() {
    if (!cartList || !cartTotal) return;
    var items = cartItems();
    if (!items.length) {
      cartList.innerHTML = '<p class="rh-shop-cart-empty">Your cart is empty. Add minis from the catalog.</p>';
      cartTotal.textContent = "Estimated subtotal: $0.00";
      return;
    }
    var subtotal = 0;
    cartList.innerHTML = items
      .map(function (it) {
        subtotal += it.price * it.qty;
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
      renderCart();
      setCheckoutStatus("Added " + cart[sku].name + " to cart.");
      if (checkoutForm) checkoutForm.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  if (cartList) {
    cartList.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("button[data-action][data-sku]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var sku = normalizedText(btn.getAttribute("data-sku")).toUpperCase();
      var item = cart[sku];
      if (!item) return;
      if (action === "inc") item.qty += 1;
      if (action === "dec") item.qty = Math.max(1, item.qty - 1);
      if (action === "remove") delete cart[sku];
      renderCart();
    });
  }

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var items = cartItems();
      if (!items.length) {
        setCheckoutStatus("Add at least one item before checkout.", "error");
        return;
      }
      var fd = new FormData(checkoutForm);
      var name = String(fd.get("name") || "").trim();
      var email = String(fd.get("email") || "").trim();
      var paymentMethod = String(fd.get("paymentMethod") || "").trim();
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
      setSubmitting(true);
      try {
        var resp = await fetch("/api/shop/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: {
              name: name,
              email: email,
              phone: String(fd.get("phone") || "").trim(),
              shippingRegion: String(fd.get("shippingRegion") || "").trim(),
            },
            paymentMethod: paymentMethod,
            notes: String(fd.get("notes") || "").trim(),
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
        renderCart();
        checkoutForm.reset();
        setCheckoutStatus("Purchase request submitted. We will follow up by email with final invoice details.", "success");
      } catch (_err) {
        setCheckoutStatus("Could not reach the server. Please try again shortly.", "error");
      } finally {
        setSubmitting(false);
      }
    });
  }

  if (search) search.addEventListener("input", updateVisible);
  updateVisible();
  renderCart();
})();

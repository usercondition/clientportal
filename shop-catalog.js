/* Load vendor catalog from Postgres API and render shop cards. */
(function () {
  var vendor = String(document.body.getAttribute("data-shop-vendor") || "").trim().toLowerCase();
  if (!vendor) return;

  var grid = document.getElementById("shop-grid");
  if (!grid) return;

  var emptyEl = document.getElementById("shop-empty");
  var resultsCount = document.getElementById("shop-results-count");

  function esc(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMoney(v) {
    return "$" + Number(v || 0).toFixed(2);
  }

  function toLargeThumb(src) {
    var value = String(src || "").trim();
    if (!value) return "";
    if (/[?&]sz=w\d+/i.test(value)) {
      return value.replace(/([?&]sz=)w\d+/i, "$1w1200");
    }
    return value;
  }

  function toSmallThumb(src) {
    var value = String(src || "").trim();
    if (!value) return "";
    if (/[?&]sz=w\d+/i.test(value)) {
      return value.replace(/([?&]sz=)w\d+/i, "$1w400");
    }
    return value;
  }

  function renderProduct(p) {
    var sku = esc(p.sku);
    var name = esc(p.name);
    var cat = esc(p.category || "general");
    var search = esc((p.searchText || "") + " " + p.sku + " " + p.name);
    var price = Number(p.price || 0);
    var gallery = Array.isArray(p.gallery) ? p.gallery : [];
    var lead = toLargeThumb(p.image || (gallery[0] || ""));
    var soldOut = p.inStock === false;
    var stockNote =
      p.stockQty != null && p.stockQty > 0 && p.stockQty <= 5
        ? '<span class="rh-shop-badge rh-shop-badge--low">Only ' + esc(String(p.stockQty)) + " left</span>"
        : "";
    var viewBadge =
      gallery.length > 1
        ? '<span class="rh-shop-badge">' + gallery.length + " views</span>"
        : "";
    var subGallery = gallery
      .map(function (src, idx) {
        var thumb = toSmallThumb(src);
        return (
          '<img src="' +
          esc(thumb) +
          '" alt="' +
          name +
          " view " +
          (idx + 1) +
          '" loading="lazy" decoding="async"' +
          (idx === 0 ? ' class="is-active" aria-current="true"' : "") +
          " />"
        );
      })
      .join("");
    var subBlock = subGallery
      ? '<div class="rh-shop-card__thumb-subgallery" aria-label="Additional listing photos">' +
        subGallery +
        "</div>"
      : "";
    var desc = esc(
      p.description ||
        "Licensed release. High-detail resin print fulfilled by Steindahl 3D Group."
    );
    return (
      '<article class="rh-shop-card" data-cat="' +
      cat +
      '" data-search="' +
      search +
      '"' +
      (soldOut ? ' data-sold-out="true"' : "") +
      ">" +
      '<div class="rh-shop-card__thumb">' +
      (lead
        ? '<img src="' +
          esc(lead) +
          '" alt="' +
          name +
          ' render front view" width="800" height="800" loading="lazy" decoding="async" />'
        : "") +
      viewBadge +
      stockNote +
      (soldOut ? '<span class="rh-shop-badge rh-shop-badge--sold">Sold out</span>' : "") +
      "</div>" +
      '<div class="rh-shop-card__body">' +
      "<h3>" +
      name +
      "</h3>" +
      "<p>" +
      desc +
      "</p>" +
      '<div class="rh-shop-meta"><strong>' +
      formatMoney(price) +
      "</strong><span>SKU: " +
      sku +
      "</span></div>" +
      subBlock +
      '<button type="button" class="rh-btn rh-btn--ghost rh-shop-add" data-sku="' +
      sku +
      '" data-name="' +
      name +
      '" data-price="' +
      String(price) +
      '"' +
      (soldOut ? " disabled" : "") +
      ">" +
      (soldOut ? "Sold out" : "Add to cart") +
      "</button>" +
      "</div>" +
      "</article>"
    );
  }

  function setLoading() {
    grid.innerHTML =
      '<p class="rh-shop-loading" id="shop-catalog-loading">Loading catalog…</p>';
    if (emptyEl) emptyEl.hidden = true;
  }

  function setError(message) {
    grid.innerHTML =
      '<p class="rh-shop-loading rh-shop-loading--error">' +
      esc(message || "Could not load catalog.") +
      "</p>";
  }

  function finish(products) {
    if (!products.length) {
      grid.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      if (resultsCount) resultsCount.textContent = "Showing 0 items";
    } else {
      grid.innerHTML = products.map(renderProduct).join("");
      if (emptyEl) emptyEl.hidden = true;
      if (resultsCount) {
        resultsCount.textContent =
          "Showing " + products.length + (products.length === 1 ? " item" : " items");
      }
    }
    document.body.setAttribute("data-shop-catalog-ready", "true");
    try {
      document.dispatchEvent(new CustomEvent("shop-catalog-ready", { detail: { vendor: vendor } }));
    } catch (_e) {}
  }

  setLoading();
  fetch("/api/shop/products?vendor=" + encodeURIComponent(vendor), {
    headers: { Accept: "application/json" },
  })
    .then(function (r) {
      if (!r.ok) throw new Error("Catalog request failed.");
      return r.json();
    })
    .then(function (payload) {
      var products = payload && Array.isArray(payload.products) ? payload.products : [];
      finish(products);
    })
    .catch(function () {
      var hasStatic = grid.querySelector(".rh-shop-card");
      if (!hasStatic) {
        setError("Catalog unavailable. Check database connection and run npm run db:migrate.");
      }
      document.body.setAttribute("data-shop-catalog-ready", hasStatic ? "fallback" : "error");
      try {
        document.dispatchEvent(
          new CustomEvent("shop-catalog-ready", { detail: { vendor: vendor, fallback: Boolean(hasStatic) } })
        );
      } catch (_e2) {}
    });
})();

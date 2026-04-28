(function () {
  var grid = document.getElementById("shop-grid");
  if (!grid) return;

  function toLargePreviewSrc(src) {
    var value = String(src || "").trim();
    if (!value) return "";
    if (/[?&]sz=w\d+/i.test(value)) {
      return value.replace(/([?&]sz=)w\d+/i, "$1w1200");
    }
    return value;
  }

  function getCard(node) {
    return node && node.closest ? node.closest(".rh-shop-card") : null;
  }

  function setActiveThumb(card, activeThumb) {
    if (!card) return;
    var thumbs = card.querySelectorAll(".rh-shop-card__thumb-subgallery img");
    Array.prototype.forEach.call(thumbs, function (thumb) {
      var isActive = thumb === activeThumb;
      thumb.classList.toggle("is-active", isActive);
      thumb.setAttribute("aria-current", isActive ? "true" : "false");
    });
  }

  function swapFromThumb(thumb) {
    var card = getCard(thumb);
    if (!card) return;
    var leadImg = card.querySelector(".rh-shop-card__thumb img");
    if (!leadImg) return;

    var nextSrc = toLargePreviewSrc(thumb.getAttribute("src"));
    if (nextSrc) leadImg.setAttribute("src", nextSrc);
    var nextAlt = thumb.getAttribute("alt");
    if (nextAlt) leadImg.setAttribute("alt", nextAlt);
    setActiveThumb(card, thumb);
  }

  var thumbs = grid.querySelectorAll(".rh-shop-card__thumb-subgallery img");
  Array.prototype.forEach.call(thumbs, function (thumb, idx) {
    if (!thumb.hasAttribute("tabindex")) thumb.setAttribute("tabindex", "0");
    thumb.setAttribute("role", "button");

    var card = getCard(thumb);
    if (idx === 0 || (card && !card.querySelector(".rh-shop-card__thumb-subgallery img.is-active"))) {
      setActiveThumb(card, thumb);
    }

    thumb.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      swapFromThumb(thumb);
    });

    // Desktop reliability: some browsers/cards may not dispatch click consistently.
    thumb.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      swapFromThumb(thumb);
    });

    thumb.addEventListener("mousedown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      swapFromThumb(thumb);
    });

    thumb.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      swapFromThumb(thumb);
    });
  });
})();

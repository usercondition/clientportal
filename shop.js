(function () {
  var chips = Array.prototype.slice.call(document.querySelectorAll(".rh-shop-chip"));
  var search = document.getElementById("shop-search");
  var grid = document.getElementById("shop-grid");
  var empty = document.getElementById("shop-empty");
  if (!chips.length || !grid) return;

  var currentFilter = "all";

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

  if (search) search.addEventListener("input", updateVisible);
  updateVisible();
})();

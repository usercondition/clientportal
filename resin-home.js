(function () {
  var list = document.querySelector(".rh-services__list");
  var panels = document.querySelector(".rh-services__panels");
  if (!list || !panels) return;

  var buttons = list.querySelectorAll("button[data-panel]");
  var articles = panels.querySelectorAll("[data-panel]");

  function activate(id) {
    buttons.forEach(function (btn) {
      var on = btn.getAttribute("data-panel") === id;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    articles.forEach(function (art) {
      var on = art.getAttribute("data-panel") === id;
      art.classList.toggle("is-active", on);
      art.setAttribute("aria-hidden", on ? "false" : "true");
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activate(btn.getAttribute("data-panel"));
    });
  });

  var initial = list.querySelector("button.is-active");
  activate(initial ? initial.getAttribute("data-panel") : "miniatures");

  var form = document.getElementById("rh-quote-form");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    var email = String(fd.get("email") || "").trim();
    var scope = String(fd.get("scope") || "").trim();
    var bodyLines = [
      "Print quote request",
      "",
      "Name: " + name,
      "Email: " + email,
      "",
      "Project details:",
      scope,
    ];
    var subject = encodeURIComponent("Resin print quote — " + (name || "request"));
    var body = encodeURIComponent(bodyLines.join("\n"));
    var action = form.getAttribute("action") || "mailto:you@example.com";
    window.location.href = action + "?subject=" + subject + "&body=" + body;
  });
})();

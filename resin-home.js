(function () {
  var list = document.querySelector(".rh-services__list");
  var panels = document.querySelector(".rh-services__panels");
  if (list && panels) {
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
  }

  var form = document.getElementById("rh-quote-form");
  if (!form) return;
  var statusEl = document.getElementById("rh-quote-status");
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitDefault = submitBtn ? submitBtn.textContent : "";

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (kind === "error") statusEl.classList.add("is-error");
    if (kind === "success") statusEl.classList.add("is-success");
  }

  function setSubmitting(on) {
    if (!submitBtn) return;
    submitBtn.disabled = !!on;
    submitBtn.textContent = on ? "Sending..." : submitDefault;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    var email = String(fd.get("email") || "").trim();
    var scope = String(fd.get("scope") || "").trim();
    if (name.length < 2 || !email || scope.length < 10) {
      setStatus("Please enter your name, a valid email, and project details.", "error");
      return;
    }
    setStatus("");
    setSubmitting(true);
    try {
      var response = await fetch(form.getAttribute("action") || "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, email: email, scope: scope }),
      });
      var data = null;
      try {
        data = await response.json();
      } catch (_e) {}
      if (!response.ok) {
        setStatus((data && data.error) || "Could not send your request. Please try again.", "error");
        return;
      }
      form.reset();
      setStatus("Thanks! Your request was sent. We will follow up by email.", "success");
    } catch (_err) {
      setStatus("Could not reach the server. Please try again in a moment.", "error");
    } finally {
      setSubmitting(false);
    }
  });
})();

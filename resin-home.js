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
  if (form) {
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
  }

  var assistantOpenBtn = document.getElementById("rh-assistant-open");
  var assistantCloseBtn = document.getElementById("rh-assistant-close");
  var assistantPanel = document.getElementById("rh-assistant-panel");
  var assistantThread = document.getElementById("rh-assistant-thread");
  var assistantForm = document.getElementById("rh-assistant-form");
  var assistantInput = document.getElementById("rh-assistant-input");

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s || "");
    return d.innerHTML;
  }

  function assistantCtas() {
    return (
      '<div class="rh-assistant__links">' +
      '<a href="#contact">Request a quote</a>' +
      '<a href="client-flow.html">Start client portal</a>' +
      '<a href="client-flow.html">Client sign in</a>' +
      "</div>"
    );
  }

  function assistantReplyFor(text) {
    var q = String(text || "").toLowerCase();
    if (/(price|quote|cost|estimate|how much)/.test(q)) {
      return (
        "I can help you get a quote quickly. Share quantity, dimensions, material preference, and deadline." +
        assistantCtas()
      );
    }
    if (/(portal|account|sign|login|track|status)/.test(q)) {
      return (
        "Great fit for the client portal. You can start a request, track orders, and message staff there." +
        assistantCtas()
      );
    }
    if (/(prototype|engineering|fit|tolerance)/.test(q)) {
      return (
        "For prototypes, include intended use, critical dimensions, and tolerance priorities so staff can advise accurately." +
        assistantCtas()
      );
    }
    return (
      "Happy to help. If you want a direct response from staff, use the quote form. If you prefer guided onboarding, use the portal." +
      assistantCtas()
    );
  }

  function appendAssistantMessage(kind, html) {
    if (!assistantThread) return;
    var cls = kind === "user" ? "rh-assistant__msg rh-assistant__msg--user" : "rh-assistant__msg rh-assistant__msg--bot";
    assistantThread.insertAdjacentHTML("beforeend", '<p class="' + cls + '">' + html + "</p>");
    assistantThread.scrollTop = assistantThread.scrollHeight;
  }

  function setAssistantOpen(on) {
    if (!assistantPanel || !assistantOpenBtn) return;
    assistantPanel.hidden = !on;
    assistantOpenBtn.hidden = !!on;
    assistantOpenBtn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on && assistantInput) {
      window.setTimeout(function () {
        assistantInput.focus();
      }, 10);
    }
  }

  if (assistantOpenBtn && assistantCloseBtn && assistantPanel && assistantForm && assistantInput && assistantThread) {
    appendAssistantMessage(
      "bot",
      "Hi, I am the website assistant. I can help you get to the best next step for quotes or portal access." +
        assistantCtas()
    );
    assistantOpenBtn.addEventListener("click", function () {
      setAssistantOpen(true);
    });
    assistantCloseBtn.addEventListener("click", function () {
      setAssistantOpen(false);
    });
    assistantForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = String(assistantInput.value || "").trim();
      if (!text) return;
      appendAssistantMessage("user", esc(text));
      assistantInput.value = "";
      window.setTimeout(function () {
        appendAssistantMessage("bot", assistantReplyFor(text));
      }, 220);
    });
  }
})();

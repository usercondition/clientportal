(function () {

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  }

  /** @param {HTMLElement} el */
  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  /** @param {HTMLElement} el */
  function clearError(el) {
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
  }

  /** @type {HTMLElement | null} */
  var activeEl = document.querySelector(".flow-slide.is-active");

  var stepIds = {
    welcome: "slide-welcome",
    lookup: "slide-lookup",
    "new-profile-intro": "slide-new-profile-intro",
    "new-profile": "slide-new-profile",
  };

  var pathSteps = {
    welcome: ["welcome"],
    returning: ["welcome", "lookup"],
    new: ["welcome", "new-profile-intro", "new-profile"],
  };

  var visitorPath = /** @type {"returning" | "new" | null} */ (null);

  function getStepKeyFromSlide(slide) {
    return slide.getAttribute("data-step") || "";
  }

  function updateProgress(activeSlide) {
    var step = getStepKeyFromSlide(activeSlide);
    var list =
      visitorPath === "returning"
        ? pathSteps.returning
        : visitorPath === "new"
          ? pathSteps.new
          : pathSteps.welcome;
    var idx = list.indexOf(step);
    var current = idx >= 0 ? idx + 1 : 1;
    var total = visitorPath ? list.length : 1;
    var curEl = document.getElementById("progress-current");
    var totEl = document.getElementById("progress-total");
    if (curEl) {
      curEl.textContent = String(current);
      curEl.classList.remove("flow-progress-bump");
      void curEl.offsetWidth;
      curEl.classList.add("flow-progress-bump");
    }
    if (totEl) totEl.textContent = String(total);
  }

  /** @param {string} stepKey */
  function goToStep(stepKey) {
    var id = stepIds[stepKey];
    if (!id) return;
    var next = document.getElementById(id);
    if (!next || !(next instanceof HTMLElement)) return;

    if (activeEl) {
      activeEl.classList.remove("is-active");
      activeEl.setAttribute("hidden", "");
    }
    next.classList.add("is-active");
    next.removeAttribute("hidden");
    activeEl = next;
    updateProgress(next);
    next.focus({ preventScroll: true });

    window.requestAnimationFrame(function () {
      var focusId =
        stepKey === "lookup"
          ? "lookup-first-name"
          : stepKey === "new-profile"
            ? "new-first-name"
            : null;
      if (focusId) {
        var el = document.getElementById(focusId);
        if (el && typeof el.focus === "function") el.focus();
      }
    });
  }

  /** @param {string} backKey */
  function goBack(backKey) {
    goToStep(backKey);
  }

  document.querySelectorAll("[data-goto]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-goto");
      if (target === "new-profile-intro") visitorPath = "new";
      if (target === "lookup") visitorPath = "returning";
      if (target) goToStep(target);
    });
  });

  document.querySelectorAll(".flow-back").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var back = btn.getAttribute("data-back");
      if (back === "welcome") visitorPath = null;
      if (back) goBack(back);
    });
  });

  var lookupForm = document.getElementById("form-lookup");
  var lookupError = document.getElementById("lookup-error");

  if (lookupForm) {
    lookupForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      clearError(/** @type {HTMLElement} */ (lookupError));

      var fd = new FormData(lookupForm);
      var firstName = String(fd.get("firstName") || "").trim();
      var lastName = String(fd.get("lastName") || "").trim();
      var zip = String(fd.get("zip") || "").trim();

      if (!/^\d{5}$/.test(zip)) {
        showError(/** @type {HTMLElement} */ (lookupError), "Enter a valid 5-digit ZIP code.");
        return;
      }

      if (!window.Portal || !Portal.loginClient) {
        showError(/** @type {HTMLElement} */ (lookupError), "Portal service is unavailable.");
        return;
      }
      try {
        await Portal.loginClient(firstName, lastName, zip);
        location.replace("client-portal.html");
      } catch (err) {
        showError(
          /** @type {HTMLElement} */ (lookupError),
          err && err.message
            ? err.message
            : "We couldn’t find a profile with those names and ZIP. Check your details or create a new profile."
        );
      }
    });
  }

  var newForm = document.getElementById("form-new-profile");
  var newError = document.getElementById("new-profile-error");

  if (newForm) {
    newForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      clearError(/** @type {HTMLElement} */ (newError));

      var fd = new FormData(newForm);
      var firstName = String(fd.get("firstName") || "").trim();
      var lastName = String(fd.get("lastName") || "").trim();
      var email = String(fd.get("email") || "").trim();
      var phone = String(fd.get("phone") || "").trim();
      var addressLine1 = String(fd.get("addressLine1") || "").trim();
      var addressLine2 = String(fd.get("addressLine2") || "").trim();
      var city = String(fd.get("city") || "").trim();
      var state = String(fd.get("state") || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 2);
      var addressZip = String(fd.get("addressZip") || "").trim();

      if (!firstName || !lastName) {
        showError(/** @type {HTMLElement} */ (newError), "First and last name are required.");
        return;
      }

      if (!email) {
        showError(/** @type {HTMLElement} */ (newError), "Email is required.");
        return;
      }
      if (!isValidEmail(email)) {
        showError(/** @type {HTMLElement} */ (newError), "Enter a valid email address.");
        return;
      }

      if (!addressLine1) {
        showError(/** @type {HTMLElement} */ (newError), "Street address is required.");
        return;
      }
      if (!city) {
        showError(/** @type {HTMLElement} */ (newError), "City is required.");
        return;
      }
      if (state.length !== 2) {
        showError(/** @type {HTMLElement} */ (newError), "Enter a two-letter state code.");
        return;
      }
      if (!/^\d{5}$/.test(addressZip)) {
        showError(/** @type {HTMLElement} */ (newError), "Enter a valid 5-digit ZIP code in your address.");
        return;
      }

      var stateInput = document.getElementById("new-state");
      if (stateInput) stateInput.value = state;

      var candidate = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: phone || undefined,
        addressLine1: addressLine1,
        addressLine2: addressLine2 || "",
        city: city,
        state: state,
        addressZip: addressZip,
      };
      if (!window.Portal || !Portal.registerClient) {
        showError(/** @type {HTMLElement} */ (newError), "Portal service is unavailable.");
        return;
      }
      try {
        await Portal.registerClient(candidate);
        location.replace("client-portal.html");
      } catch (err) {
        showError(
          /** @type {HTMLElement} */ (newError),
          err && err.message
            ? err.message
            : "Unable to create profile right now. Please try again."
        );
      }
    });
  }

  if (activeEl) updateProgress(activeEl);

  ["lookup-zip", "new-address-zip"].forEach(function (id) {
    var z = document.getElementById(id);
    if (!z) return;
    z.addEventListener("input", function () {
      var v = z.value.replace(/\D/g, "").slice(0, 5);
      if (z.value !== v) z.value = v;
    });
  });

  var stateInput = document.getElementById("new-state");
  if (stateInput) {
    stateInput.addEventListener("input", function () {
      var v = stateInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      if (stateInput.value !== v) stateInput.value = v;
    });
  }
})();

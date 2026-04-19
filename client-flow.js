(function () {
  var STORAGE_KEY = "clientFlowProfiles";

  /**
   * @typedef {{
   *   firstName: string,
   *   lastName: string,
   *   zip: string,
   *   email?: string,
   *   phone?: string,
   *   address?: { line1: string, line2?: string, city: string, state: string, zip: string },
   *   name?: string
   * }} Profile
   * `name` is legacy single-field storage only.
   */

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  }

  /** @param {{ line1: string, line2?: string, city: string, state: string, zip: string }} a */
  function formatAddressLines(a) {
    var lines = [a.line1];
    if (a.line2 && String(a.line2).trim()) lines.push(String(a.line2).trim());
    lines.push(
      [a.city, a.state, a.zip]
        .filter(function (x) {
          return String(x || "").trim();
        })
        .join(", ")
    );
    return lines.join("\n");
  }

  function loadProfiles() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /** @param {Profile[]} list */
  function saveProfiles(list) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function normalizeName(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  /**
   * @param {Partial<Profile> & { name?: string }} p
   * @returns {{ first: string, last: string }}
   */
  function profileFirstLast(p) {
    if (typeof p.firstName === "string" || typeof p.lastName === "string") {
      return { first: normalizeName(p.firstName), last: normalizeName(p.lastName) };
    }
    if (p.name) {
      var s = String(p.name).trim().replace(/\s+/g, " ");
      var i = s.indexOf(" ");
      if (i === -1) return { first: normalizeName(s), last: "" };
      return { first: normalizeName(s.slice(0, i)), last: normalizeName(s.slice(i + 1)) };
    }
    return { first: "", last: "" };
  }

  /** @param {Partial<Profile> & { name?: string }} a @param {Partial<Profile> & { name?: string }} b */
  function samePerson(a, b) {
    var af = profileFirstLast(/** @type {*} */ (a));
    var bf = profileFirstLast(/** @type {*} */ (b));
    return af.first === bf.first && af.last === bf.last && String(a.zip).trim() === String(b.zip).trim();
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
    profile: "slide-profile",
  };

  var pathSteps = {
    welcome: ["welcome"],
    returning: ["welcome", "lookup", "profile"],
    new: ["welcome", "new-profile-intro", "new-profile", "profile"],
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
    if (curEl) curEl.textContent = String(current);
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
    lookupForm.addEventListener("submit", function (e) {
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

      var profiles = loadProfiles();
      var match = profiles.find(function (p) {
        return samePerson(
          /** @type {Profile} */ ({ firstName: firstName, lastName: lastName, zip: zip }),
          /** @type {Profile} */ (p)
        );
      });

      if (!match) {
        showError(
          /** @type {HTMLElement} */ (lookupError),
          "We couldn’t find a profile with those names and ZIP. Check your details or create a new profile from the start."
        );
        return;
      }

      fillProfileView(/** @type {Profile} */ (match), "returning");
      goToStep("profile");
    });
  }

  var newForm = document.getElementById("form-new-profile");
  var newError = document.getElementById("new-profile-error");

  if (newForm) {
    newForm.addEventListener("submit", function (e) {
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

      var profiles = loadProfiles();
      var candidate = /** @type {Profile} */ ({
        firstName: firstName,
        lastName: lastName,
        zip: addressZip,
        email: email,
        phone: phone || undefined,
        address: {
          line1: addressLine1,
          line2: addressLine2 || undefined,
          city: city,
          state: state,
          zip: addressZip,
        },
      });
      var exists = profiles.some(function (p) {
        return samePerson(candidate, /** @type {Profile} */ (p));
      });
      if (exists) {
        showError(
          /** @type {HTMLElement} */ (newError),
          "A profile with this first name, last name, and ZIP already exists. Use “I’ve been here before” to sign in."
        );
        return;
      }

      profiles.push(candidate);
      saveProfiles(profiles);

      fillProfileView(candidate, "new");
      goToStep("profile");
    });
  }

  /** @param {Profile} p @param {"new" | "returning"} mode */
  function fillProfileView(p, mode) {
    var label = document.getElementById("profile-mode-label");
    var title = document.getElementById("profile-title");
    var firstEl = document.getElementById("profile-display-first-name");
    var lastEl = document.getElementById("profile-display-last-name");
    var zipEl = document.getElementById("profile-display-zip");
    var emailEl = document.getElementById("profile-display-email");
    var phoneRow = document.getElementById("profile-phone-row");
    var phoneEl = document.getElementById("profile-display-phone");

    if (label) {
      label.textContent = mode === "new" ? "New profile" : "Welcome back";
    }
    if (title) {
      title.textContent = mode === "new" ? "Profile created" : "Profile loaded";
    }
    var fn = typeof p.firstName === "string" ? p.firstName : "";
    var ln = typeof p.lastName === "string" ? p.lastName : "";
    if ((!fn || !ln) && p.name) {
      var parts = String(p.name).trim().split(/\s+/);
      if (!fn) fn = parts[0] || "";
      if (!ln) ln = parts.slice(1).join(" ") || "";
    }
    if (firstEl) firstEl.textContent = fn || "—";
    if (lastEl) lastEl.textContent = ln || "—";

    var zipRow = document.getElementById("profile-zip-row");
    var hasAddress = !!(p.address && p.address.line1);
    if (zipRow) zipRow.hidden = hasAddress;
    if (zipEl) zipEl.textContent = p.zip || "—";
    if (emailEl) emailEl.textContent = p.email && String(p.email).trim() ? p.email : "—";
    if (p.phone && phoneRow && phoneEl) {
      phoneEl.textContent = p.phone;
      phoneRow.hidden = false;
    } else if (phoneRow) {
      phoneRow.hidden = true;
    }

    var addrBlock = document.getElementById("profile-address-block");
    var addrEl = document.getElementById("profile-display-address");
    if (p.address && p.address.line1 && addrBlock && addrEl) {
      addrEl.textContent = formatAddressLines(/** @type {*} */ (p.address));
      addrBlock.hidden = false;
    } else if (addrBlock) {
      addrBlock.hidden = true;
    }
  }

  var startOver = document.getElementById("btn-start-over");
  if (startOver) {
    startOver.addEventListener("click", function () {
      visitorPath = null;
      if (lookupForm) lookupForm.reset();
      if (newForm) newForm.reset();
      clearError(/** @type {HTMLElement} */ (lookupError));
      clearError(/** @type {HTMLElement} */ (newError));
      goToStep("welcome");
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

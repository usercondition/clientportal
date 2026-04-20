(function () {
  if (!window.Portal) return;

  var form = document.getElementById("order-request-form");
  var errEl = document.getElementById("order-form-error");
  var submitBtn = document.getElementById("order-submit");
  var neededInput = document.getElementById("order-needed");

  var signOut = document.getElementById("portal-sign-out");
  if (signOut) {
    signOut.addEventListener("click", function () {
      Portal.clearSession();
      location.href = "client-flow.html";
    });
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
    errEl.hidden = !msg;
  }

  function todayISODate() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  if (neededInput) {
    neededInput.min = todayISODate();
  }

  if (form) {
    form.addEventListener("input", function () {
      showError("");
    });
    form.addEventListener("change", function () {
      showError("");
    });
  }

  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("");

    var fd = new FormData(form);
    var title = String(fd.get("title") || "").trim();
    var serviceType = String(fd.get("serviceType") || "").trim();
    var description = String(fd.get("description") || "").trim();
    var qtyRaw = fd.get("quantity");
    var quantity = qtyRaw === "" || qtyRaw === null ? NaN : Number(qtyRaw);
    var unit = String(fd.get("unit") || "").trim();
    var dimensions = String(fd.get("dimensions") || "").trim();
    var materialPreference = String(fd.get("materialPreference") || "").trim();
    var intendedUse = String(fd.get("intendedUse") || "").trim();
    var neededBy = String(fd.get("neededBy") || "").trim();
    var referenceUrl = String(fd.get("referenceUrl") || "").trim();
    var rushRequested = fd.get("rushRequested") === "on";
    var shippingPreference = String(fd.get("shippingPreference") || "").trim();
    var specialInstructions = String(fd.get("specialInstructions") || "").trim();
    var confirmAccuracy = fd.get("confirmAccuracy") === "on";

    if (title.length < 3) {
      showError("Enter a project title (at least 3 characters).");
      return;
    }
    if (!serviceType) {
      showError("Select a service type.");
      return;
    }
    if (description.length < 10) {
      showError("Description must be at least 10 characters.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100000) {
      showError("Enter a valid quantity (1–100,000).");
      return;
    }
    if (materialPreference.length < 2) {
      showError("Describe material / finish preference.");
      return;
    }
    if (intendedUse.length < 5) {
      showError("Intended use must be at least 5 characters.");
      return;
    }
    if (!shippingPreference) {
      showError("Select shipping / delivery.");
      return;
    }
    if (!confirmAccuracy) {
      showError("Confirm that your request details are accurate.");
      return;
    }
    if (referenceUrl) {
      try {
        var u = new URL(referenceUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          showError("Reference link must start with http:// or https://.");
          return;
        }
      } catch (ex) {
        showError("Reference link is not a valid URL.");
        return;
      }
    }
    if (neededBy && neededBy < todayISODate()) {
      showError("Needed-by date cannot be in the past.");
      return;
    }

    var payload = {
      title: title,
      serviceType: serviceType,
      description: description,
      quantity: Math.floor(quantity),
      unit: unit || undefined,
      dimensions: dimensions || undefined,
      materialPreference: materialPreference,
      intendedUse: intendedUse,
      neededBy: neededBy || undefined,
      referenceUrl: referenceUrl || undefined,
      rushRequested: rushRequested,
      shippingPreference: shippingPreference,
      specialInstructions: specialInstructions || undefined,
      confirmAccuracy: true,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    try {
      await Portal.submitOrderRequest(payload);
      location.href = "client-portal.html?order=submitted";
    } catch (err) {
      showError((err && err.message) || "Could not submit. Try again.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit request";
      }
    }
  });
})();

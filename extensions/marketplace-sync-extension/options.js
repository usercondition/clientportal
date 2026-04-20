(function () {
  var apiInput = document.getElementById("api-base-url");
  var tokenInput = document.getElementById("sync-token");
  var platformInput = document.getElementById("platform");
  var profileSelect = document.getElementById("selector-profile");
  var customTextarea = document.getElementById("custom-selectors");
  var saveBtn = document.getElementById("save-btn");
  var statusEl = document.getElementById("status");

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function normalizeSyncToken(v) {
    var s = String(v || "").trim();
    if (
      (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"' && s.length >= 2) ||
      (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'" && s.length >= 2)
    ) {
      return s.slice(1, -1).trim();
    }
    return s;
  }

  function load() {
    chrome.storage.sync.get(
      {
        apiBaseUrl: "",
        syncToken: "",
        platform: "marketplace",
        selectorProfile: "generic",
        customSelectorsJson: "",
      },
      function (data) {
        apiInput.value = data.apiBaseUrl || "";
        tokenInput.value = data.syncToken || "";
        platformInput.value = data.platform || "marketplace";
        if (profileSelect) profileSelect.value = data.selectorProfile || "generic";
        if (customTextarea) customTextarea.value = data.customSelectorsJson || "";
      }
    );
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      var profile = profileSelect ? String(profileSelect.value || "generic").trim() : "generic";
      var customRaw = customTextarea ? String(customTextarea.value || "").trim() : "";
      if (profile === "custom" && customRaw) {
        try {
          JSON.parse(customRaw);
        } catch (e) {
          setStatus("Custom JSON is invalid: " + ((e && e.message) || "parse error"));
          return;
        }
      }
      chrome.storage.sync.set(
        {
          apiBaseUrl: String(apiInput.value || "").trim(),
          syncToken: normalizeSyncToken(tokenInput.value),
          platform: String(platformInput.value || "").trim() || "marketplace",
          selectorProfile: profile || "generic",
          customSelectorsJson: customRaw,
        },
        function () {
          setStatus("Saved.");
        }
      );
    });
  }

  load();
})();

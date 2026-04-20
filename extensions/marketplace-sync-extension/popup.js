(function () {
  var btn = document.getElementById("sync-btn");
  var statusEl = document.getElementById("status");
  var optionsLink = document.getElementById("open-options");

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  if (optionsLink) {
    optionsLink.addEventListener("click", function (e) {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  if (!btn) return;
  btn.addEventListener("click", function () {
    btn.disabled = true;
    setStatus("Syncing…");
    chrome.runtime.sendMessage({ type: "runMarketplaceSync" }, function (resp) {
      btn.disabled = false;
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "Sync failed.");
        return;
      }
      if (!resp || !resp.ok) {
        setStatus((resp && resp.error) || "Sync failed.");
        return;
      }
      var r = resp.result || {};
      var t = r.upsertedThreads;
      var m = r.upsertedMessages;
      var parts = ["Synced.", "Threads:", t || 0, "messages:", m || 0];
      if (r.threadsSkippedMissingId) parts.push("(skipped thread ids: " + r.threadsSkippedMissingId + ")");
      if (r.messagesSkippedMissingId) parts.push("(skipped msg ids: " + r.messagesSkippedMissingId + ")");
      if (r.warnings && r.warnings.length) {
        parts.push("Warnings: " + r.warnings.slice(0, 2).join(" · "));
        if (r.warnings.length > 2) parts.push("…");
      }
      setStatus(parts.join(" "));
    });
  });
})();

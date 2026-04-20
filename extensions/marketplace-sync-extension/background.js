async function readConfig() {
  const data = await chrome.storage.sync.get({
    apiBaseUrl: "",
    syncToken: "",
    platform: "marketplace",
    selectorProfile: "generic",
    customSelectorsJson: "",
  });
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "runMarketplaceSync") return;
  (async () => {
    const cfg = await readConfig();
    if (!cfg.apiBaseUrl || !cfg.syncToken) {
      sendResponse({ ok: false, error: "Missing API base URL or sync token in extension options." });
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      sendResponse({ ok: false, error: "No active tab found." });
      return;
    }
    const collected = await chrome.tabs.sendMessage(tab.id, {
      type: "collectMarketplaceThreads",
      selectorProfile: cfg.selectorProfile || "generic",
      customSelectorsJson: cfg.customSelectorsJson || "",
    });
    if (!collected || !collected.ok) {
      sendResponse({ ok: false, error: (collected && collected.error) || "Could not read thread data from page." });
      return;
    }
    const res = await fetch(cfg.apiBaseUrl.replace(/\/+$/, "") + "/api/admin/marketplace/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.syncToken,
      },
      body: JSON.stringify({
        platform: cfg.platform || "marketplace",
        threads: collected.threads || [],
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      sendResponse({ ok: false, error: (payload && payload.error) || "Sync request failed." });
      return;
    }
    sendResponse({ ok: true, result: payload });
  })().catch((err) => {
    sendResponse({ ok: false, error: (err && err.message) || "Sync failed." });
  });
  return true;
});

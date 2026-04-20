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

function buildSyncUrl(apiBaseRaw) {
  const base = String(apiBaseRaw || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) throw new Error("API base URL is empty.");
  return new URL("/api/admin/marketplace/sync", base).href;
}

function describeFetchError(err) {
  const msg = (err && err.message) || String(err);
  if (/Failed to fetch|NetworkError|Load failed|network error/i.test(msg)) {
    return (
      "Network error reaching your API. Check: (1) API base URL is exactly your Railway URL with https, " +
      "(2) the site opens in a normal tab, (3) no VPN/firewall blocking, (4) redeploy finished. " +
      "Original: " +
      msg
    );
  }
  return msg;
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
    let syncUrl;
    try {
      syncUrl = buildSyncUrl(cfg.apiBaseUrl);
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || "Invalid API base URL." });
      return;
    }
    const res = await fetch(syncUrl, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(cfg.syncToken).trim(),
      },
      body: JSON.stringify({
        platform: cfg.platform || "marketplace",
        threads: collected.threads || [],
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      sendResponse({ ok: false, error: (payload && payload.error) || "Sync request failed (" + res.status + ")." });
      return;
    }
    sendResponse({ ok: true, result: payload });
  })().catch((err) => {
    sendResponse({ ok: false, error: describeFetchError(err) });
  });
  return true;
});

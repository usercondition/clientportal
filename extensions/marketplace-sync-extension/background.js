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

function normalizeSyncToken(v) {
  const s = String(v || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1).trim();
  }
  return s;
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

function isInjectableWebUrl(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.trim().toLowerCase();
  if (
    u.startsWith("chrome://") ||
    u.startsWith("chrome-extension://") ||
    u.startsWith("edge://") ||
    u.startsWith("about:") ||
    u.startsWith("devtools:") ||
    u.startsWith("view-source:")
  ) {
    return false;
  }
  return /^https?:\/\//i.test(u);
}

function sendMessageToTab(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response);
    });
  });
}

async function collectThreadsFromTab(tabId, payload) {
  try {
    return await sendMessageToTab(tabId, payload);
  } catch (firstErr) {
    const msg = String(firstErr && firstErr.message);
    if (!/Receiving end does not exist|Could not establish connection/i.test(msg)) {
      throw firstErr;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-marketplace.js"],
    });
    return await sendMessageToTab(tabId, payload);
  }
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
    const url = tab.url || "";
    if (url.startsWith("chrome-extension://")) {
      sendResponse({
        ok: false,
        error:
          "The active tab is this extension (e.g. Options). Switch to your Facebook/Messages inbox tab in the main browser window, then open the extension popup and click Sync again.",
      });
      return;
    }
    if (!isInjectableWebUrl(url)) {
      sendResponse({
        ok: false,
        error:
          "This page cannot run the inbox helper (internal browser URL). Open https://www.facebook.com or your marketplace inbox in a normal tab, then Sync.",
      });
      return;
    }

    const collectPayload = {
      type: "collectMarketplaceThreads",
      selectorProfile: cfg.selectorProfile || "generic",
      customSelectorsJson: cfg.customSelectorsJson || "",
    };

    let collected;
    try {
      collected = await collectThreadsFromTab(tab.id, collectPayload);
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/Receiving end does not exist|Could not establish connection/i.test(m)) {
        sendResponse({
          ok: false,
          error:
            "Could not talk to this tab after injecting the helper. Reload the inbox page (F5), then Sync again. If you use Messenger only inside another app, open it in a normal Chrome tab.",
        });
        return;
      }
      throw e;
    }

    if (!collected || !collected.ok) {
      sendResponse({ ok: false, error: (collected && collected.error) || "Could not read thread data from page." });
      return;
    }
    if (!collected.threads || collected.threads.length === 0) {
      sendResponse({
        ok: false,
        error:
          "No threads in this tab. Open your inbox list, set profile to Meta/Facebook (or Custom JSON), reload the extension, then try again.",
      });
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
        Authorization: "Bearer " + normalizeSyncToken(cfg.syncToken),
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

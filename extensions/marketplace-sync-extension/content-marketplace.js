(function () {
  function textOf(el) {
    return el ? String(el.textContent || "").trim() : "";
  }

  function collectGeneric() {
    var threadEls = Array.prototype.slice.call(document.querySelectorAll("[data-thread-id]"));
    return threadEls
      .map(function (el) {
        var threadId = el.getAttribute("data-thread-id") || "";
        var buyerName =
          textOf(el.querySelector("[data-thread-buyer]")) || textOf(el.querySelector(".buyer-name"));
        var snippet =
          textOf(el.querySelector("[data-thread-snippet]")) || textOf(el.querySelector(".thread-snippet"));
        return {
          threadId: threadId,
          buyerName: buyerName,
          snippet: snippet,
          updatedAt: new Date().toISOString(),
          messages: [],
        };
      })
      .filter(function (t) {
        return t.threadId;
      });
  }

  function collectMetaCommerce() {
    var threads = [];
    var seen = Object.create(null);
    var anchors = document.querySelectorAll(
      'a[href*="/marketplace/t/"], a[href*="/messages/t/"], a[href*="thread_id="]'
    );
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute("href") || "";
      var threadId = "";
      var m1 = href.match(/\/marketplace\/t\/(\d+)/);
      var m2 = href.match(/\/messages\/t\/(\d+)/);
      if (m1) threadId = m1[1];
      else if (m2) threadId = m2[1];
      else {
        var mq = href.match(/[?&]thread_id=(\d+)/);
        if (mq) threadId = mq[1];
      }
      if (!threadId || seen[threadId]) continue;
      seen[threadId] = true;
      var row =
        a.closest('[role="row"], [role="listitem"], li, div[role="gridcell"]') || a.parentElement;
      var buyerName = textOf(a).slice(0, 200) || (row && row !== a ? textOf(row).slice(0, 200) : "");
      var snippet = "";
      if (row && row !== a) {
        var spans = row.querySelectorAll("span[dir='auto'], span");
        for (var j = 0; j < spans.length; j++) {
          var t = textOf(spans[j]);
          if (t && t !== buyerName && t.length > 2) {
            snippet = t.slice(0, 500);
            break;
          }
        }
      }
      threads.push({
        threadId: threadId,
        buyerName: buyerName,
        snippet: snippet,
        updatedAt: new Date().toISOString(),
        messages: [],
      });
    }
    return threads;
  }

  function collectCustom(cfg) {
    if (!cfg || typeof cfg !== "object") return [];
    var rowSel = String(cfg.rowSelector || cfg.threadRowSelector || "").trim();
    if (!rowSel) return [];
    var idAttr = cfg.idAttr ? String(cfg.idAttr).trim() : "";
    var idSelector = cfg.idSelector ? String(cfg.idSelector).trim() : "";
    var idSubAttr = cfg.idSubAttr ? String(cfg.idSubAttr).trim() : "";
    var buyerSel = cfg.buyerSelector ? String(cfg.buyerSelector).trim() : "";
    var snippetSel = cfg.snippetSelector ? String(cfg.snippetSelector).trim() : "";
    var rows = document.querySelectorAll(rowSel);
    var threads = [];
    var seen = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var threadId = "";
      if (idAttr) threadId = String(row.getAttribute(idAttr) || "").trim();
      if (!threadId && idSelector) {
        var sub = row.querySelector(idSelector);
        if (sub) {
          if (idSubAttr) threadId = String(sub.getAttribute(idSubAttr) || "").trim();
          else threadId = textOf(sub).trim();
        }
      }
      if (!threadId || seen[threadId]) continue;
      seen[threadId] = true;
      threads.push({
        threadId: threadId.slice(0, 512),
        buyerName: buyerSel ? textOf(row.querySelector(buyerSel)).slice(0, 200) : "",
        snippet: snippetSel ? textOf(row.querySelector(snippetSel)).slice(0, 500) : "",
        updatedAt: new Date().toISOString(),
        messages: [],
      });
    }
    return threads;
  }

  function parseCustomJson(raw) {
    if (!raw || typeof raw !== "string") return null;
    var s = raw.trim();
    if (!s) return null;
    try {
      var o = JSON.parse(s);
      return o && typeof o === "object" ? o : null;
    } catch (_e) {
      return null;
    }
  }

  function collectFromPage(msg) {
    var profile = String((msg && msg.selectorProfile) || "generic").trim().toLowerCase();
    if (profile === "meta" || profile === "meta_commerce" || profile === "facebook") {
      return { ok: true, threads: collectMetaCommerce() };
    }
    if (profile === "custom") {
      var cfg = parseCustomJson((msg && msg.customSelectorsJson) || "");
      if (!cfg) {
        return { ok: false, error: "Custom profile: invalid or empty JSON in extension options." };
      }
      return { ok: true, threads: collectCustom(cfg) };
    }
    return { ok: true, threads: collectGeneric() };
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || msg.type !== "collectMarketplaceThreads") return;
    try {
      var out = collectFromPage(msg);
      if (!out || !out.ok) {
        sendResponse({ ok: false, error: (out && out.error) || "Could not collect threads." });
        return true;
      }
      sendResponse({ ok: true, threads: out.threads || [] });
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.message) || "Could not collect threads." });
    }
    return true;
  });
})();

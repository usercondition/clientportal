(function () {
  function textOf(el) {
    return el ? String(el.textContent || "").trim() : "";
  }

  function absolutize(href) {
    try {
      return new URL(href, document.baseURI).href;
    } catch (_e) {
      return String(href || "");
    }
  }

  /** Long numeric ids typical of Meta thread URLs (avoid matching random /t/ paths). */
  function extractThreadIdFromInboxHref(absUrl) {
    var s = String(absUrl || "");
    var patterns = [
      /\/marketplace\/t\/(\d{6,})/i,
      /\/messages\/t\/(\d{6,})/i,
      /\/messenger\/t\/(\d{6,})/i,
      /\/e2ee\/t\/(\d{6,})/i,
      /[?&]thread_id=(\d{6,})/i,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = s.match(patterns[i]);
      if (m) return m[1];
    }
    var loose = s.match(/\/t\/(\d{6,})\b/);
    if (loose) return loose[1];
    return "";
  }

  /** One stable row per thread so admin “messages” is not empty when only the inbox list is visible. */
  function previewMessagesForThread(threadId, snippet) {
    var sn = String(snippet || "").trim();
    if (!sn) return [];
    return [
      {
        messageId: "__inbox_preview__:" + String(threadId),
        senderLabel: "Inbox preview",
        body: sn.slice(0, 12000),
        sentAt: new Date().toISOString(),
      },
    ];
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
          messages: previewMessagesForThread(threadId, snippet),
        };
      })
      .filter(function (t) {
        return t.threadId;
      });
  }

  function collectMetaCommerce() {
    var threads = [];
    var seen = Object.create(null);
    var anchorSet = new Set();
    function addAnchors(sel) {
      var list = document.querySelectorAll(sel);
      for (var i = 0; i < list.length; i++) anchorSet.add(list[i]);
    }
    addAnchors('a[href*="/t/"]');
    addAnchors('a[href*="thread_id"]');
    addAnchors('a[href*="messages"]');
    addAnchors('a[href*="marketplace"]');
    addAnchors('a[href*="messenger"]');

    anchorSet.forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href) return;
      var abs = absolutize(href);
      var threadId = extractThreadIdFromInboxHref(abs);
      if (!threadId || seen[threadId]) return;
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
        messages: previewMessagesForThread(threadId, snippet),
      });
    });
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
      var sn = snippetSel ? textOf(row.querySelector(snippetSel)).slice(0, 500) : "";
      threads.push({
        threadId: threadId.slice(0, 512),
        buyerName: buyerSel ? textOf(row.querySelector(buyerSel)).slice(0, 200) : "",
        snippet: sn,
        updatedAt: new Date().toISOString(),
        messages: previewMessagesForThread(threadId, sn),
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

  var META_EMPTY_HINT =
    "No threads found on this tab. Open the Facebook/Meta Messages or Marketplace inbox list (conversation list). In extension Options choose profile “Meta / Facebook”. If the list still shows 0, use “Custom” with row selectors from DevTools (Meta changes markup often).";

  var GENERIC_EMPTY_HINT =
    'No elements matched [data-thread-id]. For Meta/Facebook inbox, switch profile to “Meta / Facebook”, or use “Custom” JSON with rowSelector / idAttr.';

  function collectFromPage(msg) {
    var profile = String((msg && msg.selectorProfile) || "generic").trim().toLowerCase();
    if (profile === "meta" || profile === "meta_commerce" || profile === "facebook") {
      var mt = collectMetaCommerce();
      if (!mt.length) return { ok: false, error: META_EMPTY_HINT };
      return { ok: true, threads: mt };
    }
    if (profile === "custom") {
      var cfg = parseCustomJson((msg && msg.customSelectorsJson) || "");
      if (!cfg) {
        return { ok: false, error: "Custom profile: invalid or empty JSON in extension options." };
      }
      var ct = collectCustom(cfg);
      if (!ct.length) {
        return {
          ok: false,
          error:
            "Custom profile matched no rows. Check rowSelector and idAttr in Options JSON against this page in DevTools.",
        };
      }
      return { ok: true, threads: ct };
    }
    var gt = collectGeneric();
    if (!gt.length) return { ok: false, error: GENERIC_EMPTY_HINT };
    return { ok: true, threads: gt };
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

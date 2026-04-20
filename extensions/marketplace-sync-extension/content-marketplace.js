(function () {
  if (window.__MARKETPLACE_SYNC_CONTENT__) return;
  window.__MARKETPLACE_SYNC_CONTENT__ = true;

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

  /** Thread id when the address bar is a single open chat, e.g. /messages/t/2524944237900437/ */
  function getOpenConversationThreadIdFromLocation() {
    var path = "";
    try {
      path = new URL(location.href).pathname || "";
    } catch (_e) {
      path = location.pathname || "";
    }
    var m = path.match(/\/(?:messages|marketplace)\/t\/(\d{6,})\/?$/i);
    return m ? m[1] : "";
  }

  function djb2Hash(str) {
    var s = String(str || "");
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = (h << 5) + h + s.charCodeAt(i);
    }
    return String(h >>> 0);
  }

  function pageTitleAsBuyer() {
    var t = textOf(document.querySelector("title")) || "";
    return t.replace(/\s*\|\s*Facebook.*$/i, "").replace(/\s*\|\s*Messenger.*$/i, "").trim().slice(0, 200);
  }

  function findLargestMessageGridInMain() {
    var main = document.querySelector('div[role="main"]');
    if (!main) return null;
    var grids = main.querySelectorAll('[role="grid"]');
    var best = null;
    var bestN = 0;
    for (var g = 0; g < grids.length; g++) {
      var gr = grids[g];
      if (gr.closest('[role="navigation"]')) continue;
      var rows = gr.querySelectorAll('[role="row"]');
      var n = rows.length;
      if (n > bestN && n < 600) {
        bestN = n;
        best = gr;
      }
    }
    return best;
  }

  var SKIP_BODY = /^(write a reply|message|search|active now|online|more options|enter)$/i;

  /**
   * One thread + messages from the open conversation only (matches visible chat area best-effort).
   */
  function collectOpenConversationThread(threadId) {
    var buyerName = pageTitleAsBuyer() || "Conversation";
    var grid = findLargestMessageGridInMain();
    var messages = [];
    if (!grid) {
      return [
        {
          threadId: String(threadId),
          buyerName: buyerName,
          snippet: "",
          updatedAt: new Date().toISOString(),
          messages: previewMessagesForThread(threadId, buyerName),
        },
      ];
    }
    var rows = grid.querySelectorAll('[role="row"]');
    var seenBodies = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.closest('[role="navigation"]')) continue;
      var cell = row.querySelector('[role="gridcell"]') || row;
      var divAutos = cell.querySelectorAll("div[dir='auto']");
      var body = "";
      for (var d = 0; d < divAutos.length; d++) {
        var piece = textOf(divAutos[d]);
        if (piece.length > body.length) body = piece;
      }
      if (!body) body = textOf(cell).replace(/\s+/g, " ").trim().slice(0, 4000);
      body = body.trim().slice(0, 12000);
      if (body.length < 2) continue;
      if (SKIP_BODY.test(body)) continue;
      var norm = body.slice(0, 300);
      if (seenBodies[norm]) continue;
      seenBodies[norm] = true;
      var midEl = row.querySelector("[data-mid],[data-message-id],[id*='mid_']");
      var mid =
        (midEl && (midEl.getAttribute("data-mid") || midEl.getAttribute("data-message-id"))) || "";
      var msgId = mid
        ? String(mid).trim().slice(0, 512)
        : "__open__:" + threadId + ":" + djb2Hash(body.slice(0, 500) + ":" + i);
      var who = textOf(row.querySelector("h4,[aria-label*='sent'],[aria-label*='Sent']")).slice(0, 200);
      messages.push({
        messageId: msgId,
        senderLabel: who || "—",
        body: body,
        sentAt: new Date().toISOString(),
      });
      if (messages.length >= 200) break;
    }
    var snippet = messages.length ? messages[messages.length - 1].body.slice(0, 500) : "";
    return [
      {
        threadId: String(threadId),
        buyerName: buyerName,
        snippet: snippet,
        updatedAt: new Date().toISOString(),
        messages: messages.length ? messages : previewMessagesForThread(threadId, buyerName),
      },
    ];
  }

  /**
   * Thread id from absolute URL (Facebook / Messenger / Marketplace / legacy query strings).
   */
  function extractThreadIdFromInboxHref(absUrl) {
    var s = String(absUrl || "");
    var patterns = [
      /\/marketplace\/t\/(\d{6,})/i,
      /\/messages\/t\/(\d{6,})/i,
      /\/messenger\/t\/(\d{6,})/i,
      /\/e2ee\/t\/(\d{6,})/i,
      /\/messages\/e\/(\d{6,})/i,
      /[?&]thread_id=(\d{6,})/i,
      /[?&]tid=id\.(\d{6,})/i,
      /[?&]tid=id%2E(\d{6,})/i,
      /[?&]tid=id%2e(\d{6,})/i,
      /[?&]tid=(\d{10,})/i,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = s.match(patterns[i]);
      if (m) return m[1];
    }
    var loose = s.match(/\/t\/(\d{6,})\b/);
    if (loose) return loose[1];
    if (/messenger\.com/i.test(s)) {
      var mc = s.match(/messenger\.com\/t\/(\d{6,})/i);
      if (mc) return mc[1];
    }
    return "";
  }

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

  /** Inbox list only: anchors that look like real thread links (avoids pulling unrelated /t/ links site-wide). */
  function hrefLooksLikeThreadLink(href) {
    if (!href) return false;
    return /\/(?:messages|marketplace)\/t\/\d|thread_id=|tid=id\.|tid=id%2e/i.test(href);
  }

  function collectMetaCommerce() {
    var threads = [];
    var seen = Object.create(null);
    var anchorSet = new Set();
    function addAnchors(sel) {
      var list = document.querySelectorAll(sel);
      for (var i = 0; i < list.length; i++) anchorSet.add(list[i]);
    }
    addAnchors('a[href*="/messages/t/"]');
    addAnchors('a[href*="/marketplace/t/"]');
    addAnchors('a[href*="/messages/e/"]');
    addAnchors('a[href*="thread_id="]');
    addAnchors('a[href*="tid=id"]');
    addAnchors('[role="row"] a[href*="/t/"]');
    addAnchors('[role="listitem"] a[href*="/t/"]');
    addAnchors('[role="grid"] a[href*="/t/"]');

    var allA = document.querySelectorAll("a[href]");
    var cap = Math.min(allA.length, 4000);
    for (var k = 0; k < cap; k++) {
      var a1 = allA[k];
      var h1 = a1.getAttribute("href") || "";
      if (!hrefLooksLikeThreadLink(h1)) continue;
      anchorSet.add(a1);
    }

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
    if (threads.length > 200) threads = threads.slice(0, 200);
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
    "No threads found. For the inbox list: scroll conversations. For a single chat URL (/messages/t/123…): stay on that page — we sync only that thread’s visible bubbles. Options → Meta / Facebook. If still empty, use Custom JSON from DevTools.";

  var GENERIC_EMPTY_HINT =
    'No elements matched [data-thread-id]. For Meta/Facebook inbox, switch profile to “Meta / Facebook”, or use “Custom” JSON with rowSelector / idAttr.';

  function collectFromPage(msg) {
    var profile = String((msg && msg.selectorProfile) || "generic").trim().toLowerCase();
    if (profile === "meta" || profile === "meta_commerce" || profile === "facebook") {
      var openId = getOpenConversationThreadIdFromLocation();
      if (openId) {
        return { ok: true, threads: collectOpenConversationThread(openId) };
      }
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

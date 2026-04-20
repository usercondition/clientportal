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

  /** facebook.com/l.php?u=… wraps real destinations; thread ids live inside u= */
  function unwrapFacebookRedirectHref(absHref) {
    var s = String(absHref || "");
    try {
      var u = new URL(s);
      var host = (u.hostname || "").replace(/^www\./i, "");
      if (!/^(l\.)?facebook\.com$/i.test(host)) return s;
      var inner = u.searchParams.get("u");
      if (!inner) return s;
      try {
        return decodeURIComponent(inner);
      } catch (_e2) {
        return inner;
      }
    } catch (_e3) {
      return s;
    }
  }

  /** Thread id when the address bar is a single open chat, e.g. /messages/t/2524944237900437/ or messenger.com/t/… */
  function getOpenConversationThreadIdFromLocation() {
    var path = "";
    var host = "";
    try {
      var u = new URL(location.href);
      path = u.pathname || "";
      host = (u.hostname || "").replace(/^www\./i, "");
    } catch (_e) {
      path = location.pathname || "";
      host = (location.hostname || "").replace(/^www\./i, "");
    }
    var m = path.match(/\/(?:messages|marketplace)\/t\/(\d{6,})\/?$/i);
    if (m) return m[1];
    if (/^messenger\.com$/i.test(host)) {
      var mt = path.match(/^\/t\/(\d{6,})\/?$/i);
      if (mt) return mt[1];
    }
    return "";
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
    var main = document.querySelector('[role="main"]');
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

  /**
   * Messenger / FB chat transcript: prefer role=log (avoids picking the inbox thread grid as "messages").
   */
  function findConversationTranscriptRoot() {
    var main = document.querySelector('[role="main"]');
    if (!main) return null;
    var logs = main.querySelectorAll('[role="log"]');
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < logs.length; i++) {
      var L = logs[i];
      if (L.closest('[role="navigation"]')) continue;
      var rows = L.querySelectorAll('[role="row"]');
      var withMid = 0;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].querySelector("[data-mid],[data-message-id]")) withMid++;
      }
      var textLen = String(L.innerText || "").length;
      var score = textLen + withMid * 400 + rows.length * 8;
      if (score > bestScore) {
        bestScore = score;
        best = L;
      }
    }
    if (best && bestScore > 80) return best;
    return findLargestMessageGridInMain();
  }

  function isFacebookFamilyHost() {
    var h = "";
    try {
      h = (new URL(location.href).hostname || "").replace(/^www\./i, "");
    } catch (_e) {
      h = String(location.hostname || "").replace(/^www\./i, "");
    }
    return (
      /^(m\.)?facebook\.com$/i.test(h) || /^facebook\.com$/i.test(h) || /^messenger\.com$/i.test(h)
    );
  }

  /** Facebook Marketplace inbox / selling — not generic Messenger. */
  function isMarketplaceInboxListUrl() {
    var path = "";
    try {
      path = new URL(location.href).pathname || "";
    } catch (_e) {
      path = location.pathname || "";
    }
    path = path.replace(/\/+$/, "") || "/";
    if (!/\/marketplace\b/i.test(path)) return false;
    if (/\/marketplace\/t\/\d/i.test(path)) return false;
    if (/\/marketplace\/item\/\d/i.test(path)) return false;
    if (/\/marketplace\/(category|categories|search|vehicles|property|groups)\b/i.test(path))
      return false;
    return (
      /\/marketplace\/inbox/i.test(path) ||
      /\/marketplace\/you\//i.test(path) ||
      /\/marketplace\/selling/i.test(path) ||
      /\/marketplace\/buying/i.test(path) ||
      /\/marketplace\/messages/i.test(path) ||
      /\/marketplace\/chats/i.test(path) ||
      path === "/marketplace" ||
      /\/marketplace$/i.test(path)
    );
  }

  /** Open chat is clearly Marketplace (thread URL). */
  function isMarketplaceThreadUrl() {
    var path = "";
    try {
      path = new URL(location.href).pathname || "";
    } catch (_e) {
      path = location.pathname || "";
    }
    return /\/marketplace\/t\/\d/i.test(path);
  }

  /**
   * /messages/t/… is used for many chats; only treat as Marketplace if the page shows Marketplace context.
   */
  function isLikelyMarketplaceOnMessagesThread() {
    var main = document.querySelector('[role="main"]');
    if (!main) return false;
    if (/marketplace/i.test(document.title || "")) return true;
    if (main.querySelector('a[href*="/marketplace/item/"]')) return true;
    if (main.querySelector('a[href*="/marketplace/inbox"]')) return true;
    if (main.querySelector('a[href*="/marketplace/t/"]')) return true;
    var t = textOf(main).slice(0, 4000);
    if (/marketplace listing/i.test(t) || /\$\d/.test(t) && /listed|buyer|pickup|is this available/i.test(t))
      return true;
    return false;
  }

  function assertMarketplaceSyncAllowed() {
    if (!isFacebookFamilyHost()) {
      return {
        ok: false,
        error:
          "Marketplace sync only runs on facebook.com or messenger.com. Open Marketplace → Inbox on Facebook, then sync.",
      };
    }
    var openId = getOpenConversationThreadIdFromLocation();
    if (openId) {
      if (isMarketplaceThreadUrl()) return { ok: true };
      var path = "";
      try {
        path = new URL(location.href).pathname || "";
      } catch (_e) {
        path = location.pathname || "";
      }
      if (/\/messages\/t\/\d/i.test(path)) {
        if (isLikelyMarketplaceOnMessagesThread()) return { ok: true };
        return {
          ok: false,
          error:
            "This tab looks like a general Messenger thread, not Marketplace. Open the chat from facebook.com/marketplace/inbox (or a /marketplace/t/… URL), then sync again.",
        };
      }
      var host = "";
      try {
        host = (new URL(location.href).hostname || "").replace(/^www\./i, "");
      } catch (_e2) {
        host = String(location.hostname || "").replace(/^www\./i, "");
      }
      if (/^messenger\.com$/i.test(host)) {
        if (isLikelyMarketplaceOnMessagesThread()) return { ok: true };
        return {
          ok: false,
          error:
            "This Messenger tab does not look like a Marketplace buyer chat. Open the thread from facebook.com/marketplace/inbox, then sync.",
        };
      }
      return { ok: true };
    }
    if (isMarketplaceInboxListUrl()) return { ok: true };
    return {
      ok: false,
      error:
        "Open **Facebook Marketplace inbox** first (URL should include /marketplace/inbox or /marketplace/you/…). We do not sync the global /messages inbox so unrelated threads are not pulled.",
    };
  }

  var SKIP_BODY =
    /^(write a reply|message|search|active now|online|more options|enter|send a sticker|attach a file|voice call|video call|more people|people|photos|files)$/i;

  /** Best-effort parse of a real timestamp from a Messenger row (else null). */
  function parseTimestampFromRow(row) {
    if (!row) return null;
    var timeEl = row.querySelector("time[datetime]");
    if (timeEl) {
      var dt = timeEl.getAttribute("datetime");
      if (dt) {
        var ms = Date.parse(dt);
        if (Number.isFinite(ms)) return new Date(ms).toISOString();
      }
    }
    var abbr = row.querySelector("abbr[data-utime]");
    if (abbr) {
      var ut = abbr.getAttribute("data-utime");
      if (ut && /^\d+$/.test(ut)) {
        var sec = Number(ut);
        if (Number.isFinite(sec) && sec > 946684800)
          return new Date(sec * 1000).toISOString();
      }
    }
    return null;
  }

  /** Heuristic: outgoing (you / seller) vs incoming — Meta uses layout + aria in many builds. */
  function inferIsOutgoing(row) {
    if (!row) return false;
    var el = row;
    for (var depth = 0; depth < 10 && el; depth++) {
      var ar = String(el.getAttribute("aria-label") || "").toLowerCase();
      if (/sent by you|you sent|your message|you replied/i.test(ar)) return true;
      var st = String(el.getAttribute("style") || "").toLowerCase().replace(/\s+/g, "");
      if (
        /flex-end|justify-content:flex-end|margin-inline-start:auto|margin-left:auto|alignself:flex-end/.test(
          st
        )
      )
        return true;
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Stable transcript order for the API: sortOrder matches top-to-bottom DOM walk.
   * sentAt is parsed from the row when possible; otherwise synthetic monotonic times so DB sort matches chat order.
   */
  function finalizeTranscriptMessages(messages) {
    var anchor = Date.UTC(2020, 0, 1);
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      m.sortOrder = i;
      var parsed = m._parsedAt || null;
      delete m._parsedAt;
      delete m._hasMid;
      if (parsed) {
        m.sentAt = parsed;
      } else {
        m.sentAt = new Date(anchor + i * 3000).toISOString();
      }
      if (typeof m.isOutgoing !== "boolean") m.isOutgoing = false;
      m.direction = m.isOutgoing ? "out" : "in";
    }
    return messages;
  }

  /**
   * One thread + messages from the open conversation only (matches visible chat area best-effort).
   */
  function collectOpenConversationThread(threadId) {
    var buyerName = pageTitleAsBuyer() || "Conversation";
    var grid = findConversationTranscriptRoot();
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
    var raw = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.closest('[role="navigation"]')) continue;
      if (row.closest('[role="complementary"]')) continue;
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
      if (/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(body)) continue;
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
      var parsedAt = parseTimestampFromRow(row);
      var outgoing = inferIsOutgoing(row);
      if (!who || who === "—") {
        if (outgoing) who = "You";
      }
      raw.push({
        messageId: msgId,
        senderLabel: who || "—",
        body: body,
        _parsedAt: parsedAt,
        isOutgoing: outgoing,
        _hasMid: !!mid,
      });
      if (raw.length >= 220) break;
    }
    var withMidN = 0;
    for (var x = 0; x < raw.length; x++) if (raw[x]._hasMid) withMidN++;
    var useStrict = raw.length >= 12 && withMidN >= Math.ceil(raw.length * 0.15);
    for (var j = 0; j < raw.length; j++) {
      if (useStrict && !raw[j]._hasMid) continue;
      delete raw[j]._hasMid;
      messages.push(raw[j]);
      if (messages.length >= 200) break;
    }
    if (!messages.length && raw.length) {
      for (var rj = 0; rj < raw.length; rj++) {
        delete raw[rj]._hasMid;
        messages.push(raw[rj]);
        if (messages.length >= 200) break;
      }
    }
    if (messages.length) finalizeTranscriptMessages(messages);
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
        sortOrder: 0,
        isOutgoing: false,
        direction: "in",
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

  /** Inbox list only: conversation thread URLs (Marketplace + Messenger + e2ee). */
  function hrefLooksLikeMarketplaceInboxThread(href) {
    if (!href) return false;
    return (
      /\/marketplace\/t\/\d{6,}/i.test(href) ||
      /\/(?:messages|messenger)\/t\/\d{6,}/i.test(href) ||
      /\/e2ee\/t\/\d{6,}/i.test(href) ||
      /\/messages\/e2ee\/t\/\d{6,}/i.test(href)
    );
  }

  /** Meta uses role=main on non-divs; inbox list often sits under role=navigation — do not skip those on Marketplace URLs. */
  function getMarketplaceDomScope() {
    return (
      document.querySelector('[role="main"]') ||
      document.querySelector("main") ||
      document.body
    );
  }

  /**
   * When Meta renders inbox rows without plain <a href> thread URLs, thread ids still appear in row HTML or nested links.
   */
  function mergeInboxRowBackfill(scope, seen, threads) {
    var rowLike = scope.querySelectorAll('[role="row"], [role="listitem"]');
    for (var i = 0; i < rowLike.length; i++) {
      var row = rowLike[i];
      if (row.closest('[role="log"]')) continue;
      if (row.closest('[role="banner"]')) continue;
      if (row.getAttribute("aria-hidden") === "true") continue;
      var html = "";
      try {
        html = String(row.outerHTML || "");
      } catch (_eH) {
        html = "";
      }
      if (html.length > 120000) html = html.slice(0, 120000);
      var threadId = "";
      var mm = html.match(/\/(?:marketplace|messages)\/t\/(\d{10,})\b/);
      if (mm) threadId = mm[1];
      if (!threadId) {
        var mmE = html.match(/\/messages\/e2ee\/t\/(\d{10,})\b/) || html.match(/\/e2ee\/t\/(\d{10,})\b/);
        if (mmE) threadId = mmE[1];
      }
      if (!threadId) {
        var links = row.querySelectorAll("a[href], [role='link'][href]");
        for (var L = 0; L < links.length; L++) {
          var href0 = links[L].getAttribute("href");
          if (!href0) continue;
          var innerAbs = unwrapFacebookRedirectHref(absolutize(href0));
          var tid = extractThreadIdFromInboxHref(innerAbs) || extractThreadIdFromInboxHref(absolutize(href0));
          if (
            tid &&
            (hrefLooksLikeMarketplaceInboxThread(innerAbs) ||
              hrefLooksLikeMarketplaceInboxThread(href0) ||
              hrefLooksLikeMarketplaceInboxThread(absolutize(href0)))
          ) {
            threadId = tid;
            break;
          }
        }
      }
      if (!threadId || seen[threadId]) continue;
      if (String(threadId).length < 10) continue;
      seen[threadId] = true;
      var buyerName = textOf(row).slice(0, 200).replace(/\s+/g, " ").trim();
      var snippet = "";
      var spans = row.querySelectorAll("span[dir='auto']");
      for (var j = 0; j < spans.length; j++) {
        var t = textOf(spans[j]);
        if (t && t.length > 2 && t !== buyerName) {
          snippet = t.slice(0, 500);
          break;
        }
      }
      threads.push({
        threadId: threadId,
        buyerName: buyerName,
        snippet: snippet,
        updatedAt: new Date().toISOString(),
        messages: previewMessagesForThread(threadId, snippet),
      });
      if (threads.length >= 200) break;
    }
  }

  function tagThreadsWithSyncPage(threads) {
    var pageUrl = "";
    try {
      pageUrl = String(location.href || "").slice(0, 2000);
    } catch (_eU) {
      pageUrl = "";
    }
    var at = new Date().toISOString();
    for (var t = 0; t < threads.length; t++) {
      threads[t].syncSourceUrl = pageUrl;
      threads[t].syncSourceCollectedAt = at;
    }
    return threads;
  }

  function collectMetaCommerce() {
    var threads = [];
    var seen = Object.create(null);
    var anchorSet = new Set();
    var scope = getMarketplaceDomScope();
    if (!scope) return threads;

    function addAnchors(sel) {
      var list = scope.querySelectorAll(sel);
      for (var i = 0; i < list.length; i++) anchorSet.add(list[i]);
    }
    addAnchors('a[href*="/messages/t/"]');
    addAnchors('a[href*="/marketplace/t/"]');
    addAnchors('a[href*="/e2ee/t/"]');
    addAnchors('a[href*="/messages/e2ee/t/"]');
    addAnchors('[role="row"] a[href*="/messages/t/"]');
    addAnchors('[role="row"] a[href*="/marketplace/t/"]');
    addAnchors('[role="row"] a[href*="/e2ee/t/"]');
    addAnchors('[role="listitem"] a[href*="/messages/t/"]');
    addAnchors('[role="listitem"] a[href*="/marketplace/t/"]');
    addAnchors('[role="listitem"] a[href*="/e2ee/t/"]');
    addAnchors('[role="grid"] a[href*="/messages/t/"]');
    addAnchors('[role="grid"] a[href*="/marketplace/t/"]');
    addAnchors('[role="grid"] a[href*="/e2ee/t/"]');
    addAnchors('[role="link"][href*="/messages/t/"]');
    addAnchors('[role="link"][href*="/marketplace/t/"]');

    var directThreadAnchors = scope.querySelectorAll(
      'a[href*="/messages/t/"], a[href*="/marketplace/t/"], a[href*="/e2ee/t/"], a[href*="/messages/e2ee/t/"]'
    );
    for (var d = 0; d < directThreadAnchors.length; d++) anchorSet.add(directThreadAnchors[d]);

    var lphp = scope.querySelectorAll('a[href*="l.php"]');
    for (var lp = 0; lp < lphp.length && lp < 400; lp++) {
      var hL = lphp[lp].getAttribute("href") || "";
      var innerL = unwrapFacebookRedirectHref(absolutize(hL));
      if (hrefLooksLikeMarketplaceInboxThread(innerL)) anchorSet.add(lphp[lp]);
    }

    anchorSet.forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href) return;
      var rawAbs = absolutize(href);
      var innerAbs = unwrapFacebookRedirectHref(rawAbs);
      var threadId = extractThreadIdFromInboxHref(innerAbs) || extractThreadIdFromInboxHref(rawAbs);
      if (!threadId || seen[threadId]) return;
      if (
        !hrefLooksLikeMarketplaceInboxThread(innerAbs) &&
        !hrefLooksLikeMarketplaceInboxThread(rawAbs) &&
        !hrefLooksLikeMarketplaceInboxThread(href)
      ) {
        return;
      }
      var abs = hrefLooksLikeMarketplaceInboxThread(innerAbs) ? innerAbs : rawAbs;
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
    if (!threads.length) mergeInboxRowBackfill(scope, seen, threads);
    if (threads.length > 200) threads = threads.slice(0, 200);
    return tagThreadsWithSyncPage(threads);
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
    "No Marketplace conversations detected. Open facebook.com/marketplace/inbox, scroll the left list so rows load, hard-refresh (Ctrl+Shift+R), confirm Options → Extraction profile is **Meta / Facebook**, then Sync. If still empty, use Custom JSON (README). Old junk in the admin list can be removed with **Erase synced Marketplace data** (same token as sync).";

  var GENERIC_EMPTY_HINT =
    'No elements matched [data-thread-id]. For Meta/Facebook inbox, switch profile to “Meta / Facebook”, or use “Custom” JSON with rowSelector / idAttr.';

  function collectFromPage(msg) {
    var profile = String((msg && msg.selectorProfile) || "generic").trim().toLowerCase();
    if (profile === "meta" || profile === "meta_commerce" || profile === "facebook") {
      var gate = assertMarketplaceSyncAllowed();
      if (!gate.ok) return gate;
      var openId = getOpenConversationThreadIdFromLocation();
      if (openId) {
        return { ok: true, threads: tagThreadsWithSyncPage(collectOpenConversationThread(openId)) };
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
      return { ok: true, threads: tagThreadsWithSyncPage(ct) };
    }
    var gt = collectGeneric();
    if (!gt.length) return { ok: false, error: GENERIC_EMPTY_HINT };
    return { ok: true, threads: tagThreadsWithSyncPage(gt) };
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

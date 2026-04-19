/**
 * Shared client ↔ admin messaging (localStorage + BroadcastChannel).
 * Same browser / origin only. Replace with WebSocket + API for production.
 */
(function (global) {
  var HUB_KEY = "portal_message_hub_v1";
  var CH_NAME = "portal-msg-sync";
  var LEGACY_PREFIX = "portal_messages_";

  /** @type {BroadcastChannel | null} */
  var bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CH_NAME) : null;

  function loadHub() {
    try {
      var raw = localStorage.getItem(HUB_KEY);
      if (!raw) return { threads: {} };
      var h = JSON.parse(raw);
      return h && typeof h.threads === "object" ? h : { threads: {} };
    } catch (e) {
      return { threads: {} };
    }
  }

  function saveHub(hub) {
    try {
      localStorage.setItem(HUB_KEY, JSON.stringify(hub));
    } catch (e) {
      console.warn("message-bus: storage full or unavailable");
    }
    global.dispatchEvent(new CustomEvent("portal-messages-updated", { detail: { source: "local" } }));
    if (bc) {
      try {
        bc.postMessage({ t: "upd", at: Date.now() });
      } catch (e) {}
    }
  }

  function clientLabelFromProfile(p) {
    var fn = String(p.firstName || "").trim();
    var ln = String(p.lastName || "").trim();
    if (fn || ln) return (fn + " " + ln).trim();
    if (p.name) return String(p.name).trim();
    return "Client";
  }

  function ensureThread(profileKey, profile) {
    var hub = loadHub();
    if (!hub.threads[profileKey]) {
      hub.threads[profileKey] = {
        profileKey: profileKey,
        clientLabel: clientLabelFromProfile(profile || {}),
        clientEmail: (profile && profile.email) || "",
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      saveHub(hub);
    } else {
      var t = hub.threads[profileKey];
      if (profile) {
        t.clientLabel = clientLabelFromProfile(profile);
        if (profile.email) t.clientEmail = profile.email;
      }
      hub.threads[profileKey] = t;
      saveHub(hub);
    }
    return hub.threads[profileKey];
  }

  function migrateLegacySession(profileKey) {
    try {
      var raw = sessionStorage.getItem(LEGACY_PREFIX + profileKey);
      if (!raw) return;
      var legacy = JSON.parse(raw);
      if (!Array.isArray(legacy) || legacy.length === 0) return;
      var hub = loadHub();
      var t = hub.threads[profileKey];
      if (t && t.messages && t.messages.length > 0) return;
      if (!t) {
        hub.threads[profileKey] = {
          profileKey: profileKey,
          clientLabel: "Client",
          clientEmail: "",
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        t = hub.threads[profileKey];
      }
      t.messages = legacy.map(function (m) {
        return {
          id: m.id || "m" + Math.random().toString(36).slice(2),
          from: m.from === "business" ? "admin" : m.from === "client" ? "client" : "admin",
          body: m.body || "",
          at: m.at || new Date().toISOString(),
        };
      });
      t.updatedAt = new Date().toISOString();
      saveHub(hub);
    } catch (e) {}
  }

  function seedDemoIfEmpty(profileKey, profile) {
    var hub = loadHub();
    var t = hub.threads[profileKey];
    if (t && t.messages && t.messages.length > 0) return;
    ensureThread(profileKey, profile);
    hub = loadHub();
    t = hub.threads[profileKey];
    if (!t) return;
    if (t.messages.length > 0) return;
    var now = Date.now();
    t.messages = [
      {
        id: "seed1",
        from: "admin",
        body:
          "Welcome to your portal. Message us here anytime — this demo shares one inbox with the admin dashboard on this device.",
        at: new Date(now - 86400000 * 2).toISOString(),
      },
      {
        id: "seed2",
        from: "client",
        body: "Thanks — looking forward to it.",
        at: new Date(now - 86400000).toISOString(),
      },
      {
        id: "seed3",
        from: "admin",
        body: "Sounds good. I’ll follow up with next steps soon.",
        at: new Date(now - 3600000 * 5).toISOString(),
      },
    ];
    t.updatedAt = new Date().toISOString();
    hub.threads[profileKey] = t;
    saveHub(hub);
  }

  function getMessagesForProfile(profileKey) {
    migrateLegacySession(profileKey);
    var hub = loadHub();
    var t = hub.threads[profileKey];
    return t && t.messages ? t.messages.slice() : [];
  }

  function appendClientMessage(profileKey, profile, text) {
    var body = String(text || "").trim();
    if (!body) return;
    ensureThread(profileKey, profile);
    var hub = loadHub();
    var t = hub.threads[profileKey];
    if (!t) return;
    t.messages.push({
      id: "m" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      from: "client",
      body: body,
      at: new Date().toISOString(),
    });
    t.updatedAt = new Date().toISOString();
    hub.threads[profileKey] = t;
    saveHub(hub);
  }

  function appendAdminMessage(profileKey, text) {
    var body = String(text || "").trim();
    if (!body) return;
    var hub = loadHub();
    var t = hub.threads[profileKey];
    if (!t) {
      ensureThread(profileKey, {});
      hub = loadHub();
      t = hub.threads[profileKey];
    }
    if (!t) return;
    t.messages.push({
      id: "a" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      from: "admin",
      body: body,
      at: new Date().toISOString(),
    });
    t.updatedAt = new Date().toISOString();
    hub.threads[profileKey] = t;
    saveHub(hub);
  }

  function getInboxList() {
    var hub = loadHub();
    var keys = Object.keys(hub.threads || {});
    var rows = keys.map(function (k) {
      var t = hub.threads[k];
      var last = t.messages && t.messages.length ? t.messages[t.messages.length - 1] : null;
      var unreadHint = last && last.from === "client" ? 1 : 0;
      return {
        profileKey: k,
        clientLabel: t.clientLabel || "Client",
        clientEmail: t.clientEmail || "",
        updatedAt: t.updatedAt || (last && last.at) || "",
        preview: last ? last.body.slice(0, 120) : "",
        lastFrom: last ? last.from : "",
        messageCount: t.messages ? t.messages.length : 0,
      };
    });
    rows.sort(function (a, b) {
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    return rows;
  }

  function getThread(profileKey) {
    migrateLegacySession(profileKey);
    var hub = loadHub();
    return hub.threads[profileKey] || null;
  }

  function onMessagesUpdated(fn) {
    var wrap = function () {
      fn();
    };
    global.addEventListener("portal-messages-updated", wrap);
    global.addEventListener("storage", function (e) {
      if (e.key === HUB_KEY) fn();
    });
    if (bc) {
      bc.addEventListener("message", function () {
        fn();
      });
    }
    return function () {
      global.removeEventListener("portal-messages-updated", wrap);
    };
  }

  global.MessageBus = {
    getMessagesForProfile: getMessagesForProfile,
    appendClientMessage: appendClientMessage,
    appendAdminMessage: appendAdminMessage,
    getInboxList: getInboxList,
    getThread: getThread,
    ensureThread: ensureThread,
    seedDemoIfEmpty: seedDemoIfEmpty,
    onMessagesUpdated: onMessagesUpdated,
  };
})(typeof window !== "undefined" ? window : this);

/**
 * Client portal session + demo orders/messages (sessionStorage).
 * Replace with API calls when you add a backend.
 */
(function (global) {
  var PROFILES_KEY = "clientFlowProfiles";
  var ACTIVE_KEY = "portal_active_profile_key";
  var SNAPSHOT_KEY = "portal_active_profile_snapshot";

  function normName(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function profileKeyFromParts(firstName, lastName, zip) {
    return normName(firstName) + "|" + normName(lastName) + "|" + String(zip || "").trim();
  }

  /** @param {{ firstName?: string, lastName?: string, zip?: string, name?: string }} p */
  function profileKey(p) {
    if (typeof p.firstName === "string" || typeof p.lastName === "string") {
      return profileKeyFromParts(p.firstName, p.lastName, p.zip);
    }
    if (p.name) {
      var s = String(p.name).trim().replace(/\s+/g, " ");
      var i = s.indexOf(" ");
      var f = i === -1 ? s : s.slice(0, i);
      var l = i === -1 ? "" : s.slice(i + 1);
      return profileKeyFromParts(f, l, p.zip);
    }
    return profileKeyFromParts("", "", p.zip);
  }

  function loadProfiles() {
    try {
      var raw = sessionStorage.getItem(PROFILES_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /** Merge snapshot with latest row from clientFlowProfiles when present. */
  function getProfile() {
    var key = sessionStorage.getItem(ACTIVE_KEY);
    if (!key) return null;
    var list = loadProfiles();
    var fromList = list.find(function (p) {
      return profileKey(p) === key;
    });
    try {
      var snap = JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY) || "null");
      if (fromList) return Object.assign({}, snap || {}, fromList);
      return snap;
    } catch (e) {
      return fromList || null;
    }
  }

  function setActiveProfile(p) {
    var key = profileKey(p);
    sessionStorage.setItem(ACTIVE_KEY, key);
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(p));
    ensureDemoData(key);
  }

  function clearSession() {
    sessionStorage.removeItem(ACTIVE_KEY);
    sessionStorage.removeItem(SNAPSHOT_KEY);
  }

  function ordersStorageKey(profileKey) {
    return "portal_orders_" + profileKey;
  }

  function messagesStorageKey(profileKey) {
    return "portal_messages_" + profileKey;
  }

  function ensureDemoData(key) {
    if (!sessionStorage.getItem(ordersStorageKey(key))) {
      var orders = [
        {
          id: "ORD-1042",
          phase: "current",
          title: "Active order",
          summary: "In progress — details will appear here when your backend is connected.",
          dateLabel: "Started Apr 18, 2026",
          total: "$124.00",
        },
        {
          id: "ORD-1038",
          phase: "current",
          title: "Proof review",
          summary: "Awaiting your approval on design proof (demo).",
          dateLabel: "Updated Apr 16, 2026",
          total: "—",
        },
        {
          id: "ORD-1021",
          phase: "past",
          title: "Delivered order",
          summary: "Shipped via USPS — tracking was emailed (demo).",
          dateLabel: "Completed Mar 2, 2026",
          total: "$58.00",
        },
        {
          id: "ORD-998",
          phase: "past",
          title: "Earlier order",
          summary: "Picked up locally (demo).",
          dateLabel: "Completed Jan 12, 2026",
          total: "$32.00",
        },
      ];
      sessionStorage.setItem(ordersStorageKey(key), JSON.stringify(orders));
    }
    if (!sessionStorage.getItem(messagesStorageKey(key))) {
      var messages = [
        {
          id: "m1",
          from: "business",
          body:
            "Welcome to your portal. You can reply here anytime — in production this syncs to my inbox.",
          at: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          id: "m2",
          from: "client",
          body: "Thanks — looking forward to it.",
          at: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: "m3",
          from: "business",
          body: "Sounds good. I’ll follow up with next steps soon.",
          at: new Date(Date.now() - 3600000 * 5).toISOString(),
        },
      ];
      sessionStorage.setItem(messagesStorageKey(key), JSON.stringify(messages));
    }
  }

  function getOrders() {
    var key = sessionStorage.getItem(ACTIVE_KEY);
    if (!key) return [];
    ensureDemoData(key);
    try {
      var raw = sessionStorage.getItem(ordersStorageKey(key));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function getMessages() {
    var key = sessionStorage.getItem(ACTIVE_KEY);
    if (!key) return [];
    ensureDemoData(key);
    try {
      var raw = sessionStorage.getItem(messagesStorageKey(key));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function appendClientMessage(text) {
    var key = sessionStorage.getItem(ACTIVE_KEY);
    if (!key) return;
    var t = String(text || "").trim();
    if (!t) return;
    var list = getMessages();
    list.push({
      id: "m" + Date.now(),
      from: "client",
      body: t,
      at: new Date().toISOString(),
    });
    sessionStorage.setItem(messagesStorageKey(key), JSON.stringify(list));
  }

  /** @param {{ line1: string, line2?: string, city: string, state: string, zip: string }} a */
  function formatAddress(a) {
    if (!a || !a.line1) return "";
    var lines = [a.line1];
    if (a.line2 && String(a.line2).trim()) lines.push(String(a.line2).trim());
    lines.push(
      [a.city, a.state, a.zip]
        .filter(function (x) {
          return String(x || "").trim();
        })
        .join(", ")
    );
    return lines.join("\n");
  }

  global.Portal = {
    profileKey: profileKey,
    setActiveProfile: setActiveProfile,
    clearSession: clearSession,
    getProfile: getProfile,
    getOrders: getOrders,
    getMessages: getMessages,
    appendClientMessage: appendClientMessage,
    formatAddress: formatAddress,
  };
})(typeof window !== "undefined" ? window : this);

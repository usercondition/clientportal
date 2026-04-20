/**
 * Client portal session + API access helpers.
 */
(function (global) {
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

  function profileKey(p) {
    return profileKeyFromParts(p.firstName, p.lastName, p.zip);
  }

  async function requestJson(url, options) {
    var res = await fetch(url, options || {});
    var text = "";
    try {
      text = await res.text();
    } catch (e) {
      text = "";
    }
    var payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (e) {
        payload = null;
      }
    }
    if (!res.ok) {
      var msg =
        (payload && payload.error) ||
        (res.status === 404
          ? "Not found. Open this site through the Node server (npm start), not as a local file."
          : res.status === 503
            ? "Service unavailable. Ensure the server has DATABASE_URL (or DATABASE_PRIVATE_URL) set — on Railway, reference it from the Web service variables."
            : "Request failed (" + res.status + ").");
      throw new Error(msg);
    }
    return payload;
  }

  function getProfile() {
    try {
      return JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function setActiveProfile(p) {
    sessionStorage.setItem(ACTIVE_KEY, profileKey(p));
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(p));
  }

  function clearSession() {
    sessionStorage.removeItem(ACTIVE_KEY);
    sessionStorage.removeItem(SNAPSHOT_KEY);
  }

  async function loginClient(firstName, lastName, zip) {
    var payload = await requestJson("/api/client/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: firstName, lastName: lastName, zip: zip }),
    });
    setActiveProfile(payload.client);
    return payload.client;
  }

  async function registerClient(input) {
    var payload = await requestJson("/api/client/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    setActiveProfile(payload.client);
    return payload.client;
  }

  async function getOrders() {
    var p = getProfile();
    if (!p || !p.id) return [];
    var payload = await requestJson("/api/client/" + encodeURIComponent(p.id) + "/orders");
    return payload.orders || [];
  }

  /**
   * Submit a new order request (portal → POST /api/client/:id/orders).
   * @param {Record<string, unknown>} payload
   */
  async function submitOrderRequest(payload) {
    var p = getProfile();
    if (!p || !p.id) throw new Error("Sign in to submit an order.");
    return requestJson("/api/client/" + encodeURIComponent(p.id) + "/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  async function getMessages() {
    var p = getProfile();
    if (!p || !p.id) return [];
    var payload = await requestJson("/api/client/" + encodeURIComponent(p.id) + "/messages");
    return payload.messages || [];
  }

  /**
   * @param {string} text
   * @param {FileList | File[] | null | undefined} fileList
   */
  async function appendClientMessage(text, fileList) {
    var p = getProfile();
    if (!p || !p.id) return;
    var bodyText = String(text || "").trim();
    var files =
      fileList && fileList.length ? Array.prototype.slice.call(fileList) : [];
    if (!bodyText && files.length === 0) return;

    var url = "/api/client/" + encodeURIComponent(p.id) + "/messages";
    if (files.length > 0) {
      var fd = new FormData();
      fd.append("body", bodyText);
      for (var i = 0; i < files.length; i++) {
        fd.append("files", files[i]);
      }
      var res = await fetch(url, { method: "POST", body: fd });
      var raw = "";
      try {
        raw = await res.text();
      } catch (e) {
        raw = "";
      }
      var payload = null;
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch (e) {
          payload = null;
        }
      }
      if (!res.ok) {
        throw new Error(
          (payload && payload.error) ||
            (res.status === 400 ? "Upload failed." : "Request failed (" + res.status + ").")
        );
      }
      return payload;
    }

    await requestJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: bodyText }),
    });
  }

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
    loginClient: loginClient,
    registerClient: registerClient,
    getOrders: getOrders,
    submitOrderRequest: submitOrderRequest,
    getMessages: getMessages,
    appendClientMessage: appendClientMessage,
    formatAddress: formatAddress,
  };
})(typeof window !== "undefined" ? window : this);

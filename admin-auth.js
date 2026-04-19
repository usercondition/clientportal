/**
 * Client-only admin gate — keeps casual visitors out of admin HTML pages.
 *
 * LIMITATIONS: The password exists in this file (or is derivable). Anyone can open DevTools,
 * read the source, or clear sessionStorage. This is not a substitute for server-side auth.
 * For production, protect admin behind your API, OAuth, or HTTP auth at the host.
 */
(function (global) {
  var STORAGE_KEY = "ps_admin_session_v1";
  /** Session length after login (milliseconds). */
  var SESSION_TTL_MS = 12 * 60 * 60 * 1000;

  /**
   * REQUIRED: set your own passphrase before relying on this in any deployed build.
   */
  var ADMIN_PASSWORD = "2771";

  function isAdminSession() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      return typeof d.exp === "number" && d.exp > Date.now();
    } catch (e) {
      return false;
    }
  }

  function setAdminSession() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
  }

  function clearAdminSession() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function checkPassword(plain) {
    return typeof plain === "string" && plain === ADMIN_PASSWORD;
  }

  function currentPageName() {
    var path = location.pathname || "";
    var parts = path.split("/");
    var last = parts[parts.length - 1] || parts[parts.length - 2];
    if (last && /\.html?$/i.test(last)) return last;
    parts = path.split("\\");
    last = parts[parts.length - 1];
    if (last && /\.html?$/i.test(last)) return last;
    return "admin.html";
  }

  function redirectToLogin() {
    var page = currentPageName();
    if (/^admin-login\.html$/i.test(page)) return;
    location.replace("admin-login.html?next=" + encodeURIComponent(page));
  }

  global.AdminAuth = {
    isAdminSession: isAdminSession,
    setAdminSession: setAdminSession,
    clearAdminSession: clearAdminSession,
    checkPassword: checkPassword,
    redirectToLogin: redirectToLogin,
  };
})(typeof window !== "undefined" ? window : this);

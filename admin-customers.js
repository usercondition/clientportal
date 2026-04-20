(function () {
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }

  function formatInt(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    try {
      return new Intl.NumberFormat(undefined).format(Number(n));
    } catch (_e) {
      return String(n);
    }
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
    } catch (_e) {
      return String(iso);
    }
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setBanner(show, text) {
    var el = document.getElementById("admin-customers-db-banner");
    if (!el) return;
    el.hidden = !show;
    if (text) el.textContent = text;
  }

  function requestJson(url) {
    return fetch(url).then(function (res) {
      return res.json().then(function (payload) {
        if (!res.ok) throw new Error((payload && payload.error) || "Request failed.");
        return payload;
      });
    });
  }

  function renderCustomers(list) {
    var host = document.getElementById("admin-customers-list");
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '<p class="admin-customers-empty">No registered clients yet.</p>';
      return;
    }
    host.innerHTML = list
      .map(function (c) {
        var cityStateZip = [c.address && c.address.city, c.address && c.address.state, c.address && c.address.postalCode]
          .filter(Boolean)
          .join(", ");
        return (
          '<article class="admin-customer-card">' +
          '<h2 class="admin-customer-card__name">' +
          esc(c.fullName || "Client") +
          "</h2>" +
          '<p class="admin-customer-card__line">' +
          esc(c.email || "No email") +
          (c.phone ? " · " + esc(c.phone) : "") +
          "</p>" +
          '<p class="admin-customer-card__line">' +
          esc((c.address && c.address.line1) || "Address not set") +
          (cityStateZip ? " · " + esc(cityStateZip) : "") +
          "</p>" +
          '<div class="admin-customer-card__grid">' +
          '<div class="admin-customer-kpi"><p class="admin-customer-kpi__label">Orders</p><p class="admin-customer-kpi__value">' +
          esc(formatInt(c.totalOrders)) +
          "</p></div>" +
          '<div class="admin-customer-kpi"><p class="admin-customer-kpi__label">Open orders</p><p class="admin-customer-kpi__value">' +
          esc(formatInt(c.openOrders)) +
          "</p></div>" +
          '<div class="admin-customer-kpi"><p class="admin-customer-kpi__label">Registered</p><p class="admin-customer-kpi__value">' +
          esc(formatDate(c.createdAt)) +
          "</p></div>" +
          '<div class="admin-customer-kpi"><p class="admin-customer-kpi__label">Last message</p><p class="admin-customer-kpi__value">' +
          esc(formatDate(c.lastMessageAt)) +
          "</p></div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function loadCustomers() {
    return requestJson("/api/admin/customers")
      .then(function (payload) {
        var list = payload && payload.customers ? payload.customers : [];
        var openOrderClients = list.filter(function (c) {
          return Number(c.openOrders || 0) > 0;
        }).length;
        setText("customers-total", formatInt(list.length));
        setText("customers-open-order-clients", formatInt(openOrderClients));
        setBanner(!payload.databaseConnected, "Database not configured or unreachable. Connect DATABASE_URL to load customers.");
        renderCustomers(list);
      })
      .catch(function (err) {
        setText("customers-total", "—");
        setText("customers-open-order-clients", "—");
        setBanner(true, (err && err.message) || "Could not load customers.");
        renderCustomers([]);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadCustomers);
  } else {
    loadCustomers();
  }
  setInterval(loadCustomers, 12000);
})();

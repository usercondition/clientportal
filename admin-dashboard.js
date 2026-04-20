(function () {
  function formatUsdFromCents(cents) {
    if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return "—";
    var n = Number(cents) / 100;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
    } catch (e) {
      return n >= 0 ? "$" + n.toFixed(2) : "—";
    }
  }

  function formatInt(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
    try {
      return new Intl.NumberFormat(undefined).format(Number(n));
    } catch (e) {
      return String(n);
    }
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  async function loadMetrics() {
    try {
      var res = await fetch("/api/admin/metrics");
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load metrics");

      setText("metric-period", data.periodLabel || "—");
      setText("metric-revenue", formatUsdFromCents(data.revenueCents));
      setText("metric-profit", formatUsdFromCents(data.estimatedProfitCents));
      setText("metric-orders", formatInt(data.ordersCountMtd));
      setText("metric-avg-order", formatUsdFromCents(data.averageOrderValueCents));
      setText("metric-open-orders", formatInt(data.openOrdersCount));
      setText("metric-clients", formatInt(data.clientsCount));
      setText("metric-threads", formatInt(data.messageThreadsCount));
      setText("metric-messages-30d", formatInt(data.messagesLast30Days));

      var profitHint = document.getElementById("metric-profit-hint");
      if (profitHint && data.profitNote) profitHint.textContent = data.profitNote;

      var dbBanner = document.getElementById("metric-db-banner");
      if (dbBanner) {
        dbBanner.hidden = Boolean(data.databaseConnected);
      }
    } catch (e) {
      setText("metric-revenue", "—");
      setText("metric-profit", "—");
      var ph = document.getElementById("metric-profit-hint");
      if (ph) ph.textContent = "Could not load metrics. Check the network tab or server logs.";
      var dbBanner = document.getElementById("metric-db-banner");
      if (dbBanner) {
        dbBanner.hidden = false;
        dbBanner.textContent = "Could not load metrics. Ensure the server is running and DATABASE_URL is set.";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadMetrics);
  } else {
    loadMetrics();
  }
})();

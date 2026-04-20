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

  function formatMoneyCents(cents) {
    if (cents == null || Number.isNaN(Number(cents))) return "—";
    var n = Number(cents) / 100;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
    } catch (_e) {
      return "$" + n.toFixed(2);
    }
  }

  function setBanner(text, show) {
    var el = document.getElementById("admin-analytics-db-banner");
    if (!el) return;
    el.hidden = !show;
    if (text) el.textContent = text;
  }

  function renderBars(hostId, rows) {
    var host = document.getElementById(hostId);
    if (!host) return;
    if (!rows || !rows.length) {
      host.innerHTML = '<p class="admin-analytics-empty">No data available.</p>';
      return;
    }
    var max = rows.reduce(function (acc, r) {
      return Math.max(acc, Number(r.value || 0));
    }, 0);
    var safeMax = max > 0 ? max : 1;
    host.innerHTML = rows
      .map(function (r) {
        var pct = Math.max(0, Math.min(100, Math.round((Number(r.value || 0) / safeMax) * 100)));
        return (
          '<div class="admin-analytics-bar">' +
          '<span class="admin-analytics-bar__label">' +
          esc(r.label) +
          "</span>" +
          '<span class="admin-analytics-bar__track"><span class="admin-analytics-bar__fill" style="width:' +
          pct +
          '%"></span></span>' +
          '<span class="admin-analytics-bar__value">' +
          esc(r.display) +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  async function requestJson(url) {
    var res = await fetch(url);
    var payload = await res.json();
    if (!res.ok) throw new Error((payload && payload.error) || "Request failed");
    return payload;
  }

  async function loadAnalytics() {
    try {
      var both = await Promise.all([requestJson("/api/admin/metrics"), requestJson("/api/admin/orders")]);
      var metrics = both[0] || {};
      var ordersPayload = both[1] || {};
      var orderMetrics = ordersPayload.metrics || {};

      setBanner(
        "Database not configured or unreachable. Connect DATABASE_URL to populate analytics.",
        !metrics.databaseConnected || !ordersPayload.databaseConnected
      );

      var funnelRows = [
        {
          label: "Leads (clients)",
          value: Number(metrics.clientsCount || 0),
          display: formatInt(metrics.clientsCount),
        },
        {
          label: "Threads",
          value: Number(metrics.messageThreadsCount || 0),
          display: formatInt(metrics.messageThreadsCount),
        },
        {
          label: "Messages (30d)",
          value: Number(metrics.messagesLast30Days || 0),
          display: formatInt(metrics.messagesLast30Days),
        },
        {
          label: "Open orders",
          value: Number(orderMetrics.openPipeline || metrics.openOrdersCount || 0),
          display: formatInt(orderMetrics.openPipeline || metrics.openOrdersCount),
        },
      ];

      var orderFlowRows = [
        {
          label: "New requests",
          value: Number(orderMetrics.newRequests || 0),
          display: formatInt(orderMetrics.newRequests),
        },
        {
          label: "In progress",
          value: Number(orderMetrics.inProgress || 0),
          display: formatInt(orderMetrics.inProgress),
        },
        {
          label: "Awaiting client",
          value: Number(orderMetrics.awaitingClient || 0),
          display: formatInt(orderMetrics.awaitingClient),
        },
        {
          label: "Fulfilled (MTD)",
          value: Number(orderMetrics.fulfilledMtd || 0),
          display: formatInt(orderMetrics.fulfilledMtd),
        },
        {
          label: "Cancelled (MTD)",
          value: Number(orderMetrics.cancelledMtd || 0),
          display: formatInt(orderMetrics.cancelledMtd),
        },
      ];

      var valueRows = [
        {
          label: "Revenue (MTD)",
          value: Number(metrics.revenueCents || 0),
          display: formatMoneyCents(metrics.revenueCents),
        },
        {
          label: "Est. profit (MTD)",
          value: Number(metrics.estimatedProfitCents || 0),
          display: formatMoneyCents(metrics.estimatedProfitCents),
        },
        {
          label: "Pipeline value",
          value: Number(orderMetrics.pipelineValueCents || 0),
          display: formatMoneyCents(orderMetrics.pipelineValueCents),
        },
        {
          label: "New orders (7d)",
          value: Number(orderMetrics.ordersCreated7d || 0),
          display: formatInt(orderMetrics.ordersCreated7d),
        },
      ];

      renderBars("analytics-funnel-bars", funnelRows);
      renderBars("analytics-order-flow-bars", orderFlowRows);
      renderBars("analytics-value-bars", valueRows);
    } catch (_e) {
      setBanner("Could not load analytics. Ensure the server is running and try again.", true);
      renderBars("analytics-funnel-bars", []);
      renderBars("analytics-order-flow-bars", []);
      renderBars("analytics-value-bars", []);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAnalytics);
  } else {
    loadAnalytics();
  }

  setInterval(loadAnalytics, 10000);
})();

/**
 * Plain-text email copy for portal + order notifications.
 * Set PUBLIC_SITE_URL (or PUBLIC_BASE_URL) so messages include a working portal link.
 */

function baseUrl() {
  const raw = process.env.PUBLIC_SITE_URL || process.env.PUBLIC_BASE_URL || "";
  return String(raw).trim().replace(/\/+$/, "");
}

function portalUrl() {
  const b = baseUrl();
  return b ? `${b}/client-portal.html` : "";
}

function portalLinkLine() {
  const u = portalUrl();
  return u ? `Open your portal: ${u}` : "Open your client portal in the browser.";
}

function truncate(text, max) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Staff inbox: new message from a client. */
function staffNewClientMessage({ clientLabel, bodySnippet }) {
  const subj = `New message from ${clientLabel}`;
  const body = [
    `${clientLabel} sent a message in the client portal.`,
    "",
    truncate(bodySnippet, 800),
    "",
    "Reply in the admin inbox (Admin → Inbox).",
    portalUrl() ? `Admin site: ${baseUrl()}/admin-inbox.html` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { subject: subj, text: body };
}

/** Client: staff replied in the thread. */
function clientNewStaffMessage({ firstName, bodySnippet }) {
  const subj = "New reply from our team";
  const body = [
    `Hi ${firstName || "there"},`,
    "",
    "You have a new message in your client portal:",
    "",
    truncate(bodySnippet, 800),
    "",
    portalLinkLine(),
  ].join("\n");
  return { subject: subj, text: body };
}

/** Client: order status changed (call when you update orders in the backend). */
function clientOrderStatusChange({
  firstName,
  orderNumber,
  title,
  status,
  previousStatus,
}) {
  const label = title || `Order ${orderNumber}`;
  const subj = `Order update: ${label} — ${humanStatus(status)}`;
  const lines = [
    `Hi ${firstName || "there"},`,
    "",
    `Your order ${orderNumber ? `#${orderNumber}` : ""} has been updated.`,
    label && label !== orderNumber ? `Item: ${label}` : "",
    previousStatus ? `Previous status: ${humanStatus(previousStatus)}` : "",
    `Current status: ${humanStatus(status)}`,
    "",
    portalLinkLine(),
  ].filter(Boolean);
  return { subject: subj, text: lines.join("\n") };
}

function humanStatus(s) {
  const m = {
    draft: "Draft",
    submitted: "Submitted",
    in_progress: "In progress",
    awaiting_client: "Awaiting your response",
    fulfilled: "Fulfilled",
    cancelled: "Cancelled",
  };
  return m[s] || String(s || "").replace(/_/g, " ");
}

module.exports = {
  baseUrl,
  portalUrl,
  portalLinkLine,
  staffNewClientMessage,
  clientNewStaffMessage,
  clientOrderStatusChange,
  humanStatus,
};

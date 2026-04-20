const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
require("dotenv").config({ quiet: true });

const emailTemplates = require("./lib/email-templates");
const chatAttachments = require("./lib/chat-attachments");

const ADMIN_NOTIFY_EMAIL_DEFAULT = "m.e.mercado@proton.me";
const SUPPORT_BOT_SAMPLER_ENABLED =
  String(process.env.SUPPORT_BOT_SAMPLER_ENABLED || "").toLowerCase() === "true";
const MARKETPLACE_SYNC_ENABLED =
  String(process.env.MARKETPLACE_SYNC_ENABLED || "").toLowerCase() === "true";
const MARKETPLACE_SYNC_TOKEN = String(process.env.MARKETPLACE_SYNC_TOKEN || "").trim();
const MARKETPLACE_SYNC_MAX_PER_MIN = (() => {
  const n = Number(process.env.MARKETPLACE_SYNC_MAX_PER_MIN || 120);
  if (!Number.isFinite(n)) return 120;
  return Math.max(0, Math.min(6000, Math.floor(n)));
})();

/** @type {Map<string, { count: number; startedAt: number }>} */
const marketplaceSyncRateBuckets = new Map();

(function logMarketplaceDeployHints() {
  if (!MARKETPLACE_SYNC_ENABLED) return;
  if (!MARKETPLACE_SYNC_TOKEN) {
    console.warn(
      "[marketplace] MARKETPLACE_SYNC_ENABLED is true but MARKETPLACE_SYNC_TOKEN is empty; POST /api/admin/marketplace/sync will return 401 until you set a secret."
    );
  } else if (MARKETPLACE_SYNC_TOKEN.length < 24) {
    console.warn(
      "[marketplace] MARKETPLACE_SYNC_TOKEN is under 24 characters; use a long random value in production (see .env.example)."
    );
  }
})();

function resolveAdminNotifyEmail() {
  const v = process.env.ADMIN_NOTIFY_EMAIL;
  if (v && String(v).trim()) return String(v).trim();
  return ADMIN_NOTIFY_EMAIL_DEFAULT;
}

/** Reply-To on emails *to clients* (staff replies). Defaults to ADMIN_NOTIFY_EMAIL so client can hit Reply in their mail app. */
function resolveAdminReplyEmail() {
  const v = process.env.ADMIN_REPLY_EMAIL;
  if (v && String(v).trim()) return String(v).trim();
  return resolveAdminNotifyEmail();
}

function buildSupportBotSamplerReply(inputText) {
  const text = String(inputText || "").toLowerCase();
  const open = "Support assistant (sample):";
  if (/(price|quote|cost|how much|estimate)/.test(text)) {
    return (
      open +
      " Thanks for your request. I can capture your specs and our team will send a formal quote. " +
      "Please share quantity, size, material preference, and deadline."
    );
  }
  if (/(status|update|progress|order)/.test(text)) {
    return (
      open +
      " I can help with status checks. Share your order number and I will flag the thread for a manual update from staff."
    );
  }
  if (/(file|stl|step|upload|attachment)/.test(text)) {
    return (
      open +
      " File received. For best results, include intended use, dimensions, and finish requirements with your upload."
    );
  }
  if (/(time|timeline|lead|turnaround|when)/.test(text)) {
    return (
      open +
      " Timelines depend on scope and queue load. If you share your deadline and quantity, staff can confirm availability."
    );
  }
  return (
    open +
    " Thanks for your message. This is a trial assistant and a human will follow up. " +
    "If you need a quote, include quantity, dimensions, material, and deadline."
  );
}

async function maybeSendSupportBotSamplerReply(client, threadId, clientBodyText) {
  if (!SUPPORT_BOT_SAMPLER_ENABLED) return;
  if (!threadId) return;
  const cleanBody = String(clientBodyText || "").trim();
  if (!cleanBody) return;

  const recentBotRes = await client.query(
    `select created_at
       from messages
      where thread_id = $1
        and sender = 'admin'
        and sender_ref = 'support_bot_sample'
        and deleted_at is null
      order by created_at desc
      limit 1`,
    [threadId]
  );
  if (recentBotRes.rows.length) {
    const lastAtMs = Date.parse(recentBotRes.rows[0].created_at);
    if (Number.isFinite(lastAtMs) && Date.now() - lastAtMs < 90 * 1000) {
      return;
    }
  }

  const botReply = buildSupportBotSamplerReply(cleanBody);
  await client.query(
    "insert into messages (thread_id, sender, sender_ref, body, attachments, delivered_at) values ($1,'admin','support_bot_sample',$2,'[]'::jsonb, now())",
    [threadId, botReply]
  );
  await client.query("update message_threads set last_message_at = now(), updated_at = now() where id = $1", [
    threadId,
  ]);
}

function createMailTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  if (!host || !user) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: process.env.SMTP_PASS || "" },
    tls: { rejectUnauthorized: true },
  });
}

const EMAIL_RETRY_BASE_MS = 15_000;
const EMAIL_MAX_ATTEMPTS = 5;
/** @type {Array<{to:string; subject:string; text:string; replyTo?:string; attempts:number; nextAttemptAt:number}>} */
const pendingNotifyEmails = [];
var notifyWorkerTimer = null;
var notifyWorkerBusy = false;

function scheduleNotifyWorker(delayMs = 0) {
  const wait = Math.max(0, Number(delayMs || 0));
  if (notifyWorkerTimer) clearTimeout(notifyWorkerTimer);
  notifyWorkerTimer = setTimeout(() => {
    notifyWorkerTimer = null;
    processNotifyQueue().catch((err) => {
      console.error("[notify] worker failure:", err && err.message);
      scheduleNotifyWorker(EMAIL_RETRY_BASE_MS);
    });
  }, wait);
}

async function processNotifyQueue() {
  if (notifyWorkerBusy) return;
  notifyWorkerBusy = true;
  try {
    if (!pendingNotifyEmails.length) return;
    const now = Date.now();
    const due = pendingNotifyEmails.filter((job) => job.nextAttemptAt <= now);
    if (!due.length) {
      const nextAt = pendingNotifyEmails.reduce((min, job) => Math.min(min, job.nextAttemptAt), Infinity);
      if (Number.isFinite(nextAt)) scheduleNotifyWorker(Math.max(250, nextAt - now));
      return;
    }
    const transport = createMailTransport();
    if (!transport) {
      console.warn("[notify] SMTP not configured; queued emails are waiting for SMTP settings.");
      pendingNotifyEmails.forEach((job) => {
        job.nextAttemptAt = now + EMAIL_RETRY_BASE_MS;
      });
      scheduleNotifyWorker(EMAIL_RETRY_BASE_MS);
      return;
    }
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    for (const job of due) {
      /** @type {{ from: string; to: string; subject: string; text: string; replyTo?: string }} */
      const mail = { from, to: job.to, subject: job.subject, text: job.text };
      if (job.replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.replyTo)) {
        mail.replyTo = job.replyTo;
      }
      try {
        await transport.sendMail(mail);
        const idx = pendingNotifyEmails.indexOf(job);
        if (idx >= 0) pendingNotifyEmails.splice(idx, 1);
        console.log(
          "[notify] email sent:",
          job.subject,
          "→",
          job.to,
          job.replyTo ? `(Reply-To ${job.replyTo})` : ""
        );
      } catch (err) {
        job.attempts += 1;
        if (job.attempts >= EMAIL_MAX_ATTEMPTS) {
          const idx = pendingNotifyEmails.indexOf(job);
          if (idx >= 0) pendingNotifyEmails.splice(idx, 1);
          console.error("[notify] dropped after retries:", err && err.message, "to:", job.to);
          continue;
        }
        const backoffMs = EMAIL_RETRY_BASE_MS * Math.pow(2, Math.max(0, job.attempts - 1));
        job.nextAttemptAt = Date.now() + backoffMs;
        console.warn(
          "[notify] send failed, retrying:",
          err && err.message,
          "attempt",
          job.attempts,
          "to:",
          job.to
        );
      }
    }
    if (pendingNotifyEmails.length) {
      const nextAt = pendingNotifyEmails.reduce((min, job) => Math.min(min, job.nextAttemptAt), Infinity);
      if (Number.isFinite(nextAt)) scheduleNotifyWorker(Math.max(250, nextAt - Date.now()));
    }
  } finally {
    notifyWorkerBusy = false;
  }
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {{ replyTo?: string }} [options] — e.g. Reply-To client when emailing staff, or support address when emailing client
 */
function queueNotifyEmail(to, subject, text, options) {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  const opts = options && typeof options === "object" ? options : {};
  const rt = opts.replyTo && String(opts.replyTo).trim();
  pendingNotifyEmails.push({
    to: String(to).trim(),
    subject: String(subject || ""),
    text: String(text || ""),
    replyTo: rt && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rt) ? rt : undefined,
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
  scheduleNotifyWorker(0);
}

/**
 * When order status is updated in the API, call this so the client (and optionally staff) get email.
 * Wire your future PATCH / order flow to: await notifyOrderStatusChange(pool, { clientId, orderNumber, title, status, previousStatus })
 */
async function notifyOrderStatusChange(pool, { clientId, orderNumber, title, status, previousStatus }) {
  if (!pool || !clientId || !status) return;
  const { rows } = await pool.query("select email, first_name from clients where id = $1 limit 1", [clientId]);
  const row = rows[0];
  if (!row || !row.email) return;
  const { subject, text } = emailTemplates.clientOrderStatusChange({
    firstName: row.first_name,
    orderNumber: orderNumber || "",
    title: title || "",
    status,
    previousStatus: previousStatus || "",
  });
  queueNotifyEmail(String(row.email).trim(), subject, text, { replyTo: resolveAdminReplyEmail() });
  if (String(process.env.NOTIFY_ADMIN_ON_ORDER_STATUS || "").toLowerCase() === "true") {
    queueNotifyEmail(
      resolveAdminNotifyEmail(),
      `[Order ${orderNumber || "?"}] ${emailTemplates.humanStatus(status)}`,
      [`Client: ${row.first_name || ""} <${row.email}>`, `Order: ${title || orderNumber || "—"}`, emailTemplates.portalLinkLine()]
        .filter(Boolean)
        .join("\n")
    );
  }
}

const app = express();
/** Behind Railway / reverse proxies (correct IPs, secure cookies if you add sessions later). */
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 3000);
/** Bind all interfaces so the container accepts traffic from the platform router. */
const LISTEN_HOST = process.env.LISTEN_HOST || "0.0.0.0";

const uploadsRoot = path.join(__dirname, "uploads");
const uploadsChatDir = path.join(uploadsRoot, "chat");
fs.mkdirSync(uploadsChatDir, { recursive: true });
const uploadMiddleware = chatAttachments.createUploadMiddleware(uploadsChatDir);

/**
 * Parse multipart for chat messages; JSON-only requests skip this (handled by express.json).
 */
function messageMultipartUpload(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return uploadMiddleware.array("files", chatAttachments.MAX_FILES_PER_MESSAGE)(req, res, (err) => {
      if (!err) return next();
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? `Each file must be ${chatAttachments.MAX_FILE_BYTES / (1024 * 1024)} MB or smaller.`
          : err.message || "Upload failed.";
      return res.status(400).json({ error: msg });
    });
  }
  next();
}

function mapMessageRow(m) {
  return {
    id: m.id,
    from: m.sender === "admin" ? "admin" : m.sender === "client" ? "client" : "admin",
    body: m.body,
    attachments: chatAttachments.toApiAttachments(m.attachments),
    at: m.created_at,
    archived: Boolean(m.admin_archived_at),
  };
}

const {
  resolveDatabaseUrlWithSource,
  postgresHostname,
  sslOptionForUrl,
} = require("./lib/pg-connection");

const { url: DATABASE_URL, sourceKey: DATABASE_SOURCE_KEY } = resolveDatabaseUrlWithSource();

if (!DATABASE_URL) {
  console.warn(
    "[db] No database URL found. Set DATABASE_URL exactly (no space in the name) on the service that runs " +
      "server.js — e.g. Web service → Variables → reference your Postgres DATABASE_URL. " +
      "Also remove stale POSTGRES_* variables that pointed at a deleted database."
  );
} else {
  const host = postgresHostname(DATABASE_URL);
  const sslOn = Boolean(sslOptionForUrl(DATABASE_URL));
  console.log(`[db] Using env ${DATABASE_SOURCE_KEY} → host=${host || "?"} ssl=${sslOn ? "on" : "off"}`);
  if (DATABASE_SOURCE_KEY === "DATABASE_PUBLIC_URL") {
    console.warn(
      "[db] Using DATABASE_PUBLIC_URL (public TCP proxy). Prefer DATABASE_URL or DATABASE_PRIVATE_URL " +
        "from Postgres on the same Railway project to avoid egress. See database/README.md (Railway section)."
    );
  } else if (host && /\.proxy\.rlwy\.net$/i.test(host)) {
    console.warn(
      "[railway] Host looks like the public TCP proxy (*.proxy.rlwy.net). That can incur egress fees. " +
        "Prefer postgres.railway.internal (private DATABASE_URL) on the web service. See database/README.md."
    );
  }
}

const sslOpt = DATABASE_URL ? sslOptionForUrl(DATABASE_URL) : false;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ...(DATABASE_URL && sslOpt ? { ssl: sslOpt } : {}),
});

const {
  applyInitialSchemaIfNeeded,
  applySchemaCompat,
  applyMarketplaceSyncSchema,
} = require("./lib/apply-initial-schema");

// Slightly higher than default: marketplace sync payloads may include many thread rows.
app.use(express.json({ limit: "2mb" }));

/** Liveness for Railway / load balancers — does not touch the database (avoids restart loops during DB misconfig). */
app.get("/health", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

function normalizeUSZip5(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 5 ? d.slice(0, 5) : d;
}

function toClientProfile(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    zip: row.sign_in_zip,
    email: row.email || "",
    phone: row.phone || "",
    address: row.line_1
      ? {
          line1: row.line_1,
          line2: row.line_2 || "",
          city: row.city,
          state: row.state,
          zip: row.postal_code,
        }
      : undefined,
  };
}

function mapOrderPhase(status) {
  return ["fulfilled", "cancelled"].includes(status) ? "past" : "current";
}

/** Client-initiated cancellation allowed only while the job is not closed out. */
const CLIENT_CANCELABLE_STATUSES = new Set(["draft", "submitted", "in_progress", "awaiting_client"]);

const ALL_ORDER_STATUSES = new Set([
  "draft",
  "submitted",
  "in_progress",
  "awaiting_client",
  "fulfilled",
  "cancelled",
]);

function previewSummary(text, max = 220) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

function formatMoney(cents) {
  const n = Number(cents || 0) / 100;
  return n > 0 ? `$${n.toFixed(2)}` : "—";
}

function parseIsoTimestamp(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function isMarketplaceSyncAuthorized(req) {
  if (!MARKETPLACE_SYNC_TOKEN) return false;
  const auth = String(req.headers.authorization || "");
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim() === MARKETPLACE_SYNC_TOKEN;
  }
  const token = String(req.headers["x-marketplace-sync-token"] || "").trim();
  return token === MARKETPLACE_SYNC_TOKEN;
}

function requireMarketplaceSyncEnabled(req, res) {
  if (!MARKETPLACE_SYNC_ENABLED) {
    res.status(404).json({ error: "Marketplace sync is disabled." });
    return false;
  }
  return true;
}

function marketplaceSyncClientKey(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").trim();
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first.slice(0, 200);
  }
  const ip = req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : "";
  return ip ? ip.slice(0, 200) : "unknown";
}

function checkMarketplaceSyncRateLimit(req, res) {
  if (MARKETPLACE_SYNC_MAX_PER_MIN <= 0) return true;
  const key = marketplaceSyncClientKey(req);
  const now = Date.now();
  const windowMs = 60_000;
  let bucket = marketplaceSyncRateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > windowMs) {
    bucket = { count: 0, startedAt: now };
    marketplaceSyncRateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MARKETPLACE_SYNC_MAX_PER_MIN) {
    res
      .status(429)
      .json({ error: "Too many marketplace sync requests. Wait a minute and try again." });
    return false;
  }
  if (marketplaceSyncRateBuckets.size > 10_000) {
    for (const [k, v] of marketplaceSyncRateBuckets) {
      if (now - v.startedAt > windowMs) marketplaceSyncRateBuckets.delete(k);
    }
  }
  return true;
}

function isPgUndefinedTable(err) {
  return Boolean(err && /** @type {{ code?: string }} */ (err).code === "42P01");
}

const ORDER_SERVICE_TYPES = new Set([
  "print",
  "cad",
  "post_process",
  "repair",
  "consultation",
  "other",
]);

const ORDER_SHIPPING_PREFS = new Set(["pickup", "ship_on_file", "discuss"]);

function nextClientOrderNumber() {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REQ-${yyyymmdd}-${suffix}`;
}

function buildOrderRequestSummary(body) {
  const items = Array.isArray(body.lineItems) ? body.lineItems : [];
  const lines = [
    `Service: ${body.serviceTypeLabel || body.serviceType || "—"}`,
    `Quantity: ${body.quantity != null ? body.quantity : "—"}`,
    `Approx. size / dimensions: ${body.dimensions ? body.dimensions : "—"}`,
    `Material / finish: ${body.materialPreference || "—"}`,
    `Intended use: ${body.intendedUse || "—"}`,
    `Needed by: ${body.neededBy || "Not specified"}`,
    `Reference URL: ${body.referenceUrl || "—"}`,
    `Rush: ${body.rushRequested ? "Yes" : "No"}`,
    `Shipping / delivery: ${body.shippingLabel || body.shippingPreference || "—"}`,
    "",
    "Description:",
    String(body.description || "").trim() || "—",
  ];
  if (items.length) {
    lines.push("", "Line items:");
    items.forEach((item, idx) => {
      const qty = Number(item.quantity || 0);
      const unit = String(item.unit || "").trim();
      const desc = String(item.description || "").trim();
      lines.push(
        `${idx + 1}. ${qty > 0 ? qty : "—"}${unit ? " " + unit : ""} — ${desc || "No item description"}`
      );
    });
  }
  if (body.unit && String(body.unit).trim()) {
    lines.splice(2, 0, `Unit: ${String(body.unit).trim()}`);
  }
  if (body.specialInstructions && String(body.specialInstructions).trim()) {
    lines.push("", "Special instructions:", String(body.specialInstructions).trim());
  }
  return lines.join("\n");
}

/** Detailed DB status (always HTTP 200 so platform healthchecks do not kill the process while you fix env vars). */
app.get("/api/health", async (_req, res) => {
  const smtpConfigured = Boolean(createMailTransport());
  const marketplace = {
    enabled: MARKETPLACE_SYNC_ENABLED,
    tokenConfigured: Boolean(MARKETPLACE_SYNC_TOKEN),
    tablesPresent: null,
  };
  if (!DATABASE_URL) {
    return res.status(200).json({
      ok: true,
      database: "not_configured",
      smtp: smtpConfigured ? "configured" : "missing",
      hint: "Set DATABASE_URL on the Web service (reference from Postgres).",
      marketplace,
    });
  }
  try {
    await pool.query("select 1 as health_check");
    if (MARKETPLACE_SYNC_ENABLED) {
      const reg = await pool.query("select to_regclass('public.marketplace_threads') as t");
      marketplace.tablesPresent = Boolean(reg.rows[0] && reg.rows[0].t);
    }
    return res.status(200).json({
      ok: true,
      database: "connected",
      env: DATABASE_SOURCE_KEY,
      smtp: smtpConfigured ? "configured" : "missing",
      marketplace,
    });
  } catch (e) {
    const err = /** @type {{ message?: string; code?: string }} */ (e);
    return res.status(200).json({
      ok: true,
      database: "unreachable",
      message: err.message,
      postgresCode: err.code,
      smtp: smtpConfigured ? "configured" : "missing",
      marketplace,
    });
  }
});

app.post("/api/contact", async (req, res) => {
  if (!createMailTransport()) {
    return res.status(503).json({
      error: "Contact email is not configured yet. Please set SMTP settings on the server.",
    });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const scope = String(body.scope || "").trim();

  if (name.length < 2 || name.length > 120) {
    return res.status(400).json({ error: "Name must be between 2 and 120 characters." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (scope.length < 10 || scope.length > 4000) {
    return res.status(400).json({ error: "Project details must be between 10 and 4000 characters." });
  }

  const subject = `Website contact form — ${name}`;
  const text = [
    "New contact form submission",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    "",
    "Project details:",
    scope,
    "",
    emailTemplates.baseUrl() ? `Website: ${emailTemplates.baseUrl()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  queueNotifyEmail(resolveAdminNotifyEmail(), subject, text, { replyTo: email });

  return res.status(202).json({ ok: true });
});

app.post("/api/client/login", async (req, res) => {
  const { firstName, lastName, zip } = req.body || {};
  if (!firstName || !lastName || !zip) {
    return res.status(400).json({ error: "Missing firstName, lastName, or zip." });
  }

  const sql = `
    select c.*, a.line_1, a.line_2, a.city, a.state, a.postal_code
    from clients c
    left join client_addresses a
      on a.client_id = c.id and a.is_default = true
    where lower(c.first_name) = lower($1)
      and lower(c.last_name) = lower($2)
      and c.sign_in_zip = $3
    limit 1
  `;
  const { rows } = await pool.query(sql, [String(firstName).trim(), String(lastName).trim(), String(zip).trim()]);
  if (!rows.length) return res.status(404).json({ error: "Client not found." });
  return res.json({ client: toClientProfile(rows[0]) });
});

app.post("/api/client/register", async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    addressLine1,
    addressLine2,
    city,
    state,
    addressZip,
  } = req.body || {};

  if (!firstName || !lastName || !email || !addressLine1 || !city || !state || !addressZip) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (!DATABASE_URL) {
    return res.status(503).json({
      error:
        "Database is not configured. On Railway, open your Web service → Variables and add DATABASE_URL " +
        "as a reference to your Postgres service’s DATABASE_URL (or DATABASE_PRIVATE_URL).",
    });
  }

  const zip5 = normalizeUSZip5(addressZip);
  if (!/^\d{5}$/.test(zip5)) {
    return res.status(400).json({ error: "Address ZIP must be exactly 5 digits (US)." });
  }
  const state2 = String(state).trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  if (state2.length !== 2) {
    return res.status(400).json({ error: "State must be a two-letter code." });
  }

  let clientConn;
  try {
    clientConn = await pool.connect();
  } catch (connErr) {
    console.error(connErr);
    return res.status(503).json({
      error: "Could not reach the database. Check DATABASE_URL and that PostgreSQL is running.",
    });
  }

  try {
  let lastErr = /** @type {unknown} */ (null);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await clientConn.query("begin");
      const insertClient = `
      insert into clients (first_name, last_name, email, phone, sign_in_zip)
      values ($1,$2,$3,$4,$5)
      returning id, first_name, last_name, email, phone, sign_in_zip
    `;
      const cRes = await clientConn.query(insertClient, [
        String(firstName).trim(),
        String(lastName).trim(),
        String(email).trim(),
        phone ? String(phone).trim() : null,
        zip5,
      ]);

      const client = cRes.rows[0];
      const insertAddress = `
      insert into client_addresses (client_id, line_1, line_2, city, state, postal_code, is_default)
      values ($1,$2,$3,$4,$5,$6,true)
      returning line_1, line_2, city, state, postal_code
    `;
      const aRes = await clientConn.query(insertAddress, [
        client.id,
        String(addressLine1).trim(),
        addressLine2 ? String(addressLine2).trim() : null,
        String(city).trim(),
        state2,
        zip5,
      ]);

      await clientConn.query(
        "insert into message_threads (client_id, subject, last_message_at) values ($1, $2, now())",
        [client.id, "General support"]
      );

      await clientConn.query("commit");
      return res.status(201).json({
        client: toClientProfile({ ...client, ...aRes.rows[0] }),
      });
    } catch (err) {
      lastErr = err;
      try {
        await clientConn.query("rollback");
      } catch (rollbackErr) {
        /* ignore */
      }
      if (
        attempt === 0 &&
        err &&
        (err.code === "42P01" || err.code === "42703" || err.code === "42883")
      ) {
        try {
          await applyInitialSchemaIfNeeded(pool);
          await applySchemaCompat(pool);
          continue;
        } catch (migrateErr) {
          console.error("[db] migration on register retry:", migrateErr);
        }
      }
      break;
    }
  }

  const err = lastErr;
  if (err && err.code === "23505") {
    return res.status(409).json({ error: "Client already exists for this name + ZIP." });
  }
  if (err && err.code === "23514") {
    return res.status(400).json({
      error:
        "Address or ZIP did not pass validation. Use a 5-digit US ZIP and a 2-letter state code.",
    });
  }
  if (err && (err.code === "42P01" || err.code === "42703" || err.code === "42883")) {
    console.error("[db] register failed (schema):", err.code, err.message, err.detail || "", err.table || "");
    return res.status(500).json({
      error:
        "Database schema mismatch or incomplete migration. Redeploy the server (it auto-applies 001_init.sql when tables are missing), " +
        "or from the project root run: npm run db:migrate (with DATABASE_URL set).",
      postgresCode: err.code || undefined,
    });
  }
  console.error("[db] register failed:", err);
  return res.status(500).json({ error: "Failed to register client." });
  } finally {
    clientConn.release();
  }
  });

app.get("/api/client/:clientId/orders", async (req, res) => {
  const { clientId } = req.params;
  const sql = `
    select id, order_number, status, title, summary, created_at, submitted_at, fulfilled_at, total_cents
    from orders
    where client_id = $1
    order by created_at desc
  `;
  const { rows } = await pool.query(sql, [clientId]);
  const orders = rows.map((o) => ({
    id: o.order_number,
    phase: mapOrderPhase(o.status),
    title: o.title,
    summary: o.summary || "",
    dateLabel: o.fulfilled_at
      ? `Completed ${new Date(o.fulfilled_at).toLocaleDateString()}`
      : o.submitted_at
      ? `Updated ${new Date(o.submitted_at).toLocaleDateString()}`
      : `Started ${new Date(o.created_at).toLocaleDateString()}`,
    total: formatMoney(o.total_cents),
    status: o.status,
    statusLabel: emailTemplates.humanStatus(o.status),
    cancellable: CLIENT_CANCELABLE_STATUSES.has(o.status),
  }));
  res.json({ orders });
});

app.post("/api/client/:clientId/orders", async (req, res) => {
  if (!DATABASE_URL) {
    return res.status(503).json({
      error:
        "Database is not configured. On Railway, add DATABASE_URL on the Web service (reference from Postgres).",
    });
  }

  const { clientId } = req.params;
  const body = req.body && typeof req.body === "object" ? req.body : {};

  const title = String(body.title || "").trim();
  const serviceType = String(body.serviceType || "").trim();
  const description = String(body.description || "").trim();
  const quantity = body.quantity != null ? Number(body.quantity) : NaN;
  const lineItemsRaw = Array.isArray(body.lineItems) ? body.lineItems : [];
  const lineItems = lineItemsRaw
    .map((item) => {
      const src = item && typeof item === "object" ? item : {};
      const itemDescription = String(src.description || "").trim();
      const qty = src.quantity != null ? Number(src.quantity) : NaN;
      const itemUnit = String(src.unit || "").trim();
      return {
        description: itemDescription,
        quantity: qty,
        unit: itemUnit,
      };
    })
    .filter((item) => item.description || Number.isFinite(item.quantity) || item.unit);
  const dimensions = String(body.dimensions || "").trim();
  const materialPreference = String(body.materialPreference || "").trim();
  const intendedUse = String(body.intendedUse || "").trim();
  const neededBy = String(body.neededBy || "").trim();
  const referenceUrl = String(body.referenceUrl || "").trim();
  const rushRequested = Boolean(body.rushRequested);
  const shippingPreference = String(body.shippingPreference || "").trim();
  const specialInstructions = String(body.specialInstructions || "").trim();
  const unit = String(body.unit || "").trim();
  const confirmAccuracy = Boolean(body.confirmAccuracy);

  const serviceLabels = {
    print: "3D printing / fabrication",
    cad: "CAD / modeling",
    post_process: "Post-processing / finishing",
    repair: "Repair or rework",
    consultation: "Consultation",
    other: "Other",
  };
  const shippingLabels = {
    pickup: "Pickup (local)",
    ship_on_file: "Ship to address on file",
    discuss: "Discuss shipping / delivery",
  };

  if (title.length < 3 || title.length > 200) {
    return res.status(400).json({ error: "Title must be between 3 and 200 characters." });
  }
  if (!ORDER_SERVICE_TYPES.has(serviceType)) {
    return res.status(400).json({ error: "Select a valid service type." });
  }
  if (description.length < 10 || description.length > 12000) {
    return res
      .status(400)
      .json({ error: "Description must be at least 10 characters (max 12,000)." });
  }
  if (lineItems.length > 50) {
    return res.status(400).json({ error: "Add at most 50 line items per request." });
  }
  const invalidLineItem = lineItems.find(
    (item) =>
      item.description.length < 2 ||
      item.description.length > 1200 ||
      !Number.isFinite(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100000 ||
      item.unit.length > 40
  );
  if (invalidLineItem) {
    return res.status(400).json({
      error: "Each line item requires a description and quantity (1–100,000). Unit max length is 40.",
    });
  }
  const derivedQuantity = lineItems.reduce((sum, item) => sum + Math.floor(Number(item.quantity || 0)), 0);
  const effectiveQuantity = lineItems.length ? derivedQuantity : quantity;
  if (!Number.isFinite(effectiveQuantity) || effectiveQuantity < 1 || effectiveQuantity > 1000000) {
    return res.status(400).json({ error: "Total quantity must be between 1 and 1,000,000." });
  }
  if (materialPreference.length < 2 || materialPreference.length > 2000) {
    return res
      .status(400)
      .json({ error: "Material / finish preference is required (2–2,000 characters)." });
  }
  if (intendedUse.length < 5 || intendedUse.length > 4000) {
    return res.status(400).json({ error: "Intended use must be at least 5 characters (max 4,000)." });
  }
  if (!ORDER_SHIPPING_PREFS.has(shippingPreference)) {
    return res.status(400).json({ error: "Select a shipping / delivery option." });
  }
  if (!confirmAccuracy) {
    return res.status(400).json({ error: "Confirm that your request details are accurate." });
  }
  if (dimensions.length > 500) {
    return res.status(400).json({ error: "Dimensions field is too long (max 500 characters)." });
  }
  if (specialInstructions.length > 8000) {
    return res.status(400).json({ error: "Special instructions are too long (max 8,000 characters)." });
  }
  if (unit.length > 40) {
    return res.status(400).json({ error: "Unit label is too long." });
  }

  if (referenceUrl) {
    try {
      const u = new URL(referenceUrl);
      if (!["http:", "https:"].includes(u.protocol)) {
        return res.status(400).json({ error: "Reference URL must start with http:// or https://." });
      }
    } catch (_e) {
      return res.status(400).json({ error: "Reference URL is not valid." });
    }
  }

  let neededByOut = "";
  if (neededBy) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) {
      return res.status(400).json({ error: "Needed-by date must be YYYY-MM-DD or empty." });
    }
    neededByOut = neededBy;
  }

  const clientCheck = await pool.query("select first_name, last_name, email from clients where id = $1 limit 1", [
    clientId,
  ]);
  if (!clientCheck.rows.length) {
    return res.status(404).json({ error: "Client not found." });
  }
  const who = clientCheck.rows[0];
  const clientLabel = `${who.first_name || ""} ${who.last_name || ""}`.trim() || "Client";
  const clientEmail = who.email ? String(who.email).trim() : "";

  const enriched = {
    ...body,
    title,
    serviceType,
    description,
    quantity: Math.floor(effectiveQuantity),
    lineItems: lineItems.map((item) => ({
      description: item.description,
      quantity: Math.floor(item.quantity),
      unit: item.unit || undefined,
    })),
    dimensions,
    materialPreference,
    intendedUse,
    neededBy: neededByOut,
    referenceUrl,
    rushRequested,
    shippingPreference,
    specialInstructions,
    unit,
    serviceTypeLabel: serviceLabels[serviceType] || serviceType,
    shippingLabel: shippingLabels[shippingPreference] || shippingPreference,
  };

  const summary = buildOrderRequestSummary(enriched);

  const dbClient = await pool.connect();
  let orderRow;
  try {
    await dbClient.query("BEGIN");
    let lastErr;
    for (let attempt = 0; attempt < 20; attempt++) {
      const orderNumber = nextClientOrderNumber();
      try {
        const ins = await dbClient.query(
          `insert into orders (
            order_number, client_id, status, title, summary,
            subtotal_cents, tax_cents, shipping_cents, submitted_at
          ) values ($1, $2, 'submitted', $3, $4, 0, 0, 0, now())
          returning id, order_number, title, summary, created_at, submitted_at, total_cents`,
          [orderNumber, clientId, title, summary]
        );
        orderRow = ins.rows[0];
        break;
      } catch (e) {
        lastErr = e;
        if (e && e.code === "23505") continue;
        throw e;
      }
    }
    if (!orderRow) {
      await dbClient.query("ROLLBACK");
      console.error("[orders] could not allocate unique order_number:", lastErr && lastErr.message);
      return res.status(500).json({ error: "Could not create order. Try again." });
    }

    await dbClient.query(
      `insert into order_timeline_events (order_id, event_code, event_label, event_details, created_by)
       values ($1, 'submitted', 'Order submitted', $2, 'system')`,
      [
        orderRow.id,
        "Request received from the client portal and queued for review.",
      ]
    );

    await dbClient.query("COMMIT");
  } catch (err) {
    try {
      await dbClient.query("ROLLBACK");
    } catch (_r) {}
    console.error("[orders] create failed:", err && err.message);
    return res.status(500).json({ error: "Failed to submit order request." });
  } finally {
    dbClient.release();
  }

  const { subject, text } = emailTemplates.staffNewOrderRequest({
    clientLabel,
    clientEmail,
    orderNumber: orderRow.order_number,
    title,
    summarySnippet: summary,
  });
  queueNotifyEmail(resolveAdminNotifyEmail(), subject, text, clientEmail ? { replyTo: clientEmail } : undefined);

  const o = orderRow;
  res.status(201).json({
    order: {
      id: o.order_number,
      phase: mapOrderPhase("submitted"),
      title: o.title,
      summary: o.summary || "",
      dateLabel: o.submitted_at
        ? `Submitted ${new Date(o.submitted_at).toLocaleDateString()}`
        : `Started ${new Date(o.created_at).toLocaleDateString()}`,
      total: formatMoney(o.total_cents),
      status: "submitted",
      statusLabel: emailTemplates.humanStatus("submitted"),
      cancellable: true,
    },
  });
});

/**
 * Client cancels their own order while it is still open (not fulfilled / already cancelled).
 */
app.post("/api/client/:clientId/orders/:orderNumber/cancel", async (req, res) => {
  if (!DATABASE_URL) {
    return res.status(503).json({ error: "Database is not configured." });
  }
  const { clientId, orderNumber } = req.params;
  const dbClient = await pool.connect();
  let previousStatus;
  let row;
  try {
    await dbClient.query("BEGIN");
    const sel = await dbClient.query(
      `select id, client_id, order_number, status, title from orders where order_number = $1 and client_id = $2::uuid for update`,
      [orderNumber, clientId]
    );
    if (!sel.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }
    row = sel.rows[0];
    previousStatus = row.status;
    if (!CLIENT_CANCELABLE_STATUSES.has(previousStatus)) {
      await dbClient.query("ROLLBACK");
      return res.status(400).json({ error: "This order can no longer be cancelled online." });
    }
    if (previousStatus === "cancelled") {
      await dbClient.query("ROLLBACK");
      return res.status(400).json({ error: "Order is already cancelled." });
    }
    const upd = await dbClient.query(
      `update orders set status = 'cancelled'::order_status, updated_at = now() where id = $1
       returning id, order_number, status, title, summary, created_at, submitted_at, fulfilled_at, total_cents, updated_at`,
      [row.id]
    );
    row = upd.rows[0];
    await dbClient.query(
      `insert into order_timeline_events (order_id, event_code, event_label, event_details, created_by)
       values ($1, 'cancelled', 'Order cancelled', $2, 'client')`,
      [row.id, "Cancelled by the client from the portal."]
    );
    await dbClient.query("COMMIT");
  } catch (err) {
    try {
      await dbClient.query("ROLLBACK");
    } catch (_e) {}
    console.error("[orders] client cancel failed:", err && err.message);
    return res.status(500).json({ error: "Could not cancel order." });
  } finally {
    dbClient.release();
  }

  await notifyOrderStatusChange(pool, {
    clientId,
    orderNumber: row.order_number,
    title: row.title,
    status: "cancelled",
    previousStatus,
  });

  const o = row;
  res.json({
    order: {
      id: o.order_number,
      phase: mapOrderPhase(o.status),
      title: o.title,
      summary: o.summary || "",
      dateLabel: o.updated_at
        ? `Updated ${new Date(o.updated_at).toLocaleDateString()}`
        : o.submitted_at
        ? `Updated ${new Date(o.submitted_at).toLocaleDateString()}`
        : `Started ${new Date(o.created_at).toLocaleDateString()}`,
      total: formatMoney(o.total_cents),
      status: o.status,
      statusLabel: emailTemplates.humanStatus(o.status),
      cancellable: false,
    },
  });
});

app.get("/api/client/:clientId/messages", async (req, res) => {
  const { clientId } = req.params;
  const threadRes = await pool.query("select id from message_threads where client_id = $1 limit 1", [clientId]);
  if (!threadRes.rows.length) return res.json({ messages: [] });
  const threadId = threadRes.rows[0].id;
  const msgRes = await pool.query(
    "select id, sender, body, attachments, created_at, admin_archived_at from messages where thread_id = $1 and deleted_at is null order by created_at asc",
    [threadId]
  );
  res.json({
    threadId,
    messages: msgRes.rows.map(mapMessageRow),
  });
});

app.post("/api/client/:clientId/messages", messageMultipartUpload, async (req, res) => {
  const { clientId } = req.params;
  const bodyText = String((req.body && req.body.body) || "").trim();
  const uploaded = chatAttachments.mapUploadedFilesToDb(req.files || []);
  if (!bodyText && uploaded.length === 0) {
    return res.status(400).json({ error: "Message text or at least one file is required." });
  }

  const threadRes = await pool.query(
    "insert into message_threads (client_id, subject, last_message_at) values ($1,$2, now()) on conflict (client_id) do update set last_message_at = now(), admin_archived_at = null returning id",
    [clientId, "General support"]
  );
  const threadId = threadRes.rows[0].id;
  const msgRes = await pool.query(
    "insert into messages (thread_id, sender, sender_ref, body, attachments, delivered_at) values ($1,'client',$2,$3,$4::jsonb, now()) returning id, created_at",
    [threadId, clientId, bodyText, JSON.stringify(uploaded)]
  );
  await pool.query("update message_threads set last_message_at = now(), updated_at = now(), admin_archived_at = null where id = $1", [threadId]);
  try {
    await maybeSendSupportBotSamplerReply(pool, threadId, bodyText);
  } catch (botErr) {
    console.error("[support-bot-sampler] failed to send sample reply:", botErr && botErr.message);
  }
  const infoRes = await pool.query(
    "select first_name, last_name, email from clients where id = $1 limit 1",
    [clientId]
  );
  const who = infoRes.rows[0];
  const label = who ? `${who.first_name || ""} ${who.last_name || ""}`.trim() || "Client" : "Client";
  const clientEmail = who && who.email ? String(who.email).trim() : "";
  const snippet = chatAttachments.snippetWithAttachments(bodyText, uploaded);
  const { subject, text } = emailTemplates.staffNewClientMessage({
    clientLabel: label,
    bodySnippet: snippet,
  });
  queueNotifyEmail(resolveAdminNotifyEmail(), subject, text, clientEmail ? { replyTo: clientEmail } : undefined);
  res.status(201).json({
    message: {
      id: msgRes.rows[0].id,
      from: "client",
      body: bodyText,
      attachments: chatAttachments.toApiAttachments(uploaded),
      at: msgRes.rows[0].created_at,
    },
  });
});

app.get("/api/admin/orders", async (_req, res) => {
  if (!DATABASE_URL) {
    return res.json({
      databaseConnected: false,
      metrics: null,
      orders: [],
    });
  }
  try {
    const mRes = await pool.query(`
      select
        count(*) filter (where status = 'submitted'::order_status)::int as new_requests,
        count(*) filter (where status = 'in_progress'::order_status)::int as in_progress,
        count(*) filter (where status = 'awaiting_client'::order_status)::int as awaiting_client,
        count(*) filter (where status not in ('fulfilled'::order_status, 'cancelled'::order_status))::int
          as open_pipeline,
        count(*) filter (
          where status = 'fulfilled'::order_status
            and coalesce(fulfilled_at, updated_at) >= date_trunc('month', now())
            and coalesce(fulfilled_at, updated_at) < date_trunc('month', now()) + interval '1 month'
        )::int as fulfilled_mtd,
        count(*) filter (
          where status = 'cancelled'::order_status
            and updated_at >= date_trunc('month', now())
            and updated_at < date_trunc('month', now()) + interval '1 month'
        )::int as cancelled_mtd,
        coalesce(
          sum(total_cents) filter (where status not in ('fulfilled'::order_status, 'cancelled'::order_status)),
          0
        )::bigint as pipeline_value_cents,
        count(*) filter (where created_at >= now() - interval '7 days')::int as orders_created_7d,
        (select count(*)::int from orders) as total_orders
      from orders
    `);
    const m = mRes.rows[0] || {};
    const listRes = await pool.query(`
      select
        o.id,
        o.order_number,
        o.status,
        o.title,
        o.summary,
        o.total_cents,
        o.created_at,
        o.submitted_at,
        o.fulfilled_at,
        c.id as client_id,
        c.first_name,
        c.last_name,
        c.email
      from orders o
      join clients c on c.id = o.client_id
      order by o.created_at desc
      limit 400
    `);
    const orders = listRes.rows.map((o) => ({
      orderNumber: o.order_number,
      status: o.status,
      statusLabel: emailTemplates.humanStatus(o.status),
      title: o.title,
      summaryPreview: previewSummary(o.summary, 200),
      total: formatMoney(o.total_cents),
      totalCents: Number(o.total_cents || 0),
      createdAt: o.created_at,
      submittedAt: o.submitted_at,
      fulfilledAt: o.fulfilled_at,
      clientId: o.client_id,
      clientName: `${o.first_name || ""} ${o.last_name || ""}`.trim() || "Client",
      clientEmail: o.email || "",
    }));
    return res.json({
      databaseConnected: true,
      metrics: {
        newRequests: Number(m.new_requests || 0),
        inProgress: Number(m.in_progress || 0),
        awaitingClient: Number(m.awaiting_client || 0),
        openPipeline: Number(m.open_pipeline || 0),
        fulfilledMtd: Number(m.fulfilled_mtd || 0),
        cancelledMtd: Number(m.cancelled_mtd || 0),
        pipelineValueCents: Number(m.pipeline_value_cents || 0),
        ordersCreated7d: Number(m.orders_created_7d || 0),
        totalOrders: Number(m.total_orders || 0),
      },
      orders,
    });
  } catch (e) {
    const err = /** @type {{ message?: string }} */ (e);
    console.error("[admin/orders] list failed:", err.message);
    return res.status(500).json({ error: "Failed to load orders.", details: err.message });
  }
});

app.get("/api/admin/orders/:orderNumber", async (req, res) => {
  if (!DATABASE_URL) {
    return res.status(503).json({ error: "Database is not configured." });
  }
  const { orderNumber } = req.params;
  try {
    const oRes = await pool.query(
      `select o.*, c.id as client_id, c.first_name, c.last_name, c.email, c.phone
       from orders o
       join clients c on c.id = o.client_id
       where o.order_number = $1
       limit 1`,
      [orderNumber]
    );
    if (!oRes.rows.length) return res.status(404).json({ error: "Order not found." });
    const o = oRes.rows[0];
    const tRes = await pool.query(
      `select id, event_code, event_label, event_details, created_by, created_at
       from order_timeline_events
       where order_id = $1
       order by created_at desc`,
      [o.id]
    );
    return res.json({
      order: {
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        statusLabel: emailTemplates.humanStatus(o.status),
        title: o.title,
        summary: o.summary || "",
        subtotalCents: o.subtotal_cents,
        taxCents: o.tax_cents,
        shippingCents: o.shipping_cents,
        totalCents: o.total_cents,
        total: formatMoney(o.total_cents),
        createdAt: o.created_at,
        submittedAt: o.submitted_at,
        fulfilledAt: o.fulfilled_at,
        updatedAt: o.updated_at,
      },
      client: {
        id: o.client_id,
        firstName: o.first_name,
        lastName: o.last_name,
        email: o.email || "",
        phone: o.phone || "",
      },
      timeline: tRes.rows.map((t) => ({
        id: t.id,
        code: t.event_code,
        label: t.event_label,
        details: t.event_details || "",
        createdBy: t.created_by || "",
        createdAt: t.created_at,
      })),
    });
  } catch (e) {
    const err = /** @type {{ message?: string }} */ (e);
    console.error("[admin/orders] detail failed:", err.message);
    return res.status(500).json({ error: "Failed to load order." });
  }
});

app.patch("/api/admin/orders/:orderNumber", async (req, res) => {
  if (!DATABASE_URL) {
    return res.status(503).json({ error: "Database is not configured." });
  }
  const { orderNumber } = req.params;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const newStatus = String(body.status || "").trim();
  if (!newStatus || !ALL_ORDER_STATUSES.has(newStatus)) {
    return res.status(400).json({ error: "A valid status is required." });
  }

  const dbClient = await pool.connect();
  let previousStatus;
  let row;
  let clientId;
  try {
    await dbClient.query("BEGIN");
    const sel = await dbClient.query(
      `select id, client_id, order_number, status, title from orders where order_number = $1 for update`,
      [orderNumber]
    );
    if (!sel.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found." });
    }
    const cur = sel.rows[0];
    previousStatus = cur.status;
    clientId = cur.client_id;
    if (previousStatus === newStatus) {
      await dbClient.query("ROLLBACK");
      const full = await pool.query(
        `select o.*, c.id as client_id, c.first_name, c.last_name, c.email, c.phone
         from orders o join clients c on c.id = o.client_id where o.order_number = $1`,
        [orderNumber]
      );
      const o = full.rows[0];
      const tRes = await pool.query(
        `select id, event_code, event_label, event_details, created_by, created_at from order_timeline_events
         where order_id = $1 order by created_at desc`,
        [o.id]
      );
      return res.json({
        order: {
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          statusLabel: emailTemplates.humanStatus(o.status),
          title: o.title,
          summary: o.summary || "",
          subtotalCents: o.subtotal_cents,
          taxCents: o.tax_cents,
          shippingCents: o.shipping_cents,
          totalCents: o.total_cents,
          total: formatMoney(o.total_cents),
          createdAt: o.created_at,
          submittedAt: o.submitted_at,
          fulfilledAt: o.fulfilled_at,
          updatedAt: o.updated_at,
        },
        client: {
          id: o.client_id,
          firstName: o.first_name,
          lastName: o.last_name,
          email: o.email || "",
          phone: o.phone || "",
        },
        timeline: tRes.rows.map((t) => ({
          id: t.id,
          code: t.event_code,
          label: t.event_label,
          details: t.event_details || "",
          createdBy: t.created_by || "",
          createdAt: t.created_at,
        })),
      });
    }

    const upd = await dbClient.query(
      `update orders set
        status = $1::order_status,
        updated_at = now(),
        fulfilled_at = case
          when $1::text = 'fulfilled' then coalesce(fulfilled_at, now())
          else fulfilled_at
        end
      where order_number = $2
      returning id, order_number, status, title, summary, subtotal_cents, tax_cents, shipping_cents, total_cents,
        created_at, submitted_at, fulfilled_at, updated_at, client_id`,
      [newStatus, orderNumber]
    );
    row = upd.rows[0];
    const detail =
      newStatus === "cancelled"
        ? "Status updated by staff in the admin dashboard."
        : `Status changed to ${emailTemplates.humanStatus(newStatus)}.`;
    await dbClient.query(
      `insert into order_timeline_events (order_id, event_code, event_label, event_details, created_by)
       values ($1, $2, $3, $4, 'admin')`,
      [
        row.id,
        newStatus,
        emailTemplates.humanStatus(newStatus),
        detail,
      ]
    );
    await dbClient.query("COMMIT");
  } catch (err) {
    try {
      await dbClient.query("ROLLBACK");
    } catch (_e) {}
    console.error("[admin/orders] patch failed:", err && err.message);
    return res.status(500).json({ error: "Could not update order." });
  } finally {
    dbClient.release();
  }

  await notifyOrderStatusChange(pool, {
    clientId,
    orderNumber: row.order_number,
    title: row.title,
    status: newStatus,
    previousStatus,
  });

  const cRow = await pool.query(
    "select first_name, last_name, email, phone from clients where id = $1 limit 1",
    [row.client_id]
  );
  const cli = cRow.rows[0] || {};

  const tRes = await pool.query(
    `select id, event_code, event_label, event_details, created_by, created_at from order_timeline_events
     where order_id = $1 order by created_at desc`,
    [row.id]
  );
  return res.json({
    order: {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      statusLabel: emailTemplates.humanStatus(row.status),
      title: row.title,
      summary: row.summary || "",
      subtotalCents: row.subtotal_cents,
      taxCents: row.tax_cents,
      shippingCents: row.shipping_cents,
      totalCents: row.total_cents,
      total: formatMoney(row.total_cents),
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      fulfilledAt: row.fulfilled_at,
      updatedAt: row.updated_at,
    },
    client: {
      id: row.client_id,
      firstName: cli.first_name || "",
      lastName: cli.last_name || "",
      email: cli.email || "",
      phone: cli.phone || "",
    },
    timeline: tRes.rows.map((t) => ({
      id: t.id,
      code: t.event_code,
      label: t.event_label,
      details: t.event_details || "",
      createdBy: t.created_by || "",
      createdAt: t.created_at,
    })),
  });
});

app.delete("/api/admin/orders/:orderNumber", async (req, res) => {
  if (!DATABASE_URL) {
    return res.status(503).json({ error: "Database is not configured." });
  }
  const { orderNumber } = req.params;
  try {
    const sel = await pool.query(
      "select id, status from orders where order_number = $1 limit 1",
      [orderNumber]
    );
    if (!sel.rows.length) {
      return res.status(404).json({ error: "Order not found." });
    }
    if (sel.rows[0].status !== "cancelled") {
      return res.status(400).json({ error: "Only cancelled orders can be deleted." });
    }
    await pool.query("delete from orders where id = $1", [sel.rows[0].id]);
    return res.json({ ok: true });
  } catch (e) {
    const err = /** @type {{ message?: string }} */ (e);
    console.error("[admin/orders] delete failed:", err.message);
    return res.status(500).json({ error: "Could not delete order." });
  }
});

app.get("/api/admin/inbox", async (_req, res) => {
  const includeArchived =
    String(_req.query.includeArchived || "").toLowerCase() === "true" || String(_req.query.includeArchived || "") === "1";
  const sql = `
    select
      t.id as thread_id,
      t.last_message_at,
      t.admin_last_read_at,
      t.admin_archived_at,
      c.id as client_id,
      c.first_name,
      c.last_name,
      c.email,
      m.body as preview,
      m.attachments as preview_attachments,
      m.sender as last_sender,
      (
        select count(*)::int
        from messages m2
        where m2.thread_id = t.id
          and m2.sender = 'client'
          and m2.deleted_at is null
          and (
            t.admin_last_read_at is null
            or m2.created_at > t.admin_last_read_at
          )
      ) as unread_count
    from message_threads t
    join clients c on c.id = t.client_id
    left join lateral (
      select body, sender, attachments
      from messages
      where thread_id = t.id
        and deleted_at is null
      order by created_at desc
      limit 1
    ) m on true
    where ($1::boolean = true or t.admin_archived_at is null)
    order by coalesce(t.last_message_at, t.updated_at, t.created_at) desc
  `;
  const { rows } = await pool.query(sql, [includeArchived]);
  res.json({
    threads: rows.map((r) => ({
      threadId: r.thread_id,
      clientId: r.client_id,
      clientLabel: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "Client",
      clientEmail: r.email || "",
      updatedAt: r.last_message_at,
      preview:
        chatAttachments.inboxPreviewLine(r.preview, r.preview_attachments) || "(no messages)",
      lastFrom: r.last_sender || "",
      unreadCount: Number(r.unread_count || 0),
      archived: Boolean(r.admin_archived_at),
    })),
  });
});

app.get("/api/admin/customers", async (_req, res) => {
  if (!DATABASE_URL) {
    return res.json({
      databaseConnected: false,
      customers: [],
    });
  }
  try {
    const cRes = await pool.query(`
      select
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.sign_in_zip,
        c.created_at,
        a.line_1,
        a.line_2,
        a.city,
        a.state,
        a.postal_code,
        coalesce(o.total_orders, 0)::int as total_orders,
        coalesce(o.open_orders, 0)::int as open_orders,
        o.last_order_at,
        t.last_message_at
      from clients c
      left join lateral (
        select line_1, line_2, city, state, postal_code
        from client_addresses
        where client_id = c.id and is_default = true
        order by created_at asc
        limit 1
      ) a on true
      left join lateral (
        select
          count(*)::int as total_orders,
          count(*) filter (
            where status not in ('fulfilled'::order_status, 'cancelled'::order_status)
          )::int as open_orders,
          max(created_at) as last_order_at
        from orders
        where client_id = c.id
      ) o on true
      left join message_threads t on t.client_id = c.id
      order by c.created_at desc
      limit 1000
    `);
    return res.json({
      databaseConnected: true,
      customers: cRes.rows.map((r) => ({
        clientId: r.id,
        firstName: r.first_name || "",
        lastName: r.last_name || "",
        fullName: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "Client",
        email: r.email || "",
        phone: r.phone || "",
        signInZip: r.sign_in_zip || "",
        createdAt: r.created_at,
        address: {
          line1: r.line_1 || "",
          line2: r.line_2 || "",
          city: r.city || "",
          state: r.state || "",
          postalCode: r.postal_code || "",
        },
        totalOrders: Number(r.total_orders || 0),
        openOrders: Number(r.open_orders || 0),
        lastOrderAt: r.last_order_at,
        lastMessageAt: r.last_message_at,
      })),
    });
  } catch (e) {
    const err = /** @type {{ message?: string }} */ (e);
    console.error("[admin/customers] failed:", err.message);
    return res.status(500).json({ error: "Failed to load customers.", details: err.message });
  }
});

/**
 * Dashboard KPIs: revenue/profit from orders (MTD), portal activity. Profit is optional margin on revenue via
 * ADMIN_ESTIMATED_GROSS_MARGIN_PERCENT (0–100) until you add real COGS.
 */
app.get("/api/admin/metrics", async (_req, res) => {
  if (!DATABASE_URL) {
    return res.json({
      periodLabel: "This month",
      databaseConnected: false,
      revenueCents: null,
      estimatedProfitCents: null,
      profitNote: "Set DATABASE_URL to load order and portal metrics.",
      ordersCountMtd: null,
      averageOrderValueCents: null,
      openOrdersCount: null,
      clientsCount: null,
      messageThreadsCount: null,
      messagesLast30Days: null,
    });
  }
  const marginRaw = process.env.ADMIN_ESTIMATED_GROSS_MARGIN_PERCENT;
  const marginPct = marginRaw != null && String(marginRaw).trim() !== "" ? Number(marginRaw) : NaN;
  const useMargin = Number.isFinite(marginPct) && marginPct >= 0 && marginPct <= 100;

  try {
    const { rows } = await pool.query(`
      with month_bounds as (
        select
          date_trunc('month', now()) as start,
          date_trunc('month', now()) + interval '1 month' as excl_end
      )
      select
        (
          select coalesce(sum(o.total_cents), 0)::bigint
          from orders o
          cross join month_bounds b
          where o.created_at >= b.start
            and o.created_at < b.excl_end
            and o.status <> 'cancelled'::order_status
        ) as revenue_mtd_cents,
        (
          select count(*)::int
          from orders o
          cross join month_bounds b
          where o.created_at >= b.start
            and o.created_at < b.excl_end
            and o.status <> 'cancelled'::order_status
        ) as orders_mtd,
        (
          select count(*)::int
          from orders
          where status not in ('fulfilled'::order_status, 'cancelled'::order_status)
        ) as open_orders,
        (select count(*)::int from clients) as clients_count,
        (select count(*)::int from message_threads) as threads_count,
        (
          select count(*)::int
          from messages
          where deleted_at is null
            and created_at >= now() - interval '30 days'
        ) as messages_30d
    `);
    const r = rows[0] || {};
    const revenueCents = Number(r.revenue_mtd_cents || 0);
    const ordersMtd = Number(r.orders_mtd || 0);
    const avgCents = ordersMtd > 0 ? Math.round(revenueCents / ordersMtd) : null;
    const estimatedProfitCents = useMargin ? Math.round(revenueCents * (marginPct / 100)) : null;

    return res.json({
      periodLabel: "Month to date (server time)",
      databaseConnected: true,
      revenueCents,
      estimatedProfitCents,
      profitNote: useMargin
        ? `Estimated using ADMIN_ESTIMATED_GROSS_MARGIN_PERCENT (${marginPct}%). Replace with real COGS when available.`
        : "Set ADMIN_ESTIMATED_GROSS_MARGIN_PERCENT (0–100) for a rough profit estimate, or add COGS later.",
      ordersCountMtd: ordersMtd,
      averageOrderValueCents: avgCents === null ? null : avgCents,
      openOrdersCount: Number(r.open_orders || 0),
      clientsCount: Number(r.clients_count || 0),
      messageThreadsCount: Number(r.threads_count || 0),
      messagesLast30Days: Number(r.messages_30d || 0),
    });
  } catch (e) {
    const err = /** @type {{ message?: string }} */ (e);
    return res.status(200).json({
      periodLabel: "This month",
      databaseConnected: false,
      revenueCents: null,
      estimatedProfitCents: null,
      profitNote: err.message || "Could not load metrics.",
      ordersCountMtd: null,
      averageOrderValueCents: null,
      openOrdersCount: null,
      clientsCount: null,
      messageThreadsCount: null,
      messagesLast30Days: null,
    });
  }
});

app.get("/api/admin/threads/:threadId/messages", async (req, res) => {
  const { threadId } = req.params;
  const threadSql = `
    select t.id as thread_id, t.admin_archived_at, c.id as client_id, c.first_name, c.last_name, c.email
    from message_threads t
    join clients c on c.id = t.client_id
    where t.id = $1
    limit 1
  `;
  const threadRes = await pool.query(threadSql, [threadId]);
  if (!threadRes.rows.length) return res.status(404).json({ error: "Thread not found." });
  const info = threadRes.rows[0];
  const msgSql = `select id, sender, body, attachments, created_at, admin_archived_at from messages
       where thread_id = $1 and deleted_at is null order by created_at asc`;
  const msgRes = await pool.query(msgSql, [threadId]);
  await pool.query("update message_threads set admin_last_read_at = now(), updated_at = updated_at where id = $1", [
    threadId,
  ]);
  res.json({
    thread: {
      threadId: info.thread_id,
      clientId: info.client_id,
      clientLabel: `${info.first_name || ""} ${info.last_name || ""}`.trim() || "Client",
      clientEmail: info.email || "",
      archived: Boolean(info.admin_archived_at),
    },
    messages: msgRes.rows.map(mapMessageRow),
  });
});

app.patch("/api/admin/threads/:threadId", async (req, res) => {
  const { threadId } = req.params;
  const action = String((req.body && req.body.action) || "").toLowerCase();
  if (!["archive", "restore"].includes(action)) {
    return res.status(400).json({ error: "action must be archive or restore." });
  }
  const exists = await pool.query("select id from message_threads where id = $1 limit 1", [threadId]);
  if (!exists.rows.length) return res.status(404).json({ error: "Thread not found." });
  if (action === "archive") {
    await pool.query("update message_threads set admin_archived_at = now(), updated_at = now() where id = $1", [threadId]);
  } else {
    await pool.query("update message_threads set admin_archived_at = null, updated_at = now() where id = $1", [threadId]);
  }
  return res.json({ ok: true });
});

app.patch("/api/admin/threads/:threadId/messages/:messageId", async (req, res) => {
  const { threadId, messageId } = req.params;
  const action = String((req.body && req.body.action) || "").toLowerCase();
  if (!["archive", "delete", "restore"].includes(action)) {
    return res.status(400).json({ error: "action must be archive, delete, or restore." });
  }
  const chk = await pool.query(
    "select id, sender from messages where id = $1 and thread_id = $2 limit 1",
    [messageId, threadId]
  );
  if (!chk.rows.length) return res.status(404).json({ error: "Message not found." });
  const row = chk.rows[0];
  if (row.sender !== "client") {
    return res.status(400).json({ error: "Only client messages can be archived or deleted by staff." });
  }
  if (action === "archive") {
    await pool.query("update messages set admin_archived_at = now() where id = $1 and thread_id = $2", [
      messageId,
      threadId,
    ]);
  } else if (action === "delete") {
    await pool.query("update messages set deleted_at = now() where id = $1 and thread_id = $2", [messageId, threadId]);
  } else if (action === "restore") {
    await pool.query("update messages set admin_archived_at = null where id = $1 and thread_id = $2", [
      messageId,
      threadId,
    ]);
  }
  res.json({ ok: true });
});

app.post("/api/admin/threads/:threadId/messages", messageMultipartUpload, async (req, res) => {
  const { threadId } = req.params;
  const bodyText = String((req.body && req.body.body) || "").trim();
  const uploaded = chatAttachments.mapUploadedFilesToDb(req.files || []);
  if (!bodyText && uploaded.length === 0) {
    return res.status(400).json({ error: "Message text or at least one file is required." });
  }
  const msgRes = await pool.query(
    "insert into messages (thread_id, sender, sender_ref, body, attachments, delivered_at) values ($1,'admin','admin', $2, $3::jsonb, now()) returning id, created_at",
    [threadId, bodyText, JSON.stringify(uploaded)]
  );
  await pool.query("update message_threads set last_message_at = now(), updated_at = now() where id = $1", [threadId]);
  const clientRes = await pool.query(
    `select c.email, c.first_name
     from message_threads t
     join clients c on c.id = t.client_id
     where t.id = $1
     limit 1`,
    [threadId]
  );
  const cRow = clientRes.rows[0];
  if (cRow && cRow.email) {
    const snippet = chatAttachments.snippetWithAttachments(bodyText, uploaded);
    const { subject, text } = emailTemplates.clientNewStaffMessage({
      firstName: cRow.first_name,
      bodySnippet: snippet,
    });
    const replyTo = resolveAdminReplyEmail();
    queueNotifyEmail(String(cRow.email).trim(), subject, text, { replyTo });
  } else {
    console.warn("[notify] Client has no email on file; skipping email for admin reply (thread " + threadId + ")");
  }
  res.status(201).json({
    message: {
      id: msgRes.rows[0].id,
      from: "admin",
      body: bodyText,
      attachments: chatAttachments.toApiAttachments(uploaded),
      at: msgRes.rows[0].created_at,
    },
  });
});

app.post("/api/admin/marketplace/sync", async (req, res) => {
  if (!requireMarketplaceSyncEnabled(req, res)) return;
  if (!checkMarketplaceSyncRateLimit(req, res)) return;
  if (!isMarketplaceSyncAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized marketplace sync token." });
  }
  if (!DATABASE_URL) {
    return res.status(503).json({ error: "Database is not configured." });
  }
  const payload = req.body && typeof req.body === "object" ? req.body : {};
  const platformRaw = String(payload.platform || "").trim().toLowerCase() || "unknown";
  const platform = platformRaw.slice(0, 80) || "unknown";
  const threadsIn = Array.isArray(payload.threads) ? payload.threads : [];
  if (!threadsIn.length) return res.status(400).json({ error: "No threads to sync." });
  if (threadsIn.length > 200) {
    return res.status(400).json({ error: "Too many threads in one sync payload." });
  }

  const warnings = [];
  const pushWarning = (msg) => {
    if (warnings.length < 40) warnings.push(String(msg || "").slice(0, 500));
  };

  let threadsSkippedMissingId = 0;
  const threadByPlatformId = new Map();
  for (const t of threadsIn) {
    const rawThread = t && typeof t === "object" ? t : {};
    const platformThreadId = String(rawThread.threadId || rawThread.platformThreadId || "")
      .trim()
      .slice(0, 512);
    if (!platformThreadId) {
      threadsSkippedMissingId += 1;
      continue;
    }
    if (threadByPlatformId.has(platformThreadId)) {
      pushWarning(`Duplicate thread id in payload; last occurrence wins: ${platformThreadId}`);
    }
    threadByPlatformId.set(platformThreadId, rawThread);
  }
  const threadsDedupedInRequest =
    threadsIn.length - threadsSkippedMissingId - threadByPlatformId.size;

  const client = await pool.connect();
  let upsertedThreads = 0;
  let upsertedMessages = 0;
  let messagesReceived = 0;
  let messagesSkippedMissingId = 0;
  let messagesDedupedInRequest = 0;
  try {
    await client.query("BEGIN");
    for (const [platformThreadId, rawThread] of threadByPlatformId) {
      const buyerName = String(rawThread.buyerName || rawThread.participant || "").trim().slice(0, 200) || null;
      const snippet = String(rawThread.snippet || "").trim().slice(0, 4000) || null;
      const unreadCount = Number.isFinite(Number(rawThread.unreadCount))
        ? Math.max(0, Math.min(9999, Number(rawThread.unreadCount)))
        : 0;
      const lastMessageAt = parseIsoTimestamp(rawThread.lastMessageAt || rawThread.updatedAt);
      const threadIns = await client.query(
        `insert into marketplace_threads
          (platform, platform_thread_id, buyer_name, snippet, unread_count, last_message_at, raw_json, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb, now())
         on conflict (platform, platform_thread_id) do update set
           buyer_name = excluded.buyer_name,
           snippet = excluded.snippet,
           unread_count = excluded.unread_count,
           last_message_at = coalesce(excluded.last_message_at, marketplace_threads.last_message_at),
           raw_json = excluded.raw_json,
           updated_at = now()
         returning id`,
        [platform, platformThreadId, buyerName, snippet, unreadCount, lastMessageAt, JSON.stringify(rawThread)]
      );
      const threadDbId = threadIns.rows[0] && threadIns.rows[0].id;
      if (!threadDbId) continue;
      upsertedThreads += 1;

      const messagesArr = Array.isArray(rawThread.messages) ? rawThread.messages : [];
      const messageById = new Map();
      for (const m of messagesArr) {
        messagesReceived += 1;
        const rawMsg = m && typeof m === "object" ? m : {};
        const platformMessageId = String(rawMsg.messageId || rawMsg.platformMessageId || "")
          .trim()
          .slice(0, 512);
        if (!platformMessageId) {
          messagesSkippedMissingId += 1;
          continue;
        }
        if (messageById.has(platformMessageId)) {
          messagesDedupedInRequest += 1;
          pushWarning(`Duplicate message id in thread ${platformThreadId}; last wins: ${platformMessageId}`);
        }
        messageById.set(platformMessageId, rawMsg);
      }
      const capped = Array.from(messageById.values()).slice(0, 500);
      if (messageById.size > 500) {
        pushWarning(
          `Thread ${platformThreadId}: only first 500 messages were stored (${messageById.size} unique ids).`
        );
      }
      for (const rawMsg of capped) {
        const platformMessageId = String(rawMsg.messageId || rawMsg.platformMessageId || "")
          .trim()
          .slice(0, 512);
        const senderLabel = String(rawMsg.senderLabel || rawMsg.from || "").trim().slice(0, 200) || null;
        const body = String(rawMsg.body || "").slice(0, 12000) || null;
        const sentAt = parseIsoTimestamp(rawMsg.sentAt || rawMsg.at || rawMsg.createdAt);
        await client.query(
          `insert into marketplace_messages
            (thread_id, platform, platform_message_id, sender_label, body, sent_at, raw_json)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb)
           on conflict (platform, platform_message_id) do update set
             sender_label = excluded.sender_label,
             body = excluded.body,
             sent_at = coalesce(excluded.sent_at, marketplace_messages.sent_at),
             raw_json = excluded.raw_json`,
          [threadDbId, platform, platformMessageId, senderLabel, body, sentAt, JSON.stringify(rawMsg)]
        );
        upsertedMessages += 1;
      }
    }
    await client.query("COMMIT");
    console.log(
      `[admin/marketplace/sync] ok platform=${platform} threads=${upsertedThreads} messages=${upsertedMessages} skippedThreadIds=${threadsSkippedMissingId} skippedMsgIds=${messagesSkippedMissingId}`
    );
    return res.status(202).json({
      ok: true,
      platform,
      upsertedThreads,
      upsertedMessages,
      threadsReceived: threadsIn.length,
      threadsSkippedMissingId,
      threadsDedupedInRequest,
      messagesReceived,
      messagesSkippedMissingId,
      messagesDedupedInRequest,
      warnings,
    });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_rollbackErr) {}
    const err = /** @type {{ message?: string; code?: string }} */ (e);
    if (isPgUndefinedTable(err)) {
      console.error("[admin/marketplace/sync] undefined table — run npm run db:migrate (003_marketplace_sync.sql).");
      return res.status(503).json({
        error: "Marketplace tables are missing. Run npm run db:migrate on the server environment.",
        migrationNeeded: true,
      });
    }
    console.error("[admin/marketplace/sync] failed:", err.message);
    return res.status(500).json({ error: "Marketplace sync failed." });
  } finally {
    client.release();
  }
});

app.get("/api/admin/marketplace/threads", async (_req, res) => {
  if (!requireMarketplaceSyncEnabled(_req, res)) return;
  if (!DATABASE_URL) {
    return res.json({ databaseConnected: false, threads: [] });
  }
  try {
    const platform = String(_req.query.platform || "").trim().toLowerCase();
    const limitRaw = Number(_req.query.limit || 100);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(300, Math.floor(limitRaw))) : 100;
    const sql =
      "select id, platform, platform_thread_id, buyer_name, snippet, unread_count, last_message_at, updated_at from marketplace_threads " +
      (platform ? "where platform = $1 " : "") +
      "order by coalesce(last_message_at, updated_at) desc limit " +
      String(limit);
    const params = platform ? [platform] : [];
    const { rows } = await pool.query(sql, params);
    return res.json({
      databaseConnected: true,
      threads: rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        threadId: r.platform_thread_id,
        buyerName: r.buyer_name || "",
        snippet: r.snippet || "",
        unreadCount: Number(r.unread_count || 0),
        lastMessageAt: r.last_message_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    const err = /** @type {{ message?: string; code?: string }} */ (e);
    if (isPgUndefinedTable(err)) {
      console.error("[admin/marketplace/threads] undefined table — apply 003_marketplace_sync.sql.");
      return res.status(503).json({
        error: "Marketplace tables are missing. Run npm run db:migrate (003_marketplace_sync.sql).",
        migrationNeeded: true,
        databaseConnected: true,
        threads: [],
      });
    }
    console.error("[admin/marketplace/threads] failed:", err.message);
    return res.status(500).json({ error: "Failed to load marketplace threads." });
  }
});

app.get("/api/admin/marketplace/threads/:threadId/messages", async (req, res) => {
  if (!requireMarketplaceSyncEnabled(req, res)) return;
  if (!DATABASE_URL) {
    return res.status(503).json({ error: "Database is not configured." });
  }
  const { threadId } = req.params;
  try {
    const threadRes = await pool.query(
      "select id, platform, platform_thread_id, buyer_name, snippet, unread_count, last_message_at, updated_at from marketplace_threads where id = $1 limit 1",
      [threadId]
    );
    if (!threadRes.rows.length) return res.status(404).json({ error: "Marketplace thread not found." });
    const msgRes = await pool.query(
      "select id, platform_message_id, sender_label, body, sent_at, created_at from marketplace_messages where thread_id = $1 order by coalesce(sent_at, created_at) asc limit 1000",
      [threadId]
    );
    const t = threadRes.rows[0];
    return res.json({
      thread: {
        id: t.id,
        platform: t.platform,
        threadId: t.platform_thread_id,
        buyerName: t.buyer_name || "",
        snippet: t.snippet || "",
        unreadCount: Number(t.unread_count || 0),
        lastMessageAt: t.last_message_at,
        updatedAt: t.updated_at,
      },
      messages: msgRes.rows.map((m) => ({
        id: m.id,
        messageId: m.platform_message_id,
        senderLabel: m.sender_label || "",
        body: m.body || "",
        sentAt: m.sent_at || m.created_at,
      })),
    });
  } catch (e) {
    const err = /** @type {{ message?: string; code?: string }} */ (e);
    if (isPgUndefinedTable(err)) {
      console.error("[admin/marketplace/messages] undefined table — apply 003_marketplace_sync.sql.");
      return res.status(503).json({
        error: "Marketplace tables are missing. Run npm run db:migrate (003_marketplace_sync.sql).",
        migrationNeeded: true,
      });
    }
    console.error("[admin/marketplace/messages] failed:", err.message);
    return res.status(500).json({ error: "Failed to load marketplace messages." });
  }
});

app.use("/uploads", express.static(uploadsRoot));

const staticDir = path.resolve(__dirname);
app.use(express.static(staticDir));

app.use((req, res) => {
  const target = req.path === "/" ? "index.html" : req.path.slice(1);
  res.sendFile(path.resolve(__dirname, target), (err) => {
    if (err) res.sendFile(path.resolve(__dirname, "index.html"));
  });
});

async function start() {
  if (DATABASE_URL && String(process.env.SKIP_AUTO_SCHEMA || "").toLowerCase() !== "true") {
    try {
      const r = await applyInitialSchemaIfNeeded(pool);
      if (r.applied) {
        console.log(
          `[db] Auto-applied initial schema (${r.statements} statements). Missing: ${(r.missing || []).join(", ")}.`
        );
      }
      const compat = await applySchemaCompat(pool);
      if (compat.ran) {
        console.log(`[db] Applied compat migration (${compat.statements} statements).`);
      }
      const mp = await applyMarketplaceSyncSchema(pool);
      if (mp.ran) {
        console.log(`[db] Applied marketplace migration (${mp.statements} statements).`);
      }
      console.log("[db] Schema step complete (bootstrap + compat + marketplace).");
    } catch (e) {
      console.error("[db] Auto-schema failed (run npm run db:migrate manually):", e && e.message);
    }
  }

  if (DATABASE_URL && MARKETPLACE_SYNC_ENABLED) {
    try {
      const chk = await pool.query("select to_regclass('public.marketplace_threads') as t");
      if (!chk.rows[0] || !chk.rows[0].t) {
        console.warn(
          "[marketplace] marketplace_threads is missing. Run `npm run db:migrate` in Railway Shell (or apply database/migrations/003_marketplace_sync.sql). If SKIP_AUTO_SCHEMA=true, migrations never run on boot."
        );
      }
    } catch (e) {
      const err = /** @type {{ message?: string }} */ (e);
      console.warn("[marketplace] Could not verify marketplace tables:", err.message);
    }
  }

  const server = app.listen(PORT, LISTEN_HOST, () => {
    const smtpOk = Boolean(createMailTransport());
    if (!smtpOk) {
      console.warn(
        "[notify] SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS (and MAIL_FROM) for email notifications."
      );
    } else {
      console.log("[notify] SMTP configured; emails will send for new messages" + (emailTemplates.baseUrl() ? " (PUBLIC_SITE_URL set for links)" : " (set PUBLIC_SITE_URL for portal links in emails)"));
    }
    console.log(
      `Client portal server listening on http://${LISTEN_HOST}:${PORT} (GET /health, GET /api/health)`
    );
  });

  /** Railway / Docker send SIGTERM when replacing or stopping the container — not an app failure. */
  function shutdown(signal) {
    console.log(`[server] ${signal} received, shutting down gracefully…`);
    server.close(() => {
      pool
        .end()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();


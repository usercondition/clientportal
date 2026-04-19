const path = require("path");
const express = require("express");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("DATABASE_URL not set. API routes will fail until configured.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(__dirname)));

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

function formatMoney(cents) {
  const n = Number(cents || 0) / 100;
  return n > 0 ? `$${n.toFixed(2)}` : "—";
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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

  const clientConn = await pool.connect();
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
      String(addressZip).trim(),
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
      String(state).trim().toUpperCase(),
      String(addressZip).trim(),
    ]);

    await clientConn.query(
      "insert into message_threads (client_id, subject, last_message_at) values ($1,$2, now()) on conflict (client_id) do nothing",
      [client.id, "General support"]
    );

    await clientConn.query("commit");
    return res.status(201).json({
      client: toClientProfile({ ...client, ...aRes.rows[0] }),
    });
  } catch (err) {
    await clientConn.query("rollback");
    if (err && err.code === "23505") {
      return res.status(409).json({ error: "Client already exists for this name + ZIP." });
    }
    console.error(err);
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
  }));
  res.json({ orders });
});

app.get("/api/client/:clientId/messages", async (req, res) => {
  const { clientId } = req.params;
  const threadRes = await pool.query("select id from message_threads where client_id = $1 limit 1", [clientId]);
  if (!threadRes.rows.length) return res.json({ messages: [] });
  const threadId = threadRes.rows[0].id;
  const msgRes = await pool.query(
    "select id, sender, body, created_at from messages where thread_id = $1 order by created_at asc",
    [threadId]
  );
  res.json({
    threadId,
    messages: msgRes.rows.map((m) => ({
      id: m.id,
      from: m.sender === "admin" ? "admin" : m.sender === "client" ? "client" : "admin",
      body: m.body,
      at: m.created_at,
    })),
  });
});

app.post("/api/client/:clientId/messages", async (req, res) => {
  const { clientId } = req.params;
  const body = String((req.body && req.body.body) || "").trim();
  if (!body) return res.status(400).json({ error: "Message body required." });

  const threadRes = await pool.query(
    "insert into message_threads (client_id, subject, last_message_at) values ($1,$2, now()) on conflict (client_id) do update set last_message_at = now() returning id",
    [clientId, "General support"]
  );
  const threadId = threadRes.rows[0].id;
  const msgRes = await pool.query(
    "insert into messages (thread_id, sender, sender_ref, body, delivered_at) values ($1,'client',$2,$3, now()) returning id, created_at",
    [threadId, clientId, body]
  );
  await pool.query("update message_threads set last_message_at = now(), updated_at = now() where id = $1", [threadId]);
  res.status(201).json({
    message: { id: msgRes.rows[0].id, from: "client", body, at: msgRes.rows[0].created_at },
  });
});

app.get("/api/admin/inbox", async (_req, res) => {
  const sql = `
    select
      t.id as thread_id,
      t.last_message_at,
      c.id as client_id,
      c.first_name,
      c.last_name,
      c.email,
      m.body as preview,
      m.sender as last_sender
    from message_threads t
    join clients c on c.id = t.client_id
    left join lateral (
      select body, sender
      from messages
      where thread_id = t.id
      order by created_at desc
      limit 1
    ) m on true
    order by coalesce(t.last_message_at, t.updated_at, t.created_at) desc
  `;
  const { rows } = await pool.query(sql);
  res.json({
    threads: rows.map((r) => ({
      threadId: r.thread_id,
      clientId: r.client_id,
      clientLabel: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "Client",
      clientEmail: r.email || "",
      updatedAt: r.last_message_at,
      preview: r.preview || "",
      lastFrom: r.last_sender || "",
    })),
  });
});

app.get("/api/admin/threads/:threadId/messages", async (req, res) => {
  const { threadId } = req.params;
  const threadSql = `
    select t.id as thread_id, c.id as client_id, c.first_name, c.last_name, c.email
    from message_threads t
    join clients c on c.id = t.client_id
    where t.id = $1
    limit 1
  `;
  const threadRes = await pool.query(threadSql, [threadId]);
  if (!threadRes.rows.length) return res.status(404).json({ error: "Thread not found." });
  const info = threadRes.rows[0];
  const msgRes = await pool.query(
    "select id, sender, body, created_at from messages where thread_id = $1 order by created_at asc",
    [threadId]
  );
  res.json({
    thread: {
      threadId: info.thread_id,
      clientId: info.client_id,
      clientLabel: `${info.first_name || ""} ${info.last_name || ""}`.trim() || "Client",
      clientEmail: info.email || "",
    },
    messages: msgRes.rows.map((m) => ({
      id: m.id,
      from: m.sender === "client" ? "client" : "admin",
      body: m.body,
      at: m.created_at,
    })),
  });
});

app.post("/api/admin/threads/:threadId/messages", async (req, res) => {
  const { threadId } = req.params;
  const body = String((req.body && req.body.body) || "").trim();
  if (!body) return res.status(400).json({ error: "Message body required." });
  const msgRes = await pool.query(
    "insert into messages (thread_id, sender, sender_ref, body, delivered_at) values ($1,'admin','admin', $2, now()) returning id, created_at",
    [threadId, body]
  );
  await pool.query("update message_threads set last_message_at = now(), updated_at = now() where id = $1", [threadId]);
  res.status(201).json({
    message: { id: msgRes.rows[0].id, from: "admin", body, at: msgRes.rows[0].created_at },
  });
});

app.get("*", (req, res) => {
  const target = req.path === "/" ? "index.html" : req.path.slice(1);
  res.sendFile(path.resolve(__dirname, target), (err) => {
    if (err) res.sendFile(path.resolve(__dirname, "index.html"));
  });
});

app.listen(PORT, () => {
  console.log(`Client portal server running at http://localhost:${PORT}`);
});


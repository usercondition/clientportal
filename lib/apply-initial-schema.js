const fs = require("fs");
const path = require("path");

/** Tables created by database/migrations/001_init.sql (excluding extension/types). */
const REQUIRED_TABLES = [
  "clients",
  "client_addresses",
  "orders",
  "order_timeline_events",
  "message_threads",
  "messages",
  "admin_users",
];

/** Errors that mean the object already exists — safe to ignore when bootstrapping. */
const BENIGN_PG_CODES = new Set([
  "42P07", // duplicate_table
  "42710", // duplicate_object (types, enums, etc.)
  "42P06", // duplicate_schema
  "42701", // duplicate_column
]);

/**
 * Split SQL on semicolons at nesting depth 0 (not inside () or single-quoted strings).
 * Naive `split(/;\\s*\\n/)` breaks on `;` inside `enum ( 'a', 'b' )` when line endings differ.
 * @param {string} sql
 * @returns {string[]}
 */
function splitSqlStatements(sql) {
  const stmts = [];
  let buf = "";
  let depth = 0;
  let inStr = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];

    if (inStr) {
      if (c === "'" && next === "'") {
        buf += "''";
        i++;
        continue;
      }
      buf += c;
      if (c === "'") inStr = false;
      continue;
    }

    if (c === "'") {
      inStr = true;
      buf += c;
      continue;
    }

    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);

    if (c === ";" && depth === 0) {
      const t = buf.trim();
      if (t) stmts.push(t);
      buf = "";
      let j = i + 1;
      while (j < sql.length && /[\s\r\n]/.test(sql[j])) j++;
      i = j - 1;
      continue;
    }

    buf += c;
  }

  const tail = buf.trim();
  if (tail) stmts.push(tail);
  return stmts;
}

function parseMigrationFile(filename) {
  const migrationPath = path.join(__dirname, "..", "database", "migrations", filename);
  if (!fs.existsSync(migrationPath)) return [];
  const rawSql = fs.readFileSync(migrationPath, "utf8");
  const sql = rawSql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  return splitSqlStatements(sql);
}

/** Statements from `001_init.sql` (create extension, types, tables). */
function getMigrationStatements() {
  return parseMigrationFile("001_init.sql");
}

/** Statements from `002_compat.sql` (ADD COLUMN patches for older DBs). */
function getCompatStatements() {
  return parseMigrationFile("002_compat.sql");
}

/** Full migrate order: bootstrap + compatibility patches. */
function getAllMigrationStatements() {
  return [...getMigrationStatements(), ...getCompatStatements()];
}

/**
 * Run DDL one statement at a time (no single transaction) so partial runs can complete.
 * @param {import("pg").PoolClient | import("pg").Client} client
 * @param {string[]} statements
 * @param {{ logOk?: boolean }} [opts]
 */
async function runMigrationStatements(client, statements, opts) {
  const logOk = opts && opts.logOk;
  for (const chunk of statements) {
    const q = chunk.endsWith(";") ? chunk : `${chunk};`;
    try {
      await client.query(q);
      if (logOk) {
        const preview = q.split(/\r?\n/).find((l) => l.trim()) || q;
        console.log("  ✓", preview.slice(0, 88).trim());
      }
    } catch (e) {
      if (e && BENIGN_PG_CODES.has(e.code)) {
        console.warn("[db] migrate skip", e.code, (q.split(/\r?\n/).find((l) => l.trim()) || "").slice(0, 80));
        continue;
      }
      if (e && /already exists/i.test(String(e.message || ""))) {
        console.warn("[db] migrate skip (already exists)", (q.split(/\r?\n/).find((l) => l.trim()) || "").slice(0, 80));
        continue;
      }
      throw e;
    }
  }
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<string[]>} names of required tables that are missing in public
 */
async function listMissingCoreTables(client) {
  const { rows } = await client.query(
    `select x.t as name
     from unnest($1::text[]) as x(t)
     left join information_schema.tables i
       on i.table_schema = 'public' and i.table_name = x.t
     where i.table_name is null`,
    [REQUIRED_TABLES]
  );
  return rows.map((r) => r.name);
}

/**
 * If any core portal table is missing, run `001_init.sql` (idempotent-friendly).
 * @param {import("pg").Pool} pool
 * @returns {Promise<{ applied: boolean; statements?: number; missing?: string[] }>}
 */
async function applyInitialSchemaIfNeeded(pool) {
  const client = await pool.connect();
  try {
    const missing = await listMissingCoreTables(client);
    if (missing.length === 0) return { applied: false };

    console.warn("[db] Missing table(s):", missing.join(", "), "— applying database/migrations/001_init.sql");

    const statements = getMigrationStatements();
    await runMigrationStatements(client, statements);

    const stillMissing = await listMissingCoreTables(client);
    if (stillMissing.length > 0) {
      throw new Error(`After migration, still missing: ${stillMissing.join(", ")}`);
    }

    return { applied: true, statements: statements.length, missing };
  } finally {
    client.release();
  }
}

/**
 * Apply `002_compat.sql` so existing databases pick up new columns without dropping tables.
 * Safe to run on every startup (idempotent).
 * @param {import("pg").Pool} pool
 */
async function applySchemaCompat(pool) {
  const statements = getCompatStatements();
  if (statements.length === 0) return { ran: false };

  const client = await pool.connect();
  try {
    await runMigrationStatements(client, statements, { logOk: false });
    return { ran: true, statements: statements.length };
  } finally {
    client.release();
  }
}

module.exports = {
  getMigrationStatements,
  getCompatStatements,
  getAllMigrationStatements,
  runMigrationStatements,
  splitSqlStatements,
  applyInitialSchemaIfNeeded,
  applySchemaCompat,
  listMissingCoreTables,
  REQUIRED_TABLES,
};

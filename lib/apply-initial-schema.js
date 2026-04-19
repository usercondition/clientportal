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

function getMigrationStatements() {
  const migrationPath = path.join(__dirname, "..", "database", "migrations", "001_init.sql");
  const rawSql = fs.readFileSync(migrationPath, "utf8");
  const sql = rawSql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  return sql
    .split(/;\s*\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
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
 * If any core portal table is missing, run `001_init.sql` in a transaction.
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
    await client.query("BEGIN");
    try {
      for (const chunk of statements) {
        const q = chunk.endsWith(";") ? chunk : `${chunk};`;
        await client.query(q);
      }
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
      throw err;
    }
    return { applied: true, statements: statements.length, missing };
  } finally {
    client.release();
  }
}

module.exports = {
  getMigrationStatements,
  applyInitialSchemaIfNeeded,
  listMissingCoreTables,
  REQUIRED_TABLES,
};

const fs = require("fs");
const path = require("path");

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
 * If `public.clients` is missing, run `001_init.sql` in a transaction.
 * @param {import("pg").Pool} pool
 * @returns {Promise<{ applied: boolean; statements?: number }>}
 */
async function applyInitialSchemaIfNeeded(pool) {
  const client = await pool.connect();
  try {
    const check = await client.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients' limit 1"
    );
    if (check.rows.length) return { applied: false };

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
    return { applied: true, statements: statements.length };
  } finally {
    client.release();
  }
}

module.exports = { getMigrationStatements, applyInitialSchemaIfNeeded };

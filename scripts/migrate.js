/**
 * Apply database/migrations/001_init.sql then 002_compat.sql.
 *
 * Usage:
 *   npm run db:migrate
 *   npm run db:migrate -- "postgresql://user:pass@host:5432/dbname"
 *
 * Without a URL, reads DATABASE_URL (or DATABASE_PRIVATE_URL / POSTGRES_URL / DATABASE_PUBLIC_URL) from .env / env.
 * Note: postgres.railway.internal only works inside Railway (shell or CI there), not from your laptop.
 */
const path = require("path");
const { Client } = require("pg");
const { getAllMigrationStatements, runMigrationStatements } = require("../lib/apply-initial-schema");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function resolveDatabaseUrl() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const cli = argv[0];
  if (
    cli &&
    (String(cli).startsWith("postgresql://") || String(cli).startsWith("postgres://"))
  ) {
    return { url: String(cli).trim(), source: "CLI" };
  }

  const keys = ["DATABASE_URL", "DATABASE_PRIVATE_URL", "POSTGRES_URL", "DATABASE_PUBLIC_URL"];
  for (const key of keys) {
    const raw = process.env[key];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed) return { url: trimmed, source: key };
  }
  return { url: "", source: "" };
}

function sslOption(url) {
  const pgssl = String(process.env.PGSSL || "").toLowerCase();
  if (pgssl === "true") return { rejectUnauthorized: false };
  if (pgssl === "false") return false;
  if (/\.proxy\.rlwy\.net/i.test(url)) return { rejectUnauthorized: false };
  if (/\.railway\.internal/i.test(url)) return false;
  return false;
}

async function main() {
  const { url, source } = resolveDatabaseUrl();
  if (!url) {
    console.error(
      "No database URL. Either set DATABASE_URL in .env, or pass the URL after --:\n" +
        '  npm run db:migrate -- "postgresql://USER:PASS@HOST:5432/DB"'
    );
    process.exit(1);
  }
  console.log("Connecting using:", source);

  const statements = getAllMigrationStatements();
  const client = new Client({
    connectionString: url,
    ssl: sslOption(url) || undefined,
  });
  await client.connect();

  await runMigrationStatements(client, statements, { logOk: true });

  await client.end();
  console.log("Done. Applied", statements.length, "statements.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

/**
 * Apply database/migrations/001_init.sql using the same env resolution as server.js.
 * Usage: npm run db:migrate
 * Railway: set DATABASE_URL on the service, then run once (e.g. railway run npm run db:migrate).
 */
const path = require("path");
const { Client } = require("pg");
const { getMigrationStatements, runMigrationStatements } = require("../lib/apply-initial-schema");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function resolveDatabaseUrl() {
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
    console.error("No database URL. Set DATABASE_URL (or DATABASE_PRIVATE_URL / POSTGRES_URL).");
    process.exit(1);
  }
  console.log("Connecting using:", source);

  const statements = getMigrationStatements();
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

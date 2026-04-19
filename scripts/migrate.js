/**
 * Apply database/migrations/001_init.sql using the same env resolution as server.js.
 * Usage: npm run db:migrate
 * Railway: set DATABASE_URL on the service, then run once (e.g. railway run npm run db:migrate).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
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

  const migrationPath = path.resolve(__dirname, "..", "database", "migrations", "001_init.sql");
  const rawSql = fs.readFileSync(migrationPath, "utf8");
  const sql = rawSql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

  const statements = sql
    .split(/;\s*\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const client = new Client({
    connectionString: url,
    ssl: sslOption(url) || undefined,
  });
  await client.connect();

  for (const chunk of statements) {
    const q = chunk.endsWith(";") ? chunk : `${chunk};`;
    await client.query(q);
    const preview = q.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith("--")) || q;
    console.log("  ✓", preview.slice(0, 88).trim());
  }

  await client.end();
  console.log("Done. Applied", statements.length, "statements from", path.relative(process.cwd(), migrationPath));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

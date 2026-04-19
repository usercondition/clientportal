/**
 * Apply database/migrations/001_init.sql then 002_compat.sql.
 *
 * Usage:
 *   npm run db:migrate
 *   npm run db:migrate -- "postgresql://user:pass@host:5432/dbname"
 *
 * Without a URL, reads DATABASE_URL (or DATABASE_PRIVATE_URL / POSTGRES_URL / DATABASE_PUBLIC_URL) from .env / env.
 * Note: Hosts like postgres-xxx.railway.internal only resolve *inside* Railway (Shell / deployed services).
 * From your laptop use the *public* connection string (e.g. *.proxy.rlwy.net) with SSL, or run migrate in Railway Shell.
 */
const path = require("path");
const { Client } = require("pg");
const { getAllMigrationStatements, runMigrationStatements } = require("../lib/apply-initial-schema");
const { resolveDatabaseUrlWithSource, sslOptionForUrl } = require("../lib/pg-connection");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function resolveDatabaseUrlForMigrate() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const cli = argv[0];
  if (
    cli &&
    (String(cli).startsWith("postgresql://") || String(cli).startsWith("postgres://"))
  ) {
    return { url: String(cli).trim(), source: "CLI" };
  }

  const { url, sourceKey } = resolveDatabaseUrlWithSource();
  return { url, source: sourceKey };
}

async function main() {
  const { url, source } = resolveDatabaseUrlForMigrate();
  if (!url) {
    console.error(
      "No database URL. Either set DATABASE_URL in .env, or pass the URL after --:\n" +
        '  npm run db:migrate -- "postgresql://USER:PASS@HOST:5432/DB"'
    );
    process.exit(1);
  }
  console.log("Connecting using:", source);

  const statements = getAllMigrationStatements();
  const ssl = sslOptionForUrl(url);
  const client = new Client({
    connectionString: url,
    ...(ssl ? { ssl } : {}),
  });
  await client.connect();

  await runMigrationStatements(client, statements, { logOk: true });

  await client.end();
  console.log("Done. Applied", statements.length, "statements.");
}

main().catch((err) => {
  console.error(err.message || err);
  const code = err && err.code;
  const cliUrl = process.argv
    .slice(2)
    .find((a) => String(a).startsWith("postgresql://") || String(a).startsWith("postgres://"));
  const envUrl = String(process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || "");
  const urlHint = cliUrl || envUrl;
  if (code === "ENOTFOUND" && /\.railway\.internal/i.test(urlHint)) {
    console.error(
      "\n[db:migrate] *.railway.internal does not resolve on your PC — it only works inside Railway’s network.\n" +
        "  • Easiest: Railway → your Web service → Shell → npm run db:migrate (uses injected DATABASE_URL).\n" +
        "  • Or: copy the Postgres *public* / TCP URL from Railway (often *.proxy.rlwy.net), set PGSSL if needed, then:\n" +
        '      npm run db:migrate -- "postgresql://USER:PASS@HOST:5432/railway"\n'
    );
  }
  process.exit(1);
});

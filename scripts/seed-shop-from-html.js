/**
 * Import licensed mini listings from vendor HTML into shop_products.
 *
 * Usage:
 *   npm run db:seed-shop
 *   npm run db:seed-shop -- --force
 */
const path = require("path");
const { Pool } = require("pg");
const { resolveDatabaseUrlWithSource, sslOptionForUrl } = require("../lib/pg-connection");
const { getShopProductsStatements, runMigrationStatements } = require("../lib/apply-initial-schema");
const shopCatalog = require("../lib/shop-catalog");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

async function main() {
  const force = process.argv.includes("--force");
  const { url, sourceKey } = resolveDatabaseUrlWithSource();
  if (!url) {
    console.error("No DATABASE_URL. Set it in .env or pass a postgres URL.");
    process.exit(1);
  }
  console.log("Connecting using:", sourceKey);

  const ssl = sslOptionForUrl(url);
  const pool = new Pool({ connectionString: url, ...(ssl ? { ssl } : {}) });
  const client = await pool.connect();
  try {
    await runMigrationStatements(client, getShopProductsStatements(), { logOk: true });
  } finally {
    client.release();
  }

  const result = await shopCatalog.seedShopProductsFromHtml(pool, { force });
  const total = await shopCatalog.countShopProducts(pool);
  console.log("Seed result:", result);
  console.log("Total products in Postgres:", total);
  await pool.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SHOP_PRODUCT_SOURCE_FILES = [
  "dm-stash.html",
  "greytide.html",
  "redmakers.html",
  "rafail-ft-pring.html",
  "epic-miniatures.html",
  "mar-fil.html",
];

const SHOP_VENDOR_LABELS = {
  "dm-stash": "DM Stash",
  greytide: "Grey Tide Studio",
  redmakers: "REDMAKERS",
  "rafail-ft-pring": "Rafail ft. PRiNG",
  "epic-miniatures": "EPIC Miniatures",
  "mar-fil": "Mar-Fil",
};

const SHOP_PRICE_OVERRIDE_PATH = path.join(ROOT, "data", "shop-price-overrides.json");

function normalizeSku(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, 48);
}

function safeReadJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function loadShopPriceOverrides() {
  const raw = safeReadJsonFile(SHOP_PRICE_OVERRIDE_PATH);
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const sku = normalizeSku(k);
    const price = Number(v);
    if (!sku || !Number.isFinite(price) || price < 0 || price > 100000) continue;
    out[sku] = Math.round(price * 100) / 100;
  }
  return out;
}

function attrValue(src, attr) {
  const m = src.match(new RegExp(`${attr}="([^"]+)"`, "i"));
  return m ? String(m[1]).trim() : "";
}

function extractGalleryUrls(body) {
  const sub = body.match(
    /<div class="rh-shop-card__thumb-subgallery"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (!sub) return [];
  const urls = [];
  const imgRe = /<img[^>]*src="([^"]+)"/gi;
  let m;
  while ((m = imgRe.exec(sub[1]))) {
    const u = String(m[1]).trim();
    if (u) urls.push(u);
  }
  return urls;
}

function parseShopItemsFromHtml(fileName) {
  const abs = path.join(ROOT, fileName);
  if (!fs.existsSync(abs)) return [];
  const html = fs.readFileSync(abs, "utf8");
  const vendor = path.basename(fileName, ".html");
  const vendorLabel = SHOP_VENDOR_LABELS[vendor] || vendor;
  const rows = [];
  const cardRegex = /<article class="rh-shop-card"([^>]*)>([\s\S]*?)<\/article>/g;
  let match;
  let sortOrder = 0;
  while ((match = cardRegex.exec(html))) {
    const attrs = String(match[1] || "");
    const body = String(match[2] || "");
    const btnMatch = body.match(
      /<button[^>]*class="[^"]*rh-shop-add[^"]*"[^>]*data-sku="([^"]+)"[^>]*data-name="([^"]+)"[^>]*data-price="([^"]+)"/i
    );
    if (!btnMatch) continue;
    const sku = normalizeSku(btnMatch[1]);
    const name = String(btnMatch[2] || "").trim().slice(0, 220);
    const basePrice = Number(btnMatch[3] || 0);
    if (!sku || !name || !Number.isFinite(basePrice) || basePrice < 0) continue;
    const cat = attrValue(attrs, "data-cat").toLowerCase() || "general";
    const searchText = attrValue(attrs, "data-search");
    const imgMatch = body.match(/<div class="rh-shop-card__thumb"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    const image = imgMatch ? String(imgMatch[1]).trim() : "";
    const gallery = extractGalleryUrls(body);
    const h3Match = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const pMatch = body.match(/<h3[^>]*>[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = pMatch
      ? String(pMatch[1])
          .replace(/<[^>]+>/g, "")
          .trim()
          .slice(0, 500)
      : "";
    rows.push({
      sku,
      name,
      description,
      vendor,
      vendorLabel,
      category: cat,
      searchText,
      basePrice: Math.round(basePrice * 100) / 100,
      image,
      gallery,
      sourceFile: fileName,
      sortOrder: sortOrder++,
    });
  }
  return rows;
}

function getAllParsedShopItems() {
  const merged = new Map();
  for (const fileName of SHOP_PRODUCT_SOURCE_FILES) {
    const rows = parseShopItemsFromHtml(fileName);
    for (const row of rows) {
      if (!merged.has(row.sku)) merged.set(row.sku, row);
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.sku.localeCompare(b.sku));
}

/** @param {import("pg").PoolClient | import("pg").Pool} db */
async function countShopProducts(db) {
  const { rows } = await db.query("select count(*)::int as c from shop_products");
  return rows[0] ? Number(rows[0].c) : 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ force?: boolean }} [opts]
 */
async function seedShopProductsFromHtml(pool, opts) {
  const force = Boolean(opts && opts.force);
  const existing = await countShopProducts(pool);
  if (existing > 0 && !force) {
    return { seeded: false, skipped: true, count: existing };
  }

  const overrides = loadShopPriceOverrides();
  const items = getAllParsedShopItems();
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (force) {
      await client.query("delete from shop_products");
    }
    for (const it of items) {
      const override = Object.prototype.hasOwnProperty.call(overrides, it.sku)
        ? overrides[it.sku]
        : null;
      const baseCents = Math.round(it.basePrice * 100);
      const priceCents =
        override != null ? Math.round(override * 100) : baseCents;
      await client.query(
        `insert into shop_products (
          sku, name, description, vendor_slug, vendor_label, category, search_text,
          base_price_cents, price_cents, image_url, gallery_urls, source_file, sort_order, active
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,true)
        on conflict (sku) do update set
          name = excluded.name,
          description = excluded.description,
          vendor_slug = excluded.vendor_slug,
          vendor_label = excluded.vendor_label,
          category = excluded.category,
          search_text = excluded.search_text,
          base_price_cents = excluded.base_price_cents,
          price_cents = excluded.price_cents,
          image_url = excluded.image_url,
          gallery_urls = excluded.gallery_urls,
          source_file = excluded.source_file,
          sort_order = excluded.sort_order,
          updated_at = now()`,
        [
          it.sku,
          it.name,
          it.description || null,
          it.vendor,
          it.vendorLabel,
          it.category,
          it.searchText || "",
          baseCents,
          priceCents,
          it.image || null,
          JSON.stringify(Array.isArray(it.gallery) ? it.gallery : []),
          it.sourceFile,
          it.sortOrder,
        ]
      );
    }
    await client.query("commit");
    return { seeded: true, count: items.length };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** @param {any} row */
function rowToPublicProduct(row) {
  const gallery = Array.isArray(row.gallery_urls)
    ? row.gallery_urls
    : typeof row.gallery_urls === "string"
      ? JSON.parse(row.gallery_urls || "[]")
      : [];
  const priceCents = Number(row.price_cents) || 0;
  const baseCents = Number(row.base_price_cents) || 0;
  const stockQty = row.stock_qty == null ? null : Number(row.stock_qty);
  return {
    sku: row.sku,
    name: row.name,
    description: row.description || "",
    vendor: row.vendor_slug,
    vendorLabel: row.vendor_label,
    category: row.category || "general",
    searchText: row.search_text || "",
    price: Math.round(priceCents) / 100,
    basePrice: Math.round(baseCents) / 100,
    image: row.image_url || "",
    gallery: gallery.filter(Boolean),
    stockQty,
    inStock: stockQty == null || stockQty > 0,
    active: Boolean(row.active),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ vendor?: string; category?: string; q?: string; activeOnly?: boolean }} filters
 */
async function listShopProducts(pool, filters) {
  const vendor = filters.vendor ? String(filters.vendor).trim().toLowerCase() : "";
  const category = filters.category ? String(filters.category).trim().toLowerCase() : "";
  const q = filters.q ? String(filters.q).trim().toLowerCase() : "";
  const activeOnly = filters.activeOnly !== false;

  const clauses = [];
  const params = [];
  if (activeOnly) clauses.push("active = true");
  if (vendor) {
    params.push(vendor);
    clauses.push(`vendor_slug = $${params.length}`);
  }
  if (category && category !== "all") {
    params.push(category);
    clauses.push(`category = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(
      `(lower(sku) like $${params.length} or lower(name) like $${params.length} or lower(search_text) like $${params.length})`
    );
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const sql = `
    select *
    from shop_products
    ${where}
    order by sort_order asc, sku asc
  `;
  const { rows } = await pool.query(sql, params);
  return rows.map(rowToPublicProduct);
}

/** @param {import("pg").Pool} pool */
async function getShopProductBySku(pool, sku) {
  const key = normalizeSku(sku);
  if (!key) return null;
  const { rows } = await pool.query("select * from shop_products where sku = $1 limit 1", [key]);
  return rows[0] ? rowToPublicProduct(rows[0]) : null;
}

/** @param {import("pg").Pool} pool */
async function listShopProductsForAdmin(pool) {
  const { rows } = await pool.query(
    `select * from shop_products order by vendor_slug asc, sort_order asc, sku asc`
  );
  return rows.map((row) => {
    const pub = rowToPublicProduct(row);
    return {
      sku: pub.sku,
      name: pub.name,
      vendor: pub.vendorLabel,
      vendorSlug: pub.vendor,
      image: pub.image,
      basePrice: pub.basePrice,
      price: pub.price,
      overridePrice: pub.price !== pub.basePrice ? pub.price : null,
      stockQty: pub.stockQty,
      active: pub.active,
      category: pub.category,
    };
  });
}

/** @param {import("pg").Pool} pool */
async function updateShopProductPrice(pool, sku, priceDollars) {
  const key = normalizeSku(sku);
  if (!key) throw new Error("Invalid SKU.");
  const price = Number(priceDollars);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    throw new Error("Price must be a number between 0 and 100000.");
  }
  const priceCents = Math.round(price * 100);
  const { rows } = await pool.query(
    `update shop_products
     set price_cents = $2, updated_at = now()
     where sku = $1
     returning *`,
    [key, priceCents]
  );
  if (!rows.length) throw new Error("SKU not found.");
  return rowToPublicProduct(rows[0]);
}

/** @param {import("pg").Pool} pool */
async function resetShopProductPrice(pool, sku) {
  const key = normalizeSku(sku);
  if (!key) throw new Error("Invalid SKU.");
  const { rows } = await pool.query(
    `update shop_products
     set price_cents = base_price_cents, updated_at = now()
     where sku = $1
     returning *`,
    [key]
  );
  if (!rows.length) throw new Error("SKU not found.");
  return rowToPublicProduct(rows[0]);
}

/**
 * Validate checkout line items against DB prices and stock.
 * @param {import("pg").Pool} pool
 * @param {Array<{ sku?: string; name?: string; quantity?: number; unitPrice?: number }>} rawItems
 */
async function resolveCheckoutLineItems(pool, rawItems) {
  /** @type {Array<{ sku: string; name: string; quantity: number; unitPrice: number }>} */
  const items = [];
  for (const it of rawItems) {
    const row = it && typeof it === "object" ? it : {};
    const sku = normalizeSku(row.sku);
    const quantity = Math.floor(Number(row.quantity || 0));
    if (!sku || quantity < 1 || quantity > 250) continue;

    const { rows } = await pool.query(
      "select sku, name, price_cents, active, stock_qty from shop_products where sku = $1 limit 1",
      [sku]
    );
    if (!rows.length) {
      throw new Error(`Unknown or unavailable SKU: ${sku}`);
    }
    const p = rows[0];
    if (!p.active) {
      throw new Error(`Item is not available for sale: ${sku}`);
    }
    const stock = p.stock_qty == null ? null : Number(p.stock_qty);
    if (stock != null && stock < quantity) {
      throw new Error(`Not enough stock for ${sku} (requested ${quantity}, available ${stock}).`);
    }
    const unitPrice = Math.round(Number(p.price_cents) || 0) / 100;
    items.push({
      sku,
      name: String(p.name || row.name || "Mini item").trim().slice(0, 180),
      quantity,
      unitPrice,
    });
  }
  if (!items.length) {
    throw new Error("Add at least one valid item to checkout.");
  }
  if (items.length > 40) {
    throw new Error("Checkout can include up to 40 line items.");
  }
  return items;
}

/** @param {number} subtotalCents */
function computeShopShippingCents(subtotalCents) {
  const flatUsd = Number(process.env.SHOP_SHIPPING_FLAT_USD || 6);
  const freeMinUsd = Number(process.env.SHOP_FREE_SHIPPING_MIN_USD || 75);
  const flat = Number.isFinite(flatUsd) ? Math.max(0, Math.round(flatUsd * 100)) : 600;
  const freeMin = Number.isFinite(freeMinUsd) ? Math.max(0, Math.round(freeMinUsd * 100)) : 7500;
  const sub = Math.max(0, Math.round(subtotalCents) || 0);
  if (sub >= freeMin) return 0;
  return flat;
}

function shippingQuoteFromSubtotalDollars(subtotalDollars) {
  const subtotalCents = Math.round(Math.max(0, Number(subtotalDollars) || 0) * 100);
  const shippingCents = computeShopShippingCents(subtotalCents);
  const freeMinUsd = Number(process.env.SHOP_FREE_SHIPPING_MIN_USD || 75);
  return {
    subtotal: subtotalCents / 100,
    shipping: shippingCents / 100,
    total: (subtotalCents + shippingCents) / 100,
    freeShippingMin: Number.isFinite(freeMinUsd) ? freeMinUsd : 75,
    freeShippingApplied: shippingCents === 0 && subtotalCents > 0,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} sku
 * @param {{ price?: number|null; stockQty?: number|null; active?: boolean }} patch
 */
async function updateShopProductFields(pool, sku, patch) {
  const key = normalizeSku(sku);
  if (!key) throw new Error("Invalid SKU.");

  const sets = [];
  const params = [key];

  if (Object.prototype.hasOwnProperty.call(patch, "price")) {
    if (patch.price == null || String(patch.price).trim() === "") {
      sets.push(`price_cents = base_price_cents`);
    } else {
      const price = Number(patch.price);
      if (!Number.isFinite(price) || price < 0 || price > 100000) {
        throw new Error("Price must be a number between 0 and 100000.");
      }
      params.push(Math.round(price * 100));
      sets.push(`price_cents = $${params.length}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "stockQty")) {
    if (patch.stockQty == null || String(patch.stockQty).trim() === "") {
      sets.push("stock_qty = null");
    } else {
      const stock = Math.floor(Number(patch.stockQty));
      if (!Number.isFinite(stock) || stock < 0 || stock > 100000) {
        throw new Error("Stock must be a whole number between 0 and 100000.");
      }
      params.push(stock);
      sets.push(`stock_qty = $${params.length}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "active")) {
    params.push(Boolean(patch.active));
    sets.push(`active = $${params.length}`);
  }

  if (!sets.length) throw new Error("No fields to update.");
  sets.push("updated_at = now()");

  const { rows } = await pool.query(
    `update shop_products set ${sets.join(", ")} where sku = $1 returning *`,
    params
  );
  if (!rows.length) throw new Error("SKU not found.");
  return rowToPublicProduct(rows[0]);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   stripeSessionId: string;
 *   customerEmail?: string;
 *   customerName?: string;
 *   currency?: string;
 *   subtotalCents: number;
 *   shippingCents: number;
 *   totalCents: number;
 *   lineItems: unknown[];
 *   notes?: string;
 * }} order
 */
async function insertShopOrder(pool, order) {
  const sessionId = String(order.stripeSessionId || "").trim();
  if (!sessionId) return null;
  const { rows } = await pool.query(
    `insert into shop_orders (
      stripe_session_id, customer_email, customer_name, currency,
      subtotal_cents, shipping_cents, total_cents, line_items, notes
    ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
    on conflict (stripe_session_id) do nothing
    returning id`,
    [
      sessionId,
      order.customerEmail || null,
      order.customerName || null,
      String(order.currency || "usd").toLowerCase().slice(0, 8),
      Math.max(0, Math.round(order.subtotalCents) || 0),
      Math.max(0, Math.round(order.shippingCents) || 0),
      Math.max(0, Math.round(order.totalCents) || 0),
      JSON.stringify(Array.isArray(order.lineItems) ? order.lineItems : []),
      order.notes ? String(order.notes).slice(0, 2000) : null,
    ]
  );
  return rows[0] ? rows[0].id : null;
}

/** Fallback when Postgres catalog is empty — parse HTML like legacy behavior. */
function getLegacyShopInventoryItems() {
  const overrides = loadShopPriceOverrides();
  return getAllParsedShopItems().map((item) => {
    const overridePrice = Object.prototype.hasOwnProperty.call(overrides, item.sku)
      ? overrides[item.sku]
      : null;
    const price = overridePrice == null ? item.basePrice : overridePrice;
    return {
      sku: item.sku,
      name: item.name,
      vendor: item.vendorLabel,
      vendorSlug: item.vendor,
      image: item.image,
      basePrice: item.basePrice,
      price,
      overridePrice,
      stockQty: null,
      active: true,
      category: item.category,
    };
  });
}

function getLegacyPriceOverridesMap() {
  return loadShopPriceOverrides();
}

module.exports = {
  SHOP_PRODUCT_SOURCE_FILES,
  SHOP_VENDOR_LABELS,
  SHOP_PRICE_OVERRIDE_PATH,
  normalizeSku,
  parseShopItemsFromHtml,
  getAllParsedShopItems,
  loadShopPriceOverrides,
  countShopProducts,
  seedShopProductsFromHtml,
  listShopProducts,
  getShopProductBySku,
  listShopProductsForAdmin,
  updateShopProductPrice,
  resetShopProductPrice,
  updateShopProductFields,
  resolveCheckoutLineItems,
  computeShopShippingCents,
  shippingQuoteFromSubtotalDollars,
  insertShopOrder,
  getLegacyShopInventoryItems,
  getLegacyPriceOverridesMap,
  rowToPublicProduct,
};

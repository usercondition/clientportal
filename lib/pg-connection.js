/**
 * Shared DATABASE_URL resolution + SSL options for node-pg (server + migrate script).
 * Railway public Postgres hosts often need TLS; private postgres.railway.internal does not.
 */

const ENV_KEYS = ["DATABASE_URL", "DATABASE_PRIVATE_URL", "POSTGRES_URL", "DATABASE_PUBLIC_URL"];

/**
 * @returns {{ url: string; sourceKey: string }}
 */
function resolveDatabaseUrlWithSource() {
  for (const key of ENV_KEYS) {
    const raw = process.env[key];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed) return { url: trimmed, sourceKey: key };
  }
  return { url: "", sourceKey: "" };
}

/**
 * Host only (best-effort; passwords with raw `@` can confuse parsers).
 * @param {string} url
 */
function postgresHostname(url) {
  try {
    const s = String(url || "").trim();
    const normalized = s.replace(/^postgres(ql)?:\/\//i, "http://");
    return new URL(normalized).hostname || "";
  } catch {
    return "";
  }
}

/**
 * SSL settings for `pg` Pool/Client, or `false` for no TLS.
 * @param {string} url
 * @returns {false | { rejectUnauthorized: boolean }}
 */
function sslOptionForUrl(url) {
  const pgssl = String(process.env.PGSSL || "").toLowerCase();
  if (pgssl === "true") return { rejectUnauthorized: false };
  if (pgssl === "false") return false;

  const host = postgresHostname(url);
  if (!host) return false;

  if (/\.railway\.internal$/i.test(host)) return false;
  if (host === "localhost" || host === "127.0.0.1") return false;

  if (/\.proxy\.rlwy\.net$/i.test(host)) return { rejectUnauthorized: false };
  if (/\.railway\.app$/i.test(host)) return { rejectUnauthorized: false };

  return false;
}

module.exports = {
  ENV_KEYS,
  resolveDatabaseUrlWithSource,
  postgresHostname,
  sslOptionForUrl,
};

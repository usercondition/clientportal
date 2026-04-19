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
 * Respect sslmode in the connection string (Railway / cloud URLs often append ?sslmode=require).
 * @param {string} url
 * @returns {"require" | "disable" | "prefer" | null}
 */
function sslModeFromUrl(url) {
  try {
    const s = String(url || "").trim();
    const normalized = s.replace(/^postgres(ql)?:\/\//i, "http://");
    const mode = (new URL(normalized).searchParams.get("sslmode") || "").toLowerCase();
    if (mode === "require" || mode === "verify-full" || mode === "verify-ca") return "require";
    if (mode === "disable") return "disable";
    if (mode === "prefer" || mode === "allow") return "prefer";
    return null;
  } catch {
    if (/[?&]sslmode=require/i.test(String(url))) return "require";
    if (/[?&]sslmode=disable/i.test(String(url))) return "disable";
    return null;
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

  const mode = sslModeFromUrl(url);
  if (mode === "require") return { rejectUnauthorized: false };
  if (mode === "disable") return false;

  const host = postgresHostname(url);
  if (!host) return false;

  if (/\.railway\.internal$/i.test(host)) return false;
  if (host === "localhost" || host === "127.0.0.1") return false;

  if (/\.proxy\.rlwy\.net$/i.test(host)) return { rejectUnauthorized: false };
  if (/\.railway\.app$/i.test(host)) return { rejectUnauthorized: false };

  // Hostname we do not recognize; if URL asks for SSL preference, enable TLS (common on managed Postgres).
  if (mode === "prefer") return { rejectUnauthorized: false };

  return false;
}

module.exports = {
  ENV_KEYS,
  resolveDatabaseUrlWithSource,
  postgresHostname,
  sslModeFromUrl,
  sslOptionForUrl,
};

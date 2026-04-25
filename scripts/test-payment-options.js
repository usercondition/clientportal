"use strict";

/**
 * Smoke-test configured payment URLs (HTTP reachability) and default metadata.
 * Run: node scripts/test-payment-options.js
 */
const defaults = require("../lib/studio-payment-defaults");

async function checkUrl(label, url) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
    headers: { "User-Agent": "clientportal-payment-test/1.0" },
  });
  const ok = res.ok || (res.status >= 200 && res.status < 400);
  return { label, url, status: res.status, finalUrl: res.url, ok };
}

async function main() {
  const rows = [
    ["PayPal", defaults.links.paypal],
    ["Venmo", defaults.links.venmo],
    ["Cash App", defaults.links.cashApp],
  ];

  let failed = false;
  console.log("HTTP checks (follow redirects, 25s timeout)\n");

  for (const [label, url] of rows) {
    try {
      const r = await checkUrl(label, url);
      const pass = r.ok;
      if (!pass) failed = true;
      console.log(
        `${pass ? "PASS" : "FAIL"}  ${label}: ${r.status}  ${r.url}${r.finalUrl !== r.url ? `\n        final: ${r.finalUrl}` : ""}`
      );
    } catch (e) {
      failed = true;
      const msg = e && e.message ? e.message : String(e);
      console.log(`FAIL  ${label}: ${msg}`);
    }
  }

  const zelle = defaults.zelleNote || "";
  const zelleOk = zelle.length > 0 && /@/.test(zelle);
  if (!zelleOk) failed = true;
  console.log(`${zelleOk ? "PASS" : "FAIL"}  Zelle copy text: ${zelleOk ? "non-empty, contains @" : "missing or invalid"}`);

  const tag = defaults.cashAppTag || "";
  const tagOk = /^\$[A-Za-z0-9_-]+$/.test(tag);
  if (!tagOk) failed = true;
  console.log(`${tagOk ? "PASS" : "FAIL"}  Cash App $Cashtag format: ${tag || "(empty)"}`);

  console.log("");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

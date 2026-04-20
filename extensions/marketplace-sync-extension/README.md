# Marketplace Sync Extension

Manual bridge from a marketplace inbox tab into the admin portal.

## Server setup

1. Set `MARKETPLACE_SYNC_ENABLED=true` and `MARKETPLACE_SYNC_TOKEN` (long random secret) on the web service.
2. Run migrations (`npm run db:migrate`) so `003_marketplace_sync.sql` is applied (or rely on server startup auto-apply when `SKIP_AUTO_SCHEMA` is not set).
3. Open **Admin → Marketplace** to view synced threads.
4. After deploy, `GET /api/health` includes `marketplace.enabled`, `marketplace.tokenConfigured`, and `marketplace.tablesPresent` when the database is reachable — use that to confirm the stack is ready before syncing.

## If the popup says “Receiving end does not exist”

That means the **active tab** had no inbox helper script attached. **Fix:** click your **Facebook / Messages / Marketplace inbox** tab so it is focused (not the extension Options page, not `chrome://…`). Reload that inbox tab (**F5**), then **Reload** the extension on `chrome://extensions` and **Sync** again. The extension will try to inject the helper automatically once if needed.

## If the popup says “Failed to fetch”

1. Open **`https://YOUR-RAILWAY-URL.up.railway.app/api/health`** in a normal tab — it must load JSON (not a browser error page).
2. In **`chrome://extensions`**, open **Service worker** (for this extension) → **Console**, click **Sync now** again and read any red errors.
3. **API base URL** must include **`https://`** (Railway serves HTTPS). No spaces or extra path like `/admin`.
4. Reload the extension after changing options.

## How to sync (Chrome)

1. **Options**: set API base URL (site origin), **same** token as `MARKETPLACE_SYNC_TOKEN`, choose **Extraction profile** (try **Meta / Facebook** on Meta inbox).
2. **Inbox list** (`/messages` or Marketplace inbox): syncs one row per visible conversation (thread links only — not every link on Facebook).
3. **Single open chat** (URL like `https://www.facebook.com/messages/t/THREAD_ID/`): syncs **only that thread** and tries to read **visible message bubbles** in the main chat grid (best-effort; Meta DOM varies).
4. Click the extension icon → **Sync now**.
5. In the portal, open **Admin → Marketplace** — threads refresh on load / every 45s.

Each thread sends an **inbox preview** line as one message when the list row had visible snippet text. Full back-and-forth history only appears if you later add deeper DOM scraping (or export) for your specific inbox; Meta markup changes often, so **Custom** JSON is there for stable selectors when you tune it.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder: `extensions/marketplace-sync-extension`

## Configure (Options)

- **API base URL** — origin of your deployed portal (no trailing slash required)
- **Sync token** — same value as `MARKETPLACE_SYNC_TOKEN`
- **Platform label** — stored per row (e.g. `facebook`, `marketplace`)
- **Extraction profile** — Generic, Meta/Facebook heuristics, or Custom JSON

### Custom JSON

```json
{
  "rowSelector": "[data-thread-id]",
  "idAttr": "data-thread-id",
  "buyerSelector": "[data-thread-buyer]",
  "snippetSelector": "[data-thread-snippet]"
}
```

Optional: `idSelector` / `idSubAttr` on a child instead of `idAttr` on the row.

## Notes

- Meta UIs change often; use **Custom** with selectors from your inbox when heuristics miss rows.
- Respect marketplace terms and account policies.

# Marketplace Sync Extension

Manual bridge from a marketplace inbox tab into the admin portal.

## Server setup

1. Set `MARKETPLACE_SYNC_ENABLED=true` and `MARKETPLACE_SYNC_TOKEN` (long random secret) on the web service.
2. Run migrations (`npm run db:migrate`) so `003_marketplace_sync.sql` is applied (or rely on server startup auto-apply when `SKIP_AUTO_SCHEMA` is not set).
3. Open **Admin → Marketplace** to view synced threads.
4. After deploy, `GET /api/health` includes `marketplace.enabled`, `marketplace.tokenConfigured`, and `marketplace.tablesPresent` when the database is reachable — use that to confirm the stack is ready before syncing.

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

# Disposable GSC spike (Phase 1)

Throwaway Node script to prove Search Console access for Simple Roster Plus.

**Not** the product app. Delete this folder when Phase 2 starts.

## Quick start

1. Follow [SETUP.md](./SETUP.md) (Google Cloud + Search Console user grant).
2. Place the service-account JSON outside git (see SETUP).
3. Run:

```powershell
cd "C:\Cursor Projects\seointernal\spike-gsc"
npm install
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\Dane\.seo-console\gsc-sa.json"
npm run spike
```

Output: console + `out/spike-report.json` (no private keys).

## What it proves

- Properties visible to the SA
- Latest finalized Search Analytics date
- Totals / top pages / top queries / query×page volume
- Sitemap list fields
- One URL Inspection of the homepage
- Error responses for bad property / missing creds / malformed inspect

## Dependencies

Only `googleapis` (official Google client). No Hono, Vite, DB, Docker, or auth UI.

# Phase 3 complete — Phase 4 handoff

## Phase 3 delivered

- Live filtered-query proof: ORIGIN page `contains` filter is trustworthy
- Production GSC client (`apps/server/src/gsc`)
- `gsc_ingest_daily` worker job: finalized catch-up, upserts, rollup, sitemaps, `job_runs`
- Manual CLI: `npm run gsc:ingest`
- Scheduler + advisory-lock concurrency
- Minimal project-detail ingest status (not a dashboard)
- Deterministic tests + optional live smoke
- Docker credential mount via `docker-compose.gsc.yml`

## Frozen Phase 3 facts

| Item | Value |
|------|--------|
| Property | `sc-domain:simplerosterplus.com` |
| Primary origin | `https://www.simplerosterplus.com` |
| Query persistence | ORIGIN only |
| Pages | All Domain-property hosts retained |
| Query × page | Rolling 28-day ORIGIN snapshot |
| Finalized data | API-discovered; never persist incomplete `all` as history |
| Sitemaps | Useful fields only; ignore deprecated `indexed` |

## Phase 4 goal (recommended next step)

Build the **understandable owner dashboard** for Simple Roster Plus:

1. Primary-origin performance summary (“Search data through \<date\>”)
2. Top pages / top queries from ingested ORIGIN data
3. Compact **Other hosts appearing in Google** panel (facts from page daily; grace period for `app.` after noindex — no alerts yet unless clearly warranted)
4. Sitemap health card (submitted count, last download, errors/warnings)
5. Last ingest status / failures already on project detail — fold into ops strip

Still **exclude**: recommendations engine, AI, GitHub, URL Inspection scheduling as a product surface, `seo:check`, GA4, Bing, notifications, multi-user RBAC.

## Do not reopen

- Warehouse / Redis / queue infrastructure
- PROPERTY query daily persistence (unless a demonstrated use case)
- Daily query×page history

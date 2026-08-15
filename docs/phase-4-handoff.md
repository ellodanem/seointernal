# Phase 3 complete — Phase 4 handoff (historical)

Phase 4 is implemented. See **`docs/phase-5-handoff.md`**, **`docs/dashboard.md`**, and **`docs/architecture.md`**.

## Phase 3 delivered

- Live filtered-query proof: ORIGIN page `contains` filter is trustworthy
- Production GSC client (`apps/server/src/gsc`)
- `gsc_ingest_daily` worker job: finalized catch-up, upserts, rollup, sitemaps, `job_runs`
- Manual CLI: `npm run gsc:ingest`
- Scheduler + advisory-lock concurrency
- Minimal project-detail ingest status (superseded by Phase 4 dashboard)
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

## Phase 4 goal (completed)

Build the **understandable owner dashboard** for Simple Roster Plus:

1. Primary-origin performance summary (“Search data through \<date\>”)
2. Top pages / top queries from ingested ORIGIN data
3. Compact **Other hosts appearing in Google** panel
4. Sitemap health card
5. Freshness / connection strip

Still **excluded** from Phase 4: recommendations engine, AI, GitHub, URL Inspection product UI, `seo:check`, GA4, Bing, notifications, multi-user RBAC.

## Do not reopen

- Warehouse / Redis / queue infrastructure
- PROPERTY query daily persistence (unless a demonstrated use case)
- Daily query×page history

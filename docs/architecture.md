# Architecture (Phase 6)

## Purpose

Portable internal SEO Operations Console. Multi-**project** data model (not multi-tenant SaaS). One owner, Google allowlist, no public registration.

Simple Roster Plus is Project #1. Phase 3 stores trusted GSC history. Phase 4 adds an **understandable owner dashboard**. Phase 5 adds **cautious page-level Attention & Opportunities**. Phase 6 adds **Indexing Awareness** via URL Inspection for managed `INDEXABLE` pages.

## Process shape

| Process | Entry | Responsibility |
|---------|-------|----------------|
| **web** | `apps/server/dist/index.js` | Hono HTTP API, Better Auth, static UI, dashboard + attention + indexing reads |
| **worker** | `apps/server/dist/worker.js` | Scheduled `gsc_ingest_daily` + `gsc_url_inspection` + DB heartbeat |
| **CLI** | `npm run gsc:ingest` / `npm run gsc:inspect` | Manual / backfill / inspect triggers (not public HTTP) |

No Redis, BullMQ, or external queues. Concurrency uses PostgreSQL advisory locks per project (separate namespaces for ingest vs inspect).

## Property vs primary origin

| Concept | Example (SRP) |
|---------|----------------|
| **Project.primaryOrigin** (ORIGIN scope) | `https://www.simplerosterplus.com` |
| **GscProperty.siteUrl** (PROPERTY scope) | `sc-domain:simplerosterplus.com` |

### Scope semantics (v0.1)

| Dataset | Scope | Notes |
|---------|-------|-------|
| Daily totals | PROPERTY + ORIGIN | Both persisted; **dashboard headlines use ORIGIN** |
| Page daily | Domain property (all hosts) | Top pages + attention filter to primary origin; Other hosts uses the rest |
| Query daily | **ORIGIN only** | Page `contains` filter on primary origin |
| Query × page | ORIGIN rolling 28-day snapshot | Supporting evidence under attention cards |
| Sitemaps | Append-only snapshots | Ignore deprecated `indexed` |
| URL Inspection | **INDEXABLE inventory only** | Weekly; not every GSC-observed URL |

## Finalized-data semantics

- Persist only `dataState=final` for Search Analytics.
- Latest finalized date is discovered from the API (date dimension probe), not assumed as `today - 2`.
- Incomplete `dataState=all` rows are never written to durable daily tables.
- Dashboard phrase: “Search data through \<latest ORIGIN total date\>”.
- Indexing freshness is separate: “Indexing checked \<date\>”.

## Ingestion flow (`gsc_ingest_daily`)

Unchanged from Phase 3/4. Attention does not write tables. Inspection is a separate job.

## URL Inspection flow (`gsc_url_inspection`)

For each active project / primary GSC property:

1. Verify SA can see the property
2. Load managed pages with `role=INDEXABLE` under primary origin
3. Skip pages with a successful inspection newer than freshness window (unless `--force`)
4. Call URL Inspection per eligible URL (bounded retry)
5. Append snapshot rows; failed attempts recorded without inventing status
6. Record `job_runs` stats

Details: **`docs/indexing.md`**.

### Scheduler

- Worker interval: `WORKER_IDLE_MS` (heartbeat)
- Ingest cadence: `GSC_INGEST_INTERVAL_MS` (default 6h)
- Inspect cadence: `GSC_INSPECT_INTERVAL_MS` (default 7d)
- `GSC_INGEST_ON_START` / `GSC_INSPECT_ON_START` optional boot triggers
- Overlap protection: in-process flags + `pg_try_advisory_lock` per job namespace

## Credential handling

- Path via `GOOGLE_APPLICATION_CREDENTIALS` (outside repo/image)
- Docker: `docker compose -f docker-compose.yml -f docker-compose.gsc.yml` with `GSC_SA_HOST_PATH`
- Never log key contents, auth headers, OAuth query strings, or session cookies

## Schema overview

Phase 2–3 tables plus Phase 6 columns on `gsc_url_inspections`:

`projects`, `gsc_properties`, `pages`, `gsc_daily_totals`, `gsc_page_daily`, `gsc_query_daily`, `gsc_query_page_rollups`, `gsc_sitemap_snapshots`, `gsc_url_inspections`, `job_runs`

## Repo layout

```
apps/server/src/gsc/         GSC client (auth, filters, dates, mapping, inspection, errors)
apps/server/src/jobs/        gsc_ingest_daily + gsc_url_inspection + advisory locks
apps/server/src/dashboard/   period/compare/visibility/attention/indexing + dashboard service
apps/web/src/pages/          owner dashboard UI
scripts/                     proof, ingest/inspect CLI, smoke, DB / dashboard / attention / indexing verify
docs/                        architecture / setup / handoffs / dashboard / attention / indexing
spike-gsc/                   Phase 1 evidence only
```

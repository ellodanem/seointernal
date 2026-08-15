# Architecture (Phase 3)

## Purpose

Portable internal SEO Operations Console. Multi-**project** data model (not multi-tenant SaaS). One owner, Google allowlist, no public registration.

Simple Roster Plus is Project #1. Phase 3 adds production-quality **read-only** Google Search Console ingestion.

## Process shape

| Process | Entry | Responsibility |
|---------|-------|----------------|
| **web** | `apps/server/dist/index.js` | Hono HTTP API, Better Auth, static UI |
| **worker** | `apps/server/dist/worker.js` | Scheduled `gsc_ingest_daily` + DB heartbeat |
| **CLI** | `npm run gsc:ingest` | Manual / backfill trigger (not a public HTTP endpoint) |

No Redis, BullMQ, or external queues. Concurrency uses PostgreSQL advisory locks per project.

## Property vs primary origin

| Concept | Example (SRP) |
|---------|----------------|
| **Project.primaryOrigin** (ORIGIN scope) | `https://www.simplerosterplus.com` |
| **GscProperty.siteUrl** (PROPERTY scope) | `sc-domain:simplerosterplus.com` |

### Scope semantics (v0.1)

| Dataset | Scope | Notes |
|---------|-------|-------|
| Daily totals | PROPERTY + ORIGIN | Both persisted |
| Page daily | Domain property (all hosts) | Includes `app.` historically — facts only |
| Query daily | **ORIGIN only** | Page `contains` filter on primary origin |
| Query × page | ORIGIN rolling 28-day snapshot | Replace on refresh; not daily pair history |
| Sitemaps | Append-only snapshots | Ignore deprecated `indexed` |

Proven (Phase 3 filtered-query gate): Search Analytics `dimensionFilterGroups` with `dimension=page`, `operator=contains`, `expression=<primaryOrigin>` excludes app-host pages and query×page pairs.

## Finalized-data semantics

- Persist only `dataState=final`.
- Latest finalized date is discovered from the API (date dimension probe), not assumed as `today - 2`.
- Incomplete `dataState=all` rows are never written to durable daily tables.
- Dashboard-ready phrase: “Search data through \<latest PROPERTY total date\>”.

## Ingestion flow (`gsc_ingest_daily`)

For each active project / primary GSC property:

1. Verify SA can see the property (`sites.list`)
2. Resolve latest finalized date
3. Compute missing dates in the configured backfill window (PROPERTY totals = completeness cursor)
4. For each missing day (chronological, capped by `GSC_MAX_DAYS_PER_RUN`):
   - Fetch PROPERTY totals, ORIGIN totals, pages, ORIGIN queries
   - Persist in one DB transaction (partial day is not marked complete)
5. Refresh 28-day ORIGIN query×page rollup (delete + insert in a transaction)
6. Append sitemap snapshots
7. Record `job_runs` stats

### Idempotency

- Totals / pages: upsert on unique keys
- Queries: delete-day + insert for ORIGIN scope
- Rollup: replace current ORIGIN snapshot for the property
- Sitemaps: **append-only** historical captures (rerun adds a new `capturedAt` row)

### Failure / retry

| Case | Behavior |
|------|----------|
| Missing credentials | Job fails clearly; web still boots |
| 403 access lost | Property → ERROR; history preserved |
| 400 bad property | Fail; no endless retry |
| 429 / 5xx / network | Bounded exponential backoff; next schedule continues |
| Partial day | Transactional write — rerun safe |

### Scheduler

- Worker interval: `WORKER_IDLE_MS` (heartbeat)
- Ingest cadence: `GSC_INGEST_INTERVAL_MS` (default 6h)
- `GSC_INGEST_ON_START` optional boot trigger
- Overlap protection: in-process `ingestRunning` + `pg_try_advisory_lock(projectId)`

## Credential handling

- Path via `GOOGLE_APPLICATION_CREDENTIALS` (outside repo/image)
- Docker: `docker compose -f docker-compose.yml -f docker-compose.gsc.yml` with `GSC_SA_HOST_PATH`
- Never log key contents, auth headers, OAuth query strings, or session cookies

## Schema overview

Unchanged Phase 2 tables; Phase 3 uses them as designed:

`projects`, `gsc_properties`, `pages`, `gsc_daily_totals`, `gsc_page_daily`, `gsc_query_daily`, `gsc_query_page_rollups`, `gsc_sitemap_snapshots`, `job_runs`

## Repo layout

```
apps/server/src/gsc/     GSC client (auth, filters, dates, mapping, errors)
apps/server/src/jobs/    gsc_ingest_daily + advisory locks
scripts/                 proof, ingest CLI, smoke, DB verify
docs/                    architecture / setup / handoffs
spike-gsc/               Phase 1 evidence only
```

# Phase 2 scope & Phase 3 handoff

## Phase 2 included

- Git repository + ignore rules for secrets
- Docker Compose: postgres, web, worker
- Hono + TypeScript API
- Vite + React UI shell (login, projects list, project detail)
- PostgreSQL + Prisma schema for GSC-ready tables
- Better Auth Google login with `OWNER_EMAILS` allowlist
- Web + worker process entrypoints
- Seed for Simple Roster Plus (primary origin + Domain GSC property + sitemap URL)
- Docs for architecture, local setup, and this handoff

## Phase 2 intentionally excluded

- Scheduled / production GSC ingestion
- 16-month backfill
- URL Inspection API calls
- Sitemap API polling
- Recommendations, anomalies, technical `seo:check` integration
- GitHub / repo workflows, AI, backlinks, ranks, GA4, Bing
- Public signup, teams/RBAC, billing, Vercel-specific APIs

## Phase 1 facts to preserve

- Property: `sc-domain:simplerosterplus.com` (DOMAIN only visible to SA)
- Primary origin: `https://www.simplerosterplus.com` (not equal to the property)
- Finalized lag ~2 days; use `dataState=final` for durable history
- Tiny volume (~6 pages/day, ~14 queries/day) — no warehouse
- Ignore deprecated sitemap `indexed`
- Domain property includes non-primary hosts (e.g. `app.`)

## Frozen product decisions (post–Phase 2 acceptance)

### 1. Query daily persistence — ORIGIN only in v0.1

| Dataset | Persist in v0.1? |
|---------|------------------|
| Daily totals `PROPERTY` + `ORIGIN` | Yes |
| Page-level daily rows (all hosts) | Yes |
| Query daily rows | **ORIGIN only** |
| Query daily `PROPERTY` rows | **No** — until a demonstrated use case |

Unfiltered Domain-property queries mix `www`, `app`, and future subdomains without attributing surface. That is less actionable and easy to misread. The SEO question for v0.1 is: *what queries cause the managed site (`https://www.simplerosterplus.com`) to appear?*

Schema keeps `scopeType` / `scopeValue` so PROPERTY query rows can be added later without a rewrite. Do not write them in Phase 3 v0.1 ingest.

### 2. Dashboard framing — primary origin + Other Hosts panel

- Main dashboard **always** represents the project primary origin (SRP = `www.simplerosterplus.com`).
- Not a filter dropdown.
- Smaller diagnostic section: **Other hosts appearing in Google** (host, URLs seen, impressions, clicks, last seen).
- That panel may later emit warnings.
- For `app.` specifically: historical impressions are **not** an immediate alert. Allow a recrawl/grace period after the global `noindex` deploy before escalating continued visibility.

## Phase 3 order (do not skip the proof)

```
filtered-query proof
  → finalized-day ingestion
  → idempotent upserts
  → catch-up / backfill
  → sitemap snapshots
  → job tracking
```

Still **no** dashboard recommendations, AI, Git integration, or backlink work.

### Phase 3 verification note (must do first)

Phase 1 did **not** fully prove that page-filtered Search Analytics returns the exact **primary-origin query metrics** we intend to store under `scopeType=ORIGIN`.

Prove with the real API:

1. Domain-property (unfiltered) queries **versus**
2. Queries filtered to pages under `https://www.simplerosterplus.com`

If that behaves as expected, the ingestion model is settled. Then:

3. Implement **finalized-day** ingestion only (`dataState=final`).
4. Persist PROPERTY + ORIGIN **totals**; all **page** rows; **ORIGIN-only** query rows.
5. Idempotent upserts (unique constraints already in schema), then catch-up/backfill.
6. Sitemap snapshots (useful fields only; never treat `indexed` as a metric).
7. Use `job_runs` for worker run tracking (table already present).
8. **Do not** build recommendations yet.

### Recommended first Phase 3 implementation step

Add a read-only GSC client in the worker that:

1. Loads the primary `GscProperty` for SRP
2. Resolves the latest finalized date
3. Fetches one day of property totals + page rows
4. Fetches query rows **with a page/origin filter** for `https://www.simplerosterplus.com` and compares to unfiltered property queries
5. Writes a spike/report documenting whether ORIGIN-scoped query metrics are trustworthy

Only after that comparison should daily query persistence begin — and only for ORIGIN scope.

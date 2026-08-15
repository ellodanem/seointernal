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

## Phase 3 verification note (must do before trusting query storage)

Phase 1 did **not** fully prove that page-filtered Search Analytics returns the exact **primary-origin query metrics** we intend to store under `scopeType=ORIGIN`.

Before finalizing Phase 3 ingestion:

1. **Prove** primary-origin page-filtered GSC query metrics against the real API.
2. Implement **finalized-day** ingestion only.
3. Persist **PROPERTY** and **ORIGIN** scopes via `scopeType` / `scopeValue`.
4. Perform **idempotent** backfill (unique constraints already in schema).
5. Ingest pages and queries (no schema-level row-count cap; record truncation if the API request is capped).
6. Add sitemap snapshots (useful fields only; never treat `indexed` as a metric).
7. Use `job_runs` for worker run tracking (table already present).
8. **Do not** build recommendations yet.

### Recommended first Phase 3 implementation step

Add a read-only GSC client in the worker that:

1. Loads the primary `GscProperty` for SRP
2. Resolves the latest finalized date
3. Fetches one day of property totals + page rows
4. Fetches query rows **with a page/origin filter** for `https://www.simplerosterplus.com` and compares to unfiltered property queries
5. Writes a spike/report (or first idempotent upsert) documenting whether ORIGIN-scoped query metrics are trustworthy

Only after that comparison should daily query persistence be considered complete.

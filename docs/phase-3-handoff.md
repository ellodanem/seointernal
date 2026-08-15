# Phase 2 scope & Phase 3 handoff (historical)

Phase 3 is implemented. See **`docs/phase-4-handoff.md`** and **`docs/architecture.md`** for current state.

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

## Phase 3 order (completed)

```
filtered-query proof
  → finalized-day ingestion
  → idempotent upserts
  → catch-up / backfill
  → sitemap snapshots
  → job tracking
  → scheduler / CLI / Docker mount
```

### Filtered-query proof result

Search Analytics page filter (`contains` + primary origin) excludes `app.` hosts from page and query×page results. ORIGIN query persistence is the v0.1 model.

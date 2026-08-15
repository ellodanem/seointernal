# SEO Operations Console

Internal multi-project SEO operations console. **Not** part of Simple Roster Plus.

Phase 2 delivers the application foundation only: auth, schema, Docker shape, and a minimal UI shell. Search Console ingestion starts in Phase 3.

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Node.js + TypeScript + Hono |
| Frontend | Vite + React + TypeScript |
| Database | PostgreSQL + Prisma |
| Auth | Better Auth (Google) + owner email allowlist |
| Process shape | `web` + `worker` (same image) |
| Deploy | Docker Compose–first, host-portable |

## Quick start (Docker)

```bash
cp .env.example .env
# Edit OWNER_EMAILS, BETTER_AUTH_SECRET, Google OAuth values

docker compose up --build
```

- App: http://localhost:3000
- Postgres: localhost:5433 (`seo` / `seo` / `seo_ops`) — host port **5433** avoids clashing with other local Postgres containers on 5432

Seed Project #1 after sign-in via **Seed Simple Roster Plus**, or:

```bash
docker compose run --rm web seed
```

## Quick start (local Node + Docker Postgres)

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate dev
npm run db:seed
npm run dev:server   # terminal 1 — http://localhost:3000
npm run dev:web      # terminal 2 — http://localhost:5173 (proxies /api)
npm run dev:worker   # terminal 3 — idle worker
```

## Documentation

- [Architecture](docs/architecture.md)
- [Local setup & auth](docs/local-setup.md)
- [Phase 2 scope & Phase 3 handoff](docs/phase-3-handoff.md)
- Phase 1 evidence: `phase1-gsc-spike-report.md`
- SRP audit: `srp-seo-implementation-audit.md`

## Project #1 (seed)

| Field | Value |
|-------|--------|
| Display name | Simple Roster Plus |
| Slug | `simple-roster-plus` |
| Primary origin | `https://www.simplerosterplus.com` |
| GSC property | `sc-domain:simplerosterplus.com` (DOMAIN) |
| Sitemap | `https://www.simplerosterplus.com/sitemap.xml` |

## Security notes

- Never commit `.env` or service-account JSON.
- GSC credentials live outside the repo (`GOOGLE_APPLICATION_CREDENTIALS`).
- App boots without GSC credentials; Phase 2 does not call Search Console.

## Default branch

Local default branch is **`main`** (renamed from `master` before any remote exists).

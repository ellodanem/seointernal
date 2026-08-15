# SEO Operations Console

Internal multi-project SEO operations console. **Not** part of Simple Roster Plus.

Phase 3 delivers production **read-only Google Search Console ingestion** on top of the Phase 2 foundation. The owner dashboard is Phase 4.

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Node.js + TypeScript + Hono |
| Frontend | Vite + React + TypeScript |
| Database | PostgreSQL + Prisma |
| Auth | Better Auth (Google) + owner email allowlist |
| GSC | Service account + `googleapis` (read-only) |
| Process shape | `web` + `worker` (same image) + CLI ingest |
| Deploy | Docker Compose–first, host-portable |

## Quick start (Docker)

```bash
cp .env.example .env
# Edit OWNER_EMAILS, BETTER_AUTH_SECRET, Google OAuth values

docker compose up --build
```

With GSC credentials mounted (never baked into the image):

```bash
# PowerShell
$env:GSC_SA_HOST_PATH = "C:\Users\Dane\.seo-console\gsc-sa.json"
docker compose -f docker-compose.yml -f docker-compose.gsc.yml up --build
```

- App: http://localhost:3000
- Postgres: localhost:5433 (`seo` / `seo` / `seo_ops`)

## Quick start (local Node + Docker Postgres)

```bash
cp .env.example .env
# Set GOOGLE_APPLICATION_CREDENTIALS to your SA JSON path
docker compose up -d postgres
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev:server   # terminal 1 — http://localhost:3000
npm run dev:web      # terminal 2 — http://localhost:5173 (proxies /api)
npm run dev:worker   # terminal 3 — scheduled GSC ingest
```

Manual ingest / proof:

```bash
npm run gsc:proof
npm run gsc:ingest -- --backfill-days 28 --max-days 28
npm run gsc:smoke
```

## Documentation

- [Architecture](docs/architecture.md) (Phase 3)
- [Local setup](docs/local-setup.md)
- [Phase 4 handoff](docs/phase-4-handoff.md)
- Phase 1 evidence: `phase1-gsc-spike-report.md`

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
- App boots without GSC credentials; ingestion reports unavailable configuration.
- OAuth callback query strings are redacted from HTTP logs.

## Default branch

Local default branch is **`main`**. There is currently **no git remote**.

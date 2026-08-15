# Local setup

## Prerequisites

- Node.js 20+
- Docker (for Postgres and/or full stack)
- Google Cloud OAuth client (for owner login)
- GSC service-account JSON outside the repo (for Phase 3 ingest)

## Environment

```bash
cp .env.example .env
```

Required for a usable login:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string (local Compose maps host `5433` → container `5432`) |
| `BETTER_AUTH_SECRET` | ≥32 character secret |
| `BETTER_AUTH_URL` | Public base URL of the API (e.g. `http://localhost:3000`) |
| `APP_BASE_URL` | Same as above for local single-host |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth web client |
| `OWNER_EMAILS` | Comma-separated allowlisted owner emails |
| `WEB_ORIGIN` | Vite origin in dev (`http://localhost:5173`) |

Phase 3 ingest:

| Variable | Purpose |
|----------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to GSC SA JSON (required for ingest; optional for web boot) |
| `GSC_INGEST_INTERVAL_MS` | Worker ingest cadence (default 6h) |
| `GSC_INGEST_ON_START` | `true`/`false` — ingest shortly after worker boot |
| `GSC_ROW_LIMIT` | Search Analytics request ceiling (default 5000) |
| `GSC_MAX_DAYS_PER_RUN` | Max finalized days per run (default 28) |
| `GSC_INITIAL_BACKFILL_DAYS` | Catch-up window ending at latest finalized date (default 28) |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` |
| `WORKER_IDLE_MS` | Worker heartbeat interval |

### Google OAuth setup

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web).
2. Authorized JavaScript origins: `http://localhost:3000`, `http://localhost:5173`
3. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Put client ID/secret in `.env`
5. Set `OWNER_EMAILS` to your Google account email

### GSC service account

Do **not** copy the key into the repo. Point `GOOGLE_APPLICATION_CREDENTIALS` at an external path, e.g.:

- Windows: `C:\Users\Dane\.seo-console\gsc-sa.json`
- Docker: mount via `docker-compose.gsc.yml` to `/run/secrets/gsc-sa.json`

## Database

```bash
docker compose up -d postgres
npm install
npx prisma migrate deploy
npm run db:seed
```

## Run processes

```bash
npm run dev:server   # :3000
npm run dev:web      # :5173 proxies /api → :3000
npm run dev:worker   # scheduled GSC ingest + heartbeat
```

### Manual ingest / backfill

```bash
npm run gsc:ingest
npm run gsc:ingest -- --only-dates 2026-08-13
npm run gsc:ingest -- --backfill-days 28 --max-days 28
npm run gsc:proof    # filtered-query decision gate
npm run gsc:smoke    # live one-day + idempotency smoke
```

Docker (after images are built; requires `docker-compose.gsc.yml` mount):

```bash
docker compose -f docker-compose.yml -f docker-compose.gsc.yml run --rm worker ingest -- --project simple-roster-plus --max-days 1
```

Or full Docker stack **without** GSC key:

```bash
docker compose up --build
```

With GSC key mounted (host path required):

```bash
# PowerShell
$env:GSC_SA_HOST_PATH = "C:\Users\Dane\.seo-console\gsc-sa.json"
docker compose -f docker-compose.yml -f docker-compose.gsc.yml up --build
```

Open http://localhost:3000 — sign in, then **Seed Simple Roster Plus** if needed. Open a project to view the Phase 4 owner dashboard.

Dashboard semantics: **`docs/dashboard.md`**.

## Verification

```bash
npm run typecheck
npm run build
npm run verify:phase2
npm run verify:phase3   # unit + DB integration
npm run verify:phase4   # dashboard unit + real-data reconciliation
npm run gsc:smoke       # optional live GSC
```

## Auth verification without automating Google

1. Allowlisted email can sign in and open `/` (Projects) and `/projects/simple-roster-plus`.
2. Non-allowlisted Google account is rejected.
3. Signed-out requests to `/api/projects` and `/api/projects/:slug/dashboard` return 401.
4. `/api/health` works without a session.

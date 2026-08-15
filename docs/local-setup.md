# Local setup

## Prerequisites

- Node.js 20+
- Docker (for Postgres and/or full stack)
- Google Cloud OAuth client (for owner login)

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

Optional Phase 2 / Phase 3:

| Variable | Purpose |
|----------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GSC service-account JSON (not required to boot) |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` |
| `WORKER_IDLE_MS` | Worker heartbeat interval |

### Google OAuth setup

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web).
2. Authorized JavaScript origins: `http://localhost:3000`, `http://localhost:5173`
3. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Put client ID/secret in `.env`
5. Set `OWNER_EMAILS` to your Google account email

Unauthorized Google accounts are rejected at user/session creation (no access).

### GSC service account (Phase 3)

Do **not** copy the key into the repo. Point `GOOGLE_APPLICATION_CREDENTIALS` at an external path, e.g.:

- Windows: `C:\Users\Dane\.seo-console\gsc-sa.json`
- Docker: mount to `/run/secrets/gsc-sa.json` and set the env var to that path

## Database

```bash
docker compose up -d postgres
npm install
npx prisma migrate dev --name init
npm run db:seed
```

## Run processes

```bash
npm run dev:server   # :3000
npm run dev:web      # :5173 proxies /api → :3000
npm run dev:worker   # idle worker
```

Or full Docker stack:

```bash
docker compose up --build
```

Open http://localhost:3000 — sign in, then **Seed Simple Roster Plus**.

## Auth verification without automating Google

Automated CI cannot complete a real Google consent screen safely here. Manual checklist:

1. Allowlisted email can sign in and open `/` (Projects).
2. Non-allowlisted Google account is rejected (forbidden / no session).
3. Signed-out requests to `/api/projects` return 401.
4. `/api/health` works without a session.

## Migrations

- Dev: `npx prisma migrate dev`
- Deploy / Docker entrypoint: `npx prisma migrate deploy`
- Seed: `npm run db:seed` or UI button / `docker compose run --rm web seed`

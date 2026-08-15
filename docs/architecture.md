# Architecture (Phase 2)

## Purpose

Portable internal SEO Operations Console. Multi-**project** data model (not multi-tenant SaaS). One owner, Google allowlist, no public registration.

Simple Roster Plus is Project #1. Future projects (Track Lucia, TidyCorePlus, etc.) share the same schema without SRP-specific enums.

## Process shape

One codebase / one Docker image, two entrypoints:

| Process | Entry | Responsibility |
|---------|-------|----------------|
| **web** | `apps/server/dist/index.js` | Hono HTTP API, Better Auth, static UI |
| **worker** | `apps/server/dist/worker.js` | DB heartbeat today; GSC jobs in Phase 3 |

No Redis, BullMQ, or proprietary queues. Phase 3 can use a simple in-process schedule loop.

## Property vs primary origin

Phase 1 proved a GSC **Domain** property is not the same as the managed SEO surface:

| Concept | Example (SRP) |
|---------|----------------|
| **Project.primaryOrigin** | `https://www.simplerosterplus.com` |
| **GscProperty.siteUrl** | `sc-domain:simplerosterplus.com` |

Domain properties can include `www`, `app`, protocol variants, and other hosts. Metrics tables use `scopeType` `PROPERTY` | `ORIGIN` plus `scopeValue` so dashboards can separate whole-property diagnostics from primary-origin performance.

Page rows store full `url` + `host` + `path`. There is **no** `marketing | app` surface enum.

## Schema overview

**Auth (Better Auth):** `auth_user`, `auth_session`, `auth_account`, `auth_verification`

**Domain:** `projects`, `gsc_properties`, `pages`, `gsc_daily_totals`, `gsc_page_daily`, `gsc_query_daily`, `gsc_query_page_rollups`, `gsc_sitemap_snapshots`, `gsc_url_inspections`, `job_runs`

Cascade: deleting a project removes its properties, pages, and GSC metric rows. URL inspections null out `pageId` if a page is deleted.

`sitemapUrl` lives on **Project** as expected primary-sitemap config for the managed SEO surface. GSC sitemap API snapshots are separate history rows on `gsc_sitemap_snapshots`.

## Auth

- Better Auth + Google OAuth
- `OWNER_EMAILS` allowlist (env)
- Hooks reject non-allowlisted user/session creation
- API routes under `/api/projects` require an allowlisted session

## GSC credentials

`GOOGLE_APPLICATION_CREDENTIALS` points at a service-account JSON **outside** the image/repo. Phase 2 does not call GSC; boot succeeds if the path is unset.

## Repo layout

```
apps/server   Hono API + worker
apps/web      Vite React UI
prisma        Schema, migrations, seed
docs          Architecture / setup / Phase 3 handoff
spike-gsc     Phase 1 spike (reference; out/ ignored)
```

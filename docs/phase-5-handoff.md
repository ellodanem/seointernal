# Phase 4 complete — Phase 5 handoff

## Phase 4 delivered

- Owner dashboard on `/projects/:slug`
- `GET /api/projects/:slug/dashboard`
- ORIGIN-scoped headline metrics + trend
- Top pages (primary origin), top queries (ORIGIN), Other hosts, Sitemap, freshness/connection
- Deterministic visibility summary (no SEO score, no recommendations)
- Period windows anchored to latest finalized stored date (7 / 28; 90 when history allows)
- Optional history extension via existing `gsc:ingest --backfill-days 56` (SRP now has 56 ORIGIN days)

## Docs

- `docs/dashboard.md` — data sources, periods, comparisons, caveats
- `docs/architecture.md` — still authoritative for ingest; dashboard reads those tables

## What the SRP dashboard revealed

- Primary-origin visibility is low but non-zero (clicks in the single digits over 28 days; ~1k impressions).
- Prior 28 days are extremely thin (~6 impressions), so trend classification stays **insufficient** despite a full comparison window.
- `app.simplerosterplus.com` still appears in page history (informational Other hosts).
- Sitemap snapshot is healthy (7 submitted, 0 errors/warnings).

## Recommended Phase 5 (narrow)

Smallest next step toward “what should I work on next, and why?”:

**Cautious page-level attention list** — not a full recommendation engine.

Suggested scope:

1. From ORIGIN top pages + query×page rollup, surface 3–5 pages that matter (impressions, clicks, or clear zero-click visibility).
2. For each, show *facts only* plus one cautious template reason (e.g. “appears often, few clicks”) with explicit uncertainty.
3. Still no AI copy, no content briefs, no Git publish, no URL Inspection product UI unless needed to answer indexing questions for those pages.

Defer: scoring, alerts, competitors, GA4, Bing, agency features.

## Do not reopen

- Warehouse / Redis / queues
- PROPERTY query daily persistence without a use case
- Daily query×page history
- SEO score

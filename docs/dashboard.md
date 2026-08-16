# Owner dashboard (Phase 5)

## Purpose

One project-scoped screen that answers:

1. *What is happening with this project's Google search visibility?*
2. *Which few primary-origin pages deserve attention right now?*

No SEO score. No AI recommendations. Descriptive metrics plus a cautious, deterministic attention list.

## Route / API

- UI: `/projects/:slug`
- API: `GET /api/projects/:slug/dashboard?period=28`

Period query accepts `7`, `28`, or `90`. Only periods with a full current window of stored ORIGIN daily totals are offered in the UI. Default is **28**.

Response includes `attention` (derived page attention). Details: **`docs/attention.md`**.

## PROPERTY vs ORIGIN

| UI area | Source | Scope |
|---------|--------|-------|
| Headline clicks / impressions / CTR / position | `gsc_daily_totals` | **ORIGIN** (`primaryOrigin`) |
| Trend chart | `gsc_daily_totals` | **ORIGIN** |
| Top pages | `gsc_page_daily` | pages under `primaryOrigin` only |
| Top queries | `gsc_query_daily` | **ORIGIN** only (v0.1 ingest) |
| Attention & Opportunities | page daily + query×page rollup | **primaryOrigin only** |
| Other hosts | `gsc_page_daily` | hosts/URLs **outside** primary origin |
| Sitemap | latest `gsc_sitemap_snapshots` | useful fields only |

Whole-property (`PROPERTY`) totals remain in the database for diagnostics and ingest completeness. They do **not** drive the primary dashboard cards or attention rules.

## Reporting periods

Windows anchor to the **latest finalized ORIGIN date stored**, never “today”.

Example with latest finalized `2026-08-13` and period 28:

- Current: `2026-07-17` → `2026-08-13`
- Previous: `2026-06-19` → `2026-07-16`

Banner copy: **Search data through \<date\>** plus a note that Search Console is delayed.

## Comparisons

For each metric the API returns current value, previous value (when the previous window is fully stored), absolute delta, and:

- counts → relative % when previous ≠ 0 (never `+∞%`)
- CTR → percentage-point change
- average position → “positions improved” (`previous − current`), not a percentage

## Visibility summary (deterministic)

High-level sentence only. Thresholds:

| Rule | Value |
|------|-------|
| Minimum impressions per period | 100 |
| Absolute impressions floor for “stable” | 40 |
| Relative impressions floor for “stable” | 15% |

Categories: `improving` | `stable` | `declining` | `insufficient`.

Raw metric deltas remain visible even when the summary says insufficient.

## Attention & Opportunities

Section **What deserves attention?** sits after the trend chart and before Top pages.

- At most 3–5 page cards (prefer 3 while data is immature)
- Plain-English reason + suggested stance + confidence
- Supporting queries optional/expandable
- Empty list is valid

Full rule docs: **`docs/attention.md`**.

## GSC aggregation caveat

Do **not** sum query or page rows to rebuild headline totals. Search Console dimension datasets can disagree with unfiltered aggregates. The UI shows a short note when helpful.

## Other hosts

Informational grouping of non-primary page hosts (e.g. `app.simplerosterplus.com`, `http://www…`). Not an alarm and not fed into attention rules.

## Sitemap

Shows path, submitted count, last downloaded, pending, warnings, errors. Never displays deprecated `indexed`. Not an attention source in Phase 5.

## Low-data behavior

Neutral copy for zero clicks, sparse queries, missing previous windows, empty projects, and empty attention lists. Low volume is not treated as an outage.

## Tests

```bash
npm run test:dashboard
npm run test:attention
npm run verify:phase4
npm run verify:phase5
```

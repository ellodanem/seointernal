# Owner dashboard (Phase 6)

## Purpose

One project-scoped screen that answers:

1. *What is happening with this project's Google search visibility?*
2. *Which few primary-origin pages deserve attention right now?*
3. *Are the pages we expect Google to index actually indexed?*

No SEO score. No AI recommendations. Descriptive metrics, cautious attention, and indexing awareness.

## Route / API

- UI: `/projects/:slug`
- API: `GET /api/projects/:slug/dashboard?period=28`

Period query accepts `7`, `28`, or `90`. Only periods with a full current window of stored ORIGIN daily totals are offered in the UI. Default is **28**.

Response includes:

- `attention` — derived performance attention (after indexing composition)
- `indexing` — URL Inspection summary + per-page rows

Details: **`docs/attention.md`**, **`docs/indexing.md`**.

## PROPERTY vs ORIGIN

| UI area | Source | Scope |
|---------|--------|-------|
| Headline clicks / impressions / CTR / position | `gsc_daily_totals` | **ORIGIN** (`primaryOrigin`) |
| Trend chart | `gsc_daily_totals` | **ORIGIN** |
| Top pages | `gsc_page_daily` | pages under `primaryOrigin` only |
| Top queries | `gsc_query_daily` | **ORIGIN** only (v0.1 ingest) |
| Attention & Opportunities | page daily + query×page rollup | **primaryOrigin only** |
| Indexing | `gsc_url_inspections` + `pages` | **INDEXABLE inventory only** |
| Other hosts | `gsc_page_daily` | hosts/URLs **outside** primary origin |
| Sitemap | latest `gsc_sitemap_snapshots` | useful fields only |

Whole-property (`PROPERTY`) totals remain in the database for diagnostics and ingest completeness. They do **not** drive the primary dashboard cards or attention rules.

## Reporting periods

Windows anchor to the **latest finalized ORIGIN date stored**, never “today”.

Banner copy: **Search data through \<date\>** plus a note that Search Console is delayed.

Indexing freshness is separate: **Indexing checked \<date\>**.

## Attention & Opportunities

Section **What deserves attention?** sits after the trend chart and before Indexing / Top pages.

- Indexing contradictions listed first (when present)
- At most 3–5 performance cards (prefer 3 while data is immature)
- Performance cards for a page are suppressed when that page has an indexing contradiction
- Empty list is valid

Full rule docs: **`docs/attention.md`**. Indexing: **`docs/indexing.md`**.

## Indexing

Section **Indexing** shows managed INDEXABLE pages only.

- Summary: expected count, indexed, needs review (no Indexing Score)
- Compact table (wide) / cards (narrow)
- Detail disclosure: coverage, robots, fetch, canonicals, crawled-as
- “Not checked yet” is distinct from “Not indexed”

## Other hosts / Sitemap

Other hosts remain informational. Sitemap shows useful fields only; never treat submitted as indexed.

## Tests

```bash
npm run test:dashboard
npm run test:attention
npm run test:indexing
npm run verify:phase4
npm run verify:phase5
npm run verify:phase6
```

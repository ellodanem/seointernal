# SEO Operations Console — Phase 1 GSC Spike Report

**For:** ChatGPT  
**From:** Cursor (workspace `C:\Cursor Projects\seointernal`)  
**Date:** 15 August 2026  
**Mode:** Technical spike only. No app scaffold. No Phase 2.

**Raw evidence:** `spike-gsc/out/spike-report.json` (redacted; no private keys)

---

## A. Google Setup Used

| Item | Value |
|------|--------|
| Cloud project | New project `seo-ops-console` (not tied to SRP product GCP / Vercel / Clerk) |
| Auth method | Service account JWT (`googleapis` + `GoogleAuth` key file) |
| SA email | `seo-console-gsc-reader@seo-ops-console.iam.gserviceaccount.com` |
| Scope | `https://www.googleapis.com/auth/webmasters.readonly` |
| GSC grant | SA added as **Restricted** user on the SRP property (`siteRestrictedUser`) |
| Credential storage | Moved out of repo to `C:\Users\Dane\.seo-console\gsc-sa.json` (not committed) |

Cloud IAM project roles were **not** required. Access is entirely via Search Console Users and permissions.

---

## B. Exact SRP Search Console Property

| Item | Verified value |
|------|----------------|
| Exact property identifier | **`sc-domain:simplerosterplus.com`** |
| Property type | **Domain** |
| Other properties visible to SA | **None** (no URL-prefix property listed) |

**Implication for www vs app**

Because this is a **Domain** property, Search Analytics includes hosts under `simplerosterplus.com`, not only `www`.

Confirmed in a 28-day page query:

- Marketing: `www.simplerosterplus.com` (dominant)
- App host **does appear**: `https://app.simplerosterplus.com/` and `https://app.simplerosterplus.com/sign-up` (impressions, 0 clicks in the sample window)
- Also saw `http://www.simplerosterplus.com/` as a separate page row (protocol variant)

There is **no separate URL-prefix-only property** visible to this SA. If a URL-prefix property exists in the owner’s GSC UI but was not shared with the SA, it was not tested. For the console, treat **`sc-domain:simplerosterplus.com`** as the integration property.

---

## C. Latest Finalized Data

| Item | Value |
|------|--------|
| Spike run date | 2026-08-15 |
| Latest **finalized** date (`dataState=final`) | **2026-08-13** |
| Observed lag | **~2 days** (final through day-before-yesterday) |
| Fresh probe (`dataState=all`) | Rows through 2026-08-15; metadata `firstIncompleteDate` = **2026-08-14** |

**Architecture note:** Persist only `dataState=final`. Do not treat “today/yesterday” fresh rows as history. Daily ingest of the previous finalized day is correct.

---

## D. Real Search Analytics Shape

### Totals (finalized day 2026-08-13, no dimensions)

| Metric | Value |
|--------|--------|
| clicks | 1 |
| impressions | 43 |
| ctr | ~2.3% |
| position | ~32.0 |
| `responseAggregationType` | `byProperty` |

Row shape is stable: `{ clicks, impressions, ctr, position }` plus `keys[]` when dimensions are requested.

### Pages

| Window | Rows returned | Hosts |
|--------|---------------|--------|
| Final day | **6** | www only |
| 28-day | **11** | www (9) + **app (2)** |

URLs look like real SRP marketing paths (`/`, `/employee-scheduling-software`, `/zkteco-attendance-integration`, etc.). App URLs appear only because the property is Domain-scoped.

### Queries

| Window | Rows returned |
|--------|---------------|
| Final day | **14** |
| 28-day | **51** |

Payload is ordinary query strings + metrics. No need to invent recommendation logic yet.

### Query × page

| Window | Rows returned | Hit 5,000 cap? |
|--------|---------------|----------------|
| Final day | **19** | no |
| 28-day | **69** | no |

### Volume verdict for ChatGPT

| Phase 0 idea | After real data |
|--------------|-----------------|
| Top ~1,000 daily queries | **Unnecessarily high for SRP** — ~14/day, ~51/28d |
| Cap queries dynamically | Optional nicety; a fixed **top 200–500** (or even **100**) is plenty |
| Full daily query storage | **Still reasonable** at this scale (tiny) |
| Query×page rolling snapshot vs daily pairs | **Rolling 28-day snapshot remains preferable** — not because volume is huge, but because pair cardinality is sparse and daily pairs add little for a 7-page site |

PostgreSQL as proposed is **proportionate**; this is nowhere near warehouse scale.

---

## E. Sitemap API Findings

Returned one sitemap:

| Field | Value |
|-------|--------|
| path | `https://www.simplerosterplus.com/sitemap.xml` |
| lastSubmitted | 2026-07-17 |
| lastDownloaded | 2026-08-15 |
| isPending | false |
| isSitemapsIndex | false |
| type | sitemap |
| warnings / errors | 0 / 0 |
| contents[].type | web |
| contents[].submitted | **7** (matches known indexable page count) |
| contents[].indexed | Present in JSON as `"0"` but **deprecated — do not use** |

**Useful for v0.1:** path, lastDownloaded, errors/warnings, submitted count, pending flag.  
**Ignore:** `indexed`.

---

## F. URL Inspection Findings

Inspected: `https://www.simplerosterplus.com/` against `sc-domain:simplerosterplus.com`  
(Index status only — not a live URL test.)

| Field | Value |
|-------|--------|
| verdict | PASS |
| coverageState | Submitted and indexed |
| indexingState | INDEXING_ALLOWED |
| robotsTxtState | ALLOWED |
| pageFetchState | SUCCESSFUL |
| lastCrawlTime | 2026-07-27T03:38:56Z |
| googleCanonical | `https://www.simplerosterplus.com/` |
| userCanonical | `https://www.simplerosterplus.com/` |
| crawledAs | MOBILE |
| Extra | `inspectionResultLink`, `mobileUsabilityResult`, referringUrls, sitemap refs |

**Verdict:** Useful enough for watched pages. Weekly inspection of ~7 marketing URLs is more than enough vs quota.

---

## G. Error Behavior

| Case | HTTP / code | Message / reason | Owner-facing UI hint |
|------|-------------|------------------|----------------------|
| Inaccessible / unknown property | **403** `forbidden` | insufficient permission for site | “This Search Console property isn’t shared with the console service account.” |
| Bad property identifier | **400** `invalidParameter` | not a valid Search Console site URL | “Property ID looks wrong. Expected `sc-domain:…` or `https://…/`.” |
| Malformed URL Inspection (bad URL + unrelated site) | **403** `PERMISSION_DENIED` | do not own site / URL not part of property | “URL isn’t under the configured property.” |
| Missing credentials (local) | client `MISSING_CREDENTIALS` | key file not found | “Service account key not configured.” |

Do not revoke live credentials to test auth failure; missing-file path is enough for v0.1 ops messaging.

---

## H. Phase 0 Assumptions — Confirmed / Changed

| Assumption | Confirmed? | Evidence | Architecture impact |
|------------|------------|----------|---------------------|
| 1. Service account works for this internal use case | **Yes** | SA + Restricted GSC user; readonly scope; all spike calls succeeded | Keep SA model; no user OAuth for v0.1 |
| 2. Exact GSC property format | **Yes — Domain** | Only `sc-domain:simplerosterplus.com` visible | Store that exact `siteUrl`; do not hard-code URL-prefix |
| 3. Data freshness/delay | **Yes ~2 days** | Final through 2026-08-13 on 2026-08-15; incomplete from 2026-08-14 | Ingest finalized day only |
| 4. Daily finalized ingestion is sensible | **Yes** | Continuous finalized date series | Keep daily job |
| 5. Property-level daily metrics storable as proposed | **Yes** | Single aggregate row/day with clicks/impr/ctr/position | Keep `property_daily` (or equivalent) |
| 6. Page-level daily metrics storable as proposed | **Yes** | 6 rows/day; stable URL keys | Keep `page_daily`; **also store host** or filter app host in UI |
| 7. Query-level daily metrics storable as proposed | **Yes** | 14 rows/day | Keep, but **lower row cap** (not 1000) |
| 8. Query×page only as rolling-period dataset | **Yes (reinforced)** | 69 pairs / 28d; tiny but sparse | Keep rolling snapshot; skip daily pair warehouse |
| 9. URL Inspection useful for watched pages | **Yes** | Rich indexStatusResult for homepage | Keep watched-page weekly inspect |
| 10. Weekly inspection sufficient for SRP | **Yes** | 7 pages; last crawl already days old | Weekly is enough |
| 11. Sitemap data useful | **Partial yes** | path, download time, errors, submitted=7 useful; indexed useless | Persist useful fields; ignore deprecated indexed |
| 12. Domain property can expose app-host URLs | **Yes — confirmed** | app `/` and `/sign-up` in 28d page rows | Console must treat app URLs as first-class signal (noindex risk), not ignore them |

---

## I. Recommended Persistence Shape After Seeing Real Data

Keep PostgreSQL for the product later, but **shrink** Phase 0 volume assumptions:

1. **`gsc_property_daily`** — one row per property per finalized date (clicks, impressions, ctr, position).
2. **`gsc_page_daily`** — page URL + metrics per finalized date. Expect tens of rows max for SRP. Include host or a `surface` flag (`marketing` / `app` / `other`).
3. **`gsc_query_daily`** — query + metrics per finalized date. Cap at **top ~100–200 by clicks** (or impressions fallback), not 1000.
4. **`gsc_query_page_rollup`** — replace daily pairs with a **rolling 28-day** snapshot (refresh weekly or daily overwrite). Cap ~500 rows; SRP returned 69.
5. **`gsc_sitemap_snapshot`** — path, lastDownloaded, errors, warnings, submitted counts; **never trust `indexed`**.
6. **`gsc_url_inspection`** — watched URLs only; store verdict, coverageState, canonicals, lastCrawlTime, pageFetchState, robotsTxtState, inspected_at.

No need for BigQuery, partitioning drama, or dynamic capability negotiation yet.

---

## J. Recommended Phase 2 Changes

1. **Hard-code / configure property as** `sc-domain:simplerosterplus.com` after discovery — still call `sites.list` on first connect to verify SA access.
2. **Add an app-host filter / alert path** in the UI: Domain property *will* show `app.simplerosterplus.com` impressions; this validates the audit’s noindex concern with live data.
3. **Lower query retention caps**; 1000/day is wasteful noise for SRP.
4. **Sitemap card:** show submitted count + last download + errors; do not display indexed from API.
5. **Ingest worker:** finalize-date cursor; skip `dataState=all` for history.
6. **Do not** scaffold capability negotiation; infer from configured GSC integration.
7. Still **no** Git/repo manifest/AI/backlinks in v0.1.

Phase 2 can now scaffold the app stack (Hono + Vite + React + Postgres later) with these constraints. **This spike does not start Phase 2.**

---

## K. Spike Files Created

Disposable; safe to delete when Phase 2 begins:

| Path | Purpose |
|------|---------|
| `spike-gsc/package.json` | Only dependency: `googleapis` |
| `spike-gsc/package-lock.json` | Lockfile |
| `spike-gsc/node_modules/` | Installed deps |
| `spike-gsc/run.mjs` | Spike runner |
| `spike-gsc/SETUP.md` | Owner Google setup notes |
| `spike-gsc/README.md` | How to run |
| `spike-gsc/.gitignore` | Local ignores |
| `spike-gsc/out/spike-report.json` | Redacted evidence dump |
| Workspace `.gitignore` | Blocks SA JSON patterns |

**Credentials (not in git):** `C:\Users\Dane\.seo-console\gsc-sa.json`  
(Original download was moved out of the project root.)

---

## L. Questions for ChatGPT

Only items that materially affect Phase 2:

1. **App-host policy in v0.1 UI:** Should Domain-property `app.simplerosterplus.com` rows be shown by default, filtered out of marketing dashboards, or elevated as a dedicated “indexation risk” panel?
2. **Query daily cap for schema defaults:** Prefer fixed **100**, **200**, or impression-floor based retention given ~14 queries/final day?
3. **Confirm no second GSC property** should be wired even if a URL-prefix property exists in the owner UI but wasn’t shared with the SA.

---

## Bottom line

Phase 1 **succeeded**. Real SRP Search Console data was read with a service account. The property is **`sc-domain:simplerosterplus.com`**. Finalized lag is ~2 days. Data volume is tiny. App-host URLs **do** appear. Phase 0’s SA + daily finalized + rolling query×page model holds; shrink query caps and plan for app-host visibility.

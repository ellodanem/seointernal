# Indexing Awareness (Phase 6)

## Purpose

Answer: *Are the pages we expect Google to index actually indexable and indexed?*

Performance data (Phases 3–5) cannot answer this reliably. A page with zero impressions may be indexed with no visibility — or not indexed at all. Phase 6 uses the Search Console **URL Inspection** API for managed inventory intent.

## Eligibility (authoritative)

Inspect only pages where:

- `pages.role = INDEXABLE`
- URL belongs to the project's `primaryOrigin`

Do **not** inspect:

- `NOINDEX` / `UNKNOWN` pages
- app-host or other-host URLs
- arbitrary GSC-discovered URLs

Inventory intent comes from the managed `pages` table (seeded/configured), never from hard-coded Phase 6 URL lists.

## Architecture

| Piece | Location |
|-------|----------|
| Client `inspectUrl` | `apps/server/src/gsc/client.ts` (Search Console v1) |
| Normalization | `normalize-indexing.ts`, `canonical.ts` |
| Eligibility / freshness | `eligibility.ts`, `inspection-freshness.ts` |
| Job | `apps/server/src/jobs/gsc-url-inspection.ts` (`gsc_url_inspection`) |
| CLI | `npm run gsc:inspect` |
| Dashboard | `indexing` field on `GET /api/projects/:slug/dashboard` |
| UI | Indexing section + indexing cards under Needs attention |

## Persistence

Table: `gsc_url_inspections` (Phase 2 table, extended in Phase 6).

**Snapshot strategy:** append-only observations.

- Successful inspections → full snapshot (`success=true`) with normalized fields
- Failed attempts → `success=false` with `errorCode` / `errorMessage` only (no fabricated UNKNOWN status)
- Dashboard latest state = newest `success=true` row per page
- Failed refresh never overwrites the last known good observation

Compact `rawResult` JSON stores stable index-status fields for debugging (not the entire API envelope).

## Normalized status

Deterministic mapping (prefer `UNKNOWN` over false claims):

| Status | When |
|--------|------|
| `INDEXED` | Coverage clearly indicates indexed as itself (e.g. “Submitted and indexed”) |
| `NOT_INDEXED` | Coverage indicates not indexed / discovered / crawled-not-indexed / unknown URL |
| `BLOCKED` | Robots disallowed or indexing state/coverage indicates blocked |
| `CANONICALIZED_ELSEWHERE` | Google chose a different canonical (coverage text or non-equivalent `googleCanonical`) |
| `UNKNOWN` | Ambiguous / incomplete evidence |

## Canonical comparison

Conservative normalization for equality:

- lowercase host
- trivial trailing-slash equivalence
- safe percent-decoding

**Not** equivalent: `http` vs `https`, different hosts, different paths.

States: `ALIGNED` | `MISMATCH` | `UNKNOWN`.

## Cadence

- Scheduled weekly (`GSC_INSPECT_INTERVAL_MS`, default 7d)
- Freshness guard (`GSC_INSPECT_FRESHNESS_MS`, default 7d) skips recently successful pages
- `--force` bypasses freshness
- Dedicated advisory lock namespace (`inspect:`) — does not block Search Analytics ingest
- Manual: `npm run gsc:inspect -- --project <slug> [--url <url>] [--force]`

## Dashboard

Separate from Search Analytics freshness:

- Summary counts (expected / indexed / needs review) — no Indexing Score
- Per-page status, last crawl, canonical, last checked
- “Not checked yet” ≠ “Not indexed”
- Sort: blocked → canonical mismatch → not indexed → unknown → indexed

## Indexing attention

Clear contradictions only:

- `INDEXING_BLOCKED`
- `NOT_INDEXED`
- `CANONICAL_MISMATCH`
- `INSPECTION_UNKNOWN` (inconclusive)

Composition: indexing contradictions suppress performance attention for the same page.

## Failure / quota

| Case | Behavior |
|------|----------|
| Single URL failure | Record failed attempt; keep prior success; continue |
| 403 access lost | Fail project/job; preserve history |
| 429 quota | Bounded retry then stop remaining work |
| Job failure | Dashboard can note refresh failure; Search Analytics unaffected |

## Tests

```bash
npm run test:indexing
npm run verify:phase6
```

## Out of scope

AI, indexing request buttons, robots/canonical/sitemap edits, `seo:check` integration, inspecting Other Hosts, SEO scores.

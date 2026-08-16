# Phase 6 complete — Phase 7 handoff

## Phase 6 delivered

- URL Inspection in the production GSC client
- Weekly `gsc_url_inspection` job + `npm run gsc:inspect` CLI
- Append-only `gsc_url_inspections` snapshots with normalized status + canonical state
- Owner dashboard **Indexing** section (separate freshness from Search Analytics)
- Cautious indexing attention + composition that outranks conflicting performance cards
- Managed inventory intent via `pages.role = INDEXABLE` (SRP seed establishes seven marketing URLs)
- Docs: `docs/indexing.md`

## Do not reopen

- Hard-coded inspection URL lists inside the job
- Inspecting every Domain-property / UNKNOWN page
- Indexing request / recrawl buttons
- Automatic robots/canonical/sitemap edits
- Full technical SEO audit / `seo:check` bridge (still deferred)

## Recommended Phase 7 (choose after reading real SRP indexing results)

Pick the **smallest** next step based on inspection outcome:

### If all expected pages are indexed and canonical-aligned

**Prefer wait / observe** — accumulate another Search Analytics reporting period so Phase 5 comparison rules (`VISIBILITY_CHANGE`, confidence) can mature. Building more product surface is optional.

### If clear indexing contradictions appear

Narrow follow-up only:

1. **Owner-facing explanation polish** for the specific contradiction class (still read-only), or
2. **Technical health bridge** — surface SRP's existing deterministic `seo:check` output beside Inspection (still no auto-fix).

### If inventory/indexing is healthy but content gaps dominate

**Query-informed content gaps** (deterministic): informational queries with impressions but no strong primary page — only after attention has a thicker baseline.

## Explicitly defer

AI explanation, Git publish, backlinks, rank tracking, notifications, SEO scores, multi-project comparison.

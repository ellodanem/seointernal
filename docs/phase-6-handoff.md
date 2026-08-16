# Phase 5 complete — Phase 6 handoff

## Phase 5 delivered

- Page-centric **Attention & Opportunities** on the owner dashboard
- Deterministic rules: `WORTH_WATCHING`, `NEAR_STRONGER_VISIBILITY`, `VISIBILITY_CHANGE`, `STRONG_VISIBILITY_LOW_ENGAGEMENT`
- Anti-churn stances (watch / review / leave alone / monitor momentum)
- Confidence: Early / Moderate / Strong from evidence depth
- Supporting queries from ORIGIN query×page rollup
- Derived on demand (not persisted); included in `GET /api/projects/:slug/dashboard`
- Docs: `docs/attention.md`

## SRP acceptance snapshot (28-day, data through 2026-08-13)

Immature (prior period ~6 impressions). Three early-signal cards:

1. `/zkteco-attendance-integration` — Near stronger visibility (pos ~8.6, 110 impr) — Review
2. `/` — Near stronger visibility (pos ~19.8, 280 impr) — Review
3. `/small-business-employee-scheduling` — Worth watching (pos ~61.5, 232 impr) — Watch

Excluded deliberately: sparse pages (\<50 impr), additional deep-position watches beyond the immature cap of 3, non-primary hosts, sitemap.

No HIGH-urgency interventions. No low-engagement / snippet rule fired. Comparison rules correctly suppressed.

## Docs

- `docs/attention.md` — philosophy, rules, thresholds, confidence, anti-churn
- `docs/dashboard.md` — attention section on the project screen
- `docs/architecture.md` — Phase 5 read path

## Recommended Phase 6 (smallest next step)

Based on actual SRP state (early visibility growth, thin history, healthy sitemap, residual other-host noise):

**Accumulate another reporting period of ORIGIN history, then re-evaluate attention quality** — specifically whether `VISIBILITY_CHANGE` and confidence can become useful once prior ≥ ~50–100 impressions per important page.

If a product phase is required sooner, prefer:

1. **Technical/indexing attention (narrow)** — watched URL Inspection for a small set of primary pages that already appear in attention, **or**
2. **Query-informed content gaps** — still deterministic: informational queries with impressions but no strong primary page — only after page attention has a thicker baseline.

Do **not** pull AI explanation, Git publish, or full `seo:check` integration until deterministic attention is trusted across a thicker comparison window.

## Do not reopen

- Persisted recommendation workflow / assignments
- AI-generated advice
- PROPERTY query daily persistence without a use case
- Daily query×page history
- SEO score / opportunity score
- Cannibalization alarms from sparse pairs

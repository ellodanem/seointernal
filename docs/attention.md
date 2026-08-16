# Attention & Opportunities (Phase 5)

## Purpose

Answer: *Which 0–5 primary-origin pages deserve attention right now, why, and how certain are we?*

This is **not** an SEO recommendation engine. Surfacing a page means there is enough evidence to **look**. It does not mean “change this page.”

## Philosophy

- Prefer **restraint** over filling slots.
- Comfortable outcomes: **Watch**, **Review**, **Leave alone**, or **Nothing needs attention yet.**
- Deterministic rules only — no AI, no opportunity scores, no prescribed edits (titles, FAQs, backlinks, etc.).
- Primary-origin pages only. Other hosts stay diagnostic. Sitemap stays status-only.

## Architecture

| Piece | Location |
|-------|----------|
| Thresholds | `apps/server/src/dashboard/attention-thresholds.ts` |
| Pure engine | `apps/server/src/dashboard/attention.ts` |
| Dashboard integration | `getProjectDashboard` → `attention` field |
| UI | “What deserves attention?” on `/projects/:slug` |

**Derived, not persisted.** Items are calculated from stored GSC metrics when the dashboard is requested. No workflow table, snooze, or assignments yet.

API: included on `GET /api/projects/:slug/dashboard` as `attention`. React does not run rules.

## Periods

Same finalized windows as the dashboard (default 28 current vs 28 previous, anchored to latest stored ORIGIN date).

## Rules

One principal category per page (precedence order):

| Order | Category | When | Stance |
|-------|----------|------|--------|
| 1 | `VISIBILITY_CHANGE` | Prior period eligible **and** material abs+rel impression move | Decrease → review; increase → leave alone / monitor momentum |
| 2 | `STRONG_VISIBILITY_LOW_ENGAGEMENT` | Position ≤ 8, ≥150 impressions, CTR \< 1.5%, ≤2 clicks | Review (watch if improving) |
| 3 | `NEAR_STRONGER_VISIBILITY` | Position 8–20, ≥50 impressions | Review if ≥100 impr; else watch. Leave alone if improving |
| 4 | `WORTH_WATCHING` | Position \> 20, ≥50 impressions | Watch (leave alone if improving) |

### Thresholds (frozen for Phase 5)

| Knob | Value |
|------|-------|
| Min page impressions | 50 |
| Stronger evidence | 100 |
| High evidence | 200 |
| Prior comparison eligibility | ≥50 previous impressions + full previous window |
| Material change | ≥30 abs **and** ≥30% rel |
| Near band | avg position 8–20 |
| Strong / low engagement | pos ≤ 8, ≥150 impr, CTR \< 1.5%, ≤2 clicks |
| Max items | 5 (prefer **3** while project data is immature) |
| Supporting queries | top 5 from ORIGIN query×page rollup |

### Adjustments from SRP data

- Prior 28-day ORIGIN totals were ~6 impressions → comparison rules **do not fire**.
- Confidence without eligible prior stays **Early signal** even at high current volume.
- Immature projects cap at 3 cards so weak deep-position watches do not pad the UI.

## Confidence

| Level | Logic |
|-------|-------|
| Early signal | No eligible prior comparison, **or** current impressions \< 100 |
| Moderate evidence | Eligible prior **and** impressions ≥ 100 |
| Strong evidence | Eligible prior **and** impressions ≥ 200 |

No percentages. No AI confidence.

## Anti-churn

- Material **increases** surface as monitor / leave alone — not “optimize now.”
- Positive momentum (material impression gain without clearly worse position) softens stance on overlapping rules.
- Thin priors never produce dramatic % claims or change cards.
- Pages below 50 impressions are ignored.

## Deduplication & ranking

- One attention item per page.
- Internal sort (not exposed as a score): category precedence → confidence → decline boost → impression volume → nearer position within the near band.
- Max 5; immature projects prefer 3.

## Supporting queries

From `gsc_query_page_rollups` (ORIGIN), filtered to the page URL, top 5 by impressions. Context only — not separate tasks.

## Insufficient / empty

If nothing qualifies:

> Nothing needs attention yet. Search visibility is still developing…

(or a mature empty variant). Empty is success, not a bug.

## Tests

```bash
npm run test:attention
npm run verify:phase5
```

## Explicitly out of scope

AI copy, Ask SEO, page edits, Git publish, URL Inspection UI, `seo:check`, cannibalization alarms, notifications, workflow boards, SEO scores.

/**
 * Phase 5 real-data attention verification for Simple Roster Plus.
 */
import { getProjectDashboard } from "../apps/server/src/dashboard/service.js";
import { confidenceLabel } from "../apps/server/src/dashboard/attention.js";
import { urlBelongsToOrigin } from "../apps/server/src/gsc/filters.js";
import { normalizeOrigin } from "../apps/server/src/gsc/filters.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const dashboard = await getProjectDashboard({
    slug: "simple-roster-plus",
    periodDays: 28,
  });
  assert(dashboard, "dashboard missing");
  assert(!dashboard.empty, "dashboard unexpectedly empty");
  assert(dashboard.attention, "attention missing");

  const origin = normalizeOrigin(dashboard.project.primaryOrigin);
  const { attention } = dashboard;

  assert(attention.items.length <= 5, "more than 5 attention items");
  if (attention.immature) {
    assert(attention.items.length <= 3, "immature projects should prefer ≤3 items");
  }

  const seen = new Set<string>();
  for (const item of attention.items) {
    assert(!seen.has(item.pageUrl), `duplicate page attention: ${item.pageUrl}`);
    seen.add(item.pageUrl);
    assert(urlBelongsToOrigin(item.pageUrl, origin), `non-primary page: ${item.pageUrl}`);
    assert(!item.pageUrl.includes("app.simplerosterplus.com"), "app host in attention");
    assert(item.metrics.impressions >= 50, `below min impressions: ${item.path}`);
    assert(
      ["early", "moderate", "strong"].includes(item.confidence),
      "bad confidence",
    );
    assert(item.reason.length > 20, "reason too short");
    assert(item.stanceLabel.length > 5, "stance missing");
    assert(item.supportingQueries.length <= 5, "too many supporting queries");
  }

  // Phase 4 regressions still hold.
  assert(dashboard.notes.headlineSource === "gsc_daily_totals:ORIGIN", "headline source");
  assert(dashboard.summary.category === "insufficient", "expected insufficient trend");
  assert(dashboard.period.hasFullPrevious === true, "expected full previous window");

  const report = {
    ok: true,
    immature: attention.immature,
    emptyMessage: attention.emptyMessage,
    itemCount: attention.items.length,
    items: attention.items.map((i) => ({
      path: i.path,
      category: i.category,
      confidence: confidenceLabel(i.confidence),
      stance: i.stance,
      impressions: i.metrics.impressions,
      clicks: i.metrics.clicks,
      position: Number(i.metrics.position.toFixed(1)),
      ctr: Number((i.metrics.ctr * 100).toFixed(2)),
      prevImpressions: i.previous?.impressions ?? null,
      comparisonEligible: i.comparisonEligible,
      changeDirection: i.changeDirection,
      reason: i.reason,
      stanceLabel: i.stanceLabel,
      supportingQueries: i.supportingQueries.map((q) => ({
        query: q.query,
        impressions: q.impressions,
        position: Number(q.position.toFixed(1)),
      })),
    })),
    deliberatelyExcluded: dashboard.topPages
      .filter((p) => !seen.has(p.pageUrl))
      .map((p) => ({
        path: p.path,
        impressions: p.impressions,
        position: Number(p.position.toFixed(1)),
        note:
          p.impressions < 50
            ? "below minimum impressions"
            : attention.immature && attention.items.length >= 3
              ? "ranked below top immature cap"
              : "did not match an active rule / outranked",
      })),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

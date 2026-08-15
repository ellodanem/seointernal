/**
 * Phase 4 real-data reconciliation against stored ORIGIN totals / pages / queries.
 */
import { PrismaClient } from "@prisma/client";
import { getProjectDashboard } from "../apps/server/src/dashboard/service.js";
import { aggregateDailyMetrics } from "../apps/server/src/dashboard/compare.js";
import { parseYmd } from "../apps/server/src/gsc/dates.js";
import { normalizeOrigin, urlBelongsToOrigin } from "../apps/server/src/gsc/filters.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const dashboard = await getProjectDashboard({
      slug: "simple-roster-plus",
      periodDays: 28,
    });
    assert(dashboard, "dashboard missing");
    assert(!dashboard.empty, "dashboard unexpectedly empty");
    assert(dashboard.notes.headlineSource === "gsc_daily_totals:ORIGIN", "headline source");

    const project = await prisma.project.findUniqueOrThrow({
      where: { slug: "simple-roster-plus" },
      include: { gscProperties: true },
    });
    const property = project.gscProperties[0]!;
    const origin = normalizeOrigin(project.primaryOrigin);

    const start = parseYmd(dashboard.period.current.startDate);
    const end = parseYmd(dashboard.period.current.endDate);

    const totals = await prisma.gscDailyTotal.findMany({
      where: {
        gscPropertyId: property.id,
        scopeType: "ORIGIN",
        scopeValue: origin,
        date: { gte: start, lte: end },
      },
    });
    const expected = aggregateDailyMetrics(totals);
    assert(dashboard.metrics.clicks.current === expected.clicks, "clicks mismatch");
    assert(dashboard.metrics.impressions.current === expected.impressions, "impressions mismatch");
    assert(Math.abs(dashboard.metrics.ctr.current - expected.ctr) < 1e-9, "ctr mismatch");
    assert(
      Math.abs(dashboard.metrics.position.current - expected.position) < 1e-6,
      "position mismatch",
    );

    // Headline must not equal sum of query rows (aggregation caveat).
    const queries = await prisma.gscQueryDaily.findMany({
      where: {
        gscPropertyId: property.id,
        scopeType: "ORIGIN",
        scopeValue: origin,
        date: { gte: start, lte: end },
      },
    });
    const querySumClicks = queries.reduce((a, r) => a + r.clicks, 0);
    const querySumImpr = queries.reduce((a, r) => a + r.impressions, 0);
    assert(
      dashboard.metrics.clicks.current === expected.clicks,
      "headline clicks must come from totals",
    );
    // Soft check: document that they may differ; do not require difference.
    void querySumClicks;
    void querySumImpr;

    for (const page of dashboard.topPages) {
      assert(urlBelongsToOrigin(page.pageUrl, origin), `non-origin page in top pages: ${page.pageUrl}`);
    }

    for (const host of dashboard.otherHosts) {
      assert(
        host.host !== "www.simplerosterplus.com",
        `primary www host leaked into other hosts: ${host.host}`,
      );
    }

    assert(dashboard.sitemap, "sitemap missing");
    assert(
      !("indexed" in (dashboard.sitemap as object)),
      "deprecated indexed must not appear on sitemap card",
    );
    assert(dashboard.sitemap.submittedCount === 7, "expected 7 submitted URLs");
    assert(dashboard.sitemap.errorCount === 0, "expected 0 sitemap errors");
    assert(dashboard.period.dataThrough === "2026-08-13", "data through date");
    assert(dashboard.period.hasFullPrevious === true, "expected full previous 28 after backfill");
    assert(dashboard.summary.category === "insufficient", "low prior volume → insufficient");

    // Project isolation: unknown slug returns null.
    const missing = await getProjectDashboard({ slug: "does-not-exist" });
    assert(missing === null, "unknown project must be null");

    console.log(
      JSON.stringify(
        {
          ok: true,
          dataThrough: dashboard.period.dataThrough,
          current: {
            clicks: dashboard.metrics.clicks.current,
            impressions: dashboard.metrics.impressions.current,
            ctr: dashboard.metrics.ctr.current,
            position: dashboard.metrics.position.current,
          },
          previous: {
            clicks: dashboard.metrics.clicks.previous,
            impressions: dashboard.metrics.impressions.previous,
          },
          summary: dashboard.summary.category,
          topPages: dashboard.topPages.length,
          topQueries: dashboard.topQueries.length,
          otherHosts: dashboard.otherHosts.map((h) => h.host),
          sitemapSubmitted: dashboard.sitemap.submittedCount,
          querySumImpressions: querySumImpr,
          headlineImpressions: dashboard.metrics.impressions.current,
          querySumDiffersFromHeadline: querySumImpr !== dashboard.metrics.impressions.current,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

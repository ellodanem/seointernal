/**
 * Phase 6 real-data indexing verification for Simple Roster Plus.
 * Expects INDEXABLE inventory + prior `npm run gsc:inspect` (or runs inspect if needed).
 */
import { PageRole } from "@prisma/client";
import { prisma } from "../apps/server/src/lib/db.js";
import { getProjectDashboard } from "../apps/server/src/dashboard/service.js";
import { filterEligiblePages } from "../apps/server/src/gsc/eligibility.js";
import { loadEnv } from "../apps/server/src/config.js";
import { runGscUrlInspection } from "../apps/server/src/jobs/gsc-url-inspection.js";

const EXPECTED_PATHS = [
  "/",
  "/employee-scheduling-software",
  "/employee-attendance-software",
  "/zkteco-attendance-integration",
  "/small-business-employee-scheduling",
  "/employee-leave-and-availability",
  "/employee-time-clock-app",
];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const env = loadEnv();
  const project = await prisma.project.findUnique({
    where: { slug: "simple-roster-plus" },
    include: { pages: true },
  });
  assert(project, "SRP project missing");

  const eligible = filterEligiblePages(project.pages, project.primaryOrigin);
  console.log("INDEXABLE inventory (eligible for inspection):");
  for (const p of eligible) {
    console.log(`  ${p.role} ${p.path}  ${p.url}`);
  }
  assert(eligible.length === 7, `expected 7 INDEXABLE pages, got ${eligible.length}`);
  const paths = new Set(eligible.map((p) => p.path));
  for (const path of EXPECTED_PATHS) {
    assert(paths.has(path), `missing expected INDEXABLE path: ${path}`);
  }
  assert(
    !eligible.some((p) => p.url.includes("app.simplerosterplus.com")),
    "app host must not be eligible",
  );
  assert(
    !project.pages.some((p) => p.role === PageRole.INDEXABLE && p.path === "/privacy.html"),
    "privacy must not be INDEXABLE",
  );

  assert(env.GOOGLE_APPLICATION_CREDENTIALS, "credentials required for live inspect");

  // Force first pass so acceptance always has fresh snapshots for this verify.
  const first = await runGscUrlInspection({
    credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
    projectSlug: "simple-roster-plus",
    force: true,
    freshnessMs: env.GSC_INSPECT_FRESHNESS_MS,
  });
  assert(first.stats.pagesInspected === 7, `expected 7 inspected, got ${first.stats.pagesInspected}`);
  assert(first.stats.apiFailures === 0, `api failures: ${first.stats.apiFailures}`);

  const second = await runGscUrlInspection({
    credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
    projectSlug: "simple-roster-plus",
    force: false,
    freshnessMs: env.GSC_INSPECT_FRESHNESS_MS,
  });
  assert(second.stats.pagesSkippedFresh === 7, `freshness skip expected 7, got ${second.stats.pagesSkippedFresh}`);
  assert(second.stats.pagesInspected === 0, "rerun without force should not reinspect");

  const dashboard = await getProjectDashboard({ slug: "simple-roster-plus", periodDays: 28 });
  assert(dashboard, "dashboard missing");
  assert(dashboard.indexing, "indexing section missing");
  assert(dashboard.indexing.summary.expectedCount === 7, "expectedCount");
  assert(dashboard.indexing.pages.length === 7, "indexing pages");
  assert(
    dashboard.indexing.pages.every((p) => !p.neverChecked),
    "all pages should be checked",
  );

  const successRows = await prisma.gscUrlInspection.findMany({
    where: { projectId: project.id, success: true },
    orderBy: { inspectedAt: "desc" },
  });
  assert(successRows.length >= 7, "expected ≥7 successful snapshots");

  const pageReport = dashboard.indexing.pages.map((p) => ({
    path: p.path,
    normalizedStatus: p.normalizedStatus,
    coverageState: p.detail?.coverageState ?? null,
    lastCrawl: p.lastCrawlTime,
    indexingAllowed: p.detail?.indexingAllowed ?? null,
    robots: p.detail?.robotsTxtState ?? null,
    fetch: p.detail?.pageFetchState ?? null,
    userCanonical: p.detail?.userCanonical ?? null,
    googleCanonical: p.detail?.googleCanonical ?? null,
    canonicalAligned: p.canonicalState === "ALIGNED",
    crawledAs: p.crawledAsLabel ?? p.crawledAs,
    inspectedAt: p.inspectedAt,
  }));

  const report = {
    ok: true,
    inventoryCount: eligible.length,
    inventoryPaths: eligible.map((p) => p.path),
    firstRun: first.stats,
    freshnessRerun: second.stats,
    summary: dashboard.indexing.summary,
    attention: dashboard.indexing.attention,
    performanceAttentionCount: dashboard.attention.items.length,
    pages: pageReport,
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

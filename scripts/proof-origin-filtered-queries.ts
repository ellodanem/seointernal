/**
 * Phase 3 decision gate: prove Search Analytics can return query metrics
 * restricted to pages under the primary origin.
 *
 * Compare unfiltered Domain-property queries vs page-filtered (ORIGIN) queries
 * for the latest finalized 28-day window.
 *
 * Run: npx tsx --env-file=.env scripts/proof-origin-filtered-queries.ts
 *
 * Does not persist anything. Does not log credential contents.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { google } from "googleapis";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const SITE_URL = "sc-domain:simplerosterplus.com";
const PRIMARY_ORIGIN = "https://www.simplerosterplus.com";
const APP_HOST = "app.simplerosterplus.com";
const ROW_LIMIT = 5000;

type AnalyticsRow = {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
};

function credPath(): string {
  return (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GSC_CREDENTIALS_PATH ||
    ""
  );
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBefore(ymdDate: string, n: number): string {
  const d = new Date(`${ymdDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return ymd(d);
}

function sum(rows: AnalyticsRow[], field: "clicks" | "impressions"): number {
  return rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
}

function topQueries(rows: AnalyticsRow[], n: number) {
  return [...rows]
    .sort((a, b) => (Number(b.clicks) || 0) - (Number(a.clicks) || 0))
    .slice(0, n)
    .map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    }));
}

/** GSC page filter for primary-origin prefix (contains semantics). */
function originPageFilter(origin: string) {
  return {
    dimensionFilterGroups: [
      {
        groupType: "and" as const,
        filters: [
          {
            dimension: "page",
            operator: "contains",
            expression: origin,
          },
        ],
      },
    ],
  };
}

async function main() {
  const path = credPath();
  if (!path || !existsSync(path)) {
    console.error(`Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS. Path tried: ${path || "(empty)"}`);
    process.exit(1);
  }

  console.log(`Auth key file: ${path} (contents not logged)`);
  console.log(`Property: ${SITE_URL}`);
  console.log(`Primary origin filter expression: ${PRIMARY_ORIGIN}`);
  console.log(`Filter operator: contains (page dimension)`);

  const auth = new google.auth.GoogleAuth({
    keyFile: path,
    scopes: [SCOPE],
  });
  const authClient = await auth.getClient();
  const webmasters = google.webmasters({ version: "v3", auth: authClient as never });

  const endProbe = ymd(new Date());
  const startProbe = daysBefore(endProbe, 14);
  const finalProbe = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: startProbe,
      endDate: endProbe,
      dimensions: ["date"],
      dataState: "final",
      rowLimit: 50,
    },
  });
  const finalDates = (finalProbe.data.rows || [])
    .map((r) => r.keys?.[0])
    .filter((d): d is string => Boolean(d))
    .sort();
  const latestFinal = finalDates[finalDates.length - 1];
  if (!latestFinal) {
    throw new Error("No finalized dates in probe window");
  }

  const periodEnd = latestFinal;
  const periodStart = daysBefore(periodEnd, 27);
  console.log(`\nLatest finalized date: ${latestFinal}`);
  console.log(`28-day window: ${periodStart} → ${periodEnd}`);

  // Dataset A — unfiltered property queries
  const unfiltered = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: periodStart,
      endDate: periodEnd,
      dimensions: ["query"],
      dataState: "final",
      rowLimit: ROW_LIMIT,
    },
  });
  const rowsA = (unfiltered.data.rows || []) as AnalyticsRow[];

  // Dataset B — primary-origin filtered queries
  const filtered = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: periodStart,
      endDate: periodEnd,
      dimensions: ["query"],
      dataState: "final",
      rowLimit: ROW_LIMIT,
      ...originPageFilter(PRIMARY_ORIGIN),
    },
  });
  const rowsB = (filtered.data.rows || []) as AnalyticsRow[];

  // Supporting: unfiltered pages (to see app-host presence) vs filtered pages
  const pagesUnfiltered = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: periodStart,
      endDate: periodEnd,
      dimensions: ["page"],
      dataState: "final",
      rowLimit: ROW_LIMIT,
    },
  });
  const pageRowsAll = (pagesUnfiltered.data.rows || []) as AnalyticsRow[];
  const appPages = pageRowsAll.filter((r) => (r.keys?.[0] || "").includes(APP_HOST));

  const pagesFiltered = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: periodStart,
      endDate: periodEnd,
      dimensions: ["page"],
      dataState: "final",
      rowLimit: ROW_LIMIT,
      ...originPageFilter(PRIMARY_ORIGIN),
    },
  });
  const pageRowsOrigin = (pagesFiltered.data.rows || []) as AnalyticsRow[];
  const appPagesAfterFilter = pageRowsOrigin.filter((r) =>
    (r.keys?.[0] || "").includes(APP_HOST),
  );

  // Query × page unfiltered vs filtered — check if app pages appear in pairs
  const qpUnfiltered = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: periodStart,
      endDate: periodEnd,
      dimensions: ["query", "page"],
      dataState: "final",
      rowLimit: ROW_LIMIT,
    },
  });
  const qpRowsAll = (qpUnfiltered.data.rows || []) as AnalyticsRow[];
  const qpApp = qpRowsAll.filter((r) => (r.keys?.[1] || "").includes(APP_HOST));

  const qpFiltered = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: periodStart,
      endDate: periodEnd,
      dimensions: ["query", "page"],
      dataState: "final",
      rowLimit: ROW_LIMIT,
      ...originPageFilter(PRIMARY_ORIGIN),
    },
  });
  const qpRowsOrigin = (qpFiltered.data.rows || []) as AnalyticsRow[];
  const qpAppAfter = qpRowsOrigin.filter((r) => (r.keys?.[1] || "").includes(APP_HOST));

  const setA = new Set(rowsA.map((r) => r.keys?.[0] || ""));
  const setB = new Set(rowsB.map((r) => r.keys?.[0] || ""));
  const onlyInA = [...setA].filter((q) => !setB.has(q));
  const onlyInB = [...setB].filter((q) => !setA.has(q));

  // Queries that appear in unfiltered query×page with app host
  const queriesWithAppHost = new Set(
    qpApp.map((r) => r.keys?.[0] || "").filter(Boolean),
  );
  const appQueriesStillInB = [...queriesWithAppHost].filter((q) => setB.has(q));

  const report = {
    generatedAt: new Date().toISOString(),
    property: SITE_URL,
    primaryOrigin: PRIMARY_ORIGIN,
    filter: {
      dimension: "page",
      operator: "contains",
      expression: PRIMARY_ORIGIN,
      semantics: "GSC contains — matches page URLs that include the expression substring (effectively origin prefix for https://www.…)",
    },
    period: { start: periodStart, end: periodEnd, days: 28 },
    latestFinalizedDate: latestFinal,
    datasetA_unfilteredQueries: {
      rowCount: rowsA.length,
      clicks: sum(rowsA, "clicks"),
      impressions: sum(rowsA, "impressions"),
      topByClicks: topQueries(rowsA, 10),
    },
    datasetB_originFilteredQueries: {
      rowCount: rowsB.length,
      clicks: sum(rowsB, "clicks"),
      impressions: sum(rowsB, "impressions"),
      topByClicks: topQueries(rowsB, 10),
    },
    queryDiff: {
      onlyInUnfiltered: onlyInA.length,
      onlyInFiltered: onlyInB.length,
      sampleOnlyUnfiltered: onlyInA.slice(0, 15),
      sampleOnlyFiltered: onlyInB.slice(0, 15),
    },
    pageEvidence: {
      unfilteredPageRows: pageRowsAll.length,
      unfilteredAppHostPageRows: appPages.length,
      filteredPageRows: pageRowsOrigin.length,
      filteredAppHostPageRows: appPagesAfterFilter.length,
      appHostPagesDisappear: appPages.length > 0 && appPagesAfterFilter.length === 0,
      sampleAppPagesBefore: appPages.slice(0, 5).map((r) => ({
        url: r.keys?.[0],
        clicks: r.clicks,
        impressions: r.impressions,
      })),
    },
    queryPageEvidence: {
      unfilteredPairRows: qpRowsAll.length,
      unfilteredAppHostPairs: qpApp.length,
      filteredPairRows: qpRowsOrigin.length,
      filteredAppHostPairs: qpAppAfter.length,
      appHostPairsDisappear: qpApp.length === 0 || qpAppAfter.length === 0,
      queriesThatHadAppHostPairs: queriesWithAppHost.size,
      thoseQueriesStillInFilteredQueryList: appQueriesStillInB.length,
      note:
        "Query strings are not host-bound; a query can still appear under ORIGIN if www also ranked for it. Exclusion of app is proven via page filter on page/page×query dimensions.",
    },
    conclusion: {
      originFilterWorks:
        appPagesAfterFilter.length === 0 &&
        qpAppAfter.length === 0 &&
        rowsB.length > 0,
      trustworthyForOriginQueryPersistence: null as boolean | null,
      notes: [] as string[],
    },
  };

  report.conclusion.trustworthyForOriginQueryPersistence =
    report.conclusion.originFilterWorks;
  if (report.conclusion.originFilterWorks) {
    report.conclusion.notes.push(
      "Page contains-filter on primary origin excludes app-host pages and query×page pairs.",
    );
    report.conclusion.notes.push(
      "ORIGIN-scoped query metrics are trustworthy for v0.1 persistence.",
    );
    if (rowsB.length <= rowsA.length) {
      report.conclusion.notes.push(
        `Filtered query rows (${rowsB.length}) ≤ unfiltered (${rowsA.length}) as expected when other hosts contribute.`,
      );
    }
  } else {
    report.conclusion.notes.push(
      "STOP: primary-origin page filter did not cleanly exclude other-host activity or returned no rows.",
    );
  }

  console.log("\n=== Dataset A (unfiltered property queries) ===");
  console.log(JSON.stringify(report.datasetA_unfilteredQueries, null, 2));
  console.log("\n=== Dataset B (origin-filtered queries) ===");
  console.log(JSON.stringify(report.datasetB_originFilteredQueries, null, 2));
  console.log("\n=== Diff / page evidence ===");
  console.log(
    JSON.stringify(
      {
        queryDiff: report.queryDiff,
        pageEvidence: report.pageEvidence,
        queryPageEvidence: report.queryPageEvidence,
        conclusion: report.conclusion,
      },
      null,
      2,
    ),
  );

  const outDir = resolve("scripts/out");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "origin-filtered-query-proof.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote proof report: ${outPath}`);

  if (!report.conclusion.trustworthyForOriginQueryPersistence) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("Proof failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

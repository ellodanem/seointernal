import { GscMetricScopeType } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { daysBetweenInclusive, parseYmd } from "../gsc/dates.js";
import { normalizeOrigin, urlBelongsToOrigin } from "../gsc/filters.js";
import {
  aggregateDailyMetrics,
  comparePeriodMetrics,
  type PeriodMetrics,
} from "./compare.js";
import { hostKeyFromPageUrl, humanizePageUrl } from "./page-label.js";
import {
  DEFAULT_DASHBOARD_PERIOD,
  buildReportingPeriods,
  resolvePeriodDays,
  type DashboardPeriodDays,
} from "./periods.js";
import type { ProjectDashboard } from "./types.js";
import { classifyVisibility } from "./visibility.js";

const TOP_LIMIT = 15;
const AGGREGATION_CAVEAT =
  "Search Console totals, pages, and queries are separate datasets and may not add up exactly.";

type DailyRow = {
  date: Date;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function getProjectDashboard(args: {
  slug: string;
  periodDays?: number;
}): Promise<ProjectDashboard | null> {
  const project = await prisma.project.findUnique({
    where: { slug: args.slug },
    include: {
      gscProperties: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!project) return null;

  const primary = project.gscProperties.find((p) => p.isPrimary) ?? project.gscProperties[0];
  const origin = normalizeOrigin(project.primaryOrigin);

  const [latestOrigin, originDates, lastSuccess, lastJob] = await Promise.all([
    primary
      ? prisma.gscDailyTotal.findFirst({
          where: {
            projectId: project.id,
            gscPropertyId: primary.id,
            scopeType: GscMetricScopeType.ORIGIN,
            scopeValue: origin,
          },
          orderBy: { date: "desc" },
          select: { date: true },
        })
      : Promise.resolve(null),
    primary
      ? prisma.gscDailyTotal.findMany({
          where: {
            projectId: project.id,
            gscPropertyId: primary.id,
            scopeType: GscMetricScopeType.ORIGIN,
            scopeValue: origin,
          },
          select: { date: true },
          distinct: ["date"],
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    prisma.jobRun.findFirst({
      where: {
        jobName: "gsc_ingest_daily",
        status: "SUCCEEDED",
        OR: [{ projectId: project.id }, { projectId: null }],
      },
      orderBy: { finishedAt: "desc" },
    }),
    prisma.jobRun.findFirst({
      where: {
        jobName: "gsc_ingest_daily",
        OR: [{ projectId: project.id }, { projectId: null }],
      },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const storedYmds = originDates.map((r) => r.date.toISOString().slice(0, 10));
  const latestFinalizedYmd = latestOrigin?.date.toISOString().slice(0, 10) ?? null;

  if (!primary || !latestFinalizedYmd || storedYmds.length === 0) {
    return emptyDashboard({
      project,
      periodDays: DEFAULT_DASHBOARD_PERIOD,
      latestFinalizedYmd,
      lastSuccessAt: lastSuccess?.finishedAt ?? null,
      primary,
      lastJob,
    });
  }

  const probe = buildReportingPeriods({
    latestFinalizedYmd,
    periodDays: DEFAULT_DASHBOARD_PERIOD,
    storedDates: storedYmds,
  });
  const periodDays = resolvePeriodDays(args.periodDays, probe.availablePeriods);
  const periods = buildReportingPeriods({
    latestFinalizedYmd,
    periodDays,
    storedDates: storedYmds,
  });

  const currentStart = parseYmd(periods.current.startDate);
  const currentEnd = parseYmd(periods.current.endDate);
  const previousStart = parseYmd(periods.previous.startDate);
  const previousEnd = parseYmd(periods.previous.endDate);

  const [originTotals, pageRows, queryRows, sitemapSnap] = await Promise.all([
    prisma.gscDailyTotal.findMany({
      where: {
        projectId: project.id,
        gscPropertyId: primary.id,
        scopeType: GscMetricScopeType.ORIGIN,
        scopeValue: origin,
        date: { gte: previousStart, lte: currentEnd },
      },
      orderBy: { date: "asc" },
    }),
    prisma.gscPageDaily.findMany({
      where: {
        projectId: project.id,
        gscPropertyId: primary.id,
        date: { gte: previousStart, lte: currentEnd },
      },
      select: {
        date: true,
        pageUrl: true,
        host: true,
        clicks: true,
        impressions: true,
        ctr: true,
        position: true,
      },
    }),
    prisma.gscQueryDaily.findMany({
      where: {
        projectId: project.id,
        gscPropertyId: primary.id,
        scopeType: GscMetricScopeType.ORIGIN,
        scopeValue: origin,
        date: { gte: previousStart, lte: currentEnd },
      },
      select: {
        date: true,
        query: true,
        clicks: true,
        impressions: true,
        ctr: true,
        position: true,
      },
    }),
    prisma.gscSitemapSnapshot.findFirst({
      where: { projectId: project.id, gscPropertyId: primary.id },
      orderBy: { capturedAt: "desc" },
    }),
  ]);

  const currentTotals = originTotals.filter((r) => inWindow(r.date, currentStart, currentEnd));
  const previousTotals = originTotals.filter((r) => inWindow(r.date, previousStart, previousEnd));

  const currentMetrics = aggregateDailyMetrics(currentTotals);
  const previousForCompare = periods.hasFullPrevious
    ? aggregateDailyMetrics(previousTotals)
    : null;

  const metrics = comparePeriodMetrics(currentMetrics, previousForCompare);
  const summary = classifyVisibility({
    current: currentMetrics,
    previous: previousForCompare,
    hasFullPrevious: periods.hasFullPrevious,
    periodDays,
  });

  return {
    project: mapProject(project),
    period: { ...periods, requestedDays: periodDays },
    freshness: buildFreshness({
      latestFinalizedYmd,
      lastSuccessAt: lastSuccess?.finishedAt ?? null,
      primary,
      lastJob,
    }),
    summary,
    metrics,
    trend: buildTrend(periods.current.startDate, periods.current.endDate, currentTotals),
    topPages: buildTopEntities({
      rows: pageRows,
      keyOf: (r) => r.pageUrl,
      include: (r) => urlBelongsToOrigin(r.pageUrl, origin),
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      hasFullPrevious: periods.hasFullPrevious,
      limit: TOP_LIMIT,
      mapRow: (key, metricsRow, previous, delta) => {
        const { label, path } = humanizePageUrl(key);
        return {
          pageUrl: key,
          label,
          path,
          ...metricsRow,
          previous,
          delta,
        };
      },
    }),
    topQueries: buildTopEntities({
      rows: queryRows,
      keyOf: (r) => r.query,
      include: () => true,
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      hasFullPrevious: periods.hasFullPrevious,
      limit: TOP_LIMIT,
      mapRow: (key, metricsRow, previous, delta) => ({
        query: key,
        ...metricsRow,
        previous,
        delta,
      }),
    }),
    otherHosts: buildOtherHosts(
      pageRows.filter((r) => inWindow(r.date, currentStart, currentEnd)),
      origin,
    ),
    sitemap: mapSitemap(sitemapSnap),
    notes: {
      headlineSource: "gsc_daily_totals:ORIGIN",
      aggregationCaveat: AGGREGATION_CAVEAT,
    },
    empty: false,
  };
}

function emptyDashboard(args: {
  project: {
    id: string;
    slug: string;
    displayName: string;
    primaryOrigin: string;
    sitemapUrl: string | null;
    status: string;
  };
  periodDays: DashboardPeriodDays;
  latestFinalizedYmd: string | null;
  lastSuccessAt: Date | null;
  primary: { siteUrl: string; status: string; lastError: string | null } | undefined;
  lastJob: { status: string; error: string | null; finishedAt: Date | null } | null;
}): ProjectDashboard {
  const { periodDays } = args;
  return {
    project: mapProject(args.project),
    period: {
      days: periodDays,
      requestedDays: periodDays,
      dataThrough: args.latestFinalizedYmd ?? "",
      current: { startDate: "", endDate: "", days: periodDays },
      previous: { startDate: "", endDate: "", days: periodDays },
      hasFullCurrent: false,
      hasFullPrevious: false,
      availablePeriods: [],
    },
    freshness: buildFreshness({
      latestFinalizedYmd: args.latestFinalizedYmd,
      lastSuccessAt: args.lastSuccessAt,
      primary: args.primary,
      lastJob: args.lastJob,
    }),
    summary: classifyVisibility({
      current: null,
      previous: null,
      hasFullPrevious: false,
      periodDays,
    }),
    metrics: comparePeriodMetrics(
      { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      null,
    ),
    trend: [],
    topPages: [],
    topQueries: [],
    otherHosts: [],
    sitemap: null,
    notes: {
      headlineSource: "gsc_daily_totals:ORIGIN",
      aggregationCaveat: AGGREGATION_CAVEAT,
    },
    empty: true,
  };
}

function mapProject(project: {
  id: string;
  slug: string;
  displayName: string;
  primaryOrigin: string;
  sitemapUrl: string | null;
  status: string;
}) {
  return {
    id: project.id,
    slug: project.slug,
    displayName: project.displayName,
    primaryOrigin: project.primaryOrigin,
    sitemapUrl: project.sitemapUrl,
    status: project.status,
  };
}

function buildFreshness(args: {
  latestFinalizedYmd: string | null;
  lastSuccessAt: Date | null;
  primary: { siteUrl: string; status: string; lastError: string | null } | undefined;
  lastJob: { status: string; error: string | null; finishedAt: Date | null } | null;
}) {
  return {
    latestFinalizedDate: args.latestFinalizedYmd,
    lastSuccessAt: args.lastSuccessAt?.toISOString() ?? null,
    gscConnected: Boolean(args.primary) && args.primary?.status !== "ERROR",
    gscSiteUrl: args.primary?.siteUrl ?? null,
    gscStatus: args.primary?.status ?? null,
    gscLastError: args.primary?.lastError ?? null,
    currentFailure:
      args.lastJob?.status === "FAILED"
        ? {
            message: args.lastJob.error ?? "Latest Search Console ingest failed.",
            finishedAt: args.lastJob.finishedAt?.toISOString() ?? null,
          }
        : null,
  };
}

function buildTrend(startYmd: string, endYmd: string, rows: DailyRow[]) {
  const byDate = new Map(
    rows.map((r) => [
      r.date.toISOString().slice(0, 10),
      { clicks: r.clicks, impressions: r.impressions },
    ]),
  );
  return daysBetweenInclusive(startYmd, endYmd).map((date) => {
    const row = byDate.get(date);
    return { date, clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0 };
  });
}

function buildTopEntities<TRow extends DailyRow, TOut>(args: {
  rows: TRow[];
  keyOf: (row: TRow) => string;
  include: (row: TRow) => boolean;
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  hasFullPrevious: boolean;
  limit: number;
  mapRow: (
    key: string,
    metrics: PeriodMetrics,
    previous: PeriodMetrics | null,
    delta: ReturnType<typeof comparePeriodMetrics>,
  ) => TOut;
}): TOut[] {
  const currentMap = new Map<string, DailyRow[]>();
  const previousMap = new Map<string, DailyRow[]>();

  for (const row of args.rows) {
    if (!args.include(row)) continue;
    const key = args.keyOf(row);
    if (inWindow(row.date, args.currentStart, args.currentEnd)) {
      const list = currentMap.get(key) ?? [];
      list.push(row);
      currentMap.set(key, list);
    } else if (inWindow(row.date, args.previousStart, args.previousEnd)) {
      const list = previousMap.get(key) ?? [];
      list.push(row);
      previousMap.set(key, list);
    }
  }

  return [...currentMap.entries()]
    .map(([key, list]) => {
      const metrics = aggregateDailyMetrics(list);
      let previous: PeriodMetrics | null = null;
      if (args.hasFullPrevious) {
        previous = previousMap.has(key)
          ? aggregateDailyMetrics(previousMap.get(key)!)
          : { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      }
      return { key, metrics, previous };
    })
    .sort(
      (a, b) =>
        b.metrics.impressions - a.metrics.impressions ||
        b.metrics.clicks - a.metrics.clicks ||
        a.key.localeCompare(b.key),
    )
    .slice(0, args.limit)
    .map(({ key, metrics, previous }) =>
      args.mapRow(key, metrics, previous, comparePeriodMetrics(metrics, previous)),
    );
}

function buildOtherHosts(
  rows: Array<{ date: Date; pageUrl: string; host: string; clicks: number; impressions: number }>,
  primaryOrigin: string,
) {
  const groups = new Map<
    string,
    { urls: Set<string>; clicks: number; impressions: number; mostRecent: string | null }
  >();

  for (const row of rows) {
    if (urlBelongsToOrigin(row.pageUrl, primaryOrigin)) continue;
    const key = hostKeyFromPageUrl(row.pageUrl);
    const g = groups.get(key) ?? {
      urls: new Set<string>(),
      clicks: 0,
      impressions: 0,
      mostRecent: null,
    };
    g.urls.add(row.pageUrl);
    g.clicks += row.clicks;
    g.impressions += row.impressions;
    const ymd = row.date.toISOString().slice(0, 10);
    if (!g.mostRecent || ymd > g.mostRecent) g.mostRecent = ymd;
    groups.set(key, g);
  }

  return [...groups.entries()]
    .map(([host, g]) => ({
      host,
      urlCount: g.urls.size,
      clicks: g.clicks,
      impressions: g.impressions,
      mostRecentDate: g.mostRecent,
    }))
    .sort((a, b) => b.impressions - a.impressions || a.host.localeCompare(b.host));
}

function mapSitemap(
  snap: {
    sitemapPath: string;
    submittedCount: number | null;
    lastDownloaded: Date | null;
    lastSubmitted: Date | null;
    isPending: boolean;
    warningCount: number;
    errorCount: number;
    capturedAt: Date;
  } | null,
) {
  if (!snap) return null;
  const healthy = !snap.isPending && snap.errorCount === 0 && snap.warningCount === 0;
  const submitted = snap.submittedCount;
  let summary: string;
  if (healthy && submitted != null) {
    summary = `Sitemap healthy — ${submitted} URL${submitted === 1 ? "" : "s"} submitted, no reported errors.`;
  } else if (snap.errorCount > 0) {
    summary = `Sitemap reported ${snap.errorCount} error${snap.errorCount === 1 ? "" : "s"}.`;
  } else if (snap.warningCount > 0) {
    summary = `Sitemap reported ${snap.warningCount} warning${snap.warningCount === 1 ? "" : "s"}.`;
  } else if (snap.isPending) {
    summary = "Sitemap is pending processing in Search Console.";
  } else {
    summary = "Latest sitemap snapshot captured.";
  }

  return {
    sitemapPath: snap.sitemapPath,
    submittedCount: snap.submittedCount,
    lastDownloaded: snap.lastDownloaded?.toISOString() ?? null,
    lastSubmitted: snap.lastSubmitted?.toISOString() ?? null,
    isPending: snap.isPending,
    warningCount: snap.warningCount,
    errorCount: snap.errorCount,
    capturedAt: snap.capturedAt.toISOString(),
    healthy,
    summary,
  };
}

function inWindow(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

import {
  GscMetricScopeType,
  GscPropertyStatus,
  JobRunStatus,
  PageRole,
  PageSource,
  ProjectStatus,
  type GscProperty,
  type Project,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/db.js";
import { log } from "../lib/log.js";
import {
  createGscClient,
  withGscRetry,
  type GscClient,
  GscError,
  daysBetweenInclusive,
  parseYmd,
  parseHost,
  parsePath,
  rollingWindowEndingOn,
  normalizeOrigin,
} from "../gsc/index.js";
import { tryAcquireProjectIngestLock, releaseProjectIngestLock } from "./locks.js";

export const GSC_INGEST_JOB_NAME = "gsc_ingest_daily";

export type GscIngestOptions = {
  credentialsPath: string;
  /** Max finalized days to ingest in one run (catch-up / backfill bound). */
  maxDaysPerRun?: number;
  /** How far back to look when project has no local history yet. */
  initialBackfillDays?: number;
  rowLimit?: number;
  /** Refresh 28-day query×page rollup after catch-up. Default true. */
  refreshRollup?: boolean;
  /** Capture sitemap snapshots. Default true. */
  captureSitemaps?: boolean;
  /** Restrict to one project slug (CLI). */
  projectSlug?: string;
  /** If set, only ingest these YMD dates (must be finalized). */
  onlyDates?: string[];
};

export type GscIngestStats = {
  projectsConsidered: number;
  projectsSucceeded: number;
  projectsFailed: number;
  projectsSkippedLocked: number;
  latestFinalizedDate: string | null;
  datesIngested: string[];
  datesSkipped: string[];
  propertyTotalRows: number;
  originTotalRows: number;
  pageRows: number;
  queryRows: number;
  queryPageRows: number;
  sitemapSnapshots: number;
  apiRequests: number;
  truncatedResponses: number;
};

const DEFAULT_MAX_DAYS = 28;
const DEFAULT_INITIAL_BACKFILL_DAYS = 28;
const ROLLUP_DAYS = 28;

type ProjectWithProperty = Project & { gscProperties: GscProperty[] };

export async function runGscIngestDaily(opts: GscIngestOptions): Promise<{
  jobRunId: string;
  stats: GscIngestStats;
}> {
  const job = await prisma.jobRun.create({
    data: {
      jobName: GSC_INGEST_JOB_NAME,
      status: JobRunStatus.RUNNING,
      stats: {},
    },
  });

  const stats: GscIngestStats = emptyStats();
  let client: GscClient;

  try {
    client = await createGscClient({
      credentialsPath: opts.credentialsPath,
      defaultRowLimit: opts.rowLimit,
    });
  } catch (err) {
    const mapped = err instanceof GscError ? err : new GscError(String(err), { code: "GSC_CLIENT_INIT" });
    await finishJob(job.id, JobRunStatus.FAILED, mapped.message, stats);
    throw mapped;
  }

  const projects = await loadActiveProjects(opts.projectSlug);
  stats.projectsConsidered = projects.length;

  log.info("gsc ingest started", {
    jobRunId: job.id,
    projects: projects.length,
    maxDaysPerRun: opts.maxDaysPerRun ?? DEFAULT_MAX_DAYS,
    initialBackfillDays: opts.initialBackfillDays ?? DEFAULT_INITIAL_BACKFILL_DAYS,
  });

  const errors: string[] = [];

  for (const project of projects) {
    const property = project.gscProperties.find((p) => p.isPrimary) ?? project.gscProperties[0];
    if (!property) {
      log.warn("project has no GSC property; skipping", { projectSlug: project.slug });
      continue;
    }

    const locked = await tryAcquireProjectIngestLock(project.id);
    if (!locked) {
      stats.projectsSkippedLocked += 1;
      log.warn("ingest skipped — lock held", { projectSlug: project.slug });
      continue;
    }

    try {
      const projectStats = await ingestProject({
        client,
        project,
        property,
        opts,
        parentJobId: job.id,
      });
      mergeStats(stats, projectStats);
      stats.projectsSucceeded += 1;
    } catch (err) {
      stats.projectsFailed += 1;
      const mapped = err instanceof GscError ? err : new GscError(String(err), { code: "INGEST_FAILED" });
      errors.push(`${project.slug}: ${mapped.message}`);
      log.error("gsc ingest project failed", {
        projectSlug: project.slug,
        code: mapped.code,
        error: mapped.message,
      });
      await markPropertyError(property.id, mapped);
    } finally {
      await releaseProjectIngestLock(project.id);
    }
  }

  const status =
    stats.projectsFailed > 0 && stats.projectsSucceeded === 0
      ? JobRunStatus.FAILED
      : stats.projectsFailed > 0
        ? JobRunStatus.FAILED
        : JobRunStatus.SUCCEEDED;

  const errorMsg = errors.length ? errors.join(" | ") : null;
  await finishJob(job.id, status, errorMsg, stats);

  log.info("gsc ingest finished", {
    jobRunId: job.id,
    status,
    datesIngested: stats.datesIngested.length,
    latestFinalizedDate: stats.latestFinalizedDate,
    pageRows: stats.pageRows,
    queryRows: stats.queryRows,
  });

  if (status === JobRunStatus.FAILED && stats.projectsSucceeded === 0) {
    throw new GscError(errorMsg ?? "GSC ingest failed", { code: "INGEST_FAILED" });
  }

  return { jobRunId: job.id, stats };
}

async function ingestProject(args: {
  client: GscClient;
  project: Project;
  property: GscProperty;
  opts: GscIngestOptions;
  parentJobId: string;
}): Promise<Partial<GscIngestStats>> {
  const { client, project, property, opts } = args;
  const local: Partial<GscIngestStats> = {
    datesIngested: [],
    datesSkipped: [],
    propertyTotalRows: 0,
    originTotalRows: 0,
    pageRows: 0,
    queryRows: 0,
    queryPageRows: 0,
    sitemapSnapshots: 0,
    apiRequests: 0,
    truncatedResponses: 0,
    latestFinalizedDate: null,
  };

  const origin = normalizeOrigin(project.primaryOrigin);
  let apiRequests = 0;
  const track = async <T>(fn: () => Promise<T>): Promise<T> => {
    apiRequests += 1;
    return withGscRetry(fn);
  };

  // 1) Verify access
  const hasAccess = await track(() => client.verifyPropertyAccess(property.siteUrl));
  if (!hasAccess) {
    throw new GscError(
      "Search Console access was lost. Re-add the service-account user.",
      { code: "GSC_FORBIDDEN", httpStatus: 403, retryable: false },
    );
  }

  await prisma.gscProperty.update({
    where: { id: property.id },
    data: {
      status: GscPropertyStatus.VERIFIED,
      lastVerifiedAt: new Date(),
      lastError: null,
    },
  });

  // 2) Latest finalized date from API
  const latestFinal = await track(() => client.findLatestFinalizedDate(property.siteUrl));
  local.latestFinalizedDate = latestFinal;
  if (!latestFinal) {
    throw new GscError("No finalized Search Analytics dates available.", {
      code: "GSC_NO_FINAL_DATES",
      retryable: true,
    });
  }

  log.info("latest finalized date", {
    projectSlug: project.slug,
    latestFinalizedDate: latestFinal,
  });

  // 3) Determine missing finalized dates (PROPERTY totals are the completeness cursor)
  const maxDays = opts.maxDaysPerRun ?? DEFAULT_MAX_DAYS;
  const initialBackfill = opts.initialBackfillDays ?? DEFAULT_INITIAL_BACKFILL_DAYS;

  let datesToIngest: string[];
  if (opts.onlyDates?.length) {
    datesToIngest = opts.onlyDates.filter((d) => d <= latestFinal).sort();
  } else {
    const existing = await prisma.gscDailyTotal.findMany({
      where: {
        gscPropertyId: property.id,
        scopeType: GscMetricScopeType.PROPERTY,
        date: { lte: parseYmd(latestFinal) },
      },
      select: { date: true },
      distinct: ["date"],
    });
    const have = new Set(existing.map((r) => r.date.toISOString().slice(0, 10)));
    const backfillStart = rollingWindowEndingOn(latestFinal, initialBackfill).startDate;
    // First run / catch-up: any missing date in the configured backfill window through latestFinal.
    // Wider history can be requested via a larger initialBackfillDays on a manual CLI run.
    datesToIngest = daysBetweenInclusive(backfillStart, latestFinal).filter((d) => !have.has(d));
  }

  datesToIngest = datesToIngest.filter((d) => d <= latestFinal).sort().slice(0, maxDays);

  log.info("dates to ingest", {
    projectSlug: project.slug,
    count: datesToIngest.length,
    from: datesToIngest[0] ?? null,
    to: datesToIngest.at(-1) ?? null,
  });

  // 4) Ingest each missing finalized day
  for (const dateYmd of datesToIngest) {
    const dayStats = await ingestFinalizedDay({
      client,
      project,
      property,
      origin,
      dateYmd,
      rowLimit: opts.rowLimit,
      track,
    });
    local.datesIngested!.push(dateYmd);
    local.propertyTotalRows = (local.propertyTotalRows ?? 0) + dayStats.propertyTotalRows;
    local.originTotalRows = (local.originTotalRows ?? 0) + dayStats.originTotalRows;
    local.pageRows = (local.pageRows ?? 0) + dayStats.pageRows;
    local.queryRows = (local.queryRows ?? 0) + dayStats.queryRows;
    local.truncatedResponses =
      (local.truncatedResponses ?? 0) + dayStats.truncatedResponses;
  }

  // 5) Refresh 28-day query×page rollup after catch-up
  if (opts.refreshRollup !== false) {
    const window = rollingWindowEndingOn(latestFinal, ROLLUP_DAYS);
    const qp = await track(() =>
      client.queryQueryPages({
        siteUrl: property.siteUrl,
        startDate: window.startDate,
        endDate: window.endDate,
        dataState: "final",
        rowLimit: opts.rowLimit,
        originFilter: origin,
      }),
    );
    if (qp.truncated) local.truncatedResponses = (local.truncatedResponses ?? 0) + 1;

    await prisma.$transaction(async (tx) => {
      await tx.gscQueryPageRollup.deleteMany({
        where: {
          gscPropertyId: property.id,
          scopeType: GscMetricScopeType.ORIGIN,
          scopeValue: origin,
        },
      });
      if (qp.rows.length > 0) {
        await tx.gscQueryPageRollup.createMany({
          data: qp.rows.map((row) => {
            const pageUrl = row.keys[1] ?? "";
            return {
              projectId: project.id,
              gscPropertyId: property.id,
              periodStart: parseYmd(window.startDate),
              periodEnd: parseYmd(window.endDate),
              query: row.keys[0] ?? "",
              pageUrl,
              host: parseHost(pageUrl),
              scopeType: GscMetricScopeType.ORIGIN,
              scopeValue: origin,
              clicks: row.clicks,
              impressions: row.impressions,
              ctr: row.ctr,
              position: row.position,
            };
          }),
        });
      }
    });
    local.queryPageRows = qp.rows.length;
    log.info("query×page rollup refreshed", {
      projectSlug: project.slug,
      periodStart: window.startDate,
      periodEnd: window.endDate,
      rows: qp.rows.length,
      truncated: qp.truncated,
    });
  }

  // 6) Sitemap snapshots (append-only historical captures)
  if (opts.captureSitemaps !== false) {
    const sitemaps = await track(() => client.listSitemaps(property.siteUrl));
    if (sitemaps.length > 0) {
      await prisma.gscSitemapSnapshot.createMany({
        data: sitemaps.map((s) => ({
          projectId: project.id,
          gscPropertyId: property.id,
          sitemapPath: s.path,
          lastSubmitted: s.lastSubmitted,
          lastDownloaded: s.lastDownloaded,
          isPending: s.isPending,
          submittedCount: s.submittedCount,
          warningCount: s.warningCount,
          errorCount: s.errorCount,
          rawResult: s.raw as Prisma.InputJsonValue,
        })),
      });
      local.sitemapSnapshots = sitemaps.length;
    }
  }

  local.apiRequests = apiRequests;
  return local;
}

async function ingestFinalizedDay(args: {
  client: GscClient;
  project: Project;
  property: GscProperty;
  origin: string;
  dateYmd: string;
  rowLimit?: number;
  track: <T>(fn: () => Promise<T>) => Promise<T>;
}): Promise<{
  propertyTotalRows: number;
  originTotalRows: number;
  pageRows: number;
  queryRows: number;
  truncatedResponses: number;
}> {
  const { client, project, property, origin, dateYmd, rowLimit, track } = args;
  let truncatedResponses = 0;

  // Fetch all dimensions first; persist in one transaction so a partial day is not "complete".
  const propertyTotals = await track(() =>
    client.queryTotals({
      siteUrl: property.siteUrl,
      startDate: dateYmd,
      endDate: dateYmd,
      dataState: "final",
    }),
  );
  const originTotals = await track(() =>
    client.queryTotals({
      siteUrl: property.siteUrl,
      startDate: dateYmd,
      endDate: dateYmd,
      dataState: "final",
      originFilter: origin,
    }),
  );
  const pages = await track(() =>
    client.queryPages({
      siteUrl: property.siteUrl,
      startDate: dateYmd,
      endDate: dateYmd,
      dataState: "final",
      rowLimit,
    }),
  );
  if (pages.truncated) truncatedResponses += 1;

  const queries = await track(() =>
    client.queryQueries({
      siteUrl: property.siteUrl,
      startDate: dateYmd,
      endDate: dateYmd,
      dataState: "final",
      rowLimit,
      originFilter: origin,
    }),
  );
  if (queries.truncated) truncatedResponses += 1;

  const date = parseYmd(dateYmd);

  await prisma.$transaction(async (tx) => {
    const dayTruncated = truncatedResponses > 0;

    // PROPERTY totals
    await tx.gscDailyTotal.upsert({
      where: {
        gscPropertyId_date_scopeType_scopeValue: {
          gscPropertyId: property.id,
          date,
          scopeType: GscMetricScopeType.PROPERTY,
          scopeValue: property.siteUrl,
        },
      },
      create: {
        projectId: project.id,
        gscPropertyId: property.id,
        date,
        scopeType: GscMetricScopeType.PROPERTY,
        scopeValue: property.siteUrl,
        clicks: propertyTotals.metrics.clicks,
        impressions: propertyTotals.metrics.impressions,
        ctr: propertyTotals.metrics.ctr,
        position: propertyTotals.metrics.position,
        truncated: dayTruncated,
      },
      update: {
        clicks: propertyTotals.metrics.clicks,
        impressions: propertyTotals.metrics.impressions,
        ctr: propertyTotals.metrics.ctr,
        position: propertyTotals.metrics.position,
        truncated: dayTruncated,
      },
    });

    // ORIGIN totals
    await tx.gscDailyTotal.upsert({
      where: {
        gscPropertyId_date_scopeType_scopeValue: {
          gscPropertyId: property.id,
          date,
          scopeType: GscMetricScopeType.ORIGIN,
          scopeValue: origin,
        },
      },
      create: {
        projectId: project.id,
        gscPropertyId: property.id,
        date,
        scopeType: GscMetricScopeType.ORIGIN,
        scopeValue: origin,
        clicks: originTotals.metrics.clicks,
        impressions: originTotals.metrics.impressions,
        ctr: originTotals.metrics.ctr,
        position: originTotals.metrics.position,
        truncated: dayTruncated,
      },
      update: {
        clicks: originTotals.metrics.clicks,
        impressions: originTotals.metrics.impressions,
        ctr: originTotals.metrics.ctr,
        position: originTotals.metrics.position,
        truncated: dayTruncated,
      },
    });

    // Pages — upsert metrics + reconcile page inventory
    for (const row of pages.rows) {
      const pageUrl = row.keys[0] ?? "";
      if (!pageUrl) continue;
      const host = parseHost(pageUrl);
      const path = parsePath(pageUrl);

      await tx.gscPageDaily.upsert({
        where: {
          gscPropertyId_date_pageUrl: {
            gscPropertyId: property.id,
            date,
            pageUrl,
          },
        },
        create: {
          projectId: project.id,
          gscPropertyId: property.id,
          date,
          pageUrl,
          host,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
        update: {
          host,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
      });

      const existingPage = await tx.page.findUnique({
        where: { projectId_url: { projectId: project.id, url: pageUrl } },
      });
      if (!existingPage) {
        await tx.page.create({
          data: {
            projectId: project.id,
            url: pageUrl,
            host,
            path,
            role: PageRole.UNKNOWN,
            source: PageSource.GSC,
          },
        });
      }
      // Do not overwrite role/source for existing sitemap/manual pages.
    }

    // ORIGIN queries only — replace day's rows then insert (handles query set changes)
    await tx.gscQueryDaily.deleteMany({
      where: {
        gscPropertyId: property.id,
        date,
        scopeType: GscMetricScopeType.ORIGIN,
        scopeValue: origin,
      },
    });
    if (queries.rows.length > 0) {
      await tx.gscQueryDaily.createMany({
        data: queries.rows.map((row) => ({
          projectId: project.id,
          gscPropertyId: property.id,
          date,
          query: row.keys[0] ?? "",
          scopeType: GscMetricScopeType.ORIGIN,
          scopeValue: origin,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        })),
      });
    }
  });

  log.info("ingested finalized day", {
    projectSlug: project.slug,
    date: dateYmd,
    pages: pages.rows.length,
    queries: queries.rows.length,
    truncated: truncatedResponses > 0,
  });

  return {
    propertyTotalRows: 1,
    originTotalRows: 1,
    pageRows: pages.rows.length,
    queryRows: queries.rows.length,
    truncatedResponses,
  };
}

async function loadActiveProjects(slug?: string): Promise<ProjectWithProperty[]> {
  return prisma.project.findMany({
    where: {
      status: ProjectStatus.ACTIVE,
      ...(slug ? { slug } : {}),
      gscProperties: { some: { status: { not: GscPropertyStatus.DISABLED } } },
    },
    include: {
      gscProperties: {
        where: { status: { not: GscPropertyStatus.DISABLED } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });
}

async function markPropertyError(propertyId: string, err: GscError): Promise<void> {
  if (err.code === "GSC_FORBIDDEN" || err.code === "GSC_BAD_PROPERTY" || err.code === "MISSING_CREDENTIALS") {
    await prisma.gscProperty.update({
      where: { id: propertyId },
      data: {
        status: GscPropertyStatus.ERROR,
        lastError: err.message.slice(0, 1000),
      },
    });
  } else {
    await prisma.gscProperty.update({
      where: { id: propertyId },
      data: { lastError: err.message.slice(0, 1000) },
    });
  }
}

async function finishJob(
  id: string,
  status: JobRunStatus,
  error: string | null,
  stats: GscIngestStats,
): Promise<void> {
  await prisma.jobRun.update({
    where: { id },
    data: {
      status,
      error,
      finishedAt: new Date(),
      stats: stats as Prisma.InputJsonValue,
    },
  });
}

function emptyStats(): GscIngestStats {
  return {
    projectsConsidered: 0,
    projectsSucceeded: 0,
    projectsFailed: 0,
    projectsSkippedLocked: 0,
    latestFinalizedDate: null,
    datesIngested: [],
    datesSkipped: [],
    propertyTotalRows: 0,
    originTotalRows: 0,
    pageRows: 0,
    queryRows: 0,
    queryPageRows: 0,
    sitemapSnapshots: 0,
    apiRequests: 0,
    truncatedResponses: 0,
  };
}

function mergeStats(target: GscIngestStats, partial: Partial<GscIngestStats>): void {
  if (partial.latestFinalizedDate) {
    if (!target.latestFinalizedDate || partial.latestFinalizedDate > target.latestFinalizedDate) {
      target.latestFinalizedDate = partial.latestFinalizedDate;
    }
  }
  target.datesIngested.push(...(partial.datesIngested ?? []));
  target.datesSkipped.push(...(partial.datesSkipped ?? []));
  target.propertyTotalRows += partial.propertyTotalRows ?? 0;
  target.originTotalRows += partial.originTotalRows ?? 0;
  target.pageRows += partial.pageRows ?? 0;
  target.queryRows += partial.queryRows ?? 0;
  target.queryPageRows += partial.queryPageRows ?? 0;
  target.sitemapSnapshots += partial.sitemapSnapshots ?? 0;
  target.apiRequests += partial.apiRequests ?? 0;
  target.truncatedResponses += partial.truncatedResponses ?? 0;
}

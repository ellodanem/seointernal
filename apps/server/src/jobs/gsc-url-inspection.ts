import {
  JobRunStatus,
  PageRole,
  ProjectStatus,
  type GscProperty,
  type Page,
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
  filterEligiblePages,
  shouldInspectPage,
  normalizeIndexingStatus,
  deriveCanonicalState,
  type NormalizedIndexingStatus,
} from "../gsc/index.js";
import { tryAcquireProjectInspectLock, releaseProjectInspectLock } from "./locks.js";

export const GSC_URL_INSPECTION_JOB_NAME = "gsc_url_inspection";

/** Default freshness / schedule window: 7 days. */
export const DEFAULT_INSPECT_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

export type GscUrlInspectionOptions = {
  credentialsPath: string;
  /** Restrict to one project slug (CLI). */
  projectSlug?: string;
  /** Inspect a single URL (must be an INDEXABLE page for the project). */
  onlyUrl?: string;
  /** Bypass freshness guard. */
  force?: boolean;
  /** Skip pages successfully inspected within this window (default 7d). */
  freshnessMs?: number;
};

export type GscUrlInspectionStats = {
  projectsConsidered: number;
  projectsSucceeded: number;
  projectsFailed: number;
  projectsSkippedLocked: number;
  pagesEligible: number;
  pagesInspected: number;
  pagesSkippedFresh: number;
  indexed: number;
  notIndexed: number;
  blocked: number;
  canonicalizedElsewhere: number;
  unknown: number;
  canonicalMismatches: number;
  apiFailures: number;
  apiRequests: number;
  durationMs: number;
};

type ProjectWithProperty = Project & {
  gscProperties: GscProperty[];
  pages: Page[];
};

export async function runGscUrlInspection(opts: GscUrlInspectionOptions): Promise<{
  jobRunId: string;
  stats: GscUrlInspectionStats;
}> {
  const started = Date.now();
  const job = await prisma.jobRun.create({
    data: {
      jobName: GSC_URL_INSPECTION_JOB_NAME,
      status: JobRunStatus.RUNNING,
      stats: {},
    },
  });

  const stats: GscUrlInspectionStats = emptyStats();
  let client: GscClient;

  try {
    client = await createGscClient({ credentialsPath: opts.credentialsPath });
  } catch (err) {
    const mapped = err instanceof GscError ? err : new GscError(String(err), { code: "GSC_CLIENT_INIT" });
    stats.durationMs = Date.now() - started;
    await finishJob(job.id, JobRunStatus.FAILED, mapped.message, stats);
    throw mapped;
  }

  const projects = await loadProjects(opts.projectSlug);
  stats.projectsConsidered = projects.length;
  const freshnessMs = opts.freshnessMs ?? DEFAULT_INSPECT_FRESHNESS_MS;
  const force = Boolean(opts.force);
  const errors: string[] = [];

  log.info("gsc url inspection started", {
    jobRunId: job.id,
    projects: projects.length,
    force,
    freshnessMs,
  });

  for (const project of projects) {
    const property = project.gscProperties.find((p) => p.isPrimary) ?? project.gscProperties[0];
    if (!property) {
      log.warn("project has no GSC property; skipping inspection", { projectSlug: project.slug });
      continue;
    }

    const locked = await tryAcquireProjectInspectLock(project.id);
    if (!locked) {
      stats.projectsSkippedLocked += 1;
      log.warn("url inspection skipped — lock held", { projectSlug: project.slug });
      continue;
    }

    try {
      await inspectProject({
        client,
        project,
        property,
        stats,
        force,
        freshnessMs,
        onlyUrl: opts.onlyUrl,
      });
      stats.projectsSucceeded += 1;
    } catch (err) {
      stats.projectsFailed += 1;
      const mapped = err instanceof GscError ? err : mapUnknown(err);
      errors.push(`${project.slug}: ${mapped.message}`);
      log.error("url inspection project failed", {
        projectSlug: project.slug,
        code: mapped.code,
        error: mapped.message,
      });
      if (mapped.code === "GSC_FORBIDDEN") {
        await prisma.gscProperty.update({
          where: { id: property.id },
          data: {
            status: "ERROR",
            lastError: mapped.message,
          },
        });
      }
      // Quota: stop remaining projects this run.
      if (mapped.code === "GSC_QUOTA") {
        errors.push("Stopped remaining projects after quota response.");
        break;
      }
    } finally {
      await releaseProjectInspectLock(project.id);
    }
  }

  stats.durationMs = Date.now() - started;
  const status = stats.projectsFailed > 0 || errors.length > 0 ? JobRunStatus.FAILED : JobRunStatus.SUCCEEDED;
  const errorMsg = errors.length ? errors.join("; ").slice(0, 2000) : null;
  await finishJob(job.id, status, errorMsg, stats);

  if (status === JobRunStatus.FAILED) {
    throw new GscError(errorMsg ?? "URL inspection failed", {
      code: "GSC_INSPECT_JOB_FAILED",
      retryable: false,
    });
  }

  return { jobRunId: job.id, stats };
}

async function inspectProject(args: {
  client: GscClient;
  project: ProjectWithProperty;
  property: GscProperty;
  stats: GscUrlInspectionStats;
  force: boolean;
  freshnessMs: number;
  onlyUrl?: string;
}): Promise<void> {
  const { client, project, property, stats, force, freshnessMs, onlyUrl } = args;

  const access = await withGscRetry(() => client.verifyPropertyAccess(property.siteUrl));
  stats.apiRequests += 1;
  if (!access) {
    throw new GscError(
      "Search Console access was lost or denied for this property. Re-add the service-account user.",
      { code: "GSC_FORBIDDEN", httpStatus: 403, retryable: false },
    );
  }

  let eligible = filterEligiblePages(project.pages, project.primaryOrigin);
  if (onlyUrl) {
    const target = onlyUrl.trim();
    eligible = eligible.filter((p) => p.url === target);
    if (eligible.length === 0) {
      throw new GscError(
        `URL is not an INDEXABLE managed page for this project: ${target}`,
        { code: "GSC_INSPECT_URL_NOT_ELIGIBLE", retryable: false },
      );
    }
  }

  stats.pagesEligible += eligible.length;

  const latestByPage = await loadLatestSuccessfulByPage(
    project.id,
    eligible.map((p) => p.id),
  );

  for (const page of eligible) {
    const last = latestByPage.get(page.id) ?? null;
    if (
      !shouldInspectPage({
        lastSuccessfulAt: last,
        force,
        freshnessMs,
      })
    ) {
      stats.pagesSkippedFresh += 1;
      continue;
    }

    try {
      const result = await withGscRetry(() =>
        client.inspectUrl({
          inspectionUrl: page.url,
          siteUrl: property.siteUrl,
        }),
      );
      stats.apiRequests += 1;

      const normalizedStatus = normalizeIndexingStatus({
        inspectedUrl: page.url,
        verdict: result.verdict,
        coverageState: result.coverageState,
        indexingState: result.indexingState,
        robotsTxtState: result.robotsTxtState,
        pageFetchState: result.pageFetchState,
        googleCanonical: result.googleCanonical,
        userCanonical: result.userCanonical,
      });
      const canonicalState = deriveCanonicalState({
        inspectedUrl: page.url,
        googleCanonical: result.googleCanonical,
        userCanonical: result.userCanonical,
      });

      await prisma.gscUrlInspection.create({
        data: {
          projectId: project.id,
          gscPropertyId: property.id,
          pageId: page.id,
          inspectedUrl: page.url,
          inspectedAt: new Date(),
          success: true,
          verdict: result.verdict,
          coverageState: result.coverageState,
          indexingState: result.indexingState,
          robotsTxtState: result.robotsTxtState,
          pageFetchState: result.pageFetchState,
          lastCrawlTime: result.lastCrawlTime,
          googleCanonical: result.googleCanonical,
          userCanonical: result.userCanonical,
          crawledAs: result.crawledAs,
          normalizedStatus,
          canonicalState,
          rawResult: result.raw as Prisma.InputJsonValue,
        },
      });

      stats.pagesInspected += 1;
      bumpStatus(stats, normalizedStatus);
      if (canonicalState === "MISMATCH") stats.canonicalMismatches += 1;
    } catch (err) {
      stats.apiRequests += 1;
      stats.apiFailures += 1;
      const mapped = err instanceof GscError ? err : mapUnknown(err);

      // Record failed attempt without inventing UNKNOWN observation fields.
      await prisma.gscUrlInspection.create({
        data: {
          projectId: project.id,
          gscPropertyId: property.id,
          pageId: page.id,
          inspectedUrl: page.url,
          inspectedAt: new Date(),
          success: false,
          errorCode: mapped.code,
          errorMessage: mapped.message.slice(0, 500),
        },
      });

      log.warn("url inspection page failed — prior successful state preserved", {
        projectSlug: project.slug,
        url: page.url,
        code: mapped.code,
      });

      if (mapped.code === "GSC_QUOTA" || mapped.code === "GSC_FORBIDDEN") {
        throw mapped;
      }
      // Other page-level failures: continue remaining pages.
    }
  }

  await prisma.gscProperty.update({
    where: { id: property.id },
    data: {
      lastVerifiedAt: new Date(),
      lastError: null,
      status: property.status === "ERROR" ? "VERIFIED" : property.status,
    },
  });
}

async function loadProjects(projectSlug?: string): Promise<ProjectWithProperty[]> {
  return prisma.project.findMany({
    where: {
      status: ProjectStatus.ACTIVE,
      ...(projectSlug ? { slug: projectSlug } : {}),
    },
    include: {
      gscProperties: true,
      pages: {
        where: { role: PageRole.INDEXABLE },
        orderBy: { path: "asc" },
      },
    },
    orderBy: { slug: "asc" },
  });
}

async function loadLatestSuccessfulByPage(
  projectId: string,
  pageIds: string[],
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (pageIds.length === 0) return map;

  const rows = await prisma.gscUrlInspection.findMany({
    where: {
      projectId,
      pageId: { in: pageIds },
      success: true,
    },
    orderBy: { inspectedAt: "desc" },
    select: { pageId: true, inspectedAt: true },
  });

  for (const row of rows) {
    if (!row.pageId) continue;
    if (!map.has(row.pageId)) map.set(row.pageId, row.inspectedAt);
  }
  return map;
}

function bumpStatus(stats: GscUrlInspectionStats, status: NormalizedIndexingStatus): void {
  switch (status) {
    case "INDEXED":
      stats.indexed += 1;
      break;
    case "NOT_INDEXED":
      stats.notIndexed += 1;
      break;
    case "BLOCKED":
      stats.blocked += 1;
      break;
    case "CANONICALIZED_ELSEWHERE":
      stats.canonicalizedElsewhere += 1;
      break;
    default:
      stats.unknown += 1;
  }
}

function emptyStats(): GscUrlInspectionStats {
  return {
    projectsConsidered: 0,
    projectsSucceeded: 0,
    projectsFailed: 0,
    projectsSkippedLocked: 0,
    pagesEligible: 0,
    pagesInspected: 0,
    pagesSkippedFresh: 0,
    indexed: 0,
    notIndexed: 0,
    blocked: 0,
    canonicalizedElsewhere: 0,
    unknown: 0,
    canonicalMismatches: 0,
    apiFailures: 0,
    apiRequests: 0,
    durationMs: 0,
  };
}

async function finishJob(
  id: string,
  status: JobRunStatus,
  error: string | null,
  stats: GscUrlInspectionStats,
): Promise<void> {
  await prisma.jobRun.update({
    where: { id },
    data: {
      status,
      error,
      finishedAt: new Date(),
      stats: stats as unknown as Prisma.InputJsonValue,
    },
  });
}

function mapUnknown(err: unknown): GscError {
  return new GscError(err instanceof Error ? err.message : String(err), {
    code: "GSC_UNKNOWN",
    retryable: false,
    cause: err,
  });
}

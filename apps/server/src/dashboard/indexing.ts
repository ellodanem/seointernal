/**
 * Phase 6 — build owner dashboard indexing section from persisted inspections.
 */

import type { Page, GscUrlInspection } from "@prisma/client";
import { PageRole } from "@prisma/client";
import { filterEligiblePages } from "../gsc/eligibility.js";
import type { CanonicalState, NormalizedIndexingStatus } from "../gsc/inspection-types.js";
import { humanizePageUrl } from "./page-label.js";
import type {
  DashboardIndexing,
  IndexingAttentionItem,
  IndexingFreshness,
  IndexingPageRow,
  IndexingSummary,
} from "./indexing-types.js";

const STATUS_SORT: Record<string, number> = {
  BLOCKED: 0,
  CANONICALIZED_ELSEWHERE: 1,
  NOT_INDEXED: 2,
  UNKNOWN: 3,
  INDEXED: 4,
  // never checked sorts with unknown/error band but after known unknowns
  NEVER: 3.5,
};

export function buildDashboardIndexing(args: {
  pages: Page[];
  primaryOrigin: string;
  /** Latest successful inspection per pageId (or inspectedUrl). */
  latestSuccessful: GscUrlInspection[];
  lastInspectJob: {
    status: string;
    error: string | null;
    finishedAt: Date | null;
    startedAt: Date;
  } | null;
  lastInspectSuccessAt: Date | null;
  cadenceMs: number;
  now?: Date;
}): DashboardIndexing {
  const now = args.now ?? new Date();
  const eligible = filterEligiblePages(args.pages, args.primaryOrigin);
  const byPageId = new Map<string, GscUrlInspection>();
  for (const row of args.latestSuccessful) {
    if (row.pageId && row.success) byPageId.set(row.pageId, row);
  }

  const pageRows: IndexingPageRow[] = eligible.map((page) => {
    const latest = byPageId.get(page.id) ?? null;
    return mapPageRow(page, latest);
  });

  pageRows.sort((a, b) => {
    const sa = sortKey(a);
    const sb = sortKey(b);
    if (sa !== sb) return sa - sb;
    return a.path.localeCompare(b.path) || a.pageUrl.localeCompare(b.pageUrl);
  });

  const summary = buildSummary(pageRows);
  const attention = buildIndexingAttention(pageRows);
  const freshness = buildIndexingFreshness({
    pageRows,
    lastInspectJob: args.lastInspectJob,
    lastInspectSuccessAt: args.lastInspectSuccessAt,
    cadenceMs: args.cadenceMs,
    now,
  });

  return { summary, freshness, pages: pageRows, attention };
}

function sortKey(row: IndexingPageRow): number {
  if (row.neverChecked) return STATUS_SORT.NEVER ?? 3.5;
  if (row.canonicalState === "MISMATCH" && row.normalizedStatus === "INDEXED") {
    return STATUS_SORT.CANONICALIZED_ELSEWHERE ?? 1;
  }
  return STATUS_SORT[row.normalizedStatus ?? "UNKNOWN"] ?? 3;
}

function mapPageRow(page: Page, latest: GscUrlInspection | null): IndexingPageRow {
  const { label, path } = humanizePageUrl(page.url);
  if (!latest) {
    return {
      pageId: page.id,
      pageUrl: page.url,
      label,
      path,
      normalizedStatus: null,
      statusLabel: "Not checked yet",
      statusDetail: null,
      canonicalState: null,
      canonicalLabel: "—",
      lastCrawlTime: null,
      crawledAs: null,
      crawledAsLabel: null,
      inspectedAt: null,
      neverChecked: true,
      needsReview: false,
      detail: null,
    };
  }

  const status = (latest.normalizedStatus as NormalizedIndexingStatus | null) ?? "UNKNOWN";
  const canonical = (latest.canonicalState as CanonicalState | null) ?? "UNKNOWN";
  const needsReview =
    status === "BLOCKED" ||
    status === "NOT_INDEXED" ||
    status === "CANONICALIZED_ELSEWHERE" ||
    status === "UNKNOWN" ||
    canonical === "MISMATCH";

  return {
    pageId: page.id,
    pageUrl: page.url,
    label,
    path,
    normalizedStatus: status,
    statusLabel: statusLabel(status),
    statusDetail: statusDetail(status, latest.coverageState),
    canonicalState: canonical,
    canonicalLabel: canonicalLabel(canonical),
    lastCrawlTime: latest.lastCrawlTime?.toISOString() ?? null,
    crawledAs: latest.crawledAs,
    crawledAsLabel: crawledAsLabel(latest.crawledAs),
    inspectedAt: latest.inspectedAt.toISOString(),
    neverChecked: false,
    needsReview,
    detail: {
      coverageState: latest.coverageState,
      indexingState: latest.indexingState,
      robotsTxtState: latest.robotsTxtState,
      pageFetchState: latest.pageFetchState,
      verdict: latest.verdict,
      userCanonical: latest.userCanonical,
      googleCanonical: latest.googleCanonical,
      indexingAllowed: indexingAllowed(latest.indexingState),
    },
  };
}

export function statusLabel(status: NormalizedIndexingStatus): string {
  switch (status) {
    case "INDEXED":
      return "Indexed";
    case "NOT_INDEXED":
      return "Not indexed";
    case "BLOCKED":
      return "Blocked";
    case "CANONICALIZED_ELSEWHERE":
      return "Canonicalized elsewhere";
    default:
      return "Unknown";
  }
}

function statusDetail(status: NormalizedIndexingStatus, coverage: string | null): string | null {
  if (status === "INDEXED") return null;
  if (status === "NOT_INDEXED") {
    return coverage
      ? `Google reports: ${coverage}`
      : "Google reports this page is not indexed.";
  }
  if (status === "BLOCKED") {
    return coverage
      ? `Google reports indexing/crawling is blocked (${coverage}).`
      : "Google reports that indexing or crawling is blocked.";
  }
  if (status === "CANONICALIZED_ELSEWHERE") {
    return "Google selected a different canonical URL for this page.";
  }
  return coverage ? `Google coverage: ${coverage}` : "Inspection result was inconclusive.";
}

function canonicalLabel(state: CanonicalState): string {
  switch (state) {
    case "ALIGNED":
      return "Aligned";
    case "MISMATCH":
      return "Google selected another";
    default:
      return "Unknown";
  }
}

function crawledAsLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "MOBILE" || upper.includes("MOBILE")) return "Smartphone";
  if (upper === "DESKTOP" || upper.includes("DESKTOP")) return "Desktop";
  return value;
}

function indexingAllowed(indexingState: string | null | undefined): boolean | null {
  if (!indexingState) return null;
  const upper = indexingState.toUpperCase();
  if (upper === "INDEXING_ALLOWED") return true;
  if (upper.includes("BLOCKED")) return false;
  return null;
}

function buildSummary(pages: IndexingPageRow[]): IndexingSummary {
  const expectedCount = pages.length;
  const fullyHealthy = pages.filter(
    (p) => p.normalizedStatus === "INDEXED" && p.canonicalState === "ALIGNED",
  ).length;
  const neverCheckedCount = pages.filter((p) => p.neverChecked).length;
  const needsReviewCount = pages.filter((p) => p.needsReview).length;
  const healthy = expectedCount > 0 && needsReviewCount === 0 && neverCheckedCount === 0;

  let headline: string;
  let subcopy: string;
  if (expectedCount === 0) {
    headline = "No expected indexable pages";
    subcopy = "Add pages with role INDEXABLE to this project's managed inventory.";
  } else if (neverCheckedCount === expectedCount) {
    headline = `${expectedCount} expected page${expectedCount === 1 ? "" : "s"}`;
    subcopy = "Indexing has not been checked yet.";
  } else if (healthy) {
    headline = "Indexing looks healthy";
    subcopy = `Google reports all ${expectedCount} expected page${expectedCount === 1 ? "" : "s"} are indexed.`;
  } else {
    headline = `${expectedCount} expected page${expectedCount === 1 ? "" : "s"}`;
    subcopy = `${fullyHealthy} indexed · ${needsReviewCount} need${needsReviewCount === 1 ? "s" : ""} review${
      neverCheckedCount ? ` · ${neverCheckedCount} not checked yet` : ""
    }`;
  }

  return {
    expectedCount,
    indexedCount: fullyHealthy,
    needsReviewCount,
    neverCheckedCount,
    healthy,
    headline,
    subcopy,
  };
}

function buildIndexingAttention(pages: IndexingPageRow[]): IndexingAttentionItem[] {
  const items: IndexingAttentionItem[] = [];
  for (const page of pages) {
    if (page.neverChecked || !page.needsReview) continue;

    if (page.normalizedStatus === "BLOCKED") {
      items.push({
        id: `idx-blocked-${page.pageId}`,
        pageUrl: page.pageUrl,
        label: page.label,
        path: page.path,
        category: "INDEXING_BLOCKED",
        categoryLabel: "Indexing blocked",
        reason: `${page.label} is expected to be indexable, but Google reports indexing or crawling is blocked.`,
        normalizedStatus: page.normalizedStatus,
        canonicalState: page.canonicalState,
        coverageState: page.detail?.coverageState ?? null,
        lastCrawlTime: page.lastCrawlTime,
        inspectedAt: page.inspectedAt,
      });
      continue;
    }

    if (page.normalizedStatus === "CANONICALIZED_ELSEWHERE" || page.canonicalState === "MISMATCH") {
      items.push({
        id: `idx-canonical-${page.pageId}`,
        pageUrl: page.pageUrl,
        label: page.label,
        path: page.path,
        category: "CANONICAL_MISMATCH",
        categoryLabel: "Canonical mismatch",
        reason: `Google selected a different canonical URL for ${page.label}.`,
        normalizedStatus: page.normalizedStatus,
        canonicalState: page.canonicalState,
        coverageState: page.detail?.coverageState ?? null,
        lastCrawlTime: page.lastCrawlTime,
        inspectedAt: page.inspectedAt,
      });
      continue;
    }

    if (page.normalizedStatus === "NOT_INDEXED") {
      items.push({
        id: `idx-not-indexed-${page.pageId}`,
        pageUrl: page.pageUrl,
        label: page.label,
        path: page.path,
        category: "NOT_INDEXED",
        categoryLabel: "Not indexed",
        reason: `${page.label} is expected to be indexable, but Google reports it is not indexed.`,
        normalizedStatus: page.normalizedStatus,
        canonicalState: page.canonicalState,
        coverageState: page.detail?.coverageState ?? null,
        lastCrawlTime: page.lastCrawlTime,
        inspectedAt: page.inspectedAt,
      });
      continue;
    }

    if (page.normalizedStatus === "UNKNOWN") {
      items.push({
        id: `idx-unknown-${page.pageId}`,
        pageUrl: page.pageUrl,
        label: page.label,
        path: page.path,
        category: "INSPECTION_UNKNOWN",
        categoryLabel: "Inspection unclear",
        reason: `Google's inspection result for ${page.label} was inconclusive.`,
        normalizedStatus: page.normalizedStatus,
        canonicalState: page.canonicalState,
        coverageState: page.detail?.coverageState ?? null,
        lastCrawlTime: page.lastCrawlTime,
        inspectedAt: page.inspectedAt,
      });
    }
  }

  const order: Record<string, number> = {
    INDEXING_BLOCKED: 0,
    CANONICAL_MISMATCH: 1,
    NOT_INDEXED: 2,
    INSPECTION_UNKNOWN: 3,
  };
  items.sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9) || a.path.localeCompare(b.path));
  return items;
}

function buildIndexingFreshness(args: {
  pageRows: IndexingPageRow[];
  lastInspectJob: {
    status: string;
    error: string | null;
    finishedAt: Date | null;
    startedAt: Date;
  } | null;
  lastInspectSuccessAt: Date | null;
  cadenceMs: number;
  now: Date;
}): IndexingFreshness {
  const checkedTimes = args.pageRows
    .map((p) => (p.inspectedAt ? Date.parse(p.inspectedAt) : NaN))
    .filter((n) => Number.isFinite(n));
  const lastCheckedAt =
    checkedTimes.length > 0
      ? new Date(Math.max(...checkedTimes)).toISOString()
      : args.lastInspectSuccessAt?.toISOString() ?? null;

  const anchor = lastCheckedAt ? Date.parse(lastCheckedAt) : null;
  const overdue =
    anchor !== null ? args.now.getTime() - anchor > args.cadenceMs * 1.25 : false;

  const refreshFailed =
    args.lastInspectJob?.status === "FAILED" &&
    (!args.lastInspectSuccessAt ||
      (args.lastInspectJob.finishedAt !== null &&
        args.lastInspectJob.finishedAt > args.lastInspectSuccessAt));

  return {
    lastCheckedAt,
    lastSuccessAt: args.lastInspectSuccessAt?.toISOString() ?? null,
    overdue,
    refreshFailed: Boolean(refreshFailed),
    refreshFailureMessage: refreshFailed ? args.lastInspectJob?.error ?? "Indexing check failed." : null,
    cadenceDays: Math.round(args.cadenceMs / (24 * 60 * 60 * 1000)),
  };
}

/** Pages with indexing contradictions that should suppress performance attention. */
export function indexingContradictionPageUrls(indexing: DashboardIndexing): Set<string> {
  const set = new Set<string>();
  for (const item of indexing.attention) {
    if (
      item.category === "INDEXING_BLOCKED" ||
      item.category === "NOT_INDEXED" ||
      item.category === "CANONICAL_MISMATCH"
    ) {
      set.add(item.pageUrl);
    }
  }
  return set;
}

export function emptyDashboardIndexing(): DashboardIndexing {
  return {
    summary: {
      expectedCount: 0,
      indexedCount: 0,
      needsReviewCount: 0,
      neverCheckedCount: 0,
      healthy: true,
      headline: "No expected indexable pages",
      subcopy: "Add pages with role INDEXABLE to this project's managed inventory.",
    },
    freshness: {
      lastCheckedAt: null,
      lastSuccessAt: null,
      overdue: false,
      refreshFailed: false,
      refreshFailureMessage: null,
      cadenceDays: 7,
    },
    pages: [],
    attention: [],
  };
}

/** Helper for tests — eligible inventory roles. */
export function indexableRole(): typeof PageRole.INDEXABLE {
  return PageRole.INDEXABLE;
}

import type { Project } from "./types";

export type VisibilityCategory = "improving" | "stable" | "declining" | "insufficient";

export type AttentionCategory =
  | "WORTH_WATCHING"
  | "NEAR_STRONGER_VISIBILITY"
  | "VISIBILITY_CHANGE"
  | "STRONG_VISIBILITY_LOW_ENGAGEMENT";

export type AttentionStance = "watch" | "review" | "leave_alone" | "monitor_momentum";

export type AttentionConfidence = "early" | "moderate" | "strong";

export type MetricDelta = {
  absolute: number | null;
  relative: number | null;
  percentagePoints: number | null;
  positionsImproved: number | null;
};

export type ComparedMetric = {
  current: number;
  previous: number | null;
  delta: MetricDelta;
};

export type ComparedMetrics = {
  clicks: ComparedMetric;
  impressions: ComparedMetric;
  ctr: ComparedMetric;
  position: ComparedMetric;
};

export type PeriodMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type AttentionItem = {
  id: string;
  pageUrl: string;
  label: string;
  path: string;
  category: AttentionCategory;
  categoryLabel: string;
  confidence: AttentionConfidence;
  reason: string;
  stance: AttentionStance;
  stanceLabel: string;
  metrics: PeriodMetrics;
  previous: PeriodMetrics | null;
  comparisonEligible: boolean;
  changeDirection: "increase" | "decrease" | null;
  supportingQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  dataThrough: string;
  generatedAt: string;
};

export type AttentionResult = {
  items: AttentionItem[];
  emptyMessage: string | null;
  immature: boolean;
  generatedAt: string;
};

export type IndexingAttentionItem = {
  id: string;
  pageUrl: string;
  label: string;
  path: string;
  category: "INDEXING_BLOCKED" | "NOT_INDEXED" | "CANONICAL_MISMATCH" | "INSPECTION_UNKNOWN";
  categoryLabel: string;
  reason: string;
  normalizedStatus: string | null;
  canonicalState: string | null;
  coverageState: string | null;
  lastCrawlTime: string | null;
  inspectedAt: string | null;
};

export type IndexingPageRow = {
  pageId: string;
  pageUrl: string;
  label: string;
  path: string;
  normalizedStatus: string | null;
  statusLabel: string;
  statusDetail: string | null;
  canonicalState: string | null;
  canonicalLabel: string;
  lastCrawlTime: string | null;
  crawledAs: string | null;
  crawledAsLabel: string | null;
  inspectedAt: string | null;
  neverChecked: boolean;
  needsReview: boolean;
  detail: {
    coverageState: string | null;
    indexingState: string | null;
    robotsTxtState: string | null;
    pageFetchState: string | null;
    verdict: string | null;
    userCanonical: string | null;
    googleCanonical: string | null;
    indexingAllowed: boolean | null;
  } | null;
};

export type DashboardIndexing = {
  summary: {
    expectedCount: number;
    indexedCount: number;
    needsReviewCount: number;
    neverCheckedCount: number;
    healthy: boolean;
    headline: string;
    subcopy: string;
  };
  freshness: {
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
    overdue: boolean;
    refreshFailed: boolean;
    refreshFailureMessage: string | null;
    cadenceDays: number;
  };
  pages: IndexingPageRow[];
  attention: IndexingAttentionItem[];
};

export type ProjectDashboard = {
  project: Pick<
    Project,
    "id" | "slug" | "displayName" | "primaryOrigin" | "sitemapUrl" | "status"
  >;
  period: {
    days: number;
    requestedDays: number;
    dataThrough: string;
    current: { startDate: string; endDate: string; days: number };
    previous: { startDate: string; endDate: string; days: number };
    hasFullCurrent: boolean;
    hasFullPrevious: boolean;
    availablePeriods: number[];
  };
  freshness: {
    latestFinalizedDate: string | null;
    lastSuccessAt: string | null;
    gscConnected: boolean;
    gscSiteUrl: string | null;
    gscStatus: string | null;
    gscLastError: string | null;
    currentFailure: { message: string; finishedAt: string | null } | null;
  };
  summary: {
    category: VisibilityCategory;
    message: string;
  };
  metrics: ComparedMetrics;
  trend: Array<{ date: string; clicks: number; impressions: number }>;
  topPages: Array<{
    pageUrl: string;
    label: string;
    path: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    previous: PeriodMetrics | null;
    delta: ComparedMetrics;
  }>;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    previous: PeriodMetrics | null;
    delta: ComparedMetrics;
  }>;
  otherHosts: Array<{
    host: string;
    urlCount: number;
    clicks: number;
    impressions: number;
    mostRecentDate: string | null;
  }>;
  sitemap: {
    sitemapPath: string;
    submittedCount: number | null;
    lastDownloaded: string | null;
    lastSubmitted: string | null;
    isPending: boolean;
    warningCount: number;
    errorCount: number;
    capturedAt: string;
    healthy: boolean;
    summary: string;
  } | null;
  attention: AttentionResult;
  indexing: DashboardIndexing;
  notes: {
    headlineSource: string;
    aggregationCaveat: string;
  };
  empty: boolean;
};

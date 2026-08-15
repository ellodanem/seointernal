import type { Project } from "./types";

export type VisibilityCategory = "improving" | "stable" | "declining" | "insufficient";

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
  notes: {
    headlineSource: string;
    aggregationCaveat: string;
  };
  empty: boolean;
};

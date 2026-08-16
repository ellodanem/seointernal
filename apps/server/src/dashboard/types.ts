import type { AttentionResult } from "./attention-types.js";
import type { ComparedMetrics, PeriodMetrics } from "./compare.js";
import type { DashboardIndexing } from "./indexing-types.js";
import type { DashboardPeriodDays, ReportingPeriods } from "./periods.js";
import type { VisibilitySummary } from "./visibility.js";

export type DashboardProject = {
  id: string;
  slug: string;
  displayName: string;
  primaryOrigin: string;
  sitemapUrl: string | null;
  status: string;
};

export type DashboardFreshness = {
  latestFinalizedDate: string | null;
  lastSuccessAt: string | null;
  gscConnected: boolean;
  gscSiteUrl: string | null;
  gscStatus: string | null;
  gscLastError: string | null;
  /** Prominent only when the latest job for this project failed. */
  currentFailure: {
    message: string;
    finishedAt: string | null;
  } | null;
};

export type DashboardTrendPoint = {
  date: string;
  clicks: number;
  impressions: number;
};

export type DashboardPageRow = {
  pageUrl: string;
  label: string;
  path: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previous: PeriodMetrics | null;
  delta: ComparedMetrics;
};

export type DashboardQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previous: PeriodMetrics | null;
  delta: ComparedMetrics;
};

export type DashboardOtherHost = {
  host: string;
  urlCount: number;
  clicks: number;
  impressions: number;
  mostRecentDate: string | null;
};

export type DashboardSitemap = {
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
};

export type ProjectDashboard = {
  project: DashboardProject;
  period: ReportingPeriods & {
    requestedDays: DashboardPeriodDays;
  };
  freshness: DashboardFreshness;
  summary: VisibilitySummary;
  metrics: ComparedMetrics;
  /** ORIGIN-scoped daily series for the current window (includes zero days). */
  trend: DashboardTrendPoint[];
  topPages: DashboardPageRow[];
  topQueries: DashboardQueryRow[];
  otherHosts: DashboardOtherHost[];
  sitemap: DashboardSitemap | null;
  /** Phase 5 — derived page attention (not persisted). Performance-only list after composition. */
  attention: AttentionResult;
  /** Phase 6 — URL Inspection for managed INDEXABLE pages. */
  indexing: DashboardIndexing;
  notes: {
    /** Headline metrics come from gsc_daily_totals ORIGIN scope. */
    headlineSource: "gsc_daily_totals:ORIGIN";
    aggregationCaveat: string;
  };
  empty: boolean;
};

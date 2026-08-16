/**
 * Phase 6 — dashboard indexing types (owner-facing).
 */

import type { CanonicalState, NormalizedIndexingStatus } from "../gsc/inspection-types.js";

export type IndexingAttentionCategory =
  | "INDEXING_BLOCKED"
  | "NOT_INDEXED"
  | "CANONICAL_MISMATCH"
  | "INSPECTION_UNKNOWN";

export type IndexingAttentionItem = {
  id: string;
  pageUrl: string;
  label: string;
  path: string;
  category: IndexingAttentionCategory;
  categoryLabel: string;
  reason: string;
  normalizedStatus: NormalizedIndexingStatus | null;
  canonicalState: CanonicalState | null;
  coverageState: string | null;
  lastCrawlTime: string | null;
  inspectedAt: string | null;
};

export type IndexingPageRow = {
  pageId: string;
  pageUrl: string;
  label: string;
  path: string;
  /** null when never successfully inspected. */
  normalizedStatus: NormalizedIndexingStatus | null;
  statusLabel: string;
  statusDetail: string | null;
  canonicalState: CanonicalState | null;
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

export type IndexingSummary = {
  expectedCount: number;
  indexedCount: number;
  needsReviewCount: number;
  neverCheckedCount: number;
  healthy: boolean;
  headline: string;
  subcopy: string;
};

export type IndexingFreshness = {
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  overdue: boolean;
  refreshFailed: boolean;
  refreshFailureMessage: string | null;
  cadenceDays: number;
};

export type DashboardIndexing = {
  summary: IndexingSummary;
  freshness: IndexingFreshness;
  pages: IndexingPageRow[];
  attention: IndexingAttentionItem[];
};

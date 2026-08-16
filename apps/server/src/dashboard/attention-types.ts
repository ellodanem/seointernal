/**
 * Phase 5 Attention & Opportunities — types.
 * Derived on demand from stored GSC metrics (not persisted).
 */

import type { PeriodMetrics } from "./compare.js";
import type { ATTENTION_THRESHOLDS } from "./attention-thresholds.js";

export type AttentionCategory =
  | "WORTH_WATCHING"
  | "NEAR_STRONGER_VISIBILITY"
  | "VISIBILITY_CHANGE"
  | "STRONG_VISIBILITY_LOW_ENGAGEMENT";

/** Owner-facing stance — not a severity traffic light. */
export type AttentionStance =
  | "watch"
  | "review"
  | "leave_alone"
  | "monitor_momentum";

export type AttentionConfidence = "early" | "moderate" | "strong";

export type VisibilityChangeDirection = "increase" | "decrease";

export type AttentionSupportingQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type AttentionItem = {
  /** Stable fingerprint for this period + page + category. */
  id: string;
  pageUrl: string;
  label: string;
  path: string;
  category: AttentionCategory;
  /** Short category label for UI. */
  categoryLabel: string;
  confidence: AttentionConfidence;
  /** Why this page was surfaced (plain English). */
  reason: string;
  /** Suggested owner stance. */
  stance: AttentionStance;
  stanceLabel: string;
  /** Current-period metrics. */
  metrics: PeriodMetrics;
  /** Previous-period metrics when the window is fully stored; else null. */
  previous: PeriodMetrics | null;
  /** True when previous volume is high enough for change rules. */
  comparisonEligible: boolean;
  /** Present only for VISIBILITY_CHANGE. */
  changeDirection: VisibilityChangeDirection | null;
  supportingQueries: AttentionSupportingQuery[];
  dataThrough: string;
  generatedAt: string;
};

export type AttentionResult = {
  items: AttentionItem[];
  /** Project-level message when the list is empty or data is immature. */
  emptyMessage: string | null;
  /** True when project-level visibility is still developing. */
  immature: boolean;
  thresholds: typeof ATTENTION_THRESHOLDS;
  generatedAt: string;
};

/** Input page row for pure attention generation (primary-origin only). */
export type AttentionPageInput = {
  pageUrl: string;
  label: string;
  path: string;
  current: PeriodMetrics;
  previous: PeriodMetrics | null;
};

export type AttentionQueryInput = {
  pageUrl: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

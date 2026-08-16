/**
 * Phase 5 attention thresholds — conservative, documented, tuned against SRP.
 *
 * These are not universal SEO truth. They exist to suppress noise on immature
 * sites and avoid churn. Adjust only with real-data review.
 */

/** Minimum impressions in the current window before any page attention item. */
export const ATTENTION_MIN_IMPRESSIONS = 50;

/** Stronger evidence floor (confidence + ranking). */
export const ATTENTION_STRONG_IMPRESSIONS = 100;

/** High-confidence impression floor. */
export const ATTENTION_HIGH_IMPRESSIONS = 200;

/**
 * Previous-period impressions required before percentage/absolute deltas
 * may drive VISIBILITY_CHANGE (or anti-churn "improving" suppression of action).
 */
export const COMPARISON_MIN_PREV_IMPRESSIONS = 50;

/** Absolute impression delta required for a material visibility change. */
export const VISIBILITY_CHANGE_ABS = 30;

/** Relative impression change required (0.30 = 30%). */
export const VISIBILITY_CHANGE_REL = 0.3;

/**
 * Near-stronger average-position band (inclusive).
 * GSC average position is aggregated — not an exact SERP rank.
 */
export const NEAR_POSITION_MIN = 8;
export const NEAR_POSITION_MAX = 20;

/**
 * Strong-position / low-engagement — very conservative.
 * Do not fire from deep positions or sparse impressions.
 */
export const STRONG_POSITION_MAX = 8;
export const LOW_ENGAGEMENT_MIN_IMPRESSIONS = 150;
/** CTR below this (fraction) may contribute when position is strong. */
export const LOW_ENGAGEMENT_CTR_MAX = 0.015;
/** Absolute clicks at or below this count as "few" when impressions are high. */
export const LOW_ENGAGEMENT_MAX_CLICKS = 2;

/** Max attention cards shown on the owner dashboard. */
export const ATTENTION_MAX_ITEMS = 5;

/** Supporting queries shown under each page item. */
export const SUPPORTING_QUERIES_LIMIT = 5;

export const ATTENTION_THRESHOLDS = {
  minImpressions: ATTENTION_MIN_IMPRESSIONS,
  strongImpressions: ATTENTION_STRONG_IMPRESSIONS,
  highImpressions: ATTENTION_HIGH_IMPRESSIONS,
  comparisonMinPrevImpressions: COMPARISON_MIN_PREV_IMPRESSIONS,
  visibilityChangeAbs: VISIBILITY_CHANGE_ABS,
  visibilityChangeRel: VISIBILITY_CHANGE_REL,
  nearPositionMin: NEAR_POSITION_MIN,
  nearPositionMax: NEAR_POSITION_MAX,
  strongPositionMax: STRONG_POSITION_MAX,
  lowEngagementMinImpressions: LOW_ENGAGEMENT_MIN_IMPRESSIONS,
  lowEngagementCtrMax: LOW_ENGAGEMENT_CTR_MAX,
  lowEngagementMaxClicks: LOW_ENGAGEMENT_MAX_CLICKS,
  maxItems: ATTENTION_MAX_ITEMS,
  supportingQueriesLimit: SUPPORTING_QUERIES_LIMIT,
} as const;

/**
 * Deterministic, conservative visibility summary.
 * Used only for the high-level sentence — raw metrics remain visible separately.
 *
 * Rules (impressions-based):
 * - insufficient if either period missing, or either period impressions < MIN
 * - stable if absolute change < ABS_FLOOR OR relative |change| < REL_FLOOR
 * - otherwise improving / declining by impressions direction
 */

import type { PeriodMetrics } from "./compare.js";

export type VisibilityCategory =
  | "improving"
  | "stable"
  | "declining"
  | "insufficient";

export type VisibilitySummary = {
  category: VisibilityCategory;
  message: string;
  /** Documented thresholds applied. */
  thresholds: {
    minImpressions: number;
    absoluteFloor: number;
    relativeFloor: number;
  };
};

/** Practical minimum so tiny SRP-era noise is not labeled as a trend. */
export const VISIBILITY_MIN_IMPRESSIONS = 100;
/** Absolute impressions delta below which we call the period stable. */
export const VISIBILITY_ABS_FLOOR = 40;
/** Relative impressions change below which we call the period stable (0.15 = 15%). */
export const VISIBILITY_REL_FLOOR = 0.15;

export function classifyVisibility(args: {
  current: PeriodMetrics | null;
  previous: PeriodMetrics | null;
  hasFullPrevious: boolean;
  periodDays: number;
}): VisibilitySummary {
  const thresholds = {
    minImpressions: VISIBILITY_MIN_IMPRESSIONS,
    absoluteFloor: VISIBILITY_ABS_FLOOR,
    relativeFloor: VISIBILITY_REL_FLOOR,
  };

  const { current, previous, hasFullPrevious, periodDays } = args;

  if (!current) {
    return {
      category: "insufficient",
      message: "There isn't enough search data yet to summarize visibility.",
      thresholds,
    };
  }

  if (!previous || !hasFullPrevious) {
    return {
      category: "insufficient",
      message: `There isn't enough previous data yet to judge a trend over ${periodDays} days.`,
      thresholds,
    };
  }

  if (
    current.impressions < VISIBILITY_MIN_IMPRESSIONS ||
    previous.impressions < VISIBILITY_MIN_IMPRESSIONS
  ) {
    return {
      category: "insufficient",
      message:
        "Search volume is still too low in one of these periods to judge a reliable visibility trend.",
      thresholds,
    };
  }

  const delta = current.impressions - previous.impressions;
  const relative = previous.impressions > 0 ? delta / previous.impressions : 0;

  if (Math.abs(delta) < VISIBILITY_ABS_FLOOR || Math.abs(relative) < VISIBILITY_REL_FLOOR) {
    return {
      category: "stable",
      message: `Search visibility was broadly stable compared with the previous ${periodDays} days.`,
      thresholds,
    };
  }

  if (delta > 0) {
    return {
      category: "improving",
      message: `Search visibility increased over the last ${periodDays} days.`,
      thresholds,
    };
  }

  return {
    category: "declining",
    message: `Search visibility decreased over the last ${periodDays} days.`,
    thresholds,
  };
}

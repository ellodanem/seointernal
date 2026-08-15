/**
 * Metric comparison helpers for current vs previous reporting windows.
 */

export type PeriodMetrics = {
  clicks: number;
  impressions: number;
  /** Fraction 0–1 (not percentage points). */
  ctr: number;
  position: number;
};

export type MetricDelta = {
  absolute: number | null;
  /** Relative change as fraction (0.25 = +25%). Null when undefined / misleading. */
  relative: number | null;
  /** CTR-only: percentage-point change (0.008 = +0.8 pp). */
  percentagePoints: number | null;
  /** Position-only: previous − current (positive = improved / moved up). */
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

/** Roll up daily GSC total rows into period metrics. */
export function aggregateDailyMetrics(
  rows: Array<{ clicks: number; impressions: number; ctr: number; position: number }>,
): PeriodMetrics {
  if (rows.length === 0) {
    return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  }
  let clicks = 0;
  let impressions = 0;
  let positionWeighted = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    positionWeighted += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? positionWeighted / impressions : 0,
  };
}

export function compareCount(current: number, previous: number | null): ComparedMetric {
  if (previous == null) {
    return {
      current,
      previous: null,
      delta: { absolute: null, relative: null, percentagePoints: null, positionsImproved: null },
    };
  }
  const absolute = current - previous;
  let relative: number | null = null;
  if (previous !== 0) {
    relative = absolute / previous;
  } else if (current === 0) {
    relative = 0;
  } else {
    // previous=0, current>0 — absolute delta only; never +∞%
    relative = null;
  }
  return {
    current,
    previous,
    delta: { absolute, relative, percentagePoints: null, positionsImproved: null },
  };
}

export function compareCtr(current: number, previous: number | null): ComparedMetric {
  if (previous == null) {
    return {
      current,
      previous: null,
      delta: { absolute: null, relative: null, percentagePoints: null, positionsImproved: null },
    };
  }
  const percentagePoints = current - previous;
  return {
    current,
    previous,
    delta: {
      absolute: percentagePoints,
      relative: null,
      percentagePoints,
      positionsImproved: null,
    },
  };
}

export function comparePosition(current: number, previous: number | null): ComparedMetric {
  if (previous == null) {
    return {
      current,
      previous: null,
      delta: { absolute: null, relative: null, percentagePoints: null, positionsImproved: null },
    };
  }
  // Lower average position is generally better. Positive = improved.
  const positionsImproved = previous - current;
  return {
    current,
    previous,
    delta: {
      absolute: current - previous,
      relative: null,
      percentagePoints: null,
      positionsImproved,
    },
  };
}

export function comparePeriodMetrics(
  current: PeriodMetrics,
  previous: PeriodMetrics | null,
): ComparedMetrics {
  return {
    clicks: compareCount(current.clicks, previous?.clicks ?? null),
    impressions: compareCount(current.impressions, previous?.impressions ?? null),
    ctr: compareCtr(current.ctr, previous?.ctr ?? null),
    position: comparePosition(current.position, previous?.position ?? null),
  };
}

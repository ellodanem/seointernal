/**
 * Reporting-period helpers for the owner dashboard.
 * All windows anchor to the latest finalized date stored — never "today".
 */

import { addDaysYmd, rollingWindowEndingOn } from "../gsc/dates.js";

export const DASHBOARD_PERIOD_DAYS = [7, 28, 90] as const;
export type DashboardPeriodDays = (typeof DASHBOARD_PERIOD_DAYS)[number];
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriodDays = 28;

export type DateWindow = {
  startDate: string;
  endDate: string;
  days: number;
};

export type ReportingPeriods = {
  days: DashboardPeriodDays;
  dataThrough: string;
  current: DateWindow;
  previous: DateWindow;
  /** True when every calendar day in the current window has a stored row. */
  hasFullCurrent: boolean;
  /** True when every calendar day in the previous window has a stored row. */
  hasFullPrevious: boolean;
  /** Period lengths that can be offered honestly given stored history. */
  availablePeriods: DashboardPeriodDays[];
};

export function isDashboardPeriodDays(value: number): value is DashboardPeriodDays {
  return (DASHBOARD_PERIOD_DAYS as readonly number[]).includes(value);
}

export function resolvePeriodDays(
  requested: number | undefined,
  available: DashboardPeriodDays[],
): DashboardPeriodDays {
  if (requested != null && isDashboardPeriodDays(requested) && available.includes(requested)) {
    return requested;
  }
  if (available.includes(DEFAULT_DASHBOARD_PERIOD)) return DEFAULT_DASHBOARD_PERIOD;
  return available[0] ?? DEFAULT_DASHBOARD_PERIOD;
}

/**
 * Build current + previous equivalent windows ending on latestFinalizedYmd.
 * `storedDates` is the set of YMD strings with ORIGIN (or completeness) totals.
 */
export function buildReportingPeriods(args: {
  latestFinalizedYmd: string;
  periodDays: DashboardPeriodDays;
  storedDates: Iterable<string>;
}): ReportingPeriods {
  const { latestFinalizedYmd, periodDays, storedDates } = args;
  const have = new Set(storedDates);

  const availablePeriods = DASHBOARD_PERIOD_DAYS.filter((d) => {
    const start = rollingWindowEndingOn(latestFinalizedYmd, d).startDate;
    return countStoredInWindow(have, start, latestFinalizedYmd) >= d;
  });

  const current = toWindow(rollingWindowEndingOn(latestFinalizedYmd, periodDays), periodDays);
  const previousEnd = addDaysYmd(current.startDate, -1);
  const previous = toWindow(rollingWindowEndingOn(previousEnd, periodDays), periodDays);

  return {
    days: periodDays,
    dataThrough: latestFinalizedYmd,
    current,
    previous,
    hasFullCurrent: countStoredInWindow(have, current.startDate, current.endDate) >= periodDays,
    hasFullPrevious: countStoredInWindow(have, previous.startDate, previous.endDate) >= periodDays,
    availablePeriods:
      availablePeriods.length > 0
        ? availablePeriods
        : ([periodDays].filter((d) => isDashboardPeriodDays(d)) as DashboardPeriodDays[]),
  };
}

function toWindow(
  w: { startDate: string; endDate: string },
  days: number,
): DateWindow {
  return { startDate: w.startDate, endDate: w.endDate, days };
}

export function countStoredInWindow(
  stored: Set<string>,
  startYmd: string,
  endYmd: string,
): number {
  let n = 0;
  let cur = startYmd;
  while (cur <= endYmd) {
    if (stored.has(cur)) n += 1;
    cur = addDaysYmd(cur, 1);
  }
  return n;
}

export function formatDataThroughLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateDailyMetrics,
  compareCount,
  compareCtr,
  comparePeriodMetrics,
  comparePosition,
} from "./compare.js";
import { humanizePageUrl, humanizePath, hostKeyFromPageUrl } from "./page-label.js";
import {
  buildReportingPeriods,
  formatDataThroughLabel,
  resolvePeriodDays,
} from "./periods.js";
import {
  VISIBILITY_MIN_IMPRESSIONS,
  classifyVisibility,
} from "./visibility.js";
import { addDaysYmd, daysBetweenInclusive } from "../gsc/dates.js";
import { urlBelongsToOrigin } from "../gsc/filters.js";

describe("reporting periods", () => {
  it("anchors 28-day current and previous windows to latest finalized date", () => {
    const stored = daysBetweenInclusive("2026-06-19", "2026-08-13");
    const periods = buildReportingPeriods({
      latestFinalizedYmd: "2026-08-13",
      periodDays: 28,
      storedDates: stored,
    });
    assert.equal(periods.dataThrough, "2026-08-13");
    assert.equal(periods.current.startDate, "2026-07-17");
    assert.equal(periods.current.endDate, "2026-08-13");
    assert.equal(periods.previous.startDate, "2026-06-19");
    assert.equal(periods.previous.endDate, "2026-07-16");
    assert.equal(periods.hasFullCurrent, true);
    assert.equal(periods.hasFullPrevious, true);
    assert.deepEqual(periods.availablePeriods, [7, 28]);
  });

  it("marks previous incomplete when history is partial", () => {
    const stored = daysBetweenInclusive("2026-07-17", "2026-08-13");
    const periods = buildReportingPeriods({
      latestFinalizedYmd: "2026-08-13",
      periodDays: 28,
      storedDates: stored,
    });
    assert.equal(periods.hasFullCurrent, true);
    assert.equal(periods.hasFullPrevious, false);
    assert.deepEqual(periods.availablePeriods, [7, 28]);
  });

  it("supports 7-day windows", () => {
    const stored = daysBetweenInclusive("2026-08-01", "2026-08-13");
    const periods = buildReportingPeriods({
      latestFinalizedYmd: "2026-08-13",
      periodDays: 7,
      storedDates: stored,
    });
    assert.equal(periods.current.startDate, "2026-08-07");
    assert.equal(periods.previous.startDate, "2026-07-31");
    assert.equal(periods.previous.endDate, "2026-08-06");
  });

  it("does not offer 90 days without enough stored history", () => {
    const stored = daysBetweenInclusive("2026-06-19", "2026-08-13");
    const periods = buildReportingPeriods({
      latestFinalizedYmd: "2026-08-13",
      periodDays: 28,
      storedDates: stored,
    });
    assert.equal(periods.availablePeriods.includes(90), false);
  });

  it("resolves period request to available default", () => {
    assert.equal(resolvePeriodDays(90, [7, 28]), 28);
    assert.equal(resolvePeriodDays(7, [7, 28]), 7);
    assert.equal(resolvePeriodDays(undefined, [7]), 7);
  });

  it("formats data-through label in UTC", () => {
    assert.equal(formatDataThroughLabel("2026-08-13"), "Aug 13, 2026");
  });
});

describe("metric comparisons", () => {
  it("aggregates daily totals with impression-weighted position", () => {
    const agg = aggregateDailyMetrics([
      { clicks: 1, impressions: 10, ctr: 0.1, position: 10 },
      { clicks: 1, impressions: 30, ctr: 0.033, position: 20 },
    ]);
    assert.equal(agg.clicks, 2);
    assert.equal(agg.impressions, 40);
    assert.equal(agg.ctr, 0.05);
    assert.equal(agg.position, 17.5);
  });

  it("handles previous=0 without infinite percent", () => {
    const c = compareCount(5, 0);
    assert.equal(c.delta.absolute, 5);
    assert.equal(c.delta.relative, null);
  });

  it("uses percentage-point change for CTR", () => {
    const c = compareCtr(0.031, 0.023);
    assert.ok(c.delta.percentagePoints != null);
    assert.ok(Math.abs(c.delta.percentagePoints! - 0.008) < 1e-9);
    assert.equal(c.delta.relative, null);
  });

  it("reports position improvement directionally, not as percent", () => {
    const c = comparePosition(26.4, 32.0);
    assert.ok(c.delta.positionsImproved != null);
    assert.ok(Math.abs(c.delta.positionsImproved! - 5.6) < 1e-9);
    assert.equal(c.delta.relative, null);
  });

  it("omits deltas when previous period is unavailable", () => {
    const m = comparePeriodMetrics(
      { clicks: 7, impressions: 989, ctr: 0.007, position: 36 },
      null,
    );
    assert.equal(m.clicks.previous, null);
    assert.equal(m.clicks.delta.absolute, null);
  });
});

describe("visibility classification", () => {
  it("returns insufficient when previous history is missing", () => {
    const s = classifyVisibility({
      current: { clicks: 7, impressions: 989, ctr: 0.007, position: 36 },
      previous: null,
      hasFullPrevious: false,
      periodDays: 28,
    });
    assert.equal(s.category, "insufficient");
  });

  it("returns insufficient for low-volume previous period", () => {
    const s = classifyVisibility({
      current: { clicks: 7, impressions: 989, ctr: 0.007, position: 36 },
      previous: { clicks: 0, impressions: 6, ctr: 0, position: 5 },
      hasFullPrevious: true,
      periodDays: 28,
    });
    assert.equal(s.category, "insufficient");
    assert.ok(s.thresholds.minImpressions === VISIBILITY_MIN_IMPRESSIONS);
  });

  it("labels tiny impression moves as stable", () => {
    const s = classifyVisibility({
      current: { clicks: 5, impressions: 430, ctr: 0.01, position: 30 },
      previous: { clicks: 4, impressions: 415, ctr: 0.01, position: 31 },
      hasFullPrevious: true,
      periodDays: 28,
    });
    assert.equal(s.category, "stable");
  });

  it("labels material impression growth as improving", () => {
    const s = classifyVisibility({
      current: { clicks: 20, impressions: 800, ctr: 0.025, position: 28 },
      previous: { clicks: 10, impressions: 400, ctr: 0.025, position: 30 },
      hasFullPrevious: true,
      periodDays: 28,
    });
    assert.equal(s.category, "improving");
  });

  it("labels material impression decline as declining", () => {
    const s = classifyVisibility({
      current: { clicks: 5, impressions: 300, ctr: 0.016, position: 35 },
      previous: { clicks: 12, impressions: 700, ctr: 0.017, position: 28 },
      hasFullPrevious: true,
      periodDays: 28,
    });
    assert.equal(s.category, "declining");
  });
});

describe("origin scoping helpers", () => {
  it("includes primary-origin pages and excludes app host", () => {
    const origin = "https://www.simplerosterplus.com";
    assert.equal(urlBelongsToOrigin("https://www.simplerosterplus.com/pricing", origin), true);
    assert.equal(urlBelongsToOrigin("https://app.simplerosterplus.com/", origin), false);
  });

  it("groups http www as a distinct other-host key", () => {
    assert.equal(hostKeyFromPageUrl("http://www.simplerosterplus.com/"), "http://www.simplerosterplus.com");
    assert.equal(hostKeyFromPageUrl("https://app.simplerosterplus.com/sign-up"), "app.simplerosterplus.com");
  });
});

describe("page labeling", () => {
  it("labels homepage and humanizes slugs", () => {
    assert.equal(humanizePath("/"), "Home");
    assert.equal(
      humanizePageUrl("https://www.simplerosterplus.com/employee-attendance-software").label,
      "Employee Attendance Software",
    );
  });
});

describe("period adjacency", () => {
  it("previous window ends the day before current starts", () => {
    const end = "2026-08-13";
    const currentStart = addDaysYmd(end, -27);
    assert.equal(currentStart, "2026-07-17");
    assert.equal(addDaysYmd(currentStart, -1), "2026-07-16");
  });
});

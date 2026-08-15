/**
 * Finalized-date helpers. Never assume today-2; discover from API.
 */

export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`Invalid YMD date: ${ymd}`);
  }
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function addDaysYmd(ymd: string, delta: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + delta);
  return toYmd(d);
}

export function daysBetweenInclusive(startYmd: string, endYmd: string): string[] {
  if (startYmd > endYmd) return [];
  const out: string[] = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

export function rollingWindowEndingOn(endYmd: string, days: number): { startDate: string; endDate: string } {
  if (days < 1) throw new Error("rolling window days must be >= 1");
  return {
    startDate: addDaysYmd(endYmd, -(days - 1)),
    endDate: endYmd,
  };
}

/** UTC calendar date for "today" (API dates are calendar dates, not timestamps). */
export function utcTodayYmd(now = new Date()): string {
  return toYmd(now);
}

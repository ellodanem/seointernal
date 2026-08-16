/** Display helpers for dashboard numbers — keep formatting UI-side. */

export function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatCtr(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatPosition(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toFixed(1);
}

export function formatDataThrough(ymd: string): string {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatShortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 60) return "just now";
  const mins = Math.round(deltaSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}

/** Calendar date from an ISO timestamp (local display). */
export function formatCheckedDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCountDelta(absolute: number | null, relative: number | null): string | null {
  if (absolute == null) return null;
  const sign = absolute > 0 ? "+" : absolute < 0 ? "" : "";
  const absPart = `${sign}${formatInt(absolute)}`;
  if (relative == null) {
    return absolute === 0 ? "no change" : absPart;
  }
  const pct = `${relative > 0 ? "+" : ""}${(relative * 100).toFixed(0)}%`;
  return `${absPart} (${pct})`;
}

export function formatCtrDelta(pp: number | null): string | null {
  if (pp == null) return null;
  const pts = pp * 100;
  if (Math.abs(pts) < 0.05) return "no change";
  const sign = pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(1)} pp`;
}

export function formatPositionDelta(improved: number | null): string | null {
  if (improved == null) return null;
  if (Math.abs(improved) < 0.05) return "unchanged";
  if (improved > 0) return `improved ${improved.toFixed(1)}`;
  return `moved down ${Math.abs(improved).toFixed(1)}`;
}

export function originDisplay(primaryOrigin: string): string {
  try {
    return new URL(primaryOrigin).host;
  } catch {
    return primaryOrigin.replace(/^https?:\/\//, "");
  }
}

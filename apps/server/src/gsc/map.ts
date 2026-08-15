import type { GscAnalyticsRow, GscMetrics, GscSitemapEntry } from "./types.js";

export function parseHost(pageUrl: string): string {
  try {
    return new URL(pageUrl).host;
  } catch {
    return "";
  }
}

export function parsePath(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    return u.pathname || "/";
  } catch {
    return "/";
  }
}

export function mapAnalyticsRow(raw: {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
}): GscAnalyticsRow {
  return {
    keys: [...(raw.keys ?? [])],
    clicks: Number(raw.clicks) || 0,
    impressions: Number(raw.impressions) || 0,
    ctr: Number(raw.ctr) || 0,
    position: Number(raw.position) || 0,
  };
}

export function mapAggregateMetrics(rows: GscAnalyticsRow[]): GscMetrics {
  if (rows.length === 0) {
    return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  }
  // Search Analytics with no dimensions returns a single aggregate row.
  const row = rows[0]!;
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}

/**
 * Map sitemap list entries. Ignores deprecated contents[].indexed as a metric.
 */
export function mapSitemapEntry(raw: {
  path?: string | null;
  lastSubmitted?: string | null;
  lastDownloaded?: string | null;
  isPending?: boolean | null;
  warnings?: string | number | null;
  errors?: string | number | null;
  contents?: Array<{ type?: string | null; submitted?: string | number | null; indexed?: string | number | null }> | null;
}): GscSitemapEntry | null {
  if (!raw.path) return null;

  let submittedCount: number | null = null;
  if (Array.isArray(raw.contents) && raw.contents.length > 0) {
    submittedCount = raw.contents.reduce((acc, c) => {
      const n = c.submitted == null ? 0 : Number(c.submitted);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }

  // Strip deprecated indexed from stored raw for clarity (keep other fields).
  const sanitizedContents = (raw.contents ?? []).map((c) => {
    const { indexed: _indexed, ...rest } = c;
    return rest;
  });

  return {
    path: raw.path,
    lastSubmitted: raw.lastSubmitted ? new Date(raw.lastSubmitted) : null,
    lastDownloaded: raw.lastDownloaded ? new Date(raw.lastDownloaded) : null,
    isPending: Boolean(raw.isPending),
    submittedCount,
    warningCount: Number(raw.warnings) || 0,
    errorCount: Number(raw.errors) || 0,
    raw: {
      path: raw.path,
      lastSubmitted: raw.lastSubmitted ?? null,
      lastDownloaded: raw.lastDownloaded ?? null,
      isPending: Boolean(raw.isPending),
      warnings: raw.warnings ?? 0,
      errors: raw.errors ?? 0,
      contents: sanitizedContents,
      // Explicitly document that indexed is ignored
      indexedIgnored: true,
    },
  };
}

import { google, type searchconsole_v1, type webmasters_v3 } from "googleapis";
import { assertCredentialsFile, mapGscError } from "./errors.js";
import { GSC_READONLY_SCOPE, type GscDataState } from "./types.js";
import { buildOriginPageFilter } from "./filters.js";
import { mapAnalyticsRow, mapAggregateMetrics, mapSitemapEntry } from "./map.js";
import type { GscAnalyticsRow, GscMetrics, GscSitemapEntry } from "./types.js";
import type { GscUrlInspectionResult, InspectUrlInput } from "./inspection-types.js";
import { addDaysYmd, toYmd, utcTodayYmd } from "./dates.js";

export type GscClient = {
  listSites: () => Promise<Array<{ siteUrl: string; permissionLevel: string | null }>>;
  verifyPropertyAccess: (siteUrl: string) => Promise<boolean>;
  findLatestFinalizedDate: (siteUrl: string, lookbackDays?: number) => Promise<string | null>;
  queryTotals: (opts: {
    siteUrl: string;
    startDate: string;
    endDate: string;
    dataState?: GscDataState;
    originFilter?: string | null;
  }) => Promise<{ metrics: GscMetrics; rowCount: number; truncated: boolean }>;
  queryPages: (opts: {
    siteUrl: string;
    startDate: string;
    endDate: string;
    dataState?: GscDataState;
    rowLimit?: number;
    originFilter?: string | null;
  }) => Promise<{ rows: GscAnalyticsRow[]; truncated: boolean }>;
  queryQueries: (opts: {
    siteUrl: string;
    startDate: string;
    endDate: string;
    dataState?: GscDataState;
    rowLimit?: number;
    originFilter?: string | null;
  }) => Promise<{ rows: GscAnalyticsRow[]; truncated: boolean }>;
  queryQueryPages: (opts: {
    siteUrl: string;
    startDate: string;
    endDate: string;
    dataState?: GscDataState;
    rowLimit?: number;
    originFilter?: string | null;
  }) => Promise<{ rows: GscAnalyticsRow[]; truncated: boolean }>;
  listSitemaps: (siteUrl: string) => Promise<GscSitemapEntry[]>;
  /** URL Inspection API (Search Console v1). One URL per call. */
  inspectUrl: (opts: InspectUrlInput) => Promise<GscUrlInspectionResult>;
};

export type CreateGscClientOptions = {
  credentialsPath: string;
  defaultRowLimit?: number;
};

/**
 * Production Search Console client (read-only).
 * Credentials stay on disk via GOOGLE_APPLICATION_CREDENTIALS — never logged.
 */
export async function createGscClient(opts: CreateGscClientOptions): Promise<GscClient> {
  assertCredentialsFile(opts.credentialsPath);
  const rowLimitDefault = opts.defaultRowLimit ?? 5000;

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: opts.credentialsPath,
      scopes: [GSC_READONLY_SCOPE],
    });
    const authClient = await auth.getClient();
    const webmasters = google.webmasters({
      version: "v3",
      auth: authClient as never,
    });
    const searchconsole = google.searchconsole({
      version: "v1",
      auth: authClient as never,
    });

    return buildClient(webmasters, searchconsole, rowLimitDefault);
  } catch (err) {
    throw mapGscError(err);
  }
}

function buildClient(
  webmasters: webmasters_v3.Webmasters,
  searchconsole: searchconsole_v1.Searchconsole,
  rowLimitDefault: number,
): GscClient {
  async function searchAnalyticsQuery(
    siteUrl: string,
    body: Record<string, unknown>,
  ): Promise<webmasters_v3.Schema$SearchAnalyticsQueryResponse> {
    try {
      const res = await webmasters.searchanalytics.query({
        siteUrl,
        requestBody: body,
      });
      return res.data;
    } catch (err) {
      throw mapGscError(err);
    }
  }

  async function queryDimensioned(opts: {
    siteUrl: string;
    startDate: string;
    endDate: string;
    dimensions: string[];
    dataState?: GscDataState;
    rowLimit?: number;
    originFilter?: string | null;
  }): Promise<{ rows: GscAnalyticsRow[]; truncated: boolean }> {
    const limit = opts.rowLimit ?? rowLimitDefault;
    const body: Record<string, unknown> = {
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions,
      dataState: opts.dataState ?? "final",
      rowLimit: limit,
    };
    if (opts.originFilter) {
      Object.assign(body, buildOriginPageFilter(opts.originFilter));
    }
    const data = await searchAnalyticsQuery(opts.siteUrl, body);
    const rows = (data.rows ?? []).map(mapAnalyticsRow);
    return { rows, truncated: rows.length >= limit };
  }

  return {
    async listSites() {
      try {
        const res = await webmasters.sites.list();
        return (res.data.siteEntry ?? []).map((e) => ({
          siteUrl: e.siteUrl ?? "",
          permissionLevel: e.permissionLevel ?? null,
        }));
      } catch (err) {
        throw mapGscError(err);
      }
    },

    async verifyPropertyAccess(siteUrl: string) {
      const sites = await this.listSites();
      return sites.some((s) => s.siteUrl === siteUrl);
    },

    async findLatestFinalizedDate(siteUrl: string, lookbackDays = 21) {
      const endDate = utcTodayYmd();
      const startDate = addDaysYmd(endDate, -lookbackDays);
      const data = await searchAnalyticsQuery(siteUrl, {
        startDate,
        endDate,
        dimensions: ["date"],
        dataState: "final",
        rowLimit: lookbackDays + 5,
      });
      const dates = (data.rows ?? [])
        .map((r) => r.keys?.[0])
        .filter((d): d is string => Boolean(d))
        .sort();
      return dates.length ? dates[dates.length - 1]! : null;
    },

    async queryTotals(opts) {
      const body: Record<string, unknown> = {
        startDate: opts.startDate,
        endDate: opts.endDate,
        dataState: opts.dataState ?? "final",
      };
      if (opts.originFilter) {
        Object.assign(body, buildOriginPageFilter(opts.originFilter));
      }
      const data = await searchAnalyticsQuery(opts.siteUrl, body);
      const rows = (data.rows ?? []).map(mapAnalyticsRow);
      return {
        metrics: mapAggregateMetrics(rows),
        rowCount: rows.length,
        truncated: false,
      };
    },

    async queryPages(opts) {
      return queryDimensioned({ ...opts, dimensions: ["page"] });
    },

    async queryQueries(opts) {
      return queryDimensioned({ ...opts, dimensions: ["query"] });
    },

    async queryQueryPages(opts) {
      return queryDimensioned({ ...opts, dimensions: ["query", "page"] });
    },

    async listSitemaps(siteUrl: string) {
      try {
        const res = await webmasters.sitemaps.list({ siteUrl });
        return (res.data.sitemap ?? [])
          .map((s) => mapSitemapEntry(s))
          .filter((s): s is GscSitemapEntry => s !== null);
      } catch (err) {
        throw mapGscError(err);
      }
    },

    async inspectUrl(opts: InspectUrlInput) {
      try {
        const res = await searchconsole.urlInspection.index.inspect({
          requestBody: {
            inspectionUrl: opts.inspectionUrl,
            siteUrl: opts.siteUrl,
            languageCode: opts.languageCode ?? "en-US",
          },
        });
        return mapInspectionResult(opts.inspectionUrl, res.data);
      } catch (err) {
        throw mapGscError(err);
      }
    },
  };
}

function mapInspectionResult(
  inspectedUrl: string,
  data: searchconsole_v1.Schema$InspectUrlIndexResponse,
): GscUrlInspectionResult {
  const result = data.inspectionResult ?? {};
  const indexStatus = result.indexStatusResult ?? {};
  const referringUrls = Array.isArray(indexStatus.referringUrls)
    ? indexStatus.referringUrls.filter((u): u is string => typeof u === "string").slice(0, 20)
    : [];

  return {
    inspectedUrl,
    inspectionResultLink: result.inspectionResultLink ?? null,
    verdict: indexStatus.verdict ?? null,
    coverageState: indexStatus.coverageState ?? null,
    indexingState: indexStatus.indexingState ?? null,
    robotsTxtState: indexStatus.robotsTxtState ?? null,
    pageFetchState: indexStatus.pageFetchState ?? null,
    lastCrawlTime: indexStatus.lastCrawlTime ? new Date(indexStatus.lastCrawlTime) : null,
    googleCanonical: indexStatus.googleCanonical ?? null,
    userCanonical: indexStatus.userCanonical ?? null,
    crawledAs: indexStatus.crawledAs ?? null,
    referringUrls,
    raw: {
      inspectionResultLink: result.inspectionResultLink ?? null,
      verdict: indexStatus.verdict ?? null,
      coverageState: indexStatus.coverageState ?? null,
      indexingState: indexStatus.indexingState ?? null,
      robotsTxtState: indexStatus.robotsTxtState ?? null,
      pageFetchState: indexStatus.pageFetchState ?? null,
      lastCrawlTime: indexStatus.lastCrawlTime ?? null,
      googleCanonical: indexStatus.googleCanonical ?? null,
      userCanonical: indexStatus.userCanonical ?? null,
      crawledAs: indexStatus.crawledAs ?? null,
      referringUrls,
    },
  };
}

/** Sleep helper for bounded backoff. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a GSC call with bounded exponential backoff for transient/quota errors.
 */
export async function withGscRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; baseMs?: number },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 4;
  const baseMs = opts?.baseMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const mapped = mapGscError(err);
      if (!mapped.retryable || attempt === maxAttempts) throw mapped;
      const delay = baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw mapGscError(lastErr);
}

export { toYmd };

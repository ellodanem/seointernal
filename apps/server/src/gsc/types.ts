/**
 * Shared GSC types and constants.
 */

export const GSC_READONLY_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly" as const;

export const DEFAULT_GSC_ROW_LIMIT = 5000;

export type GscDataState = "final" | "all";

export type GscAnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSitemapEntry = {
  path: string;
  lastSubmitted: Date | null;
  lastDownloaded: Date | null;
  isPending: boolean;
  submittedCount: number | null;
  warningCount: number;
  errorCount: number;
  /** Raw API object without deprecated indexed used as a metric. */
  raw: Record<string, unknown>;
};

export type GscDateRange = {
  startDate: string;
  endDate: string;
};

export class GscError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: { code: string; httpStatus?: number | null; retryable?: boolean; cause?: unknown },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "GscError";
    this.code = opts.code;
    this.httpStatus = opts.httpStatus ?? null;
    this.retryable = opts.retryable ?? false;
  }
}

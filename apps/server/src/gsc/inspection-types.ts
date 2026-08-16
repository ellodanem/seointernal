/**
 * Phase 6 — URL Inspection types and constants.
 */

export const NORMALIZED_INDEXING_STATUSES = [
  "INDEXED",
  "NOT_INDEXED",
  "BLOCKED",
  "CANONICALIZED_ELSEWHERE",
  "UNKNOWN",
] as const;

export type NormalizedIndexingStatus = (typeof NORMALIZED_INDEXING_STATUSES)[number];

export const CANONICAL_STATES = ["ALIGNED", "MISMATCH", "UNKNOWN"] as const;
export type CanonicalState = (typeof CANONICAL_STATES)[number];

export type GscUrlInspectionResult = {
  inspectedUrl: string;
  inspectionResultLink: string | null;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: Date | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  crawledAs: string | null;
  referringUrls: string[];
  /** Compact payload suitable for Json storage (not the entire API envelope). */
  raw: Record<string, unknown>;
};

export type InspectUrlInput = {
  inspectionUrl: string;
  siteUrl: string;
  languageCode?: string;
};

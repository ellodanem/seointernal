/**
 * Deterministic normalization of Google URL Inspection index status.
 * Prefer UNKNOWN over a false claim when evidence is ambiguous.
 */

import { urlsEquivalentForCanonical } from "./canonical.js";
import type {
  CanonicalState,
  NormalizedIndexingStatus,
} from "./inspection-types.js";

export type IndexStatusFields = {
  inspectedUrl: string;
  verdict?: string | null;
  coverageState?: string | null;
  indexingState?: string | null;
  robotsTxtState?: string | null;
  pageFetchState?: string | null;
  googleCanonical?: string | null;
  userCanonical?: string | null;
};

const BLOCKED_INDEXING = new Set([
  "BLOCKED_BY_META_TAG",
  "BLOCKED_BY_HTTP_HEADER",
  "BLOCKED_BY_ROBOTS_TXT",
]);

export function normalizeIndexingStatus(input: IndexStatusFields): NormalizedIndexingStatus {
  const robots = (input.robotsTxtState ?? "").toUpperCase();
  const indexing = (input.indexingState ?? "").toUpperCase();
  const coverage = (input.coverageState ?? "").trim();
  const coverageLower = coverage.toLowerCase();

  if (
    robots === "DISALLOWED" ||
    BLOCKED_INDEXING.has(indexing) ||
    indexing.includes("BLOCKED") ||
    /\bblocked\b/i.test(coverage)
  ) {
    return "BLOCKED";
  }

  if (isCanonicalizedElsewhereCoverage(coverageLower)) {
    return "CANONICALIZED_ELSEWHERE";
  }

  const googleCanon = input.googleCanonical?.trim() || null;
  if (
    googleCanon &&
    !urlsEquivalentForCanonical(input.inspectedUrl, googleCanon) &&
    !looksIndexedAsSelf(coverageLower)
  ) {
    return "CANONICALIZED_ELSEWHERE";
  }

  if (looksIndexedAsSelf(coverageLower)) {
    return "INDEXED";
  }

  if (looksNotIndexed(coverageLower)) {
    return "NOT_INDEXED";
  }

  // Strong google-canonical mismatch even with thin coverage text.
  if (googleCanon && !urlsEquivalentForCanonical(input.inspectedUrl, googleCanon)) {
    return "CANONICALIZED_ELSEWHERE";
  }

  return "UNKNOWN";
}

export function deriveCanonicalState(input: IndexStatusFields): CanonicalState {
  const google = input.googleCanonical?.trim();
  if (!google) return "UNKNOWN";
  return urlsEquivalentForCanonical(input.inspectedUrl, google) ? "ALIGNED" : "MISMATCH";
}

function isCanonicalizedElsewhereCoverage(coverageLower: string): boolean {
  return (
    coverageLower.includes("google chose different canonical") ||
    coverageLower.includes("duplicate without user-selected canonical") ||
    coverageLower.includes("alternate page with proper canonical tag") ||
    (coverageLower.includes("duplicate") && coverageLower.includes("canonical"))
  );
}

function looksIndexedAsSelf(coverageLower: string): boolean {
  if (!coverageLower) return false;
  if (coverageLower.includes("not indexed")) return false;
  if (coverageLower.includes("currently not indexed")) return false;
  return (
    coverageLower.includes("submitted and indexed") ||
    coverageLower === "indexed" ||
    /^indexed\b/.test(coverageLower)
  );
}

function looksNotIndexed(coverageLower: string): boolean {
  if (!coverageLower) return false;
  return (
    coverageLower.includes("not indexed") ||
    coverageLower.includes("url is unknown to google") ||
    coverageLower.includes("discovered - currently not indexed") ||
    coverageLower.includes("crawled - currently not indexed") ||
    coverageLower.includes("excluded")
  );
}

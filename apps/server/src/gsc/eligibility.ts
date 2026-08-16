/**
 * Phase 6 inspection eligibility — managed page inventory is authoritative.
 * Only pages with role INDEXABLE are inspected.
 */

import { PageRole, type Page } from "@prisma/client";
import { normalizeOrigin, urlBelongsToOrigin } from "./filters.js";

export type EligiblePage = Pick<
  Page,
  "id" | "url" | "host" | "path" | "role" | "source" | "projectId" | "watched" | "createdAt" | "updatedAt"
>;


/**
 * A page is eligible for URL Inspection when:
 * - role is INDEXABLE (intent from managed inventory)
 * - URL belongs to the project's primary SEO origin
 *
 * Explicitly excluded: NOINDEX, UNKNOWN (incl. GSC-discovered), other hosts.
 */
export function isPageEligibleForInspection(
  page: Pick<Page, "role" | "url">,
  primaryOrigin: string,
): boolean {
  if (page.role !== PageRole.INDEXABLE) return false;
  try {
    normalizeOrigin(primaryOrigin);
  } catch {
    return false;
  }
  return urlBelongsToOrigin(page.url, primaryOrigin);
}

export function filterEligiblePages(
  pages: EligiblePage[],
  primaryOrigin: string,
): EligiblePage[] {
  return pages
    .filter((p) => isPageEligibleForInspection(p, primaryOrigin))
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path) || a.url.localeCompare(b.url));
}

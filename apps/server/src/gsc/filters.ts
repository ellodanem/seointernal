/**
 * Search Analytics dimension filters for primary-origin scoping.
 *
 * GSC operator `contains` matches page URLs that include the expression.
 * For an https origin such as https://www.example.com this behaves as a
 * practical origin/prefix filter: app-host and other-scheme URLs are excluded.
 */

export type PageDimensionFilter = {
  dimension: "page";
  operator: "contains" | "equals" | "includingRegex";
  expression: string;
};

export type DimensionFilterGroup = {
  groupType: "and";
  filters: PageDimensionFilter[];
};

/**
 * Build the request fragment that restricts analytics rows to pages under
 * the managed primary origin.
 */
export function buildOriginPageFilter(primaryOrigin: string): {
  dimensionFilterGroups: DimensionFilterGroup[];
} {
  const origin = normalizeOrigin(primaryOrigin);
  return {
    dimensionFilterGroups: [
      {
        groupType: "and",
        filters: [
          {
            dimension: "page",
            operator: "contains",
            expression: origin,
          },
        ],
      },
    ],
  };
}

/** Strip trailing slash except for bare origin identity used in filters/scopeValue. */
export function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (!trimmed) throw new Error("primaryOrigin is empty");
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host}`;
  } catch {
    throw new Error(`Invalid primaryOrigin: ${origin}`);
  }
}

export function urlBelongsToOrigin(pageUrl: string, primaryOrigin: string): boolean {
  const origin = normalizeOrigin(primaryOrigin);
  return pageUrl.includes(origin);
}

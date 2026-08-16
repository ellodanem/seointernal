import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PageRole, PageSource } from "@prisma/client";
import {
  deriveCanonicalState,
  filterEligiblePages,
  isInspectionFresh,
  isPageEligibleForInspection,
  normalizeIndexingStatus,
  shouldInspectPage,
  urlsEquivalentForCanonical,
  normalizeUrlForCanonicalCompare,
} from "../gsc/index.js";
import { buildDashboardIndexing } from "../dashboard/indexing.js";
import { composeAttention } from "../dashboard/compose-attention.js";
import type { AttentionResult } from "../dashboard/attention-types.js";
import { ATTENTION_THRESHOLDS } from "../dashboard/attention-thresholds.js";
import type { GscUrlInspection, Page } from "@prisma/client";

const ORIGIN = "https://www.simplerosterplus.com";

function page(partial: Partial<Page> & Pick<Page, "url" | "role">): Page {
  const path = (() => {
    try {
      return new URL(partial.url).pathname || "/";
    } catch {
      return "/";
    }
  })();
  return {
    id: partial.id ?? partial.url,
    projectId: partial.projectId ?? "proj-a",
    url: partial.url,
    host: partial.host ?? "www.simplerosterplus.com",
    path: partial.path ?? path,
    role: partial.role,
    source: partial.source ?? PageSource.MANUAL,
    watched: partial.watched ?? false,
    createdAt: partial.createdAt ?? new Date(),
    updatedAt: partial.updatedAt ?? new Date(),
  };
}

describe("inspection eligibility", () => {
  it("includes INDEXABLE primary-origin pages", () => {
    const p = page({
      url: "https://www.simplerosterplus.com/employee-scheduling-software",
      role: PageRole.INDEXABLE,
    });
    assert.equal(isPageEligibleForInspection(p, ORIGIN), true);
  });

  it("excludes NOINDEX", () => {
    const p = page({
      url: "https://www.simplerosterplus.com/privacy.html",
      role: PageRole.NOINDEX,
    });
    assert.equal(isPageEligibleForInspection(p, ORIGIN), false);
  });

  it("excludes UNKNOWN GSC-discovered pages", () => {
    const p = page({
      url: "https://www.simplerosterplus.com/employee-scheduling-software",
      role: PageRole.UNKNOWN,
      source: PageSource.GSC,
    });
    assert.equal(isPageEligibleForInspection(p, ORIGIN), false);
  });

  it("excludes other hosts even if marked INDEXABLE by mistake filtering origin", () => {
    const p = page({
      url: "https://app.simplerosterplus.com/",
      role: PageRole.INDEXABLE,
      host: "app.simplerosterplus.com",
    });
    assert.equal(isPageEligibleForInspection(p, ORIGIN), false);
  });

  it("filterEligiblePages returns only INDEXABLE primary pages", () => {
    const pages = [
      page({ url: `${ORIGIN}/`, role: PageRole.INDEXABLE, path: "/" }),
      page({ url: `${ORIGIN}/privacy.html`, role: PageRole.NOINDEX, path: "/privacy.html" }),
      page({
        url: "https://app.simplerosterplus.com/",
        role: PageRole.UNKNOWN,
        host: "app.simplerosterplus.com",
        path: "/",
      }),
      page({
        url: `${ORIGIN}/zkteco-attendance-integration`,
        role: PageRole.UNKNOWN,
        path: "/zkteco-attendance-integration",
      }),
    ];
    const eligible = filterEligiblePages(pages, ORIGIN);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0]!.path, "/");
  });
});

describe("indexing normalization", () => {
  it("maps submitted and indexed → INDEXED", () => {
    assert.equal(
      normalizeIndexingStatus({
        inspectedUrl: `${ORIGIN}/`,
        verdict: "PASS",
        coverageState: "Submitted and indexed",
        indexingState: "INDEXING_ALLOWED",
        robotsTxtState: "ALLOWED",
        googleCanonical: `${ORIGIN}/`,
      }),
      "INDEXED",
    );
  });

  it("maps not indexed coverage → NOT_INDEXED", () => {
    assert.equal(
      normalizeIndexingStatus({
        inspectedUrl: `${ORIGIN}/a`,
        coverageState: "Crawled - currently not indexed",
        indexingState: "INDEXING_ALLOWED",
        robotsTxtState: "ALLOWED",
        googleCanonical: `${ORIGIN}/a`,
      }),
      "NOT_INDEXED",
    );
  });

  it("maps robots/indexing blocked → BLOCKED", () => {
    assert.equal(
      normalizeIndexingStatus({
        inspectedUrl: `${ORIGIN}/a`,
        coverageState: "Blocked by robots.txt",
        indexingState: "BLOCKED_BY_ROBOTS_TXT",
        robotsTxtState: "DISALLOWED",
      }),
      "BLOCKED",
    );
  });

  it("maps google-chose-different-canonical → CANONICALIZED_ELSEWHERE", () => {
    assert.equal(
      normalizeIndexingStatus({
        inspectedUrl: `${ORIGIN}/a`,
        coverageState: "Duplicate, Google chose different canonical as canonical",
        googleCanonical: `${ORIGIN}/b`,
      }),
      "CANONICALIZED_ELSEWHERE",
    );
  });

  it("returns UNKNOWN when ambiguous", () => {
    assert.equal(
      normalizeIndexingStatus({
        inspectedUrl: `${ORIGIN}/a`,
        coverageState: null,
        indexingState: null,
      }),
      "UNKNOWN",
    );
  });
});

describe("canonical comparison", () => {
  it("exact match", () => {
    assert.equal(urlsEquivalentForCanonical(`${ORIGIN}/a`, `${ORIGIN}/a`), true);
  });

  it("trailing slash equivalent", () => {
    assert.equal(urlsEquivalentForCanonical(`${ORIGIN}/a`, `${ORIGIN}/a/`), true);
    assert.equal(
      normalizeUrlForCanonicalCompare(`${ORIGIN}/`),
      normalizeUrlForCanonicalCompare(ORIGIN),
    );
  });

  it("http vs https not equivalent", () => {
    assert.equal(
      urlsEquivalentForCanonical("http://www.simplerosterplus.com/a", `${ORIGIN}/a`),
      false,
    );
  });

  it("host mismatch", () => {
    assert.equal(
      urlsEquivalentForCanonical(`${ORIGIN}/a`, "https://app.simplerosterplus.com/a"),
      false,
    );
  });

  it("different path", () => {
    assert.equal(urlsEquivalentForCanonical(`${ORIGIN}/a`, `${ORIGIN}/b`), false);
  });

  it("deriveCanonicalState ALIGNED vs MISMATCH", () => {
    assert.equal(
      deriveCanonicalState({
        inspectedUrl: `${ORIGIN}/a`,
        googleCanonical: `${ORIGIN}/a/`,
      }),
      "ALIGNED",
    );
    assert.equal(
      deriveCanonicalState({
        inspectedUrl: `${ORIGIN}/a`,
        googleCanonical: `${ORIGIN}/b`,
      }),
      "MISMATCH",
    );
  });
});

describe("inspection freshness", () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  const now = new Date("2026-08-16T12:00:00.000Z");

  it("skips recently inspected", () => {
    assert.equal(
      isInspectionFresh({
        lastSuccessfulAt: new Date("2026-08-15T12:00:00.000Z"),
        freshnessMs: week,
        now,
      }),
      true,
    );
    assert.equal(
      shouldInspectPage({
        lastSuccessfulAt: new Date("2026-08-15T12:00:00.000Z"),
        force: false,
        freshnessMs: week,
        now,
      }),
      false,
    );
  });

  it("inspects stale", () => {
    assert.equal(
      shouldInspectPage({
        lastSuccessfulAt: new Date("2026-08-01T12:00:00.000Z"),
        force: false,
        freshnessMs: week,
        now,
      }),
      true,
    );
  });

  it("force bypasses freshness", () => {
    assert.equal(
      shouldInspectPage({
        lastSuccessfulAt: new Date("2026-08-15T12:00:00.000Z"),
        force: true,
        freshnessMs: week,
        now,
      }),
      true,
    );
  });
});

describe("dashboard indexing summary", () => {
  function insp(partial: Partial<GscUrlInspection> & { pageId: string; inspectedUrl: string }): GscUrlInspection {
    return {
      id: partial.id ?? partial.pageId,
      projectId: partial.projectId ?? "proj-a",
      gscPropertyId: partial.gscPropertyId ?? "prop",
      pageId: partial.pageId,
      inspectedUrl: partial.inspectedUrl,
      inspectedAt: partial.inspectedAt ?? new Date("2026-08-16T10:00:00.000Z"),
      success: partial.success ?? true,
      errorCode: partial.errorCode ?? null,
      errorMessage: partial.errorMessage ?? null,
      verdict: partial.verdict ?? "PASS",
      coverageState: partial.coverageState ?? "Submitted and indexed",
      indexingState: partial.indexingState ?? "INDEXING_ALLOWED",
      robotsTxtState: partial.robotsTxtState ?? "ALLOWED",
      pageFetchState: partial.pageFetchState ?? "SUCCESSFUL",
      lastCrawlTime: partial.lastCrawlTime ?? new Date("2026-07-27T00:00:00.000Z"),
      googleCanonical: partial.googleCanonical ?? partial.inspectedUrl,
      userCanonical: partial.userCanonical ?? partial.inspectedUrl,
      crawledAs: partial.crawledAs ?? "MOBILE",
      normalizedStatus: partial.normalizedStatus ?? "INDEXED",
      canonicalState: partial.canonicalState ?? "ALIGNED",
      rawResult: partial.rawResult ?? null,
    };
  }

  const sevenPages = [
    "/",
    "/employee-scheduling-software",
    "/employee-attendance-software",
    "/zkteco-attendance-integration",
    "/small-business-employee-scheduling",
    "/employee-leave-and-availability",
    "/employee-time-clock-app",
  ].map((path, i) =>
    page({
      id: `p${i}`,
      url: path === "/" ? `${ORIGIN}/` : `${ORIGIN}${path}`,
      path,
      role: PageRole.INDEXABLE,
    }),
  );

  it("7/7 healthy", () => {
    const latest = sevenPages.map((p) =>
      insp({ pageId: p.id, inspectedUrl: p.url }),
    );
    const dash = buildDashboardIndexing({
      pages: sevenPages,
      primaryOrigin: ORIGIN,
      latestSuccessful: latest,
      lastInspectJob: null,
      lastInspectSuccessAt: new Date("2026-08-16T10:00:00.000Z"),
      cadenceMs: weekMs(),
    });
    assert.equal(dash.summary.healthy, true);
    assert.equal(dash.summary.expectedCount, 7);
    assert.equal(dash.summary.indexedCount, 7);
    assert.equal(dash.attention.length, 0);
    assert.match(dash.summary.headline, /healthy/i);
  });

  it("one not indexed", () => {
    const latest = sevenPages.map((p, i) =>
      insp({
        pageId: p.id,
        inspectedUrl: p.url,
        ...(i === 1
          ? {
              normalizedStatus: "NOT_INDEXED",
              coverageState: "Discovered - currently not indexed",
              canonicalState: "ALIGNED",
            }
          : {}),
      }),
    );
    const dash = buildDashboardIndexing({
      pages: sevenPages,
      primaryOrigin: ORIGIN,
      latestSuccessful: latest,
      lastInspectJob: null,
      lastInspectSuccessAt: new Date(),
      cadenceMs: weekMs(),
    });
    assert.equal(dash.summary.healthy, false);
    assert.equal(dash.summary.needsReviewCount, 1);
    assert.equal(dash.attention[0]!.category, "NOT_INDEXED");
    assert.equal(dash.pages[0]!.normalizedStatus, "NOT_INDEXED");
  });

  it("one canonical mismatch", () => {
    const latest = sevenPages.map((p, i) =>
      insp({
        pageId: p.id,
        inspectedUrl: p.url,
        ...(i === 2
          ? {
              normalizedStatus: "INDEXED",
              canonicalState: "MISMATCH",
              googleCanonical: `${ORIGIN}/other`,
            }
          : {}),
      }),
    );
    const dash = buildDashboardIndexing({
      pages: sevenPages,
      primaryOrigin: ORIGIN,
      latestSuccessful: latest,
      lastInspectJob: null,
      lastInspectSuccessAt: new Date(),
      cadenceMs: weekMs(),
    });
    assert.equal(dash.summary.needsReviewCount, 1);
    assert.equal(dash.attention[0]!.category, "CANONICAL_MISMATCH");
  });

  it("never checked", () => {
    const dash = buildDashboardIndexing({
      pages: sevenPages,
      primaryOrigin: ORIGIN,
      latestSuccessful: [],
      lastInspectJob: null,
      lastInspectSuccessAt: null,
      cadenceMs: weekMs(),
    });
    assert.equal(dash.summary.neverCheckedCount, 7);
    assert.equal(dash.pages.every((p) => p.neverChecked), true);
    assert.equal(dash.pages[0]!.statusLabel, "Not checked yet");
  });

  it("project isolation — other project inspections ignored by page set", () => {
    const pagesA = [page({ id: "a1", url: `${ORIGIN}/`, role: PageRole.INDEXABLE, projectId: "proj-a" })];
    const dash = buildDashboardIndexing({
      pages: pagesA,
      primaryOrigin: ORIGIN,
      latestSuccessful: [
        insp({
          pageId: "b1",
          projectId: "proj-b",
          inspectedUrl: `${ORIGIN}/`,
          normalizedStatus: "BLOCKED",
        }),
      ],
      lastInspectJob: null,
      lastInspectSuccessAt: null,
      cadenceMs: weekMs(),
    });
    assert.equal(dash.pages[0]!.neverChecked, true);
  });
});

describe("attention composition", () => {
  it("indexing contradiction suppresses performance attention for same page", () => {
    const pages = [
      page({ id: "p1", url: `${ORIGIN}/zkteco-attendance-integration`, role: PageRole.INDEXABLE }),
    ];
    const indexing = buildDashboardIndexing({
      pages,
      primaryOrigin: ORIGIN,
      latestSuccessful: [
        {
          id: "i1",
          projectId: "proj-a",
          gscPropertyId: "prop",
          pageId: "p1",
          inspectedUrl: pages[0]!.url,
          inspectedAt: new Date(),
          success: true,
          errorCode: null,
          errorMessage: null,
          verdict: "FAIL",
          coverageState: "Blocked by robots.txt",
          indexingState: "BLOCKED_BY_ROBOTS_TXT",
          robotsTxtState: "DISALLOWED",
          pageFetchState: null,
          lastCrawlTime: null,
          googleCanonical: null,
          userCanonical: null,
          crawledAs: null,
          normalizedStatus: "BLOCKED",
          canonicalState: "UNKNOWN",
          rawResult: null,
        },
      ],
      lastInspectJob: null,
      lastInspectSuccessAt: new Date(),
      cadenceMs: weekMs(),
    });

    const performance: AttentionResult = {
      items: [
        {
          id: "perf-1",
          pageUrl: pages[0]!.url,
          label: "ZKTeco",
          path: "/zkteco-attendance-integration",
          category: "NEAR_STRONGER_VISIBILITY",
          categoryLabel: "Near stronger visibility",
          confidence: "early",
          reason: "Appearing near stronger positions.",
          stance: "review",
          stanceLabel: "Worth reviewing",
          metrics: { clicks: 0, impressions: 110, ctr: 0, position: 8.6 },
          previous: null,
          comparisonEligible: false,
          changeDirection: null,
          supportingQueries: [],
          dataThrough: "2026-08-13",
          generatedAt: new Date().toISOString(),
        },
      ],
      emptyMessage: null,
      immature: true,
      thresholds: ATTENTION_THRESHOLDS,
      generatedAt: new Date().toISOString(),
    };

    const composed = composeAttention({ indexing, performance });
    assert.equal(composed.indexing.length, 1);
    assert.equal(composed.performance.length, 0);
    assert.equal(composed.performanceSuppressedCount, 1);
  });
});

function weekMs() {
  return 7 * 24 * 60 * 60 * 1000;
}

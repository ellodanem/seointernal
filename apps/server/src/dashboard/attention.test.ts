import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyConfidence,
  confidenceLabel,
  generateAttention,
  hasPositiveMomentum,
  isComparisonEligible,
  isMaterialVisibilityChange,
} from "./attention.js";
import {
  ATTENTION_MAX_ITEMS,
  ATTENTION_MIN_IMPRESSIONS,
  COMPARISON_MIN_PREV_IMPRESSIONS,
} from "./attention-thresholds.js";
import type { AttentionPageInput, AttentionQueryInput } from "./attention-types.js";

function page(
  path: string,
  current: { clicks: number; impressions: number; position: number; ctr?: number },
  previous: { clicks: number; impressions: number; position: number; ctr?: number } | null,
): AttentionPageInput {
  const curCtr =
    current.ctr ?? (current.impressions > 0 ? current.clicks / current.impressions : 0);
  const prev =
    previous == null
      ? null
      : {
          clicks: previous.clicks,
          impressions: previous.impressions,
          position: previous.position,
          ctr:
            previous.ctr ??
            (previous.impressions > 0 ? previous.clicks / previous.impressions : 0),
        };
  return {
    pageUrl: `https://www.example.com${path}`,
    label: path === "/" ? "Home" : path.slice(1),
    path,
    current: {
      clicks: current.clicks,
      impressions: current.impressions,
      position: current.position,
      ctr: curCtr,
    },
    previous: prev,
  };
}

function run(
  pages: AttentionPageInput[],
  opts: {
    hasFullPrevious?: boolean;
    queries?: AttentionQueryInput[];
    projectPreviousImpressions?: number | null;
    projectCurrentImpressions?: number;
  } = {},
) {
  return generateAttention({
    pages,
    queries: opts.queries ?? [],
    hasFullPrevious: opts.hasFullPrevious ?? true,
    dataThrough: "2026-08-13",
    periodDays: 28,
    projectPreviousImpressions: opts.projectPreviousImpressions ?? 200,
    projectCurrentImpressions: opts.projectCurrentImpressions ?? 500,
    generatedAt: "2026-08-15T00:00:00.000Z",
  });
}

describe("attention thresholds & helpers", () => {
  it("requires prior impressions before comparison eligibility", () => {
    assert.equal(
      isComparisonEligible({ clicks: 0, impressions: 5, ctr: 0, position: 10 }, true),
      false,
    );
    assert.equal(
      isComparisonEligible(
        { clicks: 2, impressions: COMPARISON_MIN_PREV_IMPRESSIONS, ctr: 0.01, position: 12 },
        true,
      ),
      true,
    );
    assert.equal(
      isComparisonEligible(
        { clicks: 2, impressions: 200, ctr: 0.01, position: 12 },
        false,
      ),
      false,
    );
  });

  it("requires absolute and relative movement for material change", () => {
    // 10 → 14: too small
    assert.equal(
      isMaterialVisibilityChange(
        { clicks: 0, impressions: 14, ctr: 0, position: 20 },
        { clicks: 0, impressions: 10, ctr: 0, position: 20 },
      ).material,
      false,
    );
    // 100 → 140: 40 abs and 40% rel
    const up = isMaterialVisibilityChange(
      { clicks: 2, impressions: 140, ctr: 0.014, position: 18 },
      { clicks: 1, impressions: 100, ctr: 0.01, position: 20 },
    );
    assert.equal(up.material, true);
    assert.equal(up.direction, "increase");

    const down = isMaterialVisibilityChange(
      { clicks: 1, impressions: 120, ctr: 0.008, position: 22 },
      { clicks: 3, impressions: 250, ctr: 0.012, position: 18 },
    );
    assert.equal(down.material, true);
    assert.equal(down.direction, "decrease");
  });

  it("detects positive momentum for anti-churn", () => {
    const current = { clicks: 4, impressions: 180, ctr: 0.022, position: 14 };
    const previous = { clicks: 2, impressions: 80, ctr: 0.025, position: 18 };
    assert.equal(hasPositiveMomentum(current, previous, true), true);
    assert.equal(hasPositiveMomentum(current, previous, false), false);
  });

  it("maps confidence from evidence depth", () => {
    assert.equal(
      classifyConfidence({
        impressions: 60,
        comparisonEligible: false,
        category: "WORTH_WATCHING",
      }),
      "early",
    );
    assert.equal(
      classifyConfidence({
        impressions: 280,
        comparisonEligible: false,
        category: "NEAR_STRONGER_VISIBILITY",
      }),
      "early",
    );
    assert.equal(
      classifyConfidence({
        impressions: 150,
        comparisonEligible: true,
        category: "NEAR_STRONGER_VISIBILITY",
      }),
      "moderate",
    );
    assert.equal(
      classifyConfidence({
        impressions: 220,
        comparisonEligible: true,
        category: "VISIBILITY_CHANGE",
      }),
      "strong",
    );
    assert.equal(confidenceLabel("early"), "Early signal");
  });
});

describe("attention fixtures", () => {
  it("sparse new page → no attention item", () => {
    const result = run([
      page("/", { clicks: 0, impressions: 12, position: 40 }, {
        clicks: 0,
        impressions: 0,
        position: 0,
      }),
    ]);
    assert.equal(result.items.length, 0);
    assert.ok(result.emptyMessage);
  });

  it("moderate page-two visibility → NEAR_STRONGER_VISIBILITY", () => {
    const result = run([
      page(
        "/employee-scheduling-software",
        { clicks: 4, impressions: 150, position: 14 },
        { clicks: 0, impressions: 0, position: 0 },
      ),
    ]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]!.category, "NEAR_STRONGER_VISIBILITY");
    assert.equal(result.items[0]!.confidence, "early");
    assert.match(result.items[0]!.stanceLabel, /Review|Watch/i);
  });

  it("improving page → leave alone / monitor, not rewrite pressure", () => {
    const result = run([
      page(
        "/growing",
        { clicks: 5, impressions: 180, position: 14 },
        { clicks: 2, impressions: 80, position: 18 },
      ),
    ]);
    assert.equal(result.items.length, 1);
    const item = result.items[0]!;
    // Eligible increase → VISIBILITY_CHANGE with leave_alone / monitor_momentum
    assert.equal(item.category, "VISIBILITY_CHANGE");
    assert.equal(item.changeDirection, "increase");
    assert.ok(item.stance === "leave_alone" || item.stance === "monitor_momentum");
    assert.doesNotMatch(item.reason, /rewrite|add FAQ|backlink/i);
  });

  it("meaningful decline → VISIBILITY_CHANGE review", () => {
    const result = run([
      page(
        "/declining",
        { clicks: 2, impressions: 120, position: 22 },
        { clicks: 5, impressions: 250, position: 16 },
      ),
    ]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]!.category, "VISIBILITY_CHANGE");
    assert.equal(result.items[0]!.changeDirection, "decrease");
    assert.equal(result.items[0]!.stance, "review");
  });

  it("strong position weak clicks → cautious low-engagement", () => {
    const result = run([
      page(
        "/snippet",
        { clicks: 1, impressions: 300, position: 4, ctr: 0.003 },
        { clicks: 1, impressions: 280, position: 4.2, ctr: 0.0036 },
      ),
    ]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]!.category, "STRONG_VISIBILITY_LOW_ENGAGEMENT");
    assert.match(result.items[0]!.reason, /intent|snippet|reviewing/i);
    assert.doesNotMatch(result.items[0]!.reason, /title is bad|rewrite the title/i);
  });

  it("weak position + low CTR does not blame snippet", () => {
    const result = run([
      page(
        "/deep",
        { clicks: 1, impressions: 300, position: 28, ctr: 0.003 },
        { clicks: 0, impressions: 0, position: 0 },
      ),
    ]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]!.category, "WORTH_WATCHING");
    assert.doesNotMatch(result.items[0]!.reason, /snippet|prominent positions/i);
  });

  it("thin previous period suppresses comparison rules", () => {
    const result = run([
      page(
        "/newish",
        { clicks: 3, impressions: 120, position: 25 },
        { clicks: 0, impressions: 5, position: 30 },
      ),
    ]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]!.category, "WORTH_WATCHING");
    assert.equal(result.items[0]!.comparisonEligible, false);
    assert.equal(result.items[0]!.confidence, "early");
    assert.equal(result.items[0]!.changeDirection, null);
  });

  it("zero previous does not invent dramatic percentages", () => {
    const result = run([
      page(
        "/brand-new",
        { clicks: 2, impressions: 120, position: 35 },
        { clicks: 0, impressions: 0, position: 0 },
      ),
    ]);
    assert.equal(result.items[0]!.category, "WORTH_WATCHING");
    assert.equal(result.items[0]!.changeDirection, null);
    assert.doesNotMatch(result.items[0]!.reason, /∞|infinite|% increase/i);
  });

  it("deduplicates to one item per page", () => {
    // Page matches near-stronger; also would be worth-watching if band differed.
    const result = run([
      page(
        "/only-once",
        { clicks: 2, impressions: 160, position: 12 },
        { clicks: 1, impressions: 90, position: 15 },
      ),
    ]);
    assert.equal(result.items.length, 1);
    assert.equal(
      result.items.filter((i) => i.pageUrl.endsWith("/only-once")).length,
      1,
    );
  });

  it("caps visible list at configured maximum", () => {
    const pages = Array.from({ length: 12 }, (_, i) =>
      page(
        `/page-${i}`,
        { clicks: 0, impressions: 80 + i * 10, position: 35 },
        { clicks: 0, impressions: 60, position: 36 },
      ),
    );
    const result = run(pages, {
      projectPreviousImpressions: 400,
      projectCurrentImpressions: 800,
    });
    assert.ok(result.items.length <= ATTENTION_MAX_ITEMS);
    assert.equal(result.items.length, ATTENTION_MAX_ITEMS);
    assert.equal(result.immature, false);
  });

  it("prefers at most 3 items while project data is immature", () => {
    const pages = Array.from({ length: 8 }, (_, i) =>
      page(
        `/early-${i}`,
        { clicks: 0, impressions: 80 + i * 20, position: 40 },
        { clicks: 0, impressions: 0, position: 0 },
      ),
    );
    const result = run(pages, {
      projectPreviousImpressions: 6,
      projectCurrentImpressions: 975,
    });
    assert.equal(result.immature, true);
    assert.ok(result.items.length <= 3);
  });

  it("allows zero items (no padding)", () => {
    const result = run(
      [page("/tiny", { clicks: 0, impressions: ATTENTION_MIN_IMPRESSIONS - 1, position: 10 }, null)],
      { hasFullPrevious: false, projectCurrentImpressions: 20, projectPreviousImpressions: 2 },
    );
    assert.equal(result.items.length, 0);
    assert.match(result.emptyMessage ?? "", /still developing|Nothing needs attention/i);
  });

  it("attaches supporting queries for the page only", () => {
    const pages = [
      page("/a", { clicks: 1, impressions: 100, position: 15 }, null),
      page("/b", { clicks: 1, impressions: 100, position: 16 }, null),
    ];
    const queries: AttentionQueryInput[] = [
      {
        pageUrl: "https://www.example.com/a",
        query: "alpha one",
        clicks: 0,
        impressions: 40,
        ctr: 0,
        position: 12,
      },
      {
        pageUrl: "https://www.example.com/a",
        query: "alpha two",
        clicks: 1,
        impressions: 30,
        ctr: 0.033,
        position: 10,
      },
      {
        pageUrl: "https://www.example.com/b",
        query: "beta only",
        clicks: 0,
        impressions: 99,
        ctr: 0,
        position: 11,
      },
    ];
    const result = run(pages, { queries, hasFullPrevious: false });
    const a = result.items.find((i) => i.path === "/a")!;
    assert.ok(a);
    assert.equal(a.supportingQueries.length, 2);
    assert.equal(a.supportingQueries[0]!.query, "alpha one");
    assert.ok(a.supportingQueries.every((q) => q.query.startsWith("alpha")));
  });

  it("decline outranks generic watching for the same page", () => {
    const result = run([
      page(
        "/both",
        { clicks: 1, impressions: 120, position: 28 },
        { clicks: 4, impressions: 250, position: 18 },
      ),
    ]);
    assert.equal(result.items[0]!.category, "VISIBILITY_CHANGE");
    assert.equal(result.items[0]!.changeDirection, "decrease");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOriginPageFilter,
  normalizeOrigin,
  urlBelongsToOrigin,
  addDaysYmd,
  daysBetweenInclusive,
  rollingWindowEndingOn,
  parseYmd,
  parseHost,
  parsePath,
  mapAnalyticsRow,
  mapAggregateMetrics,
  mapSitemapEntry,
  mapGscError,
  GscError,
  missingCredentialsError,
} from "../gsc/index.js";

describe("origin filter construction", () => {
  it("builds contains page filter for normalized origin", () => {
    const f = buildOriginPageFilter("https://www.simplerosterplus.com/");
    assert.equal(f.dimensionFilterGroups[0]!.filters[0]!.dimension, "page");
    assert.equal(f.dimensionFilterGroups[0]!.filters[0]!.operator, "contains");
    assert.equal(
      f.dimensionFilterGroups[0]!.filters[0]!.expression,
      "https://www.simplerosterplus.com",
    );
  });

  it("normalizeOrigin strips path and trailing slash", () => {
    assert.equal(normalizeOrigin("https://www.example.com/foo"), "https://www.example.com");
  });

  it("urlBelongsToOrigin matches primary and rejects app host", () => {
    const origin = "https://www.simplerosterplus.com";
    assert.equal(urlBelongsToOrigin("https://www.simplerosterplus.com/", origin), true);
    assert.equal(urlBelongsToOrigin("https://app.simplerosterplus.com/", origin), false);
    assert.equal(urlBelongsToOrigin("http://www.simplerosterplus.com/", origin), false);
  });
});

describe("finalized date helpers", () => {
  it("rolling 28-day window ends on given day", () => {
    const w = rollingWindowEndingOn("2026-08-13", 28);
    assert.equal(w.endDate, "2026-08-13");
    assert.equal(w.startDate, "2026-07-17");
  });

  it("daysBetweenInclusive is chronological", () => {
    assert.deepEqual(daysBetweenInclusive("2026-08-12", "2026-08-13"), [
      "2026-08-12",
      "2026-08-13",
    ]);
  });

  it("addDaysYmd and parseYmd round-trip", () => {
    assert.equal(addDaysYmd("2026-08-13", -2), "2026-08-11");
    assert.equal(parseYmd("2026-08-13").toISOString(), "2026-08-13T00:00:00.000Z");
  });
});

describe("host / path parsing and mapping", () => {
  it("parses host and path", () => {
    assert.equal(parseHost("https://www.simplerosterplus.com/pricing"), "www.simplerosterplus.com");
    assert.equal(parsePath("https://www.simplerosterplus.com/pricing"), "/pricing");
  });

  it("maps analytics rows and aggregates", () => {
    const row = mapAnalyticsRow({
      keys: ["roster plus"],
      clicks: 2,
      impressions: 36,
      ctr: 0.055,
      position: 4.2,
    });
    assert.equal(row.keys[0], "roster plus");
    assert.equal(mapAggregateMetrics([row]).clicks, 2);
    assert.deepEqual(mapAggregateMetrics([]), {
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    });
  });

  it("maps sitemap and ignores deprecated indexed", () => {
    const entry = mapSitemapEntry({
      path: "https://www.simplerosterplus.com/sitemap.xml",
      lastSubmitted: "2026-07-17T00:00:00Z",
      lastDownloaded: "2026-08-15T00:00:00Z",
      isPending: false,
      warnings: "0",
      errors: "0",
      contents: [{ type: "web", submitted: "7", indexed: "0" }],
    });
    assert.ok(entry);
    assert.equal(entry!.submittedCount, 7);
    assert.equal(entry!.raw.indexedIgnored, true);
    assert.ok(!JSON.stringify(entry!.raw.contents).includes('"indexed"'));
  });
});

describe("error mapping", () => {
  it("maps 403 to GSC_FORBIDDEN", () => {
    const err = mapGscError({ code: 403, message: "forbidden insufficient permission" });
    assert.equal(err.code, "GSC_FORBIDDEN");
    assert.equal(err.retryable, false);
  });

  it("maps 429 to retryable quota", () => {
    const err = mapGscError({ code: 429, message: "rateLimitExceeded" });
    assert.equal(err.code, "GSC_QUOTA");
    assert.equal(err.retryable, true);
  });

  it("maps 400 bad property", () => {
    const err = mapGscError({ code: 400, message: "invalidParameter not a valid site URL" });
    assert.equal(err.code, "GSC_BAD_PROPERTY");
  });

  it("missing credentials is clear and non-retryable", () => {
    const err = missingCredentialsError("");
    assert.ok(err instanceof GscError);
    assert.equal(err.code, "MISSING_CREDENTIALS");
    assert.equal(err.retryable, false);
  });
});

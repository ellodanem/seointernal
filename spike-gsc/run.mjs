/**
 * Disposable Phase 1 GSC spike.
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or GSC_CREDENTIALS_PATH → JSON key path.
 * Never logs private_key / client_secret / raw credential file contents.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "out");
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const HOMEPAGE = "https://www.simplerosterplus.com/";
const ERRORS_ONLY = process.argv.includes("--errors-only");

function credPath() {
  return (
    process.env.GSC_CREDENTIALS_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    resolve(__dirname, ".secrets", "gsc-sa.json")
  );
}

function redact(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    if (/BEGIN PRIVATE KEY|private_key|client_secret/i.test(value)) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/private_key|client_secret|token/i.test(k)) out[k] = "[REDACTED]";
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
}

function logSection(title) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function classifyProperty(siteUrl) {
  if (siteUrl.startsWith("sc-domain:")) return "domain";
  if (/^https?:\/\//i.test(siteUrl)) return "url-prefix";
  return "unknown";
}

function summarizeError(err) {
  const status = err?.code ?? err?.response?.status ?? null;
  const data = err?.response?.data ?? err?.errors ?? null;
  const message = err?.message ?? String(err);
  return redact({
    status,
    message: message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]"),
    data,
  });
}

async function loadAuth() {
  const path = credPath();
  if (!existsSync(path)) {
    const err = new Error(
      `Missing credentials file at ${path}. Set GOOGLE_APPLICATION_CREDENTIALS or place JSON at spike-gsc/.secrets/gsc-sa.json`
    );
    err.code = "MISSING_CREDENTIALS";
    throw err;
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw.client_email || !raw.private_key) {
    const err = new Error("Credentials JSON missing client_email or private_key");
    err.code = "MALFORMED_CREDENTIALS";
    throw err;
  }
  console.log(`Auth: service account ${raw.client_email}`);
  console.log(`Scope: ${SCOPE}`);
  console.log(`Key file: ${path} (contents not logged)`);

  const auth = new google.auth.GoogleAuth({
    keyFile: path,
    scopes: [SCOPE],
  });
  const authClient = await auth.getClient();
  const searchconsole = google.searchconsole({ version: "v1", auth: authClient });
  const webmasters = google.webmasters({ version: "v3", auth: authClient });
  return { authClient, searchconsole, webmasters, clientEmail: raw.client_email };
}

async function listSites(webmasters) {
  const res = await webmasters.sites.list();
  const entries = res.data.siteEntry || [];
  return entries.map((e) => ({
    siteUrl: e.siteUrl,
    permissionLevel: e.permissionLevel,
    type: classifyProperty(e.siteUrl || ""),
  }));
}

async function queryAnalytics(webmasters, siteUrl, body) {
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: body,
  });
  return res.data;
}

async function findLatestFinalDate(webmasters, siteUrl) {
  const end = ymd(daysAgo(0));
  const start = ymd(daysAgo(14));
  const data = await queryAnalytics(webmasters, siteUrl, {
    startDate: start,
    endDate: end,
    dimensions: ["date"],
    dataState: "final",
    rowLimit: 50,
  });
  const dates = (data.rows || []).map((r) => r.keys[0]).sort();
  return {
    window: { start, end },
    dates,
    latestFinalDate: dates.length ? dates[dates.length - 1] : null,
    rowCount: dates.length,
  };
}

async function findFreshBoundary(webmasters, siteUrl) {
  const end = ymd(daysAgo(0));
  const start = ymd(daysAgo(14));
  const data = await queryAnalytics(webmasters, siteUrl, {
    startDate: start,
    endDate: end,
    dimensions: ["date"],
    dataState: "all",
    rowLimit: 50,
  });
  const dates = (data.rows || []).map((r) => r.keys[0]).sort();
  return {
    latestAllDate: dates.length ? dates[dates.length - 1] : null,
    firstIncompleteDate: data.metadata?.first_incomplete_date ?? null,
    metadata: data.metadata ?? null,
  };
}

function hostStats(rows) {
  const hosts = {};
  for (const row of rows || []) {
    let host = "(invalid)";
    try {
      host = new URL(row.keys[0]).host;
    } catch {
      /* keep */
    }
    hosts[host] = (hosts[host] || 0) + 1;
  }
  return hosts;
}

async function runHappyPath(clients) {
  const { webmasters, searchconsole } = clients;
  const report = {
    generatedAt: new Date().toISOString(),
    scope: SCOPE,
    properties: [],
    selectedProperty: null,
    latestFinalized: null,
    freshness: null,
    totals: null,
    topPages: null,
    topQueries: null,
    queryPageSample: null,
    volume: null,
    sitemaps: null,
    urlInspection: null,
    errors: [],
  };

  logSection("A. Accessible properties");
  const properties = await listSites(webmasters);
  report.properties = properties;
  console.log(JSON.stringify(properties, null, 2));
  if (!properties.length) {
    throw new Error(
      "Service account can authenticate but sees zero Search Console properties. Add the SA email as a user on the SRP property in GSC."
    );
  }

  const forced = process.env.GSC_PROPERTY;
  const preferred =
    forced ||
    properties.find((p) => p.siteUrl.includes("simplerosterplus"))?.siteUrl ||
    properties[0].siteUrl;
  report.selectedProperty = {
    siteUrl: preferred,
    type: classifyProperty(preferred),
    forced: Boolean(forced),
    allVisible: properties,
  };
  console.log(`\nUsing property: ${preferred} (${classifyProperty(preferred)})`);

  logSection("B. Latest finalized Search Analytics date");
  const finalInfo = await findLatestFinalDate(webmasters, preferred);
  report.latestFinalized = finalInfo;
  console.log(JSON.stringify(finalInfo, null, 2));

  const freshInfo = await findFreshBoundary(webmasters, preferred);
  report.freshness = freshInfo;
  console.log("\nFreshness probe (dataState=all):");
  console.log(JSON.stringify(freshInfo, null, 2));

  if (!finalInfo.latestFinalDate) {
    throw new Error("No finalized Search Analytics dates returned in the last 14 days.");
  }

  const latest = finalInfo.latestFinalDate;
  // Single finalized day for daily-shape checks; 28-day window for volume.
  const dayStart = latest;
  const dayEnd = latest;
  const rollStart = (() => {
    const d = new Date(latest + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 27);
    return ymd(d);
  })();
  const rollEnd = latest;

  logSection("C. Search Analytics totals (single finalized day)");
  const totals = await queryAnalytics(webmasters, preferred, {
    startDate: dayStart,
    endDate: dayEnd,
    dataState: "final",
    // no dimensions → one aggregate row
  });
  report.totals = {
    period: { start: dayStart, end: dayEnd },
    responseAggregationType: totals.responseAggregationType,
    rows: totals.rows || [],
  };
  console.log(JSON.stringify(report.totals, null, 2));

  logSection("D. Top pages (finalized day + 28-day rollup)");
  const pagesDay = await queryAnalytics(webmasters, preferred, {
    startDate: dayStart,
    endDate: dayEnd,
    dimensions: ["page"],
    dataState: "final",
    rowLimit: 5000,
  });
  const pagesRoll = await queryAnalytics(webmasters, preferred, {
    startDate: rollStart,
    endDate: rollEnd,
    dimensions: ["page"],
    dataState: "final",
    rowLimit: 5000,
  });
  const pageRowsDay = pagesDay.rows || [];
  const pageRowsRoll = pagesRoll.rows || [];
  const appDay = pageRowsDay.filter((r) => (r.keys[0] || "").includes("app.simplerosterplus.com"));
  const appRoll = pageRowsRoll.filter((r) => (r.keys[0] || "").includes("app.simplerosterplus.com"));

  report.topPages = {
    day: {
      period: { start: dayStart, end: dayEnd },
      rowCount: pageRowsDay.length,
      hosts: hostStats(pageRowsDay),
      appHostRows: appDay.length,
      sample: pageRowsDay.slice(0, 25),
      appSample: appDay.slice(0, 10),
    },
    roll28: {
      period: { start: rollStart, end: rollEnd },
      rowCount: pageRowsRoll.length,
      hosts: hostStats(pageRowsRoll),
      appHostRows: appRoll.length,
      sample: pageRowsRoll.slice(0, 25),
      appSample: appRoll.slice(0, 10),
    },
  };
  console.log(
    JSON.stringify(
      {
        dayRowCount: report.topPages.day.rowCount,
        dayHosts: report.topPages.day.hosts,
        dayAppHostRows: report.topPages.day.appHostRows,
        daySample: report.topPages.day.sample,
        roll28RowCount: report.topPages.roll28.rowCount,
        roll28Hosts: report.topPages.roll28.hosts,
        roll28AppHostRows: report.topPages.roll28.appHostRows,
        roll28Sample: report.topPages.roll28.sample,
        roll28AppSample: report.topPages.roll28.appSample,
      },
      null,
      2
    )
  );

  logSection("E. Top queries (finalized day + 28-day rollup)");
  const queriesDay = await queryAnalytics(webmasters, preferred, {
    startDate: dayStart,
    endDate: dayEnd,
    dimensions: ["query"],
    dataState: "final",
    rowLimit: 5000,
  });
  const queriesRoll = await queryAnalytics(webmasters, preferred, {
    startDate: rollStart,
    endDate: rollEnd,
    dimensions: ["query"],
    dataState: "final",
    rowLimit: 5000,
  });
  const qDay = queriesDay.rows || [];
  const qRoll = queriesRoll.rows || [];
  report.topQueries = {
    day: {
      period: { start: dayStart, end: dayEnd },
      rowCount: qDay.length,
      sample: qDay.slice(0, 30),
    },
    roll28: {
      period: { start: rollStart, end: rollEnd },
      rowCount: qRoll.length,
      sample: qRoll.slice(0, 30),
    },
  };
  console.log(
    JSON.stringify(
      {
        dayRowCount: report.topQueries.day.rowCount,
        daySample: report.topQueries.day.sample,
        roll28RowCount: report.topQueries.roll28.rowCount,
        roll28Sample: report.topQueries.roll28.sample,
      },
      null,
      2
    )
  );

  logSection("F. Query × page volume sample (28-day, capped)");
  const qp = await queryAnalytics(webmasters, preferred, {
    startDate: rollStart,
    endDate: rollEnd,
    dimensions: ["query", "page"],
    dataState: "final",
    rowLimit: 5000,
  });
  const qpRows = qp.rows || [];
  report.queryPageSample = {
    period: { start: rollStart, end: rollEnd },
    rowCountReturned: qpRows.length,
    hitRowLimit: qpRows.length >= 5000,
    sample: qpRows.slice(0, 20),
  };
  console.log(
    JSON.stringify(
      {
        rowCountReturned: report.queryPageSample.rowCountReturned,
        hitRowLimit: report.queryPageSample.hitRowLimit,
        sample: report.queryPageSample.sample,
      },
      null,
      2
    )
  );

  // Daily query×page for one day — volume sanity
  const qpDay = await queryAnalytics(webmasters, preferred, {
    startDate: dayStart,
    endDate: dayEnd,
    dimensions: ["query", "page"],
    dataState: "final",
    rowLimit: 5000,
  });
  const qpDayRows = qpDay.rows || [];

  report.volume = {
    pagesPerFinalDay: pageRowsDay.length,
    pagesPer28d: pageRowsRoll.length,
    queriesPerFinalDay: qDay.length,
    queriesPer28d: qRoll.length,
    queryPagePerFinalDay: qpDayRows.length,
    queryPagePer28dReturned: qpRows.length,
    queryPage28dHitCap: qpRows.length >= 5000,
    note: "API returns top rows by clicks, not a guaranteed full census.",
  };
  console.log("\nVolume summary:");
  console.log(JSON.stringify(report.volume, null, 2));

  logSection("G. Sitemap API");
  try {
    const sm = await webmasters.sitemaps.list({ siteUrl: preferred });
    const list = (sm.data.sitemap || []).map((s) => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted,
      lastDownloaded: s.lastDownloaded,
      isPending: s.isPending,
      isSitemapsIndex: s.isSitemapsIndex,
      type: s.type,
      warnings: s.warnings,
      errors: s.errors,
      contents: (s.contents || []).map((c) => ({
        type: c.type,
        submitted: c.submitted,
        indexed: c.indexed, // may be deprecated / absent
        indexedFieldPresent: Object.prototype.hasOwnProperty.call(c, "indexed"),
      })),
    }));
    report.sitemaps = list;
    console.log(JSON.stringify(list, null, 2));
  } catch (err) {
    report.sitemaps = { error: summarizeError(err) };
    console.log("Sitemap list failed:", JSON.stringify(report.sitemaps, null, 2));
  }

  logSection("H. URL Inspection (index status only — not live test)");
  try {
    const insp = await searchconsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: HOMEPAGE,
        siteUrl: preferred,
        languageCode: "en-US",
      },
    });
    const result = insp.data.inspectionResult || {};
    const indexStatus = result.indexStatusResult || {};
    report.urlInspection = {
      inspectionUrl: HOMEPAGE,
      inspectionResultLink: result.inspectionResultLink,
      indexStatusResult: {
        verdict: indexStatus.verdict,
        coverageState: indexStatus.coverageState,
        robotsTxtState: indexStatus.robotsTxtState,
        indexingState: indexStatus.indexingState,
        lastCrawlTime: indexStatus.lastCrawlTime,
        pageFetchState: indexStatus.pageFetchState,
        googleCanonical: indexStatus.googleCanonical,
        userCanonical: indexStatus.userCanonical,
        crawledAs: indexStatus.crawledAs,
        referringUrls: indexStatus.referringUrls,
      },
      rawKeys: Object.keys(result),
      indexStatusKeys: Object.keys(indexStatus),
    };
    console.log(JSON.stringify(report.urlInspection, null, 2));
  } catch (err) {
    report.urlInspection = { error: summarizeError(err) };
    console.log("URL Inspection failed:", JSON.stringify(report.urlInspection, null, 2));
  }

  return report;
}

async function runErrorPaths(clients) {
  const { webmasters, searchconsole } = clients;
  const results = [];

  logSection("Error path: inaccessible / unknown property");
  try {
    await queryAnalytics(webmasters, "sc-domain:this-property-does-not-exist-for-sa.invalid", {
      startDate: ymd(daysAgo(7)),
      endDate: ymd(daysAgo(3)),
      dataState: "final",
    });
    results.push({ case: "inaccessible_property", unexpected: "succeeded" });
  } catch (err) {
    results.push({ case: "inaccessible_property", error: summarizeError(err) });
  }

  logSection("Error path: bad property identifier format");
  try {
    await queryAnalytics(webmasters, "not-a-valid-gsc-property", {
      startDate: ymd(daysAgo(7)),
      endDate: ymd(daysAgo(3)),
      dataState: "final",
    });
    results.push({ case: "bad_property_identifier", unexpected: "succeeded" });
  } catch (err) {
    results.push({ case: "bad_property_identifier", error: summarizeError(err) });
  }

  logSection("Error path: malformed URL Inspection request");
  try {
    await searchconsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: "not-a-url",
        siteUrl: "sc-domain:example.com",
        languageCode: "en-US",
      },
    });
    results.push({ case: "malformed_url_inspection", unexpected: "succeeded" });
  } catch (err) {
    results.push({ case: "malformed_url_inspection", error: summarizeError(err) });
  }

  console.log(JSON.stringify(results, null, 2));
  return results;
}

async function runMissingCredentialsCase() {
  logSection("Error path: missing credentials");
  // Simulate by pointing at a nonexistent path without loading auth.
  const fake = resolve(__dirname, ".secrets", "does-not-exist.json");
  const previous = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = fake;
  delete process.env.GSC_CREDENTIALS_PATH;
  try {
    if (!existsSync(fake)) {
      const err = {
        case: "missing_credentials",
        error: {
          status: null,
          code: "MISSING_CREDENTIALS",
          message: `File not found: ${fake}`,
          uiHint: "Owner: place service-account JSON and set GOOGLE_APPLICATION_CREDENTIALS.",
        },
      };
      console.log(JSON.stringify(err, null, 2));
      return err;
    }
  } finally {
    if (previous) process.env.GOOGLE_APPLICATION_CREDENTIALS = previous;
    else delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  if (ERRORS_ONLY) {
    const clients = await loadAuth();
    const errors = await runErrorPaths(clients);
    const missing = await runMissingCredentialsCase();
    writeFileSync(
      resolve(OUT_DIR, "error-paths.json"),
      JSON.stringify(redact({ errors, missing }), null, 2)
    );
    return;
  }

  let clients;
  try {
    clients = await loadAuth();
  } catch (err) {
    console.error("\nCannot start spike:", summarizeError(err));
    console.error("\nComplete SETUP.md first, then re-run: npm run spike");
    process.exitCode = 1;
    return;
  }

  const report = await runHappyPath(clients);
  const errors = await runErrorPaths(clients);
  const missing = await runMissingCredentialsCase();
  report.errorPaths = { errors, missing };

  const outPath = resolve(OUT_DIR, "spike-report.json");
  writeFileSync(outPath, JSON.stringify(redact(report), null, 2));
  console.log(`\nWrote redacted report: ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal:", summarizeError(err));
  process.exitCode = 1;
});

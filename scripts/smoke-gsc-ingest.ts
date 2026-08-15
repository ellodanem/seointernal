/**
 * Live GSC smoke (optional). Requires GOOGLE_APPLICATION_CREDENTIALS + DB + seeded SRP.
 *
 *   npx tsx --env-file=.env scripts/smoke-gsc-ingest.ts
 *
 * Steps: access → one finalized day → rerun idempotency → sitemap snapshot.
 */
import { PrismaClient, GscMetricScopeType } from "@prisma/client";
import { loadEnv } from "../apps/server/src/config.js";
import { createGscClient } from "../apps/server/src/gsc/client.js";
import { runGscIngestDaily } from "../apps/server/src/jobs/gsc-ingest-daily.js";
import { normalizeOrigin } from "../apps/server/src/gsc/filters.js";

const prisma = new PrismaClient();

async function counts(propertyId: string) {
  const [propertyDays, originDays, pages, queries, rollups, sitemaps] = await Promise.all([
    prisma.gscDailyTotal.count({
      where: { gscPropertyId: propertyId, scopeType: GscMetricScopeType.PROPERTY },
    }),
    prisma.gscDailyTotal.count({
      where: { gscPropertyId: propertyId, scopeType: GscMetricScopeType.ORIGIN },
    }),
    prisma.gscPageDaily.count({ where: { gscPropertyId: propertyId } }),
    prisma.gscQueryDaily.count({ where: { gscPropertyId: propertyId } }),
    prisma.gscQueryPageRollup.count({ where: { gscPropertyId: propertyId } }),
    prisma.gscSitemapSnapshot.count({ where: { gscPropertyId: propertyId } }),
  ]);
  return { propertyDays, originDays, pages, queries, rollups, sitemaps };
}

async function main() {
  const env = loadEnv();
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS required for live smoke");
  }

  const project = await prisma.project.findUnique({
    where: { slug: "simple-roster-plus" },
    include: { gscProperties: true },
  });
  if (!project?.gscProperties[0]) {
    throw new Error("Seed simple-roster-plus first (npm run db:seed)");
  }
  const property = project.gscProperties.find((p) => p.isPrimary) ?? project.gscProperties[0]!;
  const origin = normalizeOrigin(project.primaryOrigin);

  console.log("A) Property access");
  const client = await createGscClient({
    credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
  });
  const ok = await client.verifyPropertyAccess(property.siteUrl);
  if (!ok) throw new Error("SA cannot see configured property");
  const latest = await client.findLatestFinalizedDate(property.siteUrl);
  if (!latest) throw new Error("No finalized date");
  console.log("   latest finalized:", latest);

  console.log("B) Ingest one finalized day");
  const before = await counts(property.id);
  const first = await runGscIngestDaily({
    credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
    projectSlug: "simple-roster-plus",
    onlyDates: [latest],
    initialBackfillDays: 1,
    maxDaysPerRun: 1,
    refreshRollup: true,
    captureSitemaps: true,
  });
  const afterFirst = await counts(property.id);
  console.log("   stats", first.stats);
  console.log("   counts", afterFirst);

  console.log("C) Rerun same day — metric counts must not grow incorrectly");
  const sitemapBeforeRerun = afterFirst.sitemaps;
  const second = await runGscIngestDaily({
    credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
    projectSlug: "simple-roster-plus",
    onlyDates: [latest],
    maxDaysPerRun: 1,
    refreshRollup: true,
    captureSitemaps: true,
  });
  const afterSecond = await counts(property.id);

  if (afterSecond.propertyDays !== afterFirst.propertyDays) {
    throw new Error("PROPERTY totals duplicated on rerun");
  }
  if (afterSecond.originDays !== afterFirst.originDays) {
    throw new Error("ORIGIN totals duplicated on rerun");
  }
  if (afterSecond.pages !== afterFirst.pages) {
    throw new Error("page daily rows duplicated on rerun");
  }
  if (afterSecond.queries !== afterFirst.queries) {
    throw new Error("query daily rows duplicated on rerun");
  }
  // Rollup replaced in place — count stable for same period
  if (afterSecond.rollups !== afterFirst.rollups) {
    throw new Error("query×page rollup count changed unexpectedly on identical refresh");
  }
  // Sitemap snapshots are append-only historical captures
  if (afterSecond.sitemaps < sitemapBeforeRerun) {
    throw new Error("sitemap snapshots decreased");
  }
  console.log("   idempotent metrics OK; sitemap snapshots append-only:", {
    beforeRerun: sitemapBeforeRerun,
    afterRerun: afterSecond.sitemaps,
  });

  const propertyQueries = await prisma.gscQueryDaily.count({
    where: { gscPropertyId: property.id, scopeType: GscMetricScopeType.PROPERTY },
  });
  if (propertyQueries !== 0) throw new Error("PROPERTY query rows must not be persisted");

  const originQueries = await prisma.gscQueryDaily.count({
    where: {
      gscPropertyId: property.id,
      scopeType: GscMetricScopeType.ORIGIN,
      scopeValue: origin,
    },
  });
  if (originQueries < 1) throw new Error("expected ORIGIN query rows");

  console.log("D) Sitemap fields");
  const sm = await prisma.gscSitemapSnapshot.findFirst({
    where: { gscPropertyId: property.id },
    orderBy: { capturedAt: "desc" },
  });
  if (!sm) throw new Error("expected sitemap snapshot");
  console.log("   path:", sm.sitemapPath, "submitted:", sm.submittedCount);

  console.log("\nLive GSC smoke passed.", {
    before,
    afterFirst,
    afterSecond,
    jobIds: [first.jobRunId, second.jobRunId],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

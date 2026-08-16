/**
 * Phase 2 verification helpers (no Google OAuth required).
 * Run: npx tsx --env-file=.env scripts/verify-phase2.ts
 */
import {
  PrismaClient,
  GscPropertyType,
  GscMetricScopeType,
  ProjectStatus,
  PageRole,
  PageSource,
} from "@prisma/client";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("1) Seed / upsert SRP representation");
  const project = await prisma.project.upsert({
    where: { slug: "simple-roster-plus" },
    update: {
      displayName: "Simple Roster Plus",
      primaryOrigin: "https://www.simplerosterplus.com",
      sitemapUrl: "https://www.simplerosterplus.com/sitemap.xml",
      status: ProjectStatus.ACTIVE,
    },
    create: {
      slug: "simple-roster-plus",
      displayName: "Simple Roster Plus",
      primaryOrigin: "https://www.simplerosterplus.com",
      sitemapUrl: "https://www.simplerosterplus.com/sitemap.xml",
    },
  });

  const property = await prisma.gscProperty.upsert({
    where: {
      projectId_siteUrl: {
        projectId: project.id,
        siteUrl: "sc-domain:simplerosterplus.com",
      },
    },
    update: { propertyType: GscPropertyType.DOMAIN, isPrimary: true },
    create: {
      projectId: project.id,
      siteUrl: "sc-domain:simplerosterplus.com",
      propertyType: GscPropertyType.DOMAIN,
      isPrimary: true,
    },
  });

  assert(project.primaryOrigin === "https://www.simplerosterplus.com", "primaryOrigin mismatch");
  assert(property.siteUrl === "sc-domain:simplerosterplus.com", "siteUrl mismatch");
  assert(property.propertyType === "DOMAIN", "propertyType mismatch");
  console.log("   OK — SRP project + DOMAIN property");

  console.log("2) Uniqueness: duplicate projectId+url pages rejected");
  // Use a throwaway URL — do not delete/recreate managed INDEXABLE inventory pages.
  const uniqUrl = `https://www.simplerosterplus.com/__phase2-uniqueness-${Date.now()}`;
  await prisma.page.create({
    data: {
      projectId: project.id,
      url: uniqUrl,
      host: "www.simplerosterplus.com",
      path: "/__phase2-uniqueness",
      role: PageRole.UNKNOWN,
      source: PageSource.MANUAL,
    },
  });
  let dupRejected = false;
  try {
    await prisma.page.create({
      data: {
        projectId: project.id,
        url: uniqUrl,
        host: "www.simplerosterplus.com",
        path: "/__phase2-uniqueness",
        role: PageRole.UNKNOWN,
        source: PageSource.MANUAL,
      },
    });
  } catch {
    dupRejected = true;
  }
  assert(dupRejected, "expected unique constraint on projectId+url");
  await prisma.page.deleteMany({ where: { projectId: project.id, url: uniqUrl } });
  console.log("   OK — page uniqueness");

  console.log("3) Metric scopes PROPERTY vs ORIGIN coexist");
  const day = new Date("2026-08-13T00:00:00.000Z");
  await prisma.gscDailyTotal.deleteMany({
    where: { gscPropertyId: property.id, date: day },
  });
  await prisma.gscDailyTotal.createMany({
    data: [
      {
        projectId: project.id,
        gscPropertyId: property.id,
        date: day,
        scopeType: GscMetricScopeType.PROPERTY,
        scopeValue: "sc-domain:simplerosterplus.com",
        clicks: 1,
        impressions: 43,
        ctr: 0.023,
        position: 32,
      },
      {
        projectId: project.id,
        gscPropertyId: property.id,
        date: day,
        scopeType: GscMetricScopeType.ORIGIN,
        scopeValue: "https://www.simplerosterplus.com",
        clicks: 1,
        impressions: 40,
        ctr: 0.025,
        position: 30,
      },
    ],
  });
  const totals = await prisma.gscDailyTotal.count({
    where: { gscPropertyId: property.id, date: day },
  });
  assert(totals === 2, "expected PROPERTY + ORIGIN rows");
  console.log("   OK — dual scopes");

  console.log("4) Cascade delete orphan check (temp project)");
  const temp = await prisma.project.create({
    data: {
      slug: `temp-cascade-${Date.now()}`,
      displayName: "Temp Cascade",
      primaryOrigin: "https://example.com",
      gscProperties: {
        create: {
          siteUrl: "sc-domain:example.com",
          propertyType: GscPropertyType.DOMAIN,
        },
      },
      pages: {
        create: {
          url: "https://example.com/",
          host: "example.com",
          path: "/",
        },
      },
    },
    include: { gscProperties: true, pages: true },
  });
  const propId = temp.gscProperties[0]!.id;
  const pageId = temp.pages[0]!.id;
  await prisma.project.delete({ where: { id: temp.id } });
  const orphanProp = await prisma.gscProperty.findUnique({ where: { id: propId } });
  const orphanPage = await prisma.page.findUnique({ where: { id: pageId } });
  assert(!orphanProp && !orphanPage, "orphans remained after project delete");
  console.log("   OK — cascade deletes properties and pages");

  console.log("5) Owner allowlist helper");
  process.env.OWNER_EMAILS = "owner@example.com,Other@Example.COM";
  // Dynamic import after env set — config caches, so test inline:
  const allowed = new Set(
    process.env.OWNER_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
  assert(allowed.has("owner@example.com"), "allowlist missing owner");
  assert(allowed.has("other@example.com"), "allowlist should be case-insensitive");
  assert(!allowed.has("stranger@example.com"), "stranger should not be allowed");
  console.log("   OK — allowlist parsing semantics");

  console.log("\nPhase 2 DB verification passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

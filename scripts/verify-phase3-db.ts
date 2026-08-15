/**
 * Deterministic DB integration tests for GSC ingest upserts (mocked client).
 * Run: npx tsx --env-file=.env scripts/verify-phase3-db.ts
 */
import assert from "node:assert/strict";
import {
  GscMetricScopeType,
  GscPropertyType,
  PageRole,
  PageSource,
  ProjectStatus,
  PrismaClient,
} from "@prisma/client";
import { parseYmd } from "../apps/server/src/gsc/dates.js";
import { parseHost, parsePath } from "../apps/server/src/gsc/map.js";

const prisma = new PrismaClient();

async function main() {
  const slug = `phase3-db-${Date.now()}`;
  const origin = "https://www.example-phase3.test";
  const siteUrl = "sc-domain:example-phase3.test";
  const day = "2026-08-13";
  const date = parseYmd(day);

  console.log("1) Create isolated project");
  const project = await prisma.project.create({
    data: {
      slug,
      displayName: "Phase3 DB Test",
      primaryOrigin: origin,
      status: ProjectStatus.ACTIVE,
      gscProperties: {
        create: {
          siteUrl,
          propertyType: GscPropertyType.DOMAIN,
          isPrimary: true,
        },
      },
      pages: {
        create: {
          url: `${origin}/`,
          host: "www.example-phase3.test",
          path: "/",
          role: PageRole.INDEXABLE,
          source: PageSource.SITEMAP,
        },
      },
    },
    include: { gscProperties: true, pages: true },
  });
  const property = project.gscProperties[0]!;
  assert.equal(project.pages[0]!.role, PageRole.INDEXABLE);

  const upsertDay = async () => {
    await prisma.$transaction(async (tx) => {
      await tx.gscDailyTotal.upsert({
        where: {
          gscPropertyId_date_scopeType_scopeValue: {
            gscPropertyId: property.id,
            date,
            scopeType: GscMetricScopeType.PROPERTY,
            scopeValue: siteUrl,
          },
        },
        create: {
          projectId: project.id,
          gscPropertyId: property.id,
          date,
          scopeType: GscMetricScopeType.PROPERTY,
          scopeValue: siteUrl,
          clicks: 1,
          impressions: 50,
          ctr: 0.02,
          position: 20,
        },
        update: {
          clicks: 1,
          impressions: 50,
          ctr: 0.02,
          position: 20,
        },
      });
      await tx.gscDailyTotal.upsert({
        where: {
          gscPropertyId_date_scopeType_scopeValue: {
            gscPropertyId: property.id,
            date,
            scopeType: GscMetricScopeType.ORIGIN,
            scopeValue: origin,
          },
        },
        create: {
          projectId: project.id,
          gscPropertyId: property.id,
          date,
          scopeType: GscMetricScopeType.ORIGIN,
          scopeValue: origin,
          clicks: 1,
          impressions: 40,
          ctr: 0.025,
          position: 18,
        },
        update: {
          clicks: 1,
          impressions: 40,
          ctr: 0.025,
          position: 18,
        },
      });

      const pages = [
        { url: `${origin}/`, clicks: 1, impressions: 30 },
        { url: "https://app.example-phase3.test/", clicks: 0, impressions: 10 },
      ];
      for (const p of pages) {
        await tx.gscPageDaily.upsert({
          where: {
            gscPropertyId_date_pageUrl: {
              gscPropertyId: property.id,
              date,
              pageUrl: p.url,
            },
          },
          create: {
            projectId: project.id,
            gscPropertyId: property.id,
            date,
            pageUrl: p.url,
            host: parseHost(p.url),
            clicks: p.clicks,
            impressions: p.impressions,
            ctr: p.impressions ? p.clicks / p.impressions : 0,
            position: 10,
          },
          update: {
            clicks: p.clicks,
            impressions: p.impressions,
            ctr: p.impressions ? p.clicks / p.impressions : 0,
            position: 10,
          },
        });
        const existing = await tx.page.findUnique({
          where: { projectId_url: { projectId: project.id, url: p.url } },
        });
        if (!existing) {
          await tx.page.create({
            data: {
              projectId: project.id,
              url: p.url,
              host: parseHost(p.url),
              path: parsePath(p.url),
              role: PageRole.UNKNOWN,
              source: PageSource.GSC,
            },
          });
        }
      }

      await tx.gscQueryDaily.deleteMany({
        where: {
          gscPropertyId: property.id,
          date,
          scopeType: GscMetricScopeType.ORIGIN,
          scopeValue: origin,
        },
      });
      await tx.gscQueryDaily.createMany({
        data: [
          {
            projectId: project.id,
            gscPropertyId: property.id,
            date,
            query: "example query",
            scopeType: GscMetricScopeType.ORIGIN,
            scopeValue: origin,
            clicks: 1,
            impressions: 20,
            ctr: 0.05,
            position: 5,
          },
        ],
      });
    });
  };

  console.log("2) First-day ingest simulation");
  await upsertDay();

  console.log("3) Rerun same day — counts must stay stable");
  await upsertDay();

  const propertyTotals = await prisma.gscDailyTotal.count({
    where: { gscPropertyId: property.id, scopeType: GscMetricScopeType.PROPERTY },
  });
  const originTotals = await prisma.gscDailyTotal.count({
    where: { gscPropertyId: property.id, scopeType: GscMetricScopeType.ORIGIN },
  });
  const pageRows = await prisma.gscPageDaily.count({ where: { gscPropertyId: property.id } });
  const queryRows = await prisma.gscQueryDaily.count({ where: { gscPropertyId: property.id } });
  const propertyQueryRows = await prisma.gscQueryDaily.count({
    where: { gscPropertyId: property.id, scopeType: GscMetricScopeType.PROPERTY },
  });

  assert.equal(propertyTotals, 1);
  assert.equal(originTotals, 1);
  assert.equal(pageRows, 2);
  assert.equal(queryRows, 1);
  assert.equal(propertyQueryRows, 0, "no PROPERTY query rows in v0.1");

  const home = await prisma.page.findUniqueOrThrow({
    where: { projectId_url: { projectId: project.id, url: `${origin}/` } },
  });
  assert.equal(home.role, PageRole.INDEXABLE, "must not overwrite INDEXABLE with UNKNOWN");
  assert.equal(home.source, PageSource.SITEMAP);

  const appPage = await prisma.page.findUniqueOrThrow({
    where: {
      projectId_url: { projectId: project.id, url: "https://app.example-phase3.test/" },
    },
  });
  assert.equal(appPage.source, PageSource.GSC);
  assert.equal(appPage.role, PageRole.UNKNOWN);

  const appDaily = await prisma.gscPageDaily.findFirst({
    where: { gscPropertyId: property.id, host: "app.example-phase3.test" },
  });
  assert.ok(appDaily, "non-primary host page rows preserved");

  console.log("4) Rolling query×page replacement");
  const periodStart = parseYmd("2026-07-17");
  const periodEnd = parseYmd("2026-08-13");
  await prisma.gscQueryPageRollup.createMany({
    data: [
      {
        projectId: project.id,
        gscPropertyId: property.id,
        periodStart,
        periodEnd,
        query: "old",
        pageUrl: `${origin}/`,
        host: "www.example-phase3.test",
        scopeType: GscMetricScopeType.ORIGIN,
        scopeValue: origin,
        clicks: 1,
        impressions: 1,
        ctr: 1,
        position: 1,
      },
    ],
  });
  await prisma.$transaction(async (tx) => {
    await tx.gscQueryPageRollup.deleteMany({
      where: {
        gscPropertyId: property.id,
        scopeType: GscMetricScopeType.ORIGIN,
        scopeValue: origin,
      },
    });
    await tx.gscQueryPageRollup.createMany({
      data: [
        {
          projectId: project.id,
          gscPropertyId: property.id,
          periodStart,
          periodEnd,
          query: "new",
          pageUrl: `${origin}/`,
          host: "www.example-phase3.test",
          scopeType: GscMetricScopeType.ORIGIN,
          scopeValue: origin,
          clicks: 2,
          impressions: 4,
          ctr: 0.5,
          position: 3,
        },
      ],
    });
  });
  const rollups = await prisma.gscQueryPageRollup.findMany({
    where: { gscPropertyId: property.id },
  });
  assert.equal(rollups.length, 1);
  assert.equal(rollups[0]!.query, "new");

  console.log("5) Project isolation + cascade");
  const other = await prisma.project.create({
    data: {
      slug: `${slug}-other`,
      displayName: "Other",
      primaryOrigin: "https://other.test",
      gscProperties: {
        create: { siteUrl: "sc-domain:other.test", propertyType: GscPropertyType.DOMAIN },
      },
    },
    include: { gscProperties: true },
  });
  await prisma.gscDailyTotal.create({
    data: {
      projectId: other.id,
      gscPropertyId: other.gscProperties[0]!.id,
      date,
      scopeType: GscMetricScopeType.PROPERTY,
      scopeValue: "sc-domain:other.test",
      clicks: 9,
      impressions: 9,
      ctr: 1,
      position: 1,
    },
  });
  const beforeDelete = await prisma.gscDailyTotal.count({ where: { projectId: project.id } });
  assert.ok(beforeDelete >= 2);
  await prisma.project.delete({ where: { id: project.id } });
  const orphaned = await prisma.gscDailyTotal.count({ where: { projectId: project.id } });
  assert.equal(orphaned, 0);
  const otherStill = await prisma.gscDailyTotal.count({ where: { projectId: other.id } });
  assert.equal(otherStill, 1);
  await prisma.project.delete({ where: { id: other.id } });

  console.log("\nPhase 3 DB verification passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

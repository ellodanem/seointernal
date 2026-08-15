import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  try {
    const proj = await p.project.findUnique({
      where: { slug: "simple-roster-plus" },
      include: { gscProperties: true },
    });
    const id = proj!.gscProperties[0]!.id;
    const c = {
      property: await p.gscDailyTotal.count({
        where: { gscPropertyId: id, scopeType: "PROPERTY" },
      }),
      origin: await p.gscDailyTotal.count({
        where: { gscPropertyId: id, scopeType: "ORIGIN" },
      }),
      pages: await p.gscPageDaily.count({ where: { gscPropertyId: id } }),
      queries: await p.gscQueryDaily.count({ where: { gscPropertyId: id } }),
      rollups: await p.gscQueryPageRollup.count({ where: { gscPropertyId: id } }),
      sitemaps: await p.gscSitemapSnapshot.count({ where: { gscPropertyId: id } }),
      propertyQueries: await p.gscQueryDaily.count({
        where: { gscPropertyId: id, scopeType: "PROPERTY" },
      }),
    };
    console.log(JSON.stringify(c, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

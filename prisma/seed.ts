import { PrismaClient, GscPropertyType, GscPropertyStatus, ProjectStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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
      status: ProjectStatus.ACTIVE,
    },
  });

  await prisma.gscProperty.upsert({
    where: {
      projectId_siteUrl: {
        projectId: project.id,
        siteUrl: "sc-domain:simplerosterplus.com",
      },
    },
    update: {
      propertyType: GscPropertyType.DOMAIN,
      isPrimary: true,
      status: GscPropertyStatus.CONFIGURED,
    },
    create: {
      projectId: project.id,
      siteUrl: "sc-domain:simplerosterplus.com",
      propertyType: GscPropertyType.DOMAIN,
      isPrimary: true,
      status: GscPropertyStatus.CONFIGURED,
    },
  });

  console.log("Seeded Project #1: Simple Roster Plus");
  console.log(`  slug: ${project.slug}`);
  console.log(`  primaryOrigin: ${project.primaryOrigin}`);
  console.log(`  sitemapUrl: ${project.sitemapUrl}`);
  console.log(`  GSC property: sc-domain:simplerosterplus.com (DOMAIN)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

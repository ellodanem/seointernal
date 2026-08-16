import {
  PrismaClient,
  GscPropertyType,
  GscPropertyStatus,
  ProjectStatus,
  PageRole,
  PageSource,
} from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Project #1 managed page inventory (intent), not Phase 6 inspection hardcoding.
 * Paths are relative to primaryOrigin; roles express indexing intent.
 */
const SRP_INDEXABLE_PATHS = [
  "/",
  "/employee-scheduling-software",
  "/employee-attendance-software",
  "/zkteco-attendance-integration",
  "/small-business-employee-scheduling",
  "/employee-leave-and-availability",
  "/employee-time-clock-app",
] as const;

const SRP_NOINDEX_PATHS = ["/privacy.html"] as const;

function urlForPath(origin: string, path: string): string {
  const base = origin.replace(/\/$/, "");
  if (path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function hostPath(url: string): { host: string; path: string } {
  const u = new URL(url);
  return { host: u.host, path: u.pathname || "/" };
}

async function upsertPageRole(args: {
  projectId: string;
  url: string;
  role: PageRole;
  source: PageSource;
}) {
  const { host, path } = hostPath(args.url);
  await prisma.page.upsert({
    where: {
      projectId_url: { projectId: args.projectId, url: args.url },
    },
    update: {
      role: args.role,
      // Preserve MANUAL/SITEMAP intent; do not demote to GSC.
      source: args.source,
      host,
      path,
    },
    create: {
      projectId: args.projectId,
      url: args.url,
      host,
      path,
      role: args.role,
      source: args.source,
      watched: false,
    },
  });
}

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

  for (const path of SRP_INDEXABLE_PATHS) {
    await upsertPageRole({
      projectId: project.id,
      url: urlForPath(project.primaryOrigin, path),
      role: PageRole.INDEXABLE,
      source: PageSource.MANUAL,
    });
  }

  for (const path of SRP_NOINDEX_PATHS) {
    await upsertPageRole({
      projectId: project.id,
      url: urlForPath(project.primaryOrigin, path),
      role: PageRole.NOINDEX,
      source: PageSource.MANUAL,
    });
  }

  const indexable = await prisma.page.count({
    where: { projectId: project.id, role: PageRole.INDEXABLE },
  });

  console.log("Seeded Project #1: Simple Roster Plus");
  console.log(`  slug: ${project.slug}`);
  console.log(`  primaryOrigin: ${project.primaryOrigin}`);
  console.log(`  sitemapUrl: ${project.sitemapUrl}`);
  console.log(`  GSC property: sc-domain:simplerosterplus.com (DOMAIN)`);
  console.log(`  INDEXABLE pages: ${indexable}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

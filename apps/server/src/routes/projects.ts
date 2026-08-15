import { Hono } from "hono";
import { z } from "zod";
import { GscPropertyType, ProjectStatus } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { requireOwner, type AppVariables } from "../middleware/require-owner.js";

export const projectRoutes = new Hono<{ Variables: AppVariables }>();

projectRoutes.use("*", requireOwner);

const createProjectSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  displayName: z.string().min(1).max(200),
  primaryOrigin: z.string().url(),
  sitemapUrl: z.string().url().optional().nullable(),
  gscSiteUrl: z.string().min(1).optional(),
  gscPropertyType: z.nativeEnum(GscPropertyType).optional(),
});

projectRoutes.get("/", async (c) => {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      gscProperties: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  return c.json({ projects });
});

projectRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      gscProperties: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json({ project });
});

projectRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;
  const existing = await prisma.project.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return c.json({ error: "A project with this slug already exists" }, 409);
  }

  const project = await prisma.project.create({
    data: {
      slug: data.slug,
      displayName: data.displayName,
      primaryOrigin: data.primaryOrigin.replace(/\/$/, ""),
      sitemapUrl: data.sitemapUrl ?? null,
      status: ProjectStatus.ACTIVE,
      ...(data.gscSiteUrl
        ? {
            gscProperties: {
              create: {
                siteUrl: data.gscSiteUrl,
                propertyType: data.gscPropertyType ?? inferPropertyType(data.gscSiteUrl),
                isPrimary: true,
              },
            },
          }
        : {}),
    },
    include: { gscProperties: true },
  });

  return c.json({ project }, 201);
});

projectRoutes.post("/seed/simple-roster-plus", async (c) => {
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

  const property = await prisma.gscProperty.upsert({
    where: {
      projectId_siteUrl: {
        projectId: project.id,
        siteUrl: "sc-domain:simplerosterplus.com",
      },
    },
    update: {
      propertyType: GscPropertyType.DOMAIN,
      isPrimary: true,
    },
    create: {
      projectId: project.id,
      siteUrl: "sc-domain:simplerosterplus.com",
      propertyType: GscPropertyType.DOMAIN,
      isPrimary: true,
    },
  });

  const full = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    include: { gscProperties: true },
  });

  return c.json({
    project: full,
    seeded: { projectId: project.id, gscPropertyId: property.id },
  });
});

function inferPropertyType(siteUrl: string): GscPropertyType {
  return siteUrl.startsWith("sc-domain:") ? GscPropertyType.DOMAIN : GscPropertyType.URL_PREFIX;
}

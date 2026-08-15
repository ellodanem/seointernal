import { Hono } from "hono";
import type { AppVariables } from "../middleware/require-owner.js";
import { loadEnv } from "../config.js";

export const healthRoutes = new Hono<{ Variables: AppVariables }>();

healthRoutes.get("/health", (c) => {
  const env = loadEnv();
  return c.json({
    ok: true,
    service: "seo-ops-console-web",
    env: env.NODE_ENV,
    googleOAuthConfigured: env.googleOAuthConfigured,
    gscCredentialsConfigured: env.gscCredentialsConfigured,
  });
});

healthRoutes.get("/ready", async (c) => {
  try {
    const { prisma } = await import("../lib/db.js");
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ ok: true, database: "up" });
  } catch {
    return c.json({ ok: false, database: "down" }, 503);
  }
});

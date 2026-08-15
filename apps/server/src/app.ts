import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { createAuth } from "./lib/auth.js";
import { isOwnerEmail, loadEnv } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { projectRoutes } from "./routes/projects.js";
import type { AppVariables } from "./middleware/require-owner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveWebDist(): string | null {
  const candidates = [
    path.resolve(__dirname, "../../web/dist"),
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "web/dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  return null;
}

export function createApp() {
  const env = loadEnv();
  const auth = createAuth();
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", async (c, next) => {
    c.set("auth", auth);
    await next();
  });

  app.use(
    "*",
    cors({
      origin: [env.APP_BASE_URL, env.WEB_ORIGIN],
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.use(
    "*",
    logger((message) => {
      // Never log OAuth codes, states, or other sensitive query values.
      const redacted = message.replace(
        /(\/api\/auth\/[^\s?]*)\?[^\s]*/g,
        "$1?[redacted]",
      );
      console.log(redacted);
    }),
  );

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.route("/api", healthRoutes);
  app.route("/api/projects", projectRoutes);

  app.get("/api/me", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return c.json({ user: null }, 401);
    }
    if (!isOwnerEmail(session.user.email)) {
      return c.json({ user: null, error: "Forbidden" }, 403);
    }
    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      },
      auth: {
        googleOAuthConfigured: env.googleOAuthConfigured,
        gscCredentialsConfigured: env.gscCredentialsConfigured,
      },
    });
  });

  const webDist = resolveWebDist();
  if (webDist) {
    const root = path.relative(process.cwd(), webDist).replaceAll("\\", "/") || ".";
    app.use("/*", serveStatic({ root }));
    app.get("*", async (c) => {
      const { readFile } = await import("node:fs/promises");
      const html = await readFile(path.join(webDist, "index.html"), "utf8");
      return c.html(html);
    });
  } else {
    app.notFound((c) => {
      if (c.req.path.startsWith("/api")) {
        return c.json({ error: "Not found" }, 404);
      }
      return c.json(
        {
          error: "UI not built",
          hint: "Run npm run build in apps/web, or use the Vite dev server",
        },
        404,
      );
    });
  }

  return app;
}

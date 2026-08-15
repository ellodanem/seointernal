import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnv } from "./config.js";
import { log } from "./lib/log.js";
import { prisma } from "./lib/db.js";

async function main() {
  const env = loadEnv();
  const app = createApp();

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      log.info("web process listening", {
        port: info.port,
        baseUrl: env.APP_BASE_URL,
        googleOAuthConfigured: env.googleOAuthConfigured,
        gscCredentialsConfigured: env.gscCredentialsConfigured,
      });
    },
  );

  const shutdown = async (signal: string) => {
    log.info("web shutting down", { signal });
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error("web failed to start", { error: String(err) });
  process.exit(1);
});

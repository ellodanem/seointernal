import { loadEnv } from "./config.js";
import { log } from "./lib/log.js";
import { prisma } from "./lib/db.js";

/**
 * Phase 2 worker process shape.
 * Boots, connects to Postgres, idles cleanly, shuts down gracefully.
 * Phase 3 will add finalized-day GSC ingestion here — not yet.
 */
async function main() {
  const env = loadEnv();
  log.info("worker starting", {
    env: env.NODE_ENV,
    idleMs: env.WORKER_IDLE_MS,
    gscCredentialsConfigured: env.gscCredentialsConfigured,
  });

  await prisma.$queryRaw`SELECT 1`;
  log.info("worker connected to postgres");

  let stopping = false;

  const tick = async () => {
    if (stopping) return;
    try {
      await prisma.$queryRaw`SELECT 1`;
      log.debug("worker heartbeat ok");
      // Phase 3: schedule finalized GSC ingestion jobs here.
    } catch (err) {
      log.error("worker heartbeat failed", { error: String(err) });
    }
  };

  const interval = setInterval(() => void tick(), env.WORKER_IDLE_MS);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("worker shutting down", { signal });
    clearInterval(interval);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log.info("worker ready (no GSC ingestion in Phase 2)");
}

main().catch((err) => {
  log.error("worker failed to start", { error: String(err) });
  process.exit(1);
});

import { loadEnv } from "./config.js";
import { log } from "./lib/log.js";
import { prisma } from "./lib/db.js";
import { runGscIngestDaily } from "./jobs/gsc-ingest-daily.js";

/**
 * Worker process: Postgres heartbeat + scheduled GSC ingestion.
 * Manual trigger: npm run gsc:ingest (does not require UI).
 */
async function main() {
  const env = loadEnv();
  log.info("worker starting", {
    env: env.NODE_ENV,
    idleMs: env.WORKER_IDLE_MS,
    gscCredentialsConfigured: env.gscCredentialsConfigured,
    ingestIntervalMs: env.GSC_INGEST_INTERVAL_MS,
    ingestOnStart: env.GSC_INGEST_ON_START,
  });

  await prisma.$queryRaw`SELECT 1`;
  log.info("worker connected to postgres");

  let stopping = false;
  let ingestRunning = false;
  // Initialize to now so the first scheduled tick respects GSC_INGEST_INTERVAL_MS
  // when GSC_INGEST_ON_START is false.
  let lastIngestAttemptAt = Date.now();

  const runIngestIfDue = async (reason: "start" | "schedule") => {
    if (stopping || ingestRunning) return;
    if (!env.gscCredentialsConfigured || !env.GOOGLE_APPLICATION_CREDENTIALS) {
      log.warn("gsc ingest skipped — credentials not configured");
      return;
    }

    const now = Date.now();
    if (reason === "schedule" && now - lastIngestAttemptAt < env.GSC_INGEST_INTERVAL_MS) {
      return;
    }

    ingestRunning = true;
    lastIngestAttemptAt = now;
    try {
      log.info("gsc ingest triggered", { reason });
      const result = await runGscIngestDaily({
        credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
        maxDaysPerRun: env.GSC_MAX_DAYS_PER_RUN,
        initialBackfillDays: env.GSC_INITIAL_BACKFILL_DAYS,
        rowLimit: env.GSC_ROW_LIMIT,
      });
      log.info("gsc ingest ok", {
        jobRunId: result.jobRunId,
        datesIngested: result.stats.datesIngested.length,
        latestFinalizedDate: result.stats.latestFinalizedDate,
      });
    } catch (err) {
      // Failure must not kill the worker or future scheduled runs.
      log.error("gsc ingest failed", { error: String(err) });
    } finally {
      ingestRunning = false;
    }
  };

  const tick = async () => {
    if (stopping) return;
    try {
      await prisma.$queryRaw`SELECT 1`;
      log.debug("worker heartbeat ok");
    } catch (err) {
      log.error("worker heartbeat failed", { error: String(err) });
    }
    await runIngestIfDue("schedule");
  };

  const interval = setInterval(() => void tick(), env.WORKER_IDLE_MS);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("worker shutting down", { signal, ingestRunning });
    clearInterval(interval);
    // Wait briefly if ingest is in-flight (transactional day writes are atomic).
    const deadline = Date.now() + 30_000;
    while (ingestRunning && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  log.info("worker ready");

  if (env.GSC_INGEST_ON_START) {
    void runIngestIfDue("start");
  }
}

main().catch((err) => {
  log.error("worker failed to start", { error: String(err) });
  process.exit(1);
});

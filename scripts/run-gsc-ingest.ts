/**
 * Manual / safe CLI trigger for GSC ingestion (owner machine / Docker exec).
 * Not an unauthenticated HTTP endpoint.
 *
 * Examples:
 *   npx tsx --env-file=.env scripts/run-gsc-ingest.ts
 *   npx tsx --env-file=.env scripts/run-gsc-ingest.ts --days 1
 *   npx tsx --env-file=.env scripts/run-gsc-ingest.ts --backfill-days 28 --max-days 28
 *   npx tsx --env-file=.env scripts/run-gsc-ingest.ts --only-dates 2026-08-13
 *   npx tsx --env-file=.env scripts/run-gsc-ingest.ts --project simple-roster-plus --no-sitemaps
 */
import { loadEnv } from "../apps/server/src/config.js";
import { prisma } from "../apps/server/src/lib/db.js";
import { runGscIngestDaily } from "../apps/server/src/jobs/gsc-ingest-daily.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const env = loadEnv();
  const creds = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!creds) {
    console.error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
    process.exit(1);
  }

  const maxDays = Number(argValue("--max-days") ?? argValue("--days") ?? env.GSC_MAX_DAYS_PER_RUN);
  const backfillDays = Number(argValue("--backfill-days") ?? env.GSC_INITIAL_BACKFILL_DAYS);
  const onlyDatesRaw = argValue("--only-dates");
  const onlyDates = onlyDatesRaw
    ? onlyDatesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const projectSlug = argValue("--project");

  console.log("Starting GSC ingest…", {
    maxDays,
    backfillDays,
    onlyDates: onlyDates ?? null,
    projectSlug: projectSlug ?? "(all active)",
  });

  const result = await runGscIngestDaily({
    credentialsPath: creds,
    maxDaysPerRun: maxDays,
    initialBackfillDays: backfillDays,
    rowLimit: env.GSC_ROW_LIMIT,
    projectSlug,
    onlyDates,
    refreshRollup: !hasFlag("--no-rollup"),
    captureSitemaps: !hasFlag("--no-sitemaps"),
  });

  console.log(JSON.stringify({ jobRunId: result.jobRunId, stats: result.stats }, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

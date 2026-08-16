/**
 * Manual / safe CLI trigger for GSC URL Inspection (owner machine / Docker exec).
 * Not an unauthenticated HTTP endpoint.
 *
 * Examples:
 *   npm run gsc:inspect -- --project simple-roster-plus
 *   npm run gsc:inspect -- --project simple-roster-plus --force
 *   npm run gsc:inspect -- --project simple-roster-plus --url https://www.simplerosterplus.com/
 */
import { loadEnv } from "../apps/server/src/config.js";
import { prisma } from "../apps/server/src/lib/db.js";
import { runGscUrlInspection } from "../apps/server/src/jobs/gsc-url-inspection.js";

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

  const projectSlug = argValue("--project");
  const onlyUrl = argValue("--url");
  const force = hasFlag("--force");

  console.log("Starting GSC URL Inspection…", {
    projectSlug: projectSlug ?? "(all active)",
    onlyUrl: onlyUrl ?? "(all INDEXABLE)",
    force,
    freshnessMs: env.GSC_INSPECT_FRESHNESS_MS,
  });

  const result = await runGscUrlInspection({
    credentialsPath: creds,
    projectSlug,
    onlyUrl,
    force,
    freshnessMs: env.GSC_INSPECT_FRESHNESS_MS,
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

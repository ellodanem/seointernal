/**
 * Built CLI entry for Docker / production: `node apps/server/dist/cli-gsc-inspect.js`
 * Dev: prefer `npm run gsc:inspect` (tsx + .env).
 */
import { loadEnv } from "./config.js";
import { prisma } from "./lib/db.js";
import { runGscUrlInspection } from "./jobs/gsc-url-inspection.js";

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

  const result = await runGscUrlInspection({
    credentialsPath: creds,
    projectSlug: argValue("--project"),
    onlyUrl: argValue("--url"),
    force: hasFlag("--force"),
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

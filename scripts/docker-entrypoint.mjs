import { spawn } from "node:child_process";

const role = process.argv[2] ?? "web";

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...opts,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  console.log("Running prisma migrate deploy...");
  await run("npx", ["prisma", "migrate", "deploy"]);

  if (role === "web") {
    console.log("Starting web process...");
    await run("node", ["apps/server/dist/index.js"]);
  } else if (role === "worker") {
    console.log("Starting worker process...");
    await run("node", ["apps/server/dist/worker.js"]);
  } else if (role === "seed") {
    console.log("Seeding database...");
    await run("npx", ["tsx", "prisma/seed.ts"]);
  } else if (role === "ingest") {
    console.log("Running GSC ingest...");
    const extra = process.argv.slice(3);
    await run("node", ["apps/server/dist/cli-gsc-ingest.js", ...extra]);
  } else if (role === "inspect") {
    console.log("Running GSC URL Inspection...");
    const extra = process.argv.slice(3);
    await run("node", ["apps/server/dist/cli-gsc-inspect.js", ...extra]);
  } else {
    throw new Error(`Unknown role: ${role} (expected web|worker|seed|ingest|inspect)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

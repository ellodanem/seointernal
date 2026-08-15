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
  } else {
    throw new Error(`Unknown role: ${role} (expected web|worker|seed)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { prisma } from "../lib/db.js";

/**
 * Per-project concurrency guards using PostgreSQL advisory locks.
 *
 * Decision: pg_try_advisory_lock keyed by a stable hash of namespace + projectId.
 * No Redis / distributed lock infrastructure — one worker process is assumed,
 * but this also protects manual CLI vs scheduled overlap on the same DB.
 *
 * Ingest and URL Inspection use distinct namespaces so they do not block each other.
 */
export async function tryAcquireProjectIngestLock(projectId: string): Promise<boolean> {
  return tryAcquireLock("ingest", projectId);
}

export async function releaseProjectIngestLock(projectId: string): Promise<void> {
  return releaseLock("ingest", projectId);
}

export async function tryAcquireProjectInspectLock(projectId: string): Promise<boolean> {
  return tryAcquireLock("inspect", projectId);
}

export async function releaseProjectInspectLock(projectId: string): Promise<void> {
  return releaseLock("inspect", projectId);
}

async function tryAcquireLock(namespace: string, projectId: string): Promise<boolean> {
  const key = advisoryKey(`${namespace}:${projectId}`);
  const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${key}) AS locked
  `;
  return Boolean(rows[0]?.locked);
}

async function releaseLock(namespace: string, projectId: string): Promise<void> {
  const key = advisoryKey(`${namespace}:${projectId}`);
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${key})`;
}

/** Convert a string into a signed 64-bit-ish bigint key for advisory locks. */
function advisoryKey(input: string): bigint {
  // FNV-1a 64-bit over UTF-8 bytes
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  // pg advisory lock takes signed bigint; keep in signed range
  const signed = hash > 0x7fffffffffffffffn ? hash - 0x10000000000000000n : hash;
  return signed;
}

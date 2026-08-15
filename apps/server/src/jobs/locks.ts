import { prisma } from "../lib/db.js";

/**
 * Per-project ingestion concurrency guard using PostgreSQL advisory locks.
 *
 * Decision: pg_try_advisory_lock keyed by a stable hash of projectId.
 * No Redis / distributed lock infrastructure — one worker process is assumed,
 * but this also protects manual CLI vs scheduled overlap on the same DB.
 */
export async function tryAcquireProjectIngestLock(projectId: string): Promise<boolean> {
  const key = advisoryKey(projectId);
  const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${key}) AS locked
  `;
  return Boolean(rows[0]?.locked);
}

export async function releaseProjectIngestLock(projectId: string): Promise<void> {
  const key = advisoryKey(projectId);
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${key})`;
}

/** Convert project cuid into a signed 64-bit-ish bigint key for advisory locks. */
function advisoryKey(projectId: string): bigint {
  // FNV-1a 64-bit over UTF-8 bytes
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < projectId.length; i++) {
    hash ^= BigInt(projectId.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  // pg advisory lock takes signed bigint; keep in signed range
  const signed = hash > 0x7fffffffffffffffn ? hash - 0x10000000000000000n : hash;
  return signed;
}

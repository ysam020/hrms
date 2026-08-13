import { PrismaClient } from "@prisma/client";
import { logger } from "@hrms/logger";
import { attachAuditLogging } from "./auditMiddleware";

// Every service process (api-gateway, each microservice, notification worker,
// scheduler jobs) holds its own copy of this pool, so an unbounded Map here
// multiplies idle-connection/memory cost by tenant count *and* service count.
// MAX_POOL_SIZE + IDLE_TTL_MS keep each process's footprint bounded instead of
// growing forever as new tenant DBs are touched over the process lifetime.
const MAX_POOL_SIZE = 50;
const IDLE_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface PoolEntry {
  client: PrismaClient;
  lastUsed: number;
}

const pool = new Map<string, PoolEntry>();

// Prisma's Mongo connector defaults connection_limit to num_cpus*2+1 per
// client with no cap awareness of how many OTHER clients share the process —
// fine for the single shared client in prismaClient.ts, but here up to
// MAX_POOL_SIZE (50) tenant clients can be live in one process at once, each
// silently opening that same per-CPU-count default. Left untuned, a process
// on this repo's 2-vCPU prod host (m7i-flex.large) could open up to
// 50 x 5 = 250 MongoDB connections, and that multiplies again across every
// backend service process hitting the same replica set. Capping it small and
// explicit here makes the real ceiling MAX_POOL_SIZE x CONNECTION_LIMIT
// — predictable and independent of host core count.
//
// Raised 3 -> 50 (2026-07-23): the old value of 3 measurably became the
// system's throughput ceiling under load (progressive autocannon test
// against a local 5-node replica set plateaued at ~260 req/s from 100
// connections onward, with latency climbing until timeouts appeared at 500 —
// classic pool-exhaustion queueing, not a database-capacity limit). 50
// matches MAX_POOL_SIZE's own order of magnitude, keeping the ceiling
// formula's intent (MAX_POOL_SIZE x CONNECTION_LIMIT, now 2500/process)
// predictable rather than picking an arbitrary large number. Re-validate
// against whatever Mongo cluster tier is actually deployed before this
// reaches production — this was only proven out against an unconstrained
// local replica set, not Atlas' real connection ceiling.
const CONNECTION_LIMIT = 50;

function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  // Replace the database name segment (between last "/" and "?" or end of string)
  const withDbName = base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
  const separator = withDbName.includes("?") ? "&" : "?";
  // Prisma's MongoDB connector passes the connection string straight through
  // to the MongoDB driver, which uses `maxPoolSize` (not the relational
  // connectors' `connection_limit`) to cap pool size.
  return `${withDbName}${separator}maxPoolSize=${CONNECTION_LIMIT}`;
}

function evict(dbName: string, entry: PoolEntry): void {
  pool.delete(dbName);
  entry.client.$disconnect().catch((err) => {
    logger.error(
      `Failed to disconnect tenant DB client for "${dbName}": ${err}`,
    );
  });
  logger.info(`Tenant DB client evicted for "${dbName}"`);
}

// Map iteration order = insertion order, and getClientForDb()'s hit path
// below deletes-then-reinserts the touched key, so the least-recently-used
// entry is always the first one the iterator yields. O(1) instead of
// scanning every entry for the minimum lastUsed.
function evictLru(): void {
  const lruDbName = pool.keys().next().value as string | undefined;
  if (lruDbName !== undefined) {
    evict(lruDbName, pool.get(lruDbName)!);
  }
}

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [dbName, entry] of pool) {
    if (now - entry.lastUsed > IDLE_TTL_MS) {
      evict(dbName, entry);
    }
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref();

export function getClientForDb(dbName: string): PrismaClient {
  const existing = pool.get(dbName);
  if (existing) {
    existing.lastUsed = Date.now();
    // Move to MRU (end) position.
    pool.delete(dbName);
    pool.set(dbName, existing);
    return existing.client;
  }

  if (pool.size >= MAX_POOL_SIZE) {
    evictLru();
  }

  const client = new PrismaClient({
    datasourceUrl: buildUrl(dbName),
    log: [
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ],
  });
  attachAuditLogging(client);
  pool.set(dbName, { client, lastUsed: Date.now() });
  logger.info(`Tenant DB client created for "${dbName}"`);
  return client;
}

export async function closeAllTenantClients(): Promise<void> {
  await Promise.all([...pool.values()].map((e) => e.client.$disconnect()));
  pool.clear();
}

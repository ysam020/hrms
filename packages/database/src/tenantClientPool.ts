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
// explicit here makes the real ceiling MAX_POOL_SIZE x CONNECTION_LIMIT (150)
// — predictable and independent of host core count.
const CONNECTION_LIMIT = 3;

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

function evictLru(): void {
  let lruDbName: string | null = null;
  let lruEntry: PoolEntry | null = null;
  for (const [dbName, entry] of pool) {
    if (!lruEntry || entry.lastUsed < lruEntry.lastUsed) {
      lruDbName = dbName;
      lruEntry = entry;
    }
  }
  if (lruDbName && lruEntry) {
    evict(lruDbName, lruEntry);
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

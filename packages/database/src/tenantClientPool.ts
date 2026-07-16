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

function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  // Replace the database name segment (between last "/" and "?" or end of string)
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
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

import { PrismaClient } from "@prisma/client";
import { logger } from "@hrms/logger";
import { attachAuditLogging } from "./auditMiddleware";

// Every service process (api-gateway, each microservice, notification worker,
// scheduler jobs) holds its own copy of this pool
const MAX_POOL_SIZE = 50;
const IDLE_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface PoolEntry {
  client: PrismaClient;
  lastUsed: number;
}

const pool = new Map<string, PoolEntry>();

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

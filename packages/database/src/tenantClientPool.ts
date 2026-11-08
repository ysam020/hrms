import { PrismaClient } from "@prisma/client";
import { logger } from "@hrms/logger";
import { attachAuditLogging } from "./auditMiddleware";
import { attachQueryTiming } from "./queryTiming";
import { activeLeases, cancelWhenIdle, whenIdle } from "./clientLeases";

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

// LRU order is by when a client was last *handed out*, not by when it was
// last used: a request or job that took a client moments ago may still be
// running queries on it when a burst of other tenants pushes it out of the
// pool. An evicted client is therefore disconnected only once no operation
// holds it (clientLeases.ts — every runWithTenant scope holds one) and this
// grace period has passed, which also covers work that outlives its scope.
// It is put back if its tenant is asked for again before then.
const EVICTION_GRACE_MS = 60 * 1000;
const retiring = new Map<
  string,
  { client: PrismaClient; timer: ReturnType<typeof setTimeout> }
>();

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

function disconnect(dbName: string, client: PrismaClient): Promise<void> {
  return client.$disconnect().catch((err) => {
    logger.error(
      `Failed to disconnect tenant DB client for "${dbName}": ${err}`,
    );
  });
}

function evict(dbName: string, entry: PoolEntry): void {
  pool.delete(dbName);
  const timer = setTimeout(() => {
    whenIdle(entry.client, () => {
      // Still retiring (not put back meanwhile) and nothing uses it.
      if (retiring.get(dbName)?.client !== entry.client) return;
      retiring.delete(dbName);
      void disconnect(dbName, entry.client);
    });
  }, EVICTION_GRACE_MS);
  timer.unref?.();
  retiring.set(dbName, { client: entry.client, timer });
  logger.info(`Tenant DB client evicted for "${dbName}"`, {
    inUse: activeLeases(entry.client),
    retiring: retiring.size,
  });
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

  const retired = retiring.get(dbName);
  if (retired) {
    clearTimeout(retired.timer);
    cancelWhenIdle(retired.client);
    retiring.delete(dbName);
    pool.set(dbName, { client: retired.client, lastUsed: Date.now() });
    return retired.client;
  }

  const client = new PrismaClient({
    datasourceUrl: buildUrl(dbName),
    log: [
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ],
  });
  attachQueryTiming(client, "tenant");
  attachAuditLogging(client);
  pool.set(dbName, { client, lastUsed: Date.now() });
  logger.info("Tenant DB client created", { poolSize: pool.size });
  return client;
}

export async function closeAllTenantClients(): Promise<void> {
  const retired = [...retiring.values()];
  for (const { client, timer } of retired) {
    clearTimeout(timer);
    cancelWhenIdle(client);
  }
  retiring.clear();
  await Promise.all([
    ...[...pool.values()].map((e) => e.client.$disconnect()),
    ...retired.map(({ client }) => client.$disconnect()),
  ]);
  pool.clear();
}

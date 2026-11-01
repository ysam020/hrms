import { AsyncLocalStorage } from "async_hooks";
import { logger } from "@hrms/logger";

// Query-level timing for every Prisma client (master and tenant). Records
// only the model, operation, duration and which kind of database served it
// — never query arguments or results, which can carry personal data.
//
//   PRISMA_SLOW_QUERY_MS      log a warning at or above this (default 300)
//   PRISMA_QUERY_SAMPLE_RATE  fraction of all queries logged at debug (default 0)
//
// withQueryStats() opens a per-request scope; queries inside it add to its
// counters so a caller (the gateway, a gRPC service) can report round trips
// per request.
//
// What the numbers mean: a query's duration is measured around the Prisma
// call, so it includes waiting for a pooled connection, the network round
// trip to Atlas and server execution — Prisma's MongoDB connector exposes no
// pool-wait metric, so those can't be separated here. `dbBusyMs` (wall time
// with at least one query in flight) next to `dbMs` (sum of durations) and
// `maxInFlight` show how much of it overlapped.

export interface QueryStats {
  count: number;
  totalMs: number;
  slowest: { model: string; action: string; ms: number } | null;
  /** Wall time during which at least one query was in flight. */
  busyMs: number;
  inFlight: number;
  maxInFlight: number;
  busySince: number;
  /** Downstream (gRPC) calls made by this request. */
  downstreamCount: number;
  downstreamMs: number;
  /** performance.now() when the route handler started, if it marked it. */
  handlerStart: number | null;
  /** Optional cap on concurrent reads for this request (see limitReads). */
  readLimit: number | null;
  readsActive: number;
  readWaiters: (() => void)[];
  /** Time reads spent waiting for a slot under readLimit. */
  capWaitMs: number;
}

const statsStorage = new AsyncLocalStorage<QueryStats>();

export function withQueryStats<T>(fn: () => T): T {
  return statsStorage.run(
    {
      count: 0,
      totalMs: 0,
      slowest: null,
      busyMs: 0,
      inFlight: 0,
      maxInFlight: 0,
      busySince: 0,
      downstreamCount: 0,
      downstreamMs: 0,
      handlerStart: null,
      readLimit: null,
      readsActive: 0,
      readWaiters: [],
      capWaitMs: 0,
    },
    fn,
  );
}

export function currentQueryStats(): QueryStats | undefined {
  return statsStorage.getStore();
}

/** Marks where middleware ends and the route handler begins. */
export function markHandlerStart(): void {
  const stats = statsStorage.getStore();
  if (stats && stats.handlerStart === null)
    stats.handlerStart = performance.now();
}

/**
 * Caps how many reads this request may have in flight at once. Writes are
 * never held back, so a write whose middleware issues a nested read (the
 * audit pre-read) can't deadlock against its own request's cap.
 */
export function limitReads(max: number | null): void {
  const stats = statsStorage.getStore();
  if (stats) stats.readLimit = max && max > 0 ? Math.floor(max) : null;
}

const READ_ACTIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "aggregateRaw",
  "findRaw",
]);

async function acquireReadSlot(stats: QueryStats): Promise<boolean> {
  if (stats.readLimit === null) return false;
  if (stats.readsActive >= stats.readLimit) {
    const waitStart = performance.now();
    await new Promise<void>((resolve) => stats.readWaiters.push(resolve));
    stats.capWaitMs += performance.now() - waitStart;
  }
  stats.readsActive++;
  return true;
}

function releaseReadSlot(stats: QueryStats): void {
  stats.readsActive--;
  stats.readWaiters.shift()?.();
}

export function recordDownstream(ms: number): void {
  const stats = statsStorage.getStore();
  if (!stats) return;
  stats.downstreamCount++;
  stats.downstreamMs += ms;
}

function numberFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function queryStarted(stats: QueryStats | undefined, now: number): void {
  if (!stats) return;
  if (stats.inFlight === 0) stats.busySince = now;
  stats.inFlight++;
  if (stats.inFlight > stats.maxInFlight) stats.maxInFlight = stats.inFlight;
}

function queryEnded(stats: QueryStats | undefined, now: number): void {
  if (!stats || stats.inFlight === 0) return;
  stats.inFlight--;
  if (stats.inFlight === 0) stats.busyMs += now - stats.busySince;
}

export function recordQuery(
  scope: "master" | "tenant",
  model: string,
  action: string,
  ms: number,
): void {
  const stats = statsStorage.getStore();
  if (stats) {
    stats.count++;
    stats.totalMs += ms;
    if (!stats.slowest || ms > stats.slowest.ms)
      stats.slowest = { model, action, ms };
  }
  const rounded = Math.round(ms);
  if (ms >= numberFromEnv("PRISMA_SLOW_QUERY_MS", 300)) {
    logger.warn("slow prisma query", { scope, model, action, ms: rounded });
  } else if (Math.random() < numberFromEnv("PRISMA_QUERY_SAMPLE_RATE", 0)) {
    logger.debug("prisma query", { scope, model, action, ms: rounded });
  }
}

export function attachQueryTiming(
  client: { $use: (mw: any) => void },
  scope: "master" | "tenant",
): void {
  client.$use(async (params: any, next: (p: any) => Promise<unknown>) => {
    const stats = statsStorage.getStore();
    const slot =
      stats && READ_ACTIONS.has(params.action)
        ? await acquireReadSlot(stats)
        : false;
    const start = performance.now();
    queryStarted(stats, start);
    try {
      return await next(params);
    } finally {
      const end = performance.now();
      queryEnded(stats, end);
      if (slot && stats) releaseReadSlot(stats);
      recordQuery(scope, params.model ?? "$raw", params.action, end - start);
    }
  });
}

/** Safe, value-free summary of a request scope for a timing log line. */
export function summarizeQueryStats(stats: QueryStats, startedAt: number) {
  const now = performance.now();
  return {
    totalMs: Math.round(now - startedAt),
    middlewareMs:
      stats.handlerStart === null
        ? null
        : Math.round(stats.handlerStart - startedAt),
    queries: stats.count,
    dbMs: Math.round(stats.totalMs),
    dbBusyMs: Math.round(stats.busyMs),
    maxInFlight: stats.maxInFlight,
    readLimit: stats.readLimit,
    capWaitMs: Math.round(stats.capWaitMs),
    downstreamCalls: stats.downstreamCount,
    downstreamMs: Math.round(stats.downstreamMs),
    slowest: stats.slowest && {
      ...stats.slowest,
      ms: Math.round(stats.slowest.ms),
    },
  };
}

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
  /** performance.now() when the scope opened (request received). */
  startedAt: number;
  /** Every external wait, in start order (capped at MAX_OPS). */
  ops: TimedOp[];
  opsDropped: number;
  /** Named middleware/handler stages: call count and summed wall time. */
  stages: Record<string, { n: number; ms: number }>;
  redisCount: number;
  redisMs: number;
  /** res.json(): JSON.stringify + ETag + write, wall time. */
  serializeMs: number;
  /** Process CPU at scope start, and the most other scopes in flight. */
  cpuStart: NodeJS.CpuUsage;
  maxOverlap: number;
}

/** One external wait: database query, Redis command or gRPC call. */
export interface TimedOp {
  kind: "db" | "redis" | "grpc";
  /** e.g. "master:User.findUnique", "redis:get", "grpc:getLeaves". */
  name: string;
  start: number;
  end: number;
}

const MAX_OPS = 200;
// Scopes opened with { trackOverlap: true } and not yet ended: when more
// than one is open, the process CPU delta can't be attributed to a single
// request. Opt-in, because only a caller that always ends its scope (the
// gateway, on the response's "close") may register one; gRPC handler scopes
// are never ended and would otherwise accumulate here.
let openScopes = 0;
const liveScopes = new Set<QueryStats>();

const statsStorage = new AsyncLocalStorage<QueryStats>();

export function withQueryStats<T>(
  fn: () => T,
  opts: { trackOverlap?: boolean } = {},
): T {
  const stats: QueryStats = {
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
    startedAt: performance.now(),
    ops: [],
    opsDropped: 0,
    stages: {},
    redisCount: 0,
    redisMs: 0,
    serializeMs: 0,
    cpuStart: process.cpuUsage(),
    maxOverlap: 0,
  };
  if (opts.trackOverlap) {
    openScopes++;
    for (const other of liveScopes)
      other.maxOverlap = Math.max(other.maxOverlap, openScopes - 1);
    stats.maxOverlap = openScopes - 1;
    liveScopes.add(stats);
  } else {
    stats.maxOverlap = -1; // unknown
  }
  return statsStorage.run(stats, fn);
}

/** Closes a scope opened by withQueryStats (call once, when the response ends). */
export function endQueryStats(stats: QueryStats): void {
  if (!liveScopes.delete(stats)) return;
  openScopes--;
}

function pushOp(stats: QueryStats, op: TimedOp): void {
  if (stats.ops.length < MAX_OPS) stats.ops.push(op);
  else stats.opsDropped++;
}

/** Records a Redis command or other external wait against the current request. */
export function recordExternal(
  kind: "redis" | "grpc",
  name: string,
  start: number,
  end: number,
): void {
  const stats = statsStorage.getStore();
  if (!stats) return;
  pushOp(stats, { kind, name, start, end });
  if (kind === "redis") {
    stats.redisCount++;
    stats.redisMs += end - start;
  }
}

/** Adds wall time to a named stage (middleware, handler phase). */
export function recordStage(name: string, ms: number): void {
  const stats = statsStorage.getStore();
  if (!stats) return;
  const st = (stats.stages[name] ??= { n: 0, ms: 0 });
  st.n++;
  st.ms += ms;
}

export function recordSerialize(ms: number): void {
  const stats = statsStorage.getStore();
  if (stats) stats.serializeMs += ms;
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

export function recordDownstream(
  ms: number,
  name = "call",
  start?: number,
): void {
  const stats = statsStorage.getStore();
  if (!stats) return;
  stats.downstreamCount++;
  stats.downstreamMs += ms;
  const end = (start ?? performance.now() - ms) + ms;
  pushOp(stats, { kind: "grpc", name: `grpc:${name}`, start: end - ms, end });
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
      if (stats)
        pushOp(stats, {
          kind: "db",
          name: `${scope}:${params.model ?? "$raw"}.${params.action}`,
          start,
          end,
        });
      if (slot && stats) releaseReadSlot(stats);
      recordQuery(scope, params.model ?? "$raw", params.action, end - start);
    }
  });
}

/** Wall time covered by at least one of the given intervals. */
function unionMs(ops: TimedOp[]): number {
  const sorted = [...ops].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const op of sorted) {
    if (op.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = op.start;
      curEnd = op.end;
    } else if (op.end > curEnd) curEnd = op.end;
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Safe, value-free summary of a request scope for a timing log line.
 * Durations are wall clock (performance.now). Overlapping waits are never
 * summed into the total: `ioBusyMs` is the union of all recorded waits and
 * `nonIoMs` is what's left (on-CPU work, event-loop queueing and any wait
 * that isn't instrumented). `cpuMs` is the process CPU delta and is only
 * attributable to this request when `overlap` is 0.
 */
export function summarizeQueryStats(
  stats: QueryStats,
  startedAt: number,
  opts: { ops?: boolean } = {},
) {
  const now = performance.now();
  const total = now - startedAt;
  const io = unionMs(stats.ops);
  const cpu = process.cpuUsage(stats.cpuStart);
  return {
    totalMs: Math.round(total),
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
    redisCalls: stats.redisCount,
    redisMs: r1(stats.redisMs),
    ioBusyMs: Math.round(io),
    nonIoMs: Math.round(total - io),
    serializeMs: r1(stats.serializeMs),
    // Only meaningful when overlap is 0; -1 = overlap not tracked.
    cpuMs: stats.maxOverlap === 0 ? r1((cpu.user + cpu.system) / 1000) : null,
    overlap: stats.maxOverlap,
    stages: Object.fromEntries(
      Object.entries(stats.stages).map(([k, v]) => [
        k,
        { n: v.n, ms: r1(v.ms) },
      ]),
    ),
    slowest: stats.slowest && {
      ...stats.slowest,
      ms: Math.round(stats.slowest.ms),
    },
    ...(opts.ops
      ? {
          ops: stats.ops.map((o) => [
            o.name,
            r1(o.start - startedAt),
            r1(o.end - o.start),
          ]),
          opsDropped: stats.opsDropped,
        }
      : {}),
  };
}

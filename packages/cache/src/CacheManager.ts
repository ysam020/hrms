import type Redis from "ioredis";
import {
  logger,
  cacheInvalidationSubscriberReconnectsTotal,
  cacheOperationsTotal,
  cacheLoaderDuration,
  cacheRedisDuration,
} from "@hrms/logger";
import { getRedisClient, getCacheRedisClient } from "./client";

const SERVICE_LABEL =
  process.env.SERVICE_NAME || process.env.npm_package_name || "unknown";

/**
 * Metric label for a key: its family segment, never an id. Keys are either
 * "t:<tenantId>:<family>:…" or "<family>:…" (e.g. "tenantSettings:leave:<id>").
 */
export function cacheFamilyOf(key: string): string {
  const parts = key.split(":");
  const family = parts[0] === "t" ? parts[2] : parts[0];
  return /^[A-Za-z][A-Za-z-]{0,39}$/.test(family ?? "") ? family : "other";
}

// Instrumentation must never fail a cache read (optional chaining also
// covers test doubles of @hrms/logger that predate these metrics).
function count(family: string, result: string): void {
  cacheOperationsTotal?.inc({ family, result, service: SERVICE_LABEL });
}

async function timedRedis<T>(op: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    cacheRedisDuration?.observe(
      { op, service: SERVICE_LABEL },
      performance.now() - started,
    );
  }
}

export interface GetOrSetOptions {
  /** TTL entity type (see ENTITY_TTL); ignored when `ttlSeconds` is given. */
  entityType?: string;
  /** Exact TTL in seconds (no jitter), e.g. capped at a known change time. */
  ttlSeconds?: number;
  /** Skip the cached value and load (and re-cache) the authoritative one. */
  fresh?: boolean;
}

type Lookup = { hit: true; value: unknown } | { hit: false };

// Each microservice is a separate Node.js process with its own CacheManager
// instance and its own in-process memoryCache — delete()/invalidatePattern()
// only ever cleared *this* process's memory plus the shared Redis key.
// Without this, a write in one service (e.g. employee-service's KYC submit)
// correctly cleared Redis, but another service's process (e.g. user-service,
// serving GetUser) kept its own now-stale copy in memory for up to its full
// TTL, since get() checks memoryCache before ever touching Redis. Every
// instance subscribes to this channel so a delete/invalidate in one process
// evicts the matching entries everywhere, not just in the process that
// issued it.
const INVALIDATION_CHANNEL = "hrms:cache:invalidate";

type InvalidationMessage =
  | { type: "del"; key: string }
  | { type: "pattern"; pattern: string };

const ENTITY_TTL: Record<string, number> = {
  attendance: 1800,
  leave: 3600,
  hrActivity: 1800,
  employee: 7200,
  user: 7200,
  recruitment: 3600,
  salary: 14400,
  resignation: 3600,
  holiday: 86400,
  permission: 14400,
  notification: 300,
  dashboard: 900,
  analytics: 3600,
  system: 86400,
  default: 3600,
};

const MAX_MEMORY_SIZE = 1000;
const DEFAULT_TTL = 3600;

export class CacheManager {
  private memoryCache: Map<string, unknown>;
  private memoryTTL: Map<string, number>;
  private subscriber: Redis | null = null;
  // Pub/sub can't replay messages published while this connection was down,
  // so an invalidation fired during that window is permanently missed by
  // this process. Rather than track exactly which keys were missed (we
  // can't — the messages are gone), flush the whole in-process cache on
  // every reconnect after the first. False positives (flushing when nothing
  // was actually missed) just cost a few extra Redis round trips on the
  // next reads; a false negative would mean silently stale data for up to
  // this cache's full TTL (up to 4h for salary-tagged keys).
  private hasConnectedBefore = false;
  // In-flight getOrSet loads, so concurrent misses on one key share one
  // database read. Fresh loads are tracked separately: a fresh caller must
  // not join a load that may have started before the write it wants to see.
  private inflight = new Map<string, Promise<unknown>>();
  // Bumped by every invalidation seen by this process (its own, or one
  // received from another process). A load that started before an
  // invalidation may hold pre-write data, so it is returned to its callers
  // but not cached.
  private invalidationEpoch = 0;

  constructor() {
    this.memoryCache = new Map();
    this.memoryTTL = new Map();
    this.subscribeToInvalidations();
  }

  private subscribeToInvalidations(): void {
    try {
      // Pub/sub needs its own connection — once a client issues SUBSCRIBE,
      // ioredis (like Redis itself) restricts it to pub/sub commands only.
      this.subscriber = getRedisClient().duplicate();
      this.subscriber.on("error", (err) =>
        logger.error("CacheManager subscriber error:", { err }),
      );
      this.subscriber.on("ready", () => {
        if (this.hasConnectedBefore) {
          const flushed = this.memoryCache.size;
          this.invalidationEpoch++;
          this.memoryCache.clear();
          this.memoryTTL.clear();
          cacheInvalidationSubscriberReconnectsTotal.inc({
            service: SERVICE_LABEL,
          });
          logger.warn(
            "CacheManager subscriber reconnected — flushed in-process cache to avoid serving invalidations missed while disconnected",
            { flushedEntries: flushed },
          );
        }
        this.hasConnectedBefore = true;
      });
      this.subscriber.on("message", (_channel: string, message: string) => {
        try {
          const payload = JSON.parse(message) as InvalidationMessage;
          if (payload.type === "del") {
            this.evictMemory(payload.key);
          } else {
            this.evictMemoryPattern(payload.pattern);
          }
        } catch (err) {
          logger.error("CacheManager invalidation message error:", { err });
        }
      });
      this.subscriber
        .subscribe(INVALIDATION_CHANNEL)
        .catch((err) =>
          logger.error("CacheManager subscribe failed:", { err }),
        );
    } catch (err) {
      logger.error("CacheManager subscriber setup error:", { err });
    }
  }

  private evictMemory(key: string): void {
    this.invalidationEpoch++;
    this.memoryCache.delete(key);
    this.memoryTTL.delete(key);
  }

  private evictMemoryPattern(pattern: string): void {
    this.invalidationEpoch++;
    const prefix = pattern.endsWith(":*")
      ? pattern.slice(0, -1)
      : pattern.replace(/\*/g, "");
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix) || this.matchesGlob(key, pattern)) {
        this.memoryCache.delete(key);
        this.memoryTTL.delete(key);
      }
    }
  }

  private getTTL(entityType?: string): number {
    if (!entityType) return DEFAULT_TTL;
    return ENTITY_TTL[entityType] ?? DEFAULT_TTL;
  }

  private setMemoryCache(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): void {
    // Evict LRU entry when at capacity (Map preserves insertion order)
    if (
      this.memoryCache.size >= MAX_MEMORY_SIZE &&
      !this.memoryCache.has(key)
    ) {
      const lruKey = this.memoryCache.keys().next().value as string;
      this.memoryCache.delete(lruKey);
      this.memoryTTL.delete(lruKey);
    }
    // Re-insert to move key to MRU position
    this.memoryCache.delete(key);
    this.memoryCache.set(key, value);
    this.memoryTTL.set(key, Date.now() + ttlSeconds * 1000);
  }

  private getMemoryCache(key: string): unknown | null {
    if (!this.memoryCache.has(key)) return null;
    const ttl = this.memoryTTL.get(key);
    if (ttl && Date.now() > ttl) {
      this.memoryCache.delete(key);
      this.memoryTTL.delete(key);
      return null;
    }
    const value = this.memoryCache.get(key);
    // Promote to MRU position
    this.memoryCache.delete(key);
    this.memoryCache.set(key, value);
    return value ?? null;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const found = await this.lookup(key);
    return found.hit ? ((found.value ?? null) as T | null) : null;
  }

  /**
   * Memory, then Redis. Tells a miss apart from a cached null/0/false, which
   * get() cannot. A Redis failure counts as a miss (the caller loads from
   * the database) — reads use the fail-fast cache client, so an outage
   * costs at most CACHE_REDIS_TIMEOUT_MS, not a queued retry.
   */
  private async lookup(key: string): Promise<Lookup> {
    const family = cacheFamilyOf(key);
    const mem = this.readMemory(key);
    if (mem.hit) {
      count(family, "hit_memory");
      return mem;
    }
    let raw: string | null;
    try {
      raw = await timedRedis("get", () => getCacheRedisClient().get(key));
    } catch (err) {
      count(family, "redis_error");
      logger.warn("CacheManager.get Redis error:", { family, err });
      return { hit: false };
    }
    if (raw === null) {
      count(family, "miss");
      return { hit: false };
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      count(family, "miss");
      return { hit: false };
    }
    count(family, "hit_redis");
    // Warm the memory cache with a short TTL (5 min) for hot data
    this.setMemoryCache(key, value, 300);
    return { hit: true, value };
  }

  private readMemory(key: string): Lookup {
    if (!this.memoryCache.has(key)) return { hit: false };
    const value = this.getMemoryCache(key);
    // getMemoryCache maps an expired entry to null and removes it.
    return this.memoryCache.has(key) ? { hit: true, value } : { hit: false };
  }

  /**
   * Cache-aside read: the cached value if present, otherwise `load()`'s
   * result, cached under `key`. Concurrent misses in this process share one
   * load. Any value except `undefined` is cached — null, 0 and false
   * included. A failed load caches nothing and rejects every waiter.
   *
   * Must only be called after the request's authentication, tenant and
   * permission checks: a hit returns the value without running `load()`.
   */
  async getOrSet<T>(
    key: string,
    load: () => Promise<T>,
    options: GetOrSetOptions = {},
  ): Promise<T> {
    const family = cacheFamilyOf(key);
    if (!options.fresh) {
      const found = await this.lookup(key);
      if (found.hit) return found.value as T;
    }
    const flightKey = options.fresh ? `fresh\u0000${key}` : key;
    const pending = this.inflight.get(flightKey);
    if (pending) {
      count(family, "coalesced");
      return pending as Promise<T>;
    }
    const epoch = this.invalidationEpoch;
    const run = (async () => {
      const started = performance.now();
      let value: T;
      try {
        value = await load();
      } catch (err) {
        count(family, "loader_error");
        throw err;
      } finally {
        cacheLoaderDuration?.observe(
          { family, service: SERVICE_LABEL },
          performance.now() - started,
        );
      }
      if (value !== undefined && epoch === this.invalidationEpoch) {
        await this.set(key, value, options.entityType, options.ttlSeconds);
      }
      return value;
    })();
    this.inflight.set(flightKey, run);
    try {
      return await run;
    } finally {
      if (this.inflight.get(flightKey) === run) this.inflight.delete(flightKey);
    }
  }

  /**
   * Every colon-delimited ancestor prefix of a key, e.g.
   * "t:tenant:leaves:2026:7" -> ["t:tenant:leaves:2026", "t:tenant:leaves", "t:tenant", "t"].
   * Used to maintain small per-prefix index sets at write time so
   * invalidatePattern() can look up exactly which keys exist under a prefix
   * instead of scanning the entire keyspace to find out — see that method's
   * comment for why this matters.
   */
  private static prefixesOf(key: string): string[] {
    const parts = key.split(":");
    const prefixes: string[] = [];
    for (let i = parts.length - 1; i >= 1; i--) {
      prefixes.push(parts.slice(0, i).join(":"));
    }
    return prefixes;
  }

  async set(
    key: string,
    value: unknown,
    entityType?: string,
    customTTL?: number,
  ): Promise<void> {
    // Entity TTLs get ±10% jitter so keys filled together (a cold start, a
    // tenant-wide invalidation) don't all expire and refill in the same
    // second. An explicit customTTL is honoured exactly.
    const baseTTL = customTTL ?? this.getTTL(entityType);
    const ttl =
      customTTL === undefined
        ? Math.max(1, Math.round(baseTTL * (0.9 + Math.random() * 0.2)))
        : baseTTL;
    // Index sets must outlive every member written with this base TTL.
    const indexTTL =
      customTTL === undefined ? Math.ceil(baseTTL * 1.1) : baseTTL;
    const family = cacheFamilyOf(key);
    try {
      // Fills use the fail-fast client: losing one is harmless (the next
      // read loads again), waiting on a dead Redis is not.
      const redis = getCacheRedisClient();
      const multi = redis.multi();
      multi.set(key, JSON.stringify(value ?? null), "EX", ttl);
      // Index this key under every ancestor prefix so a later
      // invalidatePattern("<prefix>:*") can find it in O(1) instead of
      // scanning the whole keyspace. Each index set's own TTL is refreshed
      // on every write so it stays alive as long as the prefix is in active
      // use, and expires naturally (self-cleaning) once it isn't.
      for (const prefix of CacheManager.prefixesOf(key)) {
        const idxKey = `idx:${prefix}`;
        multi.sadd(idxKey, key);
        multi.expire(idxKey, indexTTL);
      }
      await timedRedis("set", () => multi.exec());
      count(family, "set");
      this.setMemoryCache(key, value, ttl);
    } catch (err) {
      count(family, "redis_error");
      logger.error("CacheManager.set error:", { family, err });
      // Fall back to memory-only on Redis failure
      this.setMemoryCache(key, value, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    this.evictMemory(key);
    count(cacheFamilyOf(key), "invalidate");
    try {
      const redis = getRedisClient();
      await redis.del(key);
      // Tell every other process's CacheManager to evict this key from its
      // own memory too — see the comment on INVALIDATION_CHANNEL above.
      await redis.publish(
        INVALIDATION_CHANNEL,
        JSON.stringify({ type: "del", key } satisfies InvalidationMessage),
      );
    } catch (err) {
      logger.error("CacheManager.delete error:", { key, err });
    }
  }

  /**
   * Delete all Redis keys matching a glob pattern AND evict matching memory entries.
   *
   * Every real call site in this codebase uses the simple "<prefix>:*" shape
   * (single trailing wildcard) — for that shape, look the keys up directly
   * via the per-prefix index set() maintains instead of SCANning the entire
   * keyspace to find them. This used to be the dominant source of Redis load
   * under any real write volume: SCAN's MATCH filter is applied *after*
   * iterating every key in the database (Redis has no prefix index of its
   * own), so a call like invalidatePattern(`t:${tenantId}:leaves:*`) — fired
   * on every single leave/attendance mutation — cost O(total keys in Redis
   * across every tenant, every rate limiter counter, every BullMQ job) each
   * time, not O(keys actually under that prefix). Confirmed via
   * `redis-cli INFO commandstats` under load: 43M+ SCAN calls, ~972 CPU-s
   * cumulative, Redis pegged at ~190% CPU while every other command
   * (including the actual rate limiting) was a rounding error by comparison.
   *
   * Any pattern that isn't that simple shape (wildcard elsewhere, multiple
   * wildcards) falls back to the original SCAN-based sweep, so this can't
   * silently under-invalidate for a pattern shape introduced later.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    // Always evict this process's memory entries first — independent of
    // Redis availability.
    this.evictMemoryPattern(pattern);
    count(cacheFamilyOf(pattern), "invalidate");

    try {
      const redis = getRedisClient();
      const simpleMatch = /^([^*?[]+):\*$/.exec(pattern);

      if (simpleMatch) {
        const idxKey = `idx:${simpleMatch[1]}`;
        const keys = await redis.smembers(idxKey);
        if (keys.length > 0) {
          await redis.del(...keys, idxKey);
        } else {
          await redis.del(idxKey);
        }
      } else {
        // Fallback sweep for any pattern shape the index can't answer directly.
        let cursor = "0";
        do {
          const [nextCursor, keys] = await redis.scan(
            cursor,
            "MATCH",
            pattern,
            "COUNT",
            100,
          );
          cursor = nextCursor;
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        } while (cursor !== "0");
      }

      await redis.publish(
        INVALIDATION_CHANNEL,
        JSON.stringify({
          type: "pattern",
          pattern,
        } satisfies InvalidationMessage),
      );
    } catch (err) {
      logger.error("CacheManager.invalidatePattern error:", { pattern, err });
    }
  }

  /** Simple glob match supporting only '*' wildcard. */
  private matchesGlob(str: string, pattern: string): boolean {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(str);
  }

  /** Purge expired entries from the in-memory cache. Called on a timer. */
  cleanup(): void {
    const now = Date.now();
    for (const [key, expiry] of this.memoryTTL.entries()) {
      if (expiry && now > expiry) {
        this.memoryCache.delete(key);
        this.memoryTTL.delete(key);
      }
    }
  }

  getCacheStats() {
    return {
      memoryEntries: this.memoryCache.size,
      maxSize: MAX_MEMORY_SIZE,
    };
  }

  async healthCheck() {
    try {
      const redis = getRedisClient();
      const result = await redis.ping();
      return { redis: result === "PONG", memory: true };
    } catch (err) {
      return { redis: false, memory: true, error: (err as Error).message };
    }
  }
}

let instance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!instance) {
    instance = new CacheManager();
    // unref() so this timer alone doesn't keep the process/event loop
    // alive — matters for scripts, tests, and graceful shutdown, and is a
    // no-op for a long-running service (which always has other work
    // keeping it alive anyway).
    setInterval(() => instance!.cleanup(), 300_000).unref();
  }
  return instance;
}

export const cacheManager = getCacheManager();

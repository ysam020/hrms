import type Redis from "ioredis";
import { logger } from "@hrms/logger";
import { getRedisClient } from "./client";

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
    this.memoryCache.delete(key);
    this.memoryTTL.delete(key);
  }

  private evictMemoryPattern(pattern: string): void {
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
    try {
      const memHit = this.getMemoryCache(key);
      if (memHit !== null) return memHit as T;

      const redis = getRedisClient();
      const raw = await redis.get(key);
      if (!raw) return null;

      const value = JSON.parse(raw) as T;
      // Warm the memory cache with a short TTL (5 min) for hot data
      this.setMemoryCache(key, value, 300);
      return value;
    } catch (err) {
      logger.error("CacheManager.get error:", { key, err });
      return null;
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
    const ttl = customTTL ?? this.getTTL(entityType);
    try {
      const redis = getRedisClient();
      const multi = redis.multi();
      multi.set(key, JSON.stringify(value), "EX", ttl);
      // Index this key under every ancestor prefix so a later
      // invalidatePattern("<prefix>:*") can find it in O(1) instead of
      // scanning the whole keyspace. Each index set's own TTL is refreshed
      // on every write so it stays alive as long as the prefix is in active
      // use, and expires naturally (self-cleaning) once it isn't.
      for (const prefix of CacheManager.prefixesOf(key)) {
        const idxKey = `idx:${prefix}`;
        multi.sadd(idxKey, key);
        multi.expire(idxKey, ttl);
      }
      await multi.exec();
      this.setMemoryCache(key, value, ttl);
    } catch (err) {
      logger.error("CacheManager.set error:", { key, err });
      // Fall back to memory-only on Redis failure
      this.setMemoryCache(key, value, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    this.evictMemory(key);
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

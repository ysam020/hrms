import Redis from "ioredis";
import { logger } from "@hrms/logger";
import { getRedisClient } from "./client";

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

// Set CACHE_MEMORY_DISABLED=true when running multiple api-gateway instances.
// With the in-memory tier enabled each instance has its own local copy that
// won't see Redis-side invalidations issued by other instances.
const MEMORY_DISABLED = process.env.CACHE_MEMORY_DISABLED === "true";

// Redis Pub/Sub channel used to broadcast invalidation events to every instance.
const INVALIDATION_CHANNEL = "cache:invalidate";

export class CacheManager {
  private memoryCache: Map<string, unknown>;
  private memoryTTL: Map<string, number>;
  private subscriber: Redis | null = null;

  constructor() {
    this.memoryCache = new Map();
    this.memoryTTL = new Map();
    if (!MEMORY_DISABLED) {
      this.subscribeToInvalidations();
    }
  }

  /**
   * Subscribe to the Redis invalidation channel so that delete/invalidate
   * calls made by other instances are reflected in this instance's memory cache.
   */
  private subscribeToInvalidations(): void {
    try {
      // Use a dedicated connection for subscriptions (ioredis requirement).
      this.subscriber = new Redis(
        process.env.REDIS_URL || "redis://localhost:6379",
      );
      this.subscriber.on("error", (err) =>
        logger.error("Cache invalidation subscriber error:", { err }),
      );
      this.subscriber.subscribe(INVALIDATION_CHANNEL, (err) => {
        if (err)
          logger.error("Failed to subscribe to invalidation channel:", { err });
      });
      this.subscriber.on("message", (_channel, message) => {
        try {
          const { type, key, pattern } = JSON.parse(message) as {
            type: "key" | "pattern";
            key?: string;
            pattern?: string;
          };
          if (type === "key" && key) {
            this.memoryCache.delete(key);
            this.memoryTTL.delete(key);
          } else if (type === "pattern" && pattern) {
            this.evictMemoryByPattern(pattern);
          }
        } catch {
          // Malformed message — ignore
        }
      });
    } catch (err) {
      logger.error("Could not set up cache invalidation subscriber:", { err });
    }
  }

  /** Publish an invalidation event so all instances can evict the same key. */
  private async publishInvalidation(
    payload:
      | { type: "key"; key: string }
      | { type: "pattern"; pattern: string },
  ): Promise<void> {
    try {
      await getRedisClient().publish(
        INVALIDATION_CHANNEL,
        JSON.stringify(payload),
      );
    } catch (err) {
      logger.error("Failed to publish cache invalidation:", { err });
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
    if (MEMORY_DISABLED) return;
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
    if (MEMORY_DISABLED) return null;
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

  /** Evict all memory-cache entries whose key matches a glob pattern. */
  private evictMemoryByPattern(pattern: string): void {
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

  async set(
    key: string,
    value: unknown,
    entityType?: string,
    customTTL?: number,
  ): Promise<void> {
    const ttl = customTTL ?? this.getTTL(entityType);
    try {
      const redis = getRedisClient();
      await redis.set(key, JSON.stringify(value), "EX", ttl);
      this.setMemoryCache(key, value, ttl);
    } catch (err) {
      logger.error("CacheManager.set error:", { key, err });
      // Fall back to memory-only on Redis failure
      this.setMemoryCache(key, value, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      this.memoryCache.delete(key);
      this.memoryTTL.delete(key);
      const redis = getRedisClient();
      await redis.del(key);
      // Broadcast to other instances so they also evict this key
      await this.publishInvalidation({ type: "key", key });
    } catch (err) {
      logger.error("CacheManager.delete error:", { key, err });
    }
  }

  /**
   * Delete all Redis keys matching a glob pattern AND evict matching memory entries.
   * Uses SCAN to avoid blocking Redis on large keyspaces.
   * Broadcasts the invalidation via Pub/Sub so other instances stay consistent.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const redis = getRedisClient();
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

      this.evictMemoryByPattern(pattern);
      // Broadcast to other instances
      await this.publishInvalidation({ type: "pattern", pattern });
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
      memoryDisabled: MEMORY_DISABLED,
      memoryEntries: MEMORY_DISABLED ? 0 : this.memoryCache.size,
      maxSize: MAX_MEMORY_SIZE,
    };
  }

  async disconnect(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
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
    setInterval(() => instance!.cleanup(), 300_000);
  }
  return instance;
}

export const cacheManager = getCacheManager();

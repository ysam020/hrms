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

export class CacheManager {
  private memoryCache: Map<string, unknown>;
  private memoryTTL: Map<string, number>;

  constructor() {
    this.memoryCache = new Map();
    this.memoryTTL = new Map();
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
    } catch (err) {
      logger.error("CacheManager.delete error:", { key, err });
    }
  }

  /**
   * Delete all Redis keys matching a glob pattern AND evict matching memory entries.
   * Uses SCAN to avoid blocking Redis on large keyspaces.
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

      const prefix = pattern.endsWith(":*")
        ? pattern.slice(0, -1)
        : pattern.replace(/\*/g, "");
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(prefix) || this.matchesGlob(key, pattern)) {
          this.memoryCache.delete(key);
          this.memoryTTL.delete(key);
        }
      }
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
    setInterval(() => instance!.cleanup(), 300_000);
  }
  return instance;
}

export const cacheManager = getCacheManager();

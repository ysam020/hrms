// Generic bounded in-memory cache: LRU eviction on overflow + idle-TTL sweep.
// Extracted from packages/database/src/tenantClientPool.ts, which already
// gets this pattern right, so every ad-hoc `new Map()` lookup cache
// (dbNameCache/usernameCache in authenticate.ts, tenantBySlugCache in
// resolvePublicTenant.ts, ...) can reuse it instead of growing unbounded for
// the lifetime of the process.
export interface BoundedCacheOptions {
  maxSize?: number;
  idleTtlMs?: number;
  sweepIntervalMs?: number;
}

interface Entry<V> {
  value: V;
  lastUsed: number;
}

export class BoundedCache<K, V> {
  private readonly map = new Map<K, Entry<V>>();
  private readonly maxSize: number;
  private readonly idleTtlMs: number;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(options: BoundedCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 500;
    this.idleTtlMs = options.idleTtlMs ?? 30 * 60 * 1000;
    const sweepIntervalMs = options.sweepIntervalMs ?? 5 * 60 * 1000;
    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweepTimer.unref();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (now - entry.lastUsed > this.idleTtlMs) this.map.delete(key);
    }
  }

  // Map iteration order = insertion order, and get()/set() below always
  // delete-then-reinsert the touched key, so the least-recently-used entry
  // is always the first one the iterator yields. O(1) instead of scanning
  // every entry for the minimum lastUsed.
  private evictLru(): void {
    const lruKey = this.map.keys().next().value as K | undefined;
    if (lruKey !== undefined) this.map.delete(lruKey);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    entry.lastUsed = Date.now();
    // Move to MRU (end) position.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (!this.map.has(key) && this.map.size >= this.maxSize) {
      this.evictLru();
    }
    // Delete first so re-setting an existing key also moves it to MRU.
    this.map.delete(key);
    this.map.set(key, { value, lastUsed: Date.now() });
  }

  clear(): void {
    this.map.clear();
  }

  /** Stops the idle-sweep timer — call in tests to avoid open-handle leaks. */
  destroy(): void {
    clearInterval(this.sweepTimer);
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

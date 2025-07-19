// server/config/optimizedRedisPool.mjs
import Redis from "ioredis";

class OptimizedRedisPool {
  static instance = null;
  static pool = null;

  static getInstance() {
    if (!OptimizedRedisPool.instance) {
      OptimizedRedisPool.instance = new OptimizedRedisPool();
      OptimizedRedisPool.pool = new Redis.Cluster(
        [
          {
            host: process.env.REDIS_HOST || "localhost",
            port: process.env.REDIS_PORT || 6379,
          },
        ],
        {
          // Connection pool settings for high concurrency
          redisOptions: {
            password: process.env.REDIS_PASSWORD,
            connectTimeout: 5000,
            commandTimeout: 3000,
            lazyConnect: true,
            keepAlive: 30000,
            maxRetriesPerRequest: 2,
            retryDelayOnFailover: 50,
            enableOfflineQueue: false,
            // Critical: Enable connection pooling
            family: 4,
          },
          // Cluster-specific settings for better load distribution
          enableReadyCheck: false,
          maxRetriesPerRequest: 2,
          retryDelayOnFailover: 50,
          slotsRefreshTimeout: 2000,
          slotsRefreshInterval: 5000,
          // Connection pooling
          lazyConnect: true,
          // For single Redis instance, use these instead:
          // enableOfflineQueue: false,
          // connectTimeout: 5000,
          // commandTimeout: 3000,
        }
      );

      // For single Redis instance (not cluster), use this instead:
      /*
      OptimizedRedisPool.pool = new Redis({
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0,
        
        // Critical settings for high concurrency
        connectTimeout: 5000,
        commandTimeout: 3000,
        lazyConnect: true,
        keepAlive: 30000,
        maxRetriesPerRequest: 2,
        retryDelayOnFailover: 50,
        enableOfflineQueue: false,
        
        // Connection pool settings
        family: 4,
        enableReadyCheck: false,
        
        // Pipeline settings for better throughput
        enableAutoPipelining: true,
        maxRetriesPerRequest: 2,
      });
      */

      // Error handling
      OptimizedRedisPool.pool.on("error", (err) => {
        console.error("Redis pool error:", err);
      });

      OptimizedRedisPool.pool.on("connect", () => {
        console.log("Redis pool connected");
      });
    }

    return OptimizedRedisPool.pool;
  }

  static async closePool() {
    if (OptimizedRedisPool.pool) {
      await OptimizedRedisPool.pool.quit();
      OptimizedRedisPool.pool = null;
      OptimizedRedisPool.instance = null;
    }
  }
}

export default OptimizedRedisPool;

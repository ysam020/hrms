import Redis from "ioredis";

class RedisConnectionManager {
  static instance = null;
  static connections = new Map();

  static getInstance() {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager();
    }
    return RedisConnectionManager.instance;
  }

  getConnection(type = "default") {
    if (!RedisConnectionManager.connections.has(type)) {
      const connection = new Redis({
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryDelayOnFailover: 100,
        enableOfflineQueue: false,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
        // Connection pool settings
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableOfflineQueue: false,
      });

      connection.on("error", (err) => {
        console.error(
          `Redis ${type} connection error - Worker ${process.pid}:`,
          err
        );
      });

      RedisConnectionManager.connections.set(type, connection);
    }

    return RedisConnectionManager.connections.get(type);
  }

  async closeAll() {
    const promises = [];
    for (const [type, connection] of RedisConnectionManager.connections) {
      promises.push(connection.disconnect());
    }

    await Promise.all(promises);
    RedisConnectionManager.connections.clear();
  }
}

export default RedisConnectionManager;

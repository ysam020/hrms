// server/config/redisConfig.mjs - Updated consolidated version
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

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
      const connectionOptions = {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        retryDelayOnFailover: 100,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
      };

      // Special handling for subscriber connections
      if (type === "subscriber" || type === "publisher") {
        connectionOptions.enableOfflineQueue = true;
        connectionOptions.lazyConnect = false;
      } else {
        connectionOptions.enableOfflineQueue = false;
        connectionOptions.lazyConnect = true;
      }

      const connection = new Redis(connectionOptions);

      connection.on("error", (err) => {
        console.error(
          `Redis ${type} connection error - Worker ${process.pid}:`,
          err
        );
      });

      connection.on("connect", () => {
        console.log(
          `Redis ${type} connection established - Worker ${process.pid}`
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

// Export both the manager and a default client for backward compatibility
const redisManager = RedisConnectionManager.getInstance();
const redisClient = redisManager.getConnection("default");

export default redisClient;
export { RedisConnectionManager, redisManager };

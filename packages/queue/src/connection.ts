import { ConnectionOptions } from "bullmq";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the ioredis connection.
 * This factory creates a consistent connection config from the environment.
 */
export function getBullMQConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    ...(process.env.REDIS_PASSWORD
      ? { password: process.env.REDIS_PASSWORD }
      : {}),
    ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  } as ConnectionOptions;
}

import Redis from "ioredis";
import { logger } from "@hrms/logger";

type ConnectionType = "publisher" | "subscriber" | "client";

const connections = new Map<ConnectionType, Redis>();

function createRedisConnection(type: ConnectionType): Redis {
  const conn = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    ...(process.env.REDIS_PASSWORD
      ? { password: process.env.REDIS_PASSWORD }
      : {}),
    ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
  });

  conn.on("error", (err) =>
    logger.error(`WebSocket Redis [${type}] error:`, { err }),
  );
  conn.on("connect", () => logger.info(`WebSocket Redis [${type}] connected`));

  return conn;
}

export function getWebSocketRedis(type: ConnectionType): Redis {
  if (!connections.has(type)) {
    connections.set(type, createRedisConnection(type));
  }
  return connections.get(type)!;
}

export async function closeWebSocketRedisConnections(): Promise<void> {
  const promises: Promise<unknown>[] = [];

  for (const [, conn] of connections) {
    if (conn.status !== "end" && conn.status !== "close") {
      promises.push(
        Promise.race([
          conn.disconnect(),
          new Promise((resolve) => setTimeout(resolve, 5173)),
        ]).catch((err) =>
          logger.error("WebSocket Redis disconnect error:", { err }),
        ),
      );
    }
  }

  await Promise.allSettled(promises);
  connections.clear();
}

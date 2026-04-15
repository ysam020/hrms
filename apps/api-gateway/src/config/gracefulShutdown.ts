import http from "http";
import http2 from "http2";
import { logger } from "@hrms/logger";

type RedisAdapter = { cleanup: () => Promise<void> };

export function registerGracefulShutdown(
  server: http.Server | http2.Http2SecureServer,
  redisAdapter: RedisAdapter,
) {
  const shutdown = async () => {
    logger.info("API Gateway shutting down...");
    await redisAdapter.cleanup();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

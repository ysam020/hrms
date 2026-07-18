import http from "http";
import http2 from "http2";
import { logger } from "@hrms/logger";

type RedisAdapter = { cleanup: () => Promise<void> };

// http.Server#close()'s callback only fires once every open connection ends
// — with long-lived WebSocket connections, a rolling-deploy SIGTERM can hang
// until the orchestrator's own SIGKILL grace period expires, turning
// "graceful" shutdown into a hard kill anyway (and skipping the Redis
// cleanup path above, which already ran, but not this log line telling us
// that happened). This timer forces the same outcome deliberately, with a
// log line, instead of relying on the orchestrator to notice.
const HARD_EXIT_TIMEOUT_MS = 15_000;

export function registerGracefulShutdown(
  server: http.Server | http2.Http2SecureServer,
  redisAdapter: RedisAdapter,
) {
  const shutdown = async () => {
    logger.info("API Gateway shutting down...");
    await redisAdapter.cleanup();

    const forceExitTimer = setTimeout(() => {
      logger.error(
        `Graceful shutdown did not complete within ${HARD_EXIT_TIMEOUT_MS}ms (likely long-lived connections still open) — forcing exit`,
      );
      process.exit(1);
    }, HARD_EXIT_TIMEOUT_MS);

    server.close(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

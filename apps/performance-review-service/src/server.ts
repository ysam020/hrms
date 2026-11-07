import { PerformanceReviewServer } from "./index";
import { logger } from "@hrms/logger";
import { processShutdown } from "@hrms/common";
import { disconnectDatabases } from "@hrms/db";
import { closeQueues } from "@hrms/queue";

async function startServer() {
  try {
    const server = new PerformanceReviewServer();
    const host = "0.0.0.0";
    const port = process.env.PERFORMANCE_REVIEW_SERVICE_PORT || "50061";
    server.start(`${host}:${port}`);
    logger.info("PerformanceReviewServer started");

    // On SIGTERM: stop taking calls and let in-flight ones finish, then
    // close what they used (see processShutdown in @hrms/common).
    const shutdown = processShutdown("performance-review-service");
    shutdown.onShutdown("gRPC server", (ms) => server.stop(ms), "drain");
    shutdown.onShutdown("queues", () => closeQueues(), "cleanup");
    shutdown.onShutdown(
      "database clients",
      () => disconnectDatabases(),
      "cleanup",
    );
  } catch (error) {
    logger.error(`Failed to start PerformanceReviewServer: ${error}`);
    process.exit(1);
  }
}
startServer();

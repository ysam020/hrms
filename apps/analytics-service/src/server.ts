import { AnalyticsServer } from "./index";
import { logger } from "@hrms/logger";
import { processShutdown } from "@hrms/common";
import { disconnectDatabases } from "@hrms/db";

async function startServer() {
  try {
    const server = new AnalyticsServer();
    const host = "0.0.0.0";
    const port = process.env.ANALYTICS_SERVICE_PORT || "50059";
    server.start(`${host}:${port}`);
    logger.info("AnalyticsServer started");

    // On SIGTERM: stop taking calls and let in-flight ones finish, then
    // close what they used (see processShutdown in @hrms/common).
    const shutdown = processShutdown("analytics-service");
    shutdown.onShutdown("gRPC server", (ms) => server.stop(ms), "drain");
    shutdown.onShutdown(
      "database clients",
      () => disconnectDatabases(),
      "cleanup",
    );
  } catch (error) {
    logger.error(`Failed to start AnalyticsServer: ${error}`);
    process.exit(1);
  }
}
startServer();

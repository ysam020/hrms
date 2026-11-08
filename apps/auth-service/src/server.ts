import { AuthServer } from "./index";
import { logger } from "@hrms/logger";
import { processShutdown } from "@hrms/common";
import { disconnectDatabases } from "@hrms/db";

async function startServer() {
  try {
    const server = new AuthServer();
    const host = "0.0.0.0";
    const port = process.env.AUTH_SERVICE_PORT || "50051";
    server.start(`${host}:${port}`);
    logger.info("AuthServer started");

    // On SIGTERM: stop taking calls and let in-flight ones finish, then
    // close what they used (see processShutdown in @hrms/common).
    const shutdown = processShutdown("auth-service");
    shutdown.onShutdown("gRPC server", (ms) => server.stop(ms), "drain");
    shutdown.onShutdown(
      "database clients",
      () => disconnectDatabases(),
      "cleanup",
    );
  } catch (error) {
    logger.error(`Failed to start AuthServer: ${error}`);
    process.exit(1);
  }
}
startServer();

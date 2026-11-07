import { UserServer } from "./index";
import { logger } from "@hrms/logger";
import { processShutdown } from "@hrms/common";
import { disconnectDatabases } from "@hrms/db";

async function startServer() {
  try {
    const server = new UserServer();
    const host = "0.0.0.0";
    const port = process.env.USER_SERVICE_PORT || "50052";
    server.start(`${host}:${port}`);
    logger.info("UserServer started");

    // On SIGTERM: stop taking calls and let in-flight ones finish, then
    // close what they used (see processShutdown in @hrms/common).
    const shutdown = processShutdown("user-service");
    shutdown.onShutdown("gRPC server", (ms) => server.stop(ms), "drain");
    shutdown.onShutdown(
      "database clients",
      () => disconnectDatabases(),
      "cleanup",
    );
  } catch (error) {
    logger.error(`Failed to start UserServer: ${error}`);
    process.exit(1);
  }
}
startServer();

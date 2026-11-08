import { LeaveServer } from "./index";
import { logger } from "@hrms/logger";
import { processShutdown } from "@hrms/common";
import { disconnectDatabases } from "@hrms/db";
import { closeQueues } from "@hrms/queue";

async function startServer() {
  try {
    const server = new LeaveServer();
    const host = "0.0.0.0";
    const port = process.env.LEAVE_SERVICE_PORT || "50055";
    server.start(`${host}:${port}`);
    logger.info("LeaveServer started");

    // On SIGTERM: stop taking calls and let in-flight ones finish, then
    // close what they used (see processShutdown in @hrms/common).
    const shutdown = processShutdown("leave-service");
    shutdown.onShutdown("gRPC server", (ms) => server.stop(ms), "drain");
    shutdown.onShutdown("queues", () => closeQueues(), "cleanup");
    shutdown.onShutdown(
      "database clients",
      () => disconnectDatabases(),
      "cleanup",
    );
  } catch (error) {
    logger.error(`Failed to start LeaveServer: ${error}`);
    process.exit(1);
  }
}
startServer();

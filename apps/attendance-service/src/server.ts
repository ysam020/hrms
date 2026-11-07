import { AttendanceServer } from "./index";
import { logger } from "@hrms/logger";
import { processShutdown } from "@hrms/common";
import { disconnectDatabases } from "@hrms/db";
import { closeQueues } from "@hrms/queue";

async function startServer() {
  try {
    const server = new AttendanceServer();
    const host = "0.0.0.0";
    const port = process.env.ATTENDANCE_SERVICE_PORT || "50054";
    server.start(`${host}:${port}`);
    logger.info("AttendanceServer started");

    // On SIGTERM: stop taking calls and let in-flight ones finish, then
    // close what they used (see processShutdown in @hrms/common).
    const shutdown = processShutdown("attendance-service");
    shutdown.onShutdown("gRPC server", (ms) => server.stop(ms), "drain");
    shutdown.onShutdown("queues", () => closeQueues(), "cleanup");
    shutdown.onShutdown(
      "database clients",
      () => disconnectDatabases(),
      "cleanup",
    );
  } catch (error) {
    logger.error(`Failed to start AttendanceServer: ${error}`);
    process.exit(1);
  }
}
startServer();

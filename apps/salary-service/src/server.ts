import { SalaryServer } from "./index";
import { logger } from "@hrms/logger";
import { processShutdown } from "@hrms/common";
import { disconnectDatabases } from "@hrms/db";

async function startServer() {
  try {
    const server = new SalaryServer();
    const host = "0.0.0.0";
    const port = process.env.SALARY_SERVICE_PORT || "50058";
    server.start(`${host}:${port}`);
    logger.info("SalaryServer started");

    // On SIGTERM: stop taking calls and let in-flight ones finish, then
    // close what they used (see processShutdown in @hrms/common).
    const shutdown = processShutdown("salary-service");
    shutdown.onShutdown("gRPC server", (ms) => server.stop(ms), "drain");
    shutdown.onShutdown(
      "database clients",
      () => disconnectDatabases(),
      "cleanup",
    );
  } catch (error) {
    logger.error(`Failed to start SalaryServer: ${error}`);
    process.exit(1);
  }
}
startServer();

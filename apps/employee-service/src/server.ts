import { EmployeeServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new EmployeeServer();
    const host = process.env.EMPLOYEE_SERVICE_HOST || "localhost";
    const port = process.env.EMPLOYEE_SERVICE_PORT || "50053";
    server.start(`${host}:${port}`);
    logger.info(`EmployeeServer started at ${host}:${port}`);
  } catch (error) {
    logger.error(`Failed to start EmployeeServer: ${error}`);
    process.exit(1);
  }
}
startServer();

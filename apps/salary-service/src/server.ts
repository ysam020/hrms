import { SalaryServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new SalaryServer();
    const host = process.env.SALARY_SERVICE_HOST || "localhost";
    const port = process.env.SALARY_SERVICE_PORT || "50058";
    server.start(`${host}:${port}`);
    logger.info("SalaryServer started");
  } catch (error) {
    logger.error(`Failed to start SalaryServer: ${error}`);
    process.exit(1);
  }
}
startServer();

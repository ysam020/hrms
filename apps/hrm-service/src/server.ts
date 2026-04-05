import { HrmServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new HrmServer();
    const host = process.env.HRM_SERVICE_HOST || "localhost";
    const port = process.env.HRM_SERVICE_PORT || "50057";
    server.start(`${host}:${port}`);
    logger.info("HrmServer started");
  } catch (error) {
    logger.error(`Failed to start HrmServer: ${error}`);
    process.exit(1);
  }
}
startServer();

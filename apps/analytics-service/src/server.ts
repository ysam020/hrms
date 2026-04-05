import { AnalyticsServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new AnalyticsServer();
    const host = process.env.ANALYTICS_SERVICE_HOST || "localhost";
    const port = process.env.ANALYTICS_SERVICE_PORT || "50059";
    server.start(`${host}:${port}`);
    logger.info(`AnalyticsServer started at ${host}:${port}`);
  } catch (error) {
    logger.error(`Failed to start AnalyticsServer: ${error}`);
    process.exit(1);
  }
}
startServer();

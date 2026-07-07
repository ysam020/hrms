import { NotificationServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new NotificationServer();
    const host = "0.0.0.0";
    const port = process.env.NOTIFICATION_SERVICE_PORT || "50060";
    server.start(`${host}:${port}`);
    logger.info("NotificationServer started");
  } catch (error) {
    logger.error(`Failed to start NotificationServer: ${error}`);
    process.exit(1);
  }
}
startServer();

import { LeaveServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new LeaveServer();
    const host = process.env.LEAVE_SERVICE_HOST || "localhost";
    const port = process.env.LEAVE_SERVICE_PORT || "50055";
    server.start(`${host}:${port}`);
    logger.info("LeaveServer started");
  } catch (error) {
    logger.error(`Failed to start LeaveServer: ${error}`);
    process.exit(1);
  }
}
startServer();

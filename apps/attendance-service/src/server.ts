import { AttendanceServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new AttendanceServer();
    const host = process.env.ATTENDANCE_SERVICE_HOST || "localhost";
    const port = process.env.ATTENDANCE_SERVICE_PORT || "50054";
    server.start(`${host}:${port}`);
    logger.info("AttendanceServer started");
  } catch (error) {
    logger.error(`Failed to start AttendanceServer: ${error}`);
    process.exit(1);
  }
}
startServer();

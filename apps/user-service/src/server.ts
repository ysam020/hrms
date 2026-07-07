import { UserServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new UserServer();
    const host = "0.0.0.0";
    const port = process.env.USER_SERVICE_PORT || "50052";
    server.start(`${host}:${port}`);
    logger.info("UserServer started");
  } catch (error) {
    logger.error(`Failed to start UserServer: ${error}`);
    process.exit(1);
  }
}
startServer();

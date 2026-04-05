import { AuthServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new AuthServer();
    const host = process.env.AUTH_SERVICE_HOST || "localhost";
    const port = process.env.AUTH_SERVICE_PORT || "50051";
    server.start(`${host}:${port}`);
    logger.info("AuthServer started");
  } catch (error) {
    logger.error(`Failed to start AuthServer: ${error}`);
    process.exit(1);
  }
}
startServer();

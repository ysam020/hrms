import { PerformanceReviewServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new PerformanceReviewServer();
    const host = "0.0.0.0";
    const port = process.env.PERFORMANCE_REVIEW_SERVICE_PORT || "50061";
    server.start(`${host}:${port}`);
    logger.info("PerformanceReviewServer started");
  } catch (error) {
    logger.error(`Failed to start PerformanceReviewServer: ${error}`);
    process.exit(1);
  }
}
startServer();

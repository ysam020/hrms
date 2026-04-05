import { RecruitmentServer } from "./index";
import { logger } from "@hrms/logger";

async function startServer() {
  try {
    const server = new RecruitmentServer();
    const host = process.env.RECRUITMENT_SERVICE_HOST || "localhost";
    const port = process.env.RECRUITMENT_SERVICE_PORT || "50056";
    server.start(`${host}:${port}`);
    logger.info("RecruitmentServer started");
  } catch (error) {
    logger.error(`Failed to start RecruitmentServer: ${error}`);
    process.exit(1);
  }
}
startServer();

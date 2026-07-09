import { RecruitmentServer } from "./index";
import { logger } from "@hrms/logger";
import { startResumeParserWorker } from "./workers/resumeParser";

async function startServer() {
  try {
    const server = new RecruitmentServer();
    const host = "0.0.0.0";
    const port = process.env.RECRUITMENT_SERVICE_PORT || "50056";
    server.start(`${host}:${port}`);
    logger.info("RecruitmentServer started");

    startResumeParserWorker();
    logger.info("Resume parser worker started");
  } catch (error) {
    logger.error(`Failed to start RecruitmentServer: ${error}`);
    process.exit(1);
  }
}
startServer();

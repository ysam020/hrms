import { RecruitmentServer } from "./index";
import { logger } from "@hrms/logger";
import { processShutdown } from "@hrms/common";
import { disconnectDatabases } from "@hrms/db";
import { closeQueues, closeWorker } from "@hrms/queue";
import { startResumeParserWorker } from "./workers/resumeParser";

async function startServer() {
  try {
    const server = new RecruitmentServer();
    const host = "0.0.0.0";
    const port = process.env.RECRUITMENT_SERVICE_PORT || "50056";
    server.start(`${host}:${port}`);
    logger.info("RecruitmentServer started");

    // On SIGTERM: stop taking calls and let in-flight ones finish, then
    // close what they used (see processShutdown in @hrms/common).
    const shutdown = processShutdown("recruitment-service");
    shutdown.onShutdown("gRPC server", (ms) => server.stop(ms), "drain");
    shutdown.onShutdown("queues", () => closeQueues(), "cleanup");
    shutdown.onShutdown(
      "database clients",
      () => disconnectDatabases(),
      "cleanup",
    );

    const resumeWorker = startResumeParserWorker();
    shutdown.onShutdown(
      "resume parser worker",
      (ms) => closeWorker(resumeWorker, ms),
      "drain",
    );
    logger.info("Resume parser worker started");
  } catch (error) {
    logger.error(`Failed to start RecruitmentServer: ${error}`);
    process.exit(1);
  }
}
startServer();

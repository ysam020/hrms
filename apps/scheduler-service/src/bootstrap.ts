import { loadSecrets } from "@hrms/common";
import { logger } from "@hrms/logger";
import { registerScheduledJobs } from "./scheduler";
import { startSchedulerWorker } from "./worker";

async function bootstrap() {
  await loadSecrets("hrms/config");

  await registerScheduledJobs();
  startSchedulerWorker();

  logger.info("Scheduler service started");
}

bootstrap().catch((err) => {
  console.error("Failed to start scheduler service");
  console.error(err instanceof Error ? err.name : "unknown error");
  process.exit(1);
});

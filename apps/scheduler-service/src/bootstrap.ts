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
  logger.error(
    "Failed to start: could not load secrets from AWS Secrets Manager",
  );
  logger.error(err instanceof Error ? err.name : "unknown error");
  process.exit(1);
});

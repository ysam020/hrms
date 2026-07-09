// ⚠️ Telemetry MUST be the very first import — before any other module.
import "./telemetry";

import { loadSecrets } from "@hrms/common";
import { logger } from "@hrms/logger";
import { registerScheduledJobs } from "./scheduler";
import { startSchedulerWorker, startWebhookWorker } from "./worker";

async function bootstrap() {
  await loadSecrets("hrms/config");

  await registerScheduledJobs();

  // Cron/business logic jobs (serial).
  startSchedulerWorker();

  // Webhook HTTP delivery (high-concurrency, separate queue).
  startWebhookWorker();

  logger.info("Scheduler service started (schedulerWorker + webhookWorker)");
}

bootstrap().catch((err) => {
  logger.error(
    "Failed to start: could not load secrets from AWS Secrets Manager",
  );
  logger.error(err instanceof Error ? err.name : "unknown error");
  process.exit(1);
});

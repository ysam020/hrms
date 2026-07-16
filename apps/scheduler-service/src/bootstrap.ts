// ⚠️ Telemetry MUST be the very first import — before any other module.
import "./telemetry";

import { loadSecrets, validateEnv } from "@hrms/common";
import { logger } from "@hrms/logger";
import { envSchema } from "./envSchema";

async function bootstrap() {
  await loadSecrets("hrms/config");
  validateEnv(envSchema, "scheduler-service");

  // Dynamic imports so @hrms/cache's eagerly-constructed Redis singleton
  // (packages/cache/src/CacheManager.ts's top-level `getCacheManager()`)
  // only initializes after REDIS_URL is populated in process.env — mirrors
  // every other service's bootstrap.ts (`await loadSecrets(...)` then
  // `await import("./server")`). Static imports here would pull in
  // @hrms/cache (via ./worker -> jobs/reconcileAttendance) before
  // loadSecrets runs, permanently locking the client onto the
  // redis://localhost:6379 fallback.
  const { registerScheduledJobs } = await import("./scheduler");
  const { startSchedulerWorker, startWebhookWorker } = await import("./worker");

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

// ⚠️ Telemetry MUST be the very first import — before any other module.
import "./telemetry";

import { loadSecrets, processShutdown, validateEnv } from "@hrms/common";
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
  const { registerScheduledJobs, unregisterScheduledJobs, isSchedulerEnabled } =
    await import("./scheduler");
  const { startSchedulerWorker } = await import("./worker");

  if (!isSchedulerEnabled()) {
    const removed = await unregisterScheduledJobs();
    logger.warn(
      `Scheduler disabled (SCHEDULER_ENABLED is not "true"): no cron jobs registered or run; removed ${removed} stale repeatable job(s)`,
    );
    return;
  }

  await registerScheduledJobs();

  // Cron/business logic jobs (serial).
  const worker = startSchedulerWorker();

  // On SIGTERM: stop taking jobs and let a running one finish rather than
  // be killed mid-run (which leaves its lease "running" and the job half
  // done until the next period), then close connections and flush
  // telemetry. The telemetry SDK's own SIGTERM handler only flushes, so
  // without this the process waited for SIGKILL.
  const { closeWorker, closeQueues } = await import("@hrms/queue");
  const { disconnectDatabases } = await import("@hrms/db");
  const { flushTelemetry } = await import("./telemetry");
  const shutdown = processShutdown("scheduler-service");
  shutdown.onShutdown(
    "scheduler worker",
    (ms) => closeWorker(worker, ms),
    "drain",
  );
  shutdown.onShutdown("queues", () => closeQueues(), "cleanup");
  shutdown.onShutdown(
    "database clients",
    () => disconnectDatabases(),
    "cleanup",
  );
  shutdown.onShutdown("telemetry", () => flushTelemetry(), "flush");

  logger.info("Scheduler service started (schedulerWorker)");
}

bootstrap().catch((err) => {
  logger.error(
    "Failed to start: could not load secrets from AWS Secrets Manager",
  );
  logger.error(err instanceof Error ? err.name : "unknown error");
  process.exit(1);
});

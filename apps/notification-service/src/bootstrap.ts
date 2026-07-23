import cluster from "node:cluster";
import { cpus } from "node:os";

// One worker process per CPU core — see apps/api-gateway/src/bootstrap.ts
// for the full rationale. Set WEB_CONCURRENCY=1 to disable.
const WORKERS = Number(process.env.WEB_CONCURRENCY) || cpus().length;

async function startWorker() {
  const { loadSecrets, validateEnv } = await import("@hrms/common");
  const { logger } = await import("@hrms/logger");
  const { envSchema } = await import("./envSchema");

  try {
    await loadSecrets("hrms/config");
    validateEnv(envSchema, "notification-service");

    // Dynamic imports so Prisma initializes after DEV_MONGODB_URI is set
    const { startEmailWorker } = await import("./workers/emailWorker");
    const { startNotificationWorker } =
      await import("./workers/notificationWorker");
    const { getNotificationQueue } = await import("@hrms/queue");

    // One-time migration + failed-job retry only need to run once across
    // the whole cluster, not once per worker — restrict to worker 1 (or the
    // sole process outside cluster mode). The BullMQ workers themselves are
    // fine (and intended) to run in every worker: BullMQ coordinates
    // concurrent consumers on the same queue via Redis locks, so this is the
    // normal way to scale queue throughput, unlike a naive interval/cron.
    if (!cluster.isWorker || cluster.worker?.id === 1) {
      const { migrateNotificationRecipients } =
        await import("./migrations/migrateNotificationRecipients");
      await migrateNotificationRecipients();

      // Retry any jobs that failed while the worker was broken (e.g. DEV_MONGODB_URI not set)
      try {
        const queue = getNotificationQueue();
        const failedCount = await queue.getFailedCount();
        if (failedCount > 0) {
          await queue.retryJobs({ state: "failed" });
          logger.info(
            `Re-queued ${failedCount} previously failed notification jobs`,
          );
        }
      } catch (err) {
        logger.warn("Could not retry failed notification jobs:", { err });
      }
    }

    startEmailWorker();
    startNotificationWorker();
    logger.info("BullMQ workers started (email, notification)");

    await import("./server");
  } catch (err) {
    logger.error(
      "Failed to start: could not load secrets from AWS Secrets Manager",
    );
    logger.error(err instanceof Error ? err.name : "unknown error");
    process.exit(1);
  }
}

if (cluster.isPrimary && WORKERS > 1) {
  // eslint-disable-next-line no-console
  console.log(
    `notification-service primary ${process.pid}: forking ${WORKERS} workers`,
  );
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on("exit", (worker, code, signal) => {
    // eslint-disable-next-line no-console
    console.error(
      `notification-service worker ${worker.process.pid} exited (${signal || code}) — respawning`,
    );
    cluster.fork();
  });
} else {
  startWorker();
}

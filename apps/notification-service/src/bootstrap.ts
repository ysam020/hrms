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
    const { reportFailedNotificationJobs } =
      await import("./workers/failedNotificationJobs");

    // One-time migration + the failed-job report only need to run once
    // across the whole cluster, not once per worker — restrict to worker 1
    // (or the sole process outside cluster mode). The BullMQ workers
    // themselves are fine (and intended) to run in every worker: BullMQ
    // coordinates concurrent consumers on the same queue via Redis locks, so
    // this is the normal way to scale queue throughput, unlike a naive
    // interval/cron.
    if (!cluster.isWorker || cluster.worker?.id === 1) {
      const { migrateNotificationRecipients } =
        await import("./migrations/migrateNotificationRecipients");
      await migrateNotificationRecipients();

      // Failed jobs are reported, never replayed, on startup: replaying
      // every retained failure re-delivered stale notifications and added
      // a fresh dead-letter entry per restart. Replay is an operator action
      // on chosen jobs — see scripts/replayFailedNotifications.ts.
      await reportFailedNotificationJobs();
    }

    const workers = [startEmailWorker(), ...startNotificationWorker()];
    logger.info("BullMQ workers started (email, notification)");

    // On SIGTERM: stop taking jobs and let in-flight deliveries finish
    // (instead of being killed and re-run after the stalled interval), then
    // close the connections they used. server.ts adds the gRPC server and
    // database clients to the same coordinator.
    const { processShutdown } = await import("@hrms/common");
    const { closeWorker, closeQueues } = await import("@hrms/queue");
    const { closeWebSocketRedisConnections } = await import("@hrms/websocket");
    const shutdown = processShutdown("notification-service");
    shutdown.onShutdown(
      "BullMQ workers",
      (ms) => Promise.all(workers.map((w) => closeWorker(w, ms))),
      "drain",
    );
    shutdown.onShutdown("queues", () => closeQueues(), "cleanup");
    shutdown.onShutdown(
      "websocket redis",
      () => closeWebSocketRedisConnections(),
      "cleanup",
    );

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
  // The primary serves /metrics for all workers (see @hrms/logger).
  void import("@hrms/logger");
  // Forks and respawns the workers; on SIGTERM passes the signal on and
  // waits for them to drain instead of respawning them.
  void import("@hrms/common").then(({ runClusterPrimary }) =>
    runClusterPrimary("notification-service", WORKERS, cluster),
  );
} else {
  startWorker();
}

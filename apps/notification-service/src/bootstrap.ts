import { loadSecrets } from "@hrms/common";
import { logger } from "@hrms/logger";

async function bootstrap() {
  await loadSecrets("hrms/config");

  // Dynamic imports so Prisma initializes after DEV_MONGODB_URI is set
  const { startEmailWorker } = await import("./workers/emailWorker");
  const { startNotificationWorker } =
    await import("./workers/notificationWorker");
  const { getNotificationQueue } = await import("@hrms/queue");
  const { migrateNotificationRecipients } =
    await import("./migrations/migrateNotificationRecipients");

  await migrateNotificationRecipients();

  startEmailWorker();
  startNotificationWorker();
  logger.info("BullMQ workers started (email, notification)");

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

  await import("./server");
}

bootstrap().catch((err) => {
  logger.error(
    "Failed to start: could not load secrets from AWS Secrets Manager",
  );
  logger.error(err instanceof Error ? err.name : "unknown error");
  process.exit(1);
});

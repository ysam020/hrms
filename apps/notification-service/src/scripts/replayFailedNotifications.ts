/**
 * Operator tool: replay specific failed notification jobs of one tenant.
 *
 *   node dist/scripts/replayFailedNotifications.js \
 *     --tenant <tenantId> --job <jobId> [--job <jobId> ...] \
 *     [--queue notificationQueueV2|notificationQueue] [--max-age-days 7] \
 *     [--execute]
 *
 * Without --execute it only reports what it would do. See
 * workers/failedNotificationJobs.ts for the rules a job must pass.
 */
import { parseArgs } from "node:util";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      tenant: { type: "string" },
      job: { type: "string", multiple: true },
      queue: { type: "string" },
      "max-age-days": { type: "string" },
      execute: { type: "boolean", default: false },
    },
  });

  const { loadSecrets } = await import("@hrms/common");
  await loadSecrets("hrms/config");

  const {
    NOTIFICATION_QUEUE_NAME,
    getNotificationQueue,
    getLegacyNotificationQueue,
  } = await import("@hrms/queue");
  const { replayFailedNotificationJobs } =
    await import("../workers/failedNotificationJobs");

  const maxAgeDays = values["max-age-days"]
    ? Number(values["max-age-days"])
    : undefined;
  if (maxAgeDays !== undefined && !(maxAgeDays > 0)) {
    throw new Error("--max-age-days must be a positive number");
  }

  try {
    const decisions = await replayFailedNotificationJobs({
      queueName: values.queue ?? NOTIFICATION_QUEUE_NAME,
      tenantId: values.tenant ?? "",
      jobIds: values.job ?? [],
      execute: values.execute,
      maxAgeDays,
    });
    // eslint-disable-next-line no-console
    console.table(decisions);
    if (!values.execute) {
      // eslint-disable-next-line no-console
      console.log("Dry run — re-run with --execute to replay the jobs above.");
    }
  } finally {
    await Promise.all([
      getNotificationQueue().close(),
      getLegacyNotificationQueue().close(),
    ]);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

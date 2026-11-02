import { Worker, Job } from "bullmq";
import { prisma, runWithTenant, getClientForDb } from "@hrms/db";
import { getBullMQConnection } from "@hrms/queue";
import type { PresenceExpiryJobData } from "@hrms/queue";
import { logger, requestIdStorage } from "@hrms/logger";
import { expireIfCurrent } from "../services/presence";

// Ends timed availability statuses ("Busy for 1 hour") even when the person
// has closed every tab. Same tenant-resolution pattern as
// payrollDisbursementWorker.ts: the job runs outside any request, so the
// tenant database is resolved and entered explicitly. Reads never depend on
// this job — an ended status already reads as ended — it only makes the
// change durable and tells watchers.
export function startPresenceExpiryWorker(): Worker {
  const worker = new Worker<PresenceExpiryJobData>(
    "presenceQueue",
    (job) =>
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () => processJob(job))
        : processJob(job),
    {
      connection: getBullMQConnection(),
      concurrency: 10,
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 100 },
    },
  );
  worker.on("failed", (job, err) =>
    logger.warn(`Presence expiry job ${job?.id} failed:`, { err }),
  );
  worker.on("error", (err) =>
    logger.error("Presence expiry worker error:", { err }),
  );
  return worker;
}

async function processJob(job: Job<PresenceExpiryJobData>) {
  const { tenantId, userId, revision } = job.data;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbName: true },
  });
  if (!tenant?.dbName) return; // organisation deleted — nothing to end
  await runWithTenant(tenantId, getClientForDb(tenant.dbName), () =>
    expireIfCurrent(tenantId, userId, revision),
  );
}

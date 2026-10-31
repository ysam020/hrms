import { Worker, Job } from "bullmq";
import { prisma, runWithTenant, getClientForDb } from "@hrms/db";
import { getBullMQConnection, getDeadLetterQueue } from "@hrms/queue";
import type { PayrollDisbursementJobData } from "@hrms/queue";
import { logger, requestIdStorage } from "@hrms/logger";
import { runPayrollDisbursement } from "../services/payrollDisbursement";

// Mirrors notificationWorker.ts's tenant-resolution pattern: this worker
// runs in the same api-gateway process as the HTTP server but outside any
// request's AsyncLocalStorage context, so tenant scoping (prismaWithTenant)
// and the correlation ID (see @hrms/logger) both have to be established
// explicitly per job instead of being ambient.
export function startPayrollDisbursementWorker(): Worker {
  const worker = new Worker<PayrollDisbursementJobData>(
    "payrollDisbursementQueue",
    (job) =>
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () => processJob(job))
        : processJob(job),
    {
      connection: getBullMQConnection(),
      concurrency: 1, // one payroll run's disbursement at a time per process
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    },
  );

  worker.on("failed", async (job, err) => {
    logger.error(`Payroll disbursement job ${job?.id} failed:`, { err });
    if (!job) return;
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      // Exhausted retries — surface it on the run itself so it's visible in
      // the UI (polling getPayrollRun) instead of only in worker logs, and
      // forward to the DLQ like every other queue in this app.
      await prisma.payrollRun
        .update({
          where: { id: job.data.runId, status: "disbursing" },
          data: { status: "disbursement_failed" },
        })
        .catch(() => {
          // Ignore — status may have already moved on (e.g. a concurrent
          // retry-payouts call already succeeded).
        });
      getDeadLetterQueue()
        .add("failed-payroll-disbursement", {
          originalQueue: "payrollDisbursementQueue",
          originalJobId: job.id,
          originalJobData: job.data,
          failureReason: err.message,
          failedAt: new Date().toISOString(),
        })
        .catch((dlqErr) =>
          logger.error("Failed to forward job to DLQ:", { dlqErr }),
        );
    }
  });

  worker.on("stalled", (jobId) => {
    logger.warn(`Payroll disbursement job ${jobId} stalled`);
  });

  worker.on("error", (err) => {
    logger.error("Payroll disbursement worker error:", { err });
  });

  return worker;
}

async function processJob(job: Job<PayrollDisbursementJobData>) {
  const { tenantId, runId, disbursedBy } = job.data;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbName: true },
  });
  if (!tenant?.dbName) {
    throw new Error(
      `Payroll disbursement job ${job.id}: tenant ${tenantId} has no resolvable database.`,
    );
  }
  const tenantClient = getClientForDb(tenant.dbName);

  return runWithTenant(tenantId, tenantClient, async () => {
    const summary = await runPayrollDisbursement(runId);

    // Move to the terminal "disbursed" state from either "disbursing" (the
    // first attempt) or "disbursement_failed" (a retry-payouts call after
    // exhausted BullMQ attempts). If the run is already "disbursed" (a
    // retry-payouts call made while only some individual line items had
    // failed, not the whole job), there's nothing to transition — this
    // pass just picked up the remaining failed items.
    await prisma.payrollRun
      .update({
        where: {
          id: runId,
          status: { in: ["disbursing", "disbursement_failed"] },
        },
        data: { disbursedBy, disbursedAt: new Date(), status: "disbursed" },
      })
      .catch((err: any) => {
        if (err?.code !== "P2025") throw err;
      });

    logger.info(`Payroll disbursement job ${job.id} completed`, summary);
    return summary;
  });
}

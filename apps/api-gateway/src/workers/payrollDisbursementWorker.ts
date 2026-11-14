import { Worker, Job } from "bullmq";
import {
  prisma as masterPrisma,
  prismaWithTenant,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";
import { getBullMQConnection, getDeadLetterQueue } from "@hrms/queue";
import type { PayrollDisbursementJobData } from "@hrms/queue";
import { logger, requestIdStorage } from "@hrms/logger";
import { runPayrollDisbursement } from "../services/payrollDisbursement";
import { gatewayTenantStorage } from "../middleware/tenantContext";

// Mirrors notificationWorker.ts's tenant-resolution pattern: this worker
// runs in the same api-gateway process as the HTTP server but outside any
// request's AsyncLocalStorage context, so tenant scoping (prismaWithTenant)
// and the correlation ID (see @hrms/logger) both have to be established
// explicitly per job instead of being ambient.
//
// PayrollRun lives in each tenant's own database. Every read or write of it
// here goes through prismaWithTenant inside withTenantDatabase(), never the
// master client: the master database has no payroll runs, so a status update
// sent there matches nothing.

/** Why a run's status could not be recorded. Never swallowed. */
export class PayrollRunStatusError extends Error {
  constructor(
    message: string,
    readonly code: "TENANT_UNRESOLVED" | "RUN_NOT_FOUND" | "UNEXPECTED_STATUS",
  ) {
    super(message);
    this.name = "PayrollRunStatusError";
  }
}

/**
 * Runs `fn` bound to the tenant's own database. Both contexts, as for an
 * HTTP request (see runAsTenant in mcp/principal.ts): runWithTenant binds
 * this process's own database queries; gatewayTenantStorage is what grpcCall
 * forwards to the services (x-tenant-id / x-tenant-db-name), so payslip
 * lookups through salary-service reach the same tenant database.
 */
async function withTenantDatabase<T>(
  tenantId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new PayrollRunStatusError(
      "Payroll disbursement job has no tenant id.",
      "TENANT_UNRESOLVED",
    );
  }
  const tenant = await masterPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbName: true },
  });
  if (!tenant?.dbName) {
    throw new PayrollRunStatusError(
      `Tenant ${tenantId} has no resolvable database.`,
      "TENANT_UNRESOLVED",
    );
  }
  const dbName = tenant.dbName;
  return gatewayTenantStorage.run({ tenantId, dbName }, () =>
    runWithTenant(tenantId, getClientForDb(dbName), fn),
  );
}

/**
 * Compare-and-swap a run's status in the bound tenant database.
 *
 * Returns "updated" when the run moved, or "already" when it already holds
 * `to` (a redelivered job after the first delivery recorded it). A run that
 * doesn't exist, or that sits in any other status, throws: the caller must
 * see it rather than assume the write happened.
 */
async function transitionRun(
  tenantId: string,
  runId: string,
  from: string[],
  to: string,
  data: Record<string, unknown>,
): Promise<"updated" | "already"> {
  // A single-record update (not updateMany) so the audit log keeps the
  // before/after values of the status change.
  try {
    await prismaWithTenant.payrollRun.update({
      where: { id: runId, tenantId, status: { in: from } },
      data: { ...data, status: to },
    });
    return "updated";
  } catch (err) {
    // P2025 = no row matched the compare-and-swap; find out why below.
    // Anything else (connection, validation) propagates unchanged.
    if ((err as { code?: string })?.code !== "P2025") throw err;
  }

  const run = await prismaWithTenant.payrollRun.findFirst({
    where: { id: runId, tenantId },
    select: { status: true },
  });
  if (!run) {
    throw new PayrollRunStatusError(
      `Payroll run ${runId} was not found in tenant ${tenantId}'s database.`,
      "RUN_NOT_FOUND",
    );
  }
  if ((run as { status: string }).status === to) return "already";
  throw new PayrollRunStatusError(
    `Payroll run ${runId} is '${(run as { status: string }).status}', expected one of ${from.join("/")} before moving to '${to}'.`,
    "UNEXPECTED_STATUS",
  );
}

/**
 * One delivery of a disbursement job. Safe to run again for the same run:
 * runPayrollDisbursement skips items already in a terminal payout state and
 * items already post-processed, and the status transition accepts a run
 * that an earlier delivery already marked disbursed.
 */
export async function processPayrollDisbursementJob(
  job: Job<PayrollDisbursementJobData>,
) {
  const { tenantId, runId, disbursedBy } = job.data;

  return withTenantDatabase(tenantId, async () => {
    const summary = await runPayrollDisbursement(runId);

    // "disbursing" is the normal case (both the disburse action and
    // retry-payouts set it before enqueueing); "disbursement_failed" covers
    // a delivery that follows an exhausted earlier attempt.
    const outcome = await transitionRun(
      tenantId,
      runId,
      ["disbursing", "disbursement_failed"],
      "disbursed",
      { disbursedBy, disbursedAt: new Date() },
    );
    if (outcome === "already") {
      logger.info(
        `Payroll disbursement job ${job.id}: run ${runId} was already recorded as disbursed`,
      );
    }

    logger.info(`Payroll disbursement job ${job.id} completed`, summary);
    return summary;
  });
}

/**
 * BullMQ "failed" listener. Once retries are exhausted, the failure is
 * recorded on the run itself (visible when polling the run, and what lets
 * retry-payouts pick it up) and the job goes to the dead-letter queue. If
 * the run's status can't be recorded, that is logged as an error and
 * carried on the DLQ entry: replaying the DLQ job re-runs the (resumable)
 * disbursement and records the status.
 */
export async function handlePayrollDisbursementFailure(
  job: Job<PayrollDisbursementJobData> | undefined,
  err: Error,
): Promise<void> {
  logger.error(`Payroll disbursement job ${job?.id} failed:`, { err });
  if (!job) return;
  if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

  const { tenantId, runId } = job.data;
  let runStatusRecorded = false;
  let runStatusError: string | undefined;
  try {
    await withTenantDatabase(tenantId, async () => {
      // Never overwrite a run that a delivery already marked disbursed.
      const run = await prismaWithTenant.payrollRun.findFirst({
        where: { id: runId, tenantId },
        select: { status: true },
      });
      if ((run as { status?: string } | null)?.status === "disbursed") {
        logger.warn(
          `Payroll disbursement job ${job.id} failed after run ${runId} was recorded as disbursed; status left as is`,
        );
        return;
      }
      await transitionRun(
        tenantId,
        runId,
        ["disbursing"],
        "disbursement_failed",
        {},
      );
    });
    runStatusRecorded = true;
  } catch (statusErr) {
    runStatusError =
      statusErr instanceof PayrollRunStatusError
        ? statusErr.code
        : ((statusErr as Error)?.name ?? "Error");
    logger.error(
      `Payroll disbursement job ${job.id}: could not record the failure on run ${runId}; replay the DLQ entry once the cause is fixed`,
      { tenantId, runId, code: runStatusError },
    );
  }

  await getDeadLetterQueue()
    .add("failed-payroll-disbursement", {
      originalQueue: "payrollDisbursementQueue",
      originalJobId: job.id,
      originalJobData: job.data,
      failureReason: err.message,
      failedAt: new Date().toISOString(),
      runStatusRecorded,
      ...(runStatusError ? { runStatusError } : {}),
    })
    .catch((dlqErr) =>
      logger.error("Failed to forward job to DLQ:", { dlqErr }),
    );
}

export function startPayrollDisbursementWorker(): Worker {
  const worker = new Worker<PayrollDisbursementJobData>(
    "payrollDisbursementQueue",
    (job) =>
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () =>
            processPayrollDisbursementJob(job),
          )
        : processPayrollDisbursementJob(job),
    {
      connection: getBullMQConnection(),
      concurrency: 1, // one payroll run's disbursement at a time per process
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    },
  );

  // The handler never rejects (it logs and reports through the DLQ).
  worker.on("failed", (job, err) => handlePayrollDisbursementFailure(job, err));

  worker.on("stalled", (jobId) => {
    logger.warn(`Payroll disbursement job ${jobId} stalled`);
  });

  worker.on("error", (err) => {
    logger.error("Payroll disbursement worker error:", { err });
  });

  return worker;
}

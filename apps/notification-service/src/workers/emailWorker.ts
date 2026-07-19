import { Worker } from "bullmq";
import { getBullMQConnection, getDeadLetterQueue } from "@hrms/queue";
import { sendEmail } from "@hrms/common";
import { logger, requestIdStorage } from "@hrms/logger";
import type { EmailJobData } from "@hrms/queue";
import type { Job } from "bullmq";

async function processJob(job: Job<EmailJobData>) {
  const { to, subject, html, from } = job.data;
  await sendEmail({ to, subject, html, from });
  logger.info(`Email sent to ${to}`, { jobId: job.id });
}

export function startEmailWorker(): Worker {
  const worker = new Worker<EmailJobData>(
    "emailQueue",
    (job) =>
      // Continue the correlation ID the producer attached (see
      // wrapAddWithRequestId in @hrms/queue) so this worker's own log lines
      // can be traced back to the HTTP/gRPC request that enqueued it.
      job.data.requestId
        ? requestIdStorage.run(job.data.requestId, () => processJob(job))
        : processJob(job),
    {
      connection: getBullMQConnection(),
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(`Email job ${job?.id} failed:`, { err });
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      getDeadLetterQueue()
        .add("failed-email", {
          originalQueue: "emailQueue",
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

  worker.on("error", (err) => {
    logger.error("Email worker error:", { err });
  });

  return worker;
}

import { Worker } from "bullmq";
import { getBullMQConnection } from "@hrms/queue";
import { sendEmail } from "@hrms/common";
import { logger } from "@hrms/logger";
import type { EmailJobData } from "@hrms/queue";

export function startEmailWorker(): Worker {
  const worker = new Worker<EmailJobData>(
    "emailQueue",
    async (job) => {
      const { to, subject, html, from } = job.data;
      await sendEmail({ to, subject, html, from });
      logger.info(`Email sent to ${to}`, { jobId: job.id });
    },
    {
      connection: getBullMQConnection(),
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(`Email job ${job?.id} failed:`, { err });
  });

  worker.on("error", (err) => {
    logger.error("Email worker error:", { err });
  });

  return worker;
}

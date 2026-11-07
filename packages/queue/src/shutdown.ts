import type { Worker } from "bullmq";

/**
 * Stops a worker taking new jobs and waits for its active ones, for at most
 * `timeoutMs`. Rejects if jobs are still running then: they keep their
 * locks until the process exits, after which BullMQ re-runs them as stalled
 * — the same path as a crash, so they are retried rather than lost.
 */
export async function closeWorker(
  worker: Worker,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), Math.max(timeoutMs, 0));
    timer.unref?.();
  });
  const result = await Promise.race([
    worker.close().then(() => "closed" as const),
    timedOut,
  ]).finally(() => clearTimeout(timer));
  if (result === "timeout") {
    throw new Error(
      `worker "${worker.name}": active jobs still running after ${timeoutMs} ms — they will be retried as stalled`,
    );
  }
}

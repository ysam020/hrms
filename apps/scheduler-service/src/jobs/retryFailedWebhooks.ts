/**
 * retryFailedWebhooks.ts
 *
 * Cron sweep (runs daily at 6 AM) to pick up any webhook deliveries that
 * got stuck in "pending" state (e.g. api-gateway crashed before enqueuing).
 *
 * This is a safety net — the primary retry path is BullMQ's built-in
 * exponential backoff. This job only catches deliveries that never made it
 * into the queue at all.
 */

import { prisma } from "@hrms/db";
import { getWebhookQueue } from "@hrms/queue";
import { logger } from "@hrms/logger";
import dayjs from "dayjs";

const STALE_THRESHOLD_MINUTES = 60; // deliveries older than 1h still pending = stale

export async function retryFailedWebhooks(): Promise<void> {
  const staleThreshold = dayjs()
    .subtract(STALE_THRESHOLD_MINUTES, "minute")
    .toDate();

  const staleDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: "pending",
      createdAt: { lte: staleThreshold },
      attempts: 0,
    },
    select: { id: true },
    take: 200, // process at most 200 per sweep to avoid queue flooding
  });

  if (staleDeliveries.length === 0) return;

  logger.info(
    `retryFailedWebhooks: found ${staleDeliveries.length} stale deliveries, re-enqueuing`,
  );

  const queue = getWebhookQueue();
  await Promise.allSettled(
    staleDeliveries.map((d: any) =>
      queue.add(
        "deliverWebhook",
        { deliveryId: d.id },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          jobId: `retry:${d.id}`, // idempotent
        },
      ),
    ),
  );

  logger.info(
    `retryFailedWebhooks: ${staleDeliveries.length} deliveries re-enqueued`,
  );
}

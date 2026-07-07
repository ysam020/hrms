/**
 * webhookEmitter.ts
 *
 * Central utility called by every handler that produces a business event.
 * Enqueues a BullMQ job; the webhook delivery worker handles the actual HTTP
 * dispatch with HMAC signing and exponential-backoff retries.
 *
 * Designed to be fire-and-forget: a failure to enqueue must never break the
 * primary request. All errors are logged and swallowed.
 */

import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";

let _webhookQueue: any = null;

function getWebhookQueue() {
  if (!_webhookQueue) {
    try {
      // Lazy-require to avoid circular deps at startup.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getWebhookQueue: gq } = require("@hrms/queue");
      _webhookQueue = gq();
    } catch {
      return null;
    }
  }
  return _webhookQueue;
}

export async function emitWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const tenantId = getTenantId();
  if (!tenantId) return;

  try {
    // Find all active endpoints subscribed to this event type.
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: eventType },
      },
      select: { id: true },
    });

    if (endpoints.length === 0) return;

    const queue = getWebhookQueue();
    if (!queue) {
      logger.warn("Webhook queue unavailable — skipping webhook dispatch", {
        eventType,
      });
      return;
    }

    // Create a WebhookDelivery record and enqueue a job for each endpoint.
    await Promise.all(
      endpoints.map(async (ep: any) => {
        const delivery = await prisma.webhookDelivery.create({
          data: {
            tenantId,
            endpointId: ep.id,
            eventType,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            payload: {
              event: eventType,
              timestamp: new Date().toISOString(),
              data: payload as any,
            },
            status: "pending",
          },
        });

        await queue.add(
          "deliverWebhook",
          { deliveryId: delivery.id },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 100,
          },
        );
      }),
    );
  } catch (err) {
    // Non-fatal: webhook failure must not break the primary response.
    logger.error("emitWebhookEvent error (non-fatal):", { eventType, err });
  }
}

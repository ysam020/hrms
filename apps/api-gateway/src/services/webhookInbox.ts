import { createHash } from "node:crypto";
import { prisma } from "@hrms/db";
import { encryptField } from "@hrms/crypto";
import { logger } from "@hrms/logger";

/**
 * Durable inbox for payment webhooks. An event is claimed before work starts
 * and marked processed only afterwards, so:
 *  - a failed delivery is processed again when the provider retries;
 *  - a processed event is recognised however often it is redelivered;
 *  - two simultaneous deliveries can't both do the work;
 *  - a process that dies mid-event loses only its lease.
 *
 * An event that keeps failing is parked as "dead", with its sealed payload,
 * for manual replay.
 */

const LEASE_MS = 2 * 60 * 1000;
export const MAX_WEBHOOK_ATTEMPTS = 8;
const PAYLOAD_FIELD = "webhook_inbox_payload";

export type WebhookClaim =
  | { outcome: "claimed"; id: string }
  | { outcome: "duplicate" }
  | { outcome: "in_progress" };

export const webhookBodyDigest = (rawBody: string) =>
  `body:${createHash("sha256").update(rawBody).digest("hex")}`;

const leaseFromNow = () => new Date(Date.now() + LEASE_MS);

export async function claimWebhookEvent(input: {
  provider: string;
  eventId: string;
  eventType?: string;
  rawBody: string;
}): Promise<WebhookClaim> {
  const { provider, eventId, eventType, rawBody } = input;
  try {
    const created = await prisma.webhookInboxEvent.create({
      data: {
        provider,
        eventId,
        eventType,
        status: "processing",
        leaseUntil: leaseFromNow(),
        payload: encryptField(rawBody, PAYLOAD_FIELD),
      },
      select: { id: true },
    });
    return { outcome: "claimed", id: created.id };
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
  }

  const existing = await prisma.webhookInboxEvent.findUnique({
    where: { provider_eventId: { provider, eventId } },
    select: { id: true, status: true, attempts: true, leaseUntil: true },
  });
  if (!existing) return { outcome: "in_progress" };
  if (existing.status === "processed" || existing.status === "dead") {
    return { outcome: "duplicate" };
  }
  if (existing.status === "processing" && existing.leaseUntil > new Date()) {
    return { outcome: "in_progress" };
  }

  // Compare-and-swap on attempts: only one retry can take over.
  const taken = await prisma.webhookInboxEvent.updateMany({
    where: { id: existing.id, attempts: existing.attempts },
    data: {
      status: "processing",
      attempts: { increment: 1 },
      leaseUntil: leaseFromNow(),
    },
  });
  return taken.count === 1
    ? { outcome: "claimed", id: existing.id }
    : { outcome: "in_progress" };
}

export async function completeWebhookEvent(id: string | null): Promise<void> {
  if (!id) return;
  await prisma.webhookInboxEvent.update({
    where: { id },
    data: { status: "processed", processedAt: new Date(), payload: null },
  });
}

/**
 * Never throws: the caller is already answering with a failure, and an
 * event left in "processing" is retried once its lease ends.
 */
export async function failWebhookEvent(
  id: string,
  error: unknown,
): Promise<void> {
  try {
    const row = await prisma.webhookInboxEvent.findUnique({
      where: { id },
      select: { attempts: true, provider: true, eventType: true },
    });
    const dead = (row?.attempts ?? 0) >= MAX_WEBHOOK_ATTEMPTS;
    await prisma.webhookInboxEvent.update({
      where: { id },
      data: {
        status: dead ? "dead" : "failed",
        lastErrorName: (error as Error)?.name ?? "Error",
      },
    });
    if (dead) {
      logger.error("webhook event moved to dead letter", {
        provider: row?.provider,
        eventType: row?.eventType,
        inboxId: id,
      });
    }
  } catch (err) {
    logger.error("webhook inbox: could not record failure", {
      name: (err as Error)?.name,
    });
  }
}

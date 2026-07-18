/**
 * deliverWebhook.ts – BullMQ worker job.
 *
 * Picks up a WebhookDelivery record, fetches the endpoint's encrypted secret,
 * signs the payload with HMAC-SHA256, sends the HTTP POST, and records the result.
 *
 * Retry policy: handled by BullMQ (3 attempts, exponential backoff set at enqueue time).
 * After the final attempt the job is moved to the dead-letter queue and
 * WebhookDelivery.status is set to "failed".
 *
 * HMAC header: X-HRMS-Signature-256: sha256=<hex>
 * The consumer verifies this against their stored plaintext secret.
 */

import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { isSafeUrl, isSafeHostname } from "@hrms/common";
import { createHmac } from "crypto";

// Re-use the same encrypt/decrypt from crypto package.
let decryptFn: (s: string) => string;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { aesDecrypt } = require("@hrms/crypto");
  decryptFn = aesDecrypt;
} catch {
  decryptFn = (s: string) => Buffer.from(s, "base64").toString("utf-8");
}

const DELIVERY_TIMEOUT_MS = 15_000; // 15 s per attempt

export async function deliverWebhook({
  deliveryId,
}: {
  deliveryId: string;
}): Promise<void> {
  // Fetch delivery + endpoint in a single query.
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      endpoint: {
        select: { url: true, secret: true, isActive: true },
      },
    },
  });

  if (!delivery) {
    logger.warn(`deliverWebhook: delivery ${deliveryId} not found — skipping`);
    return;
  }

  // Skip if the endpoint was deactivated after the job was enqueued.
  if (!(delivery as any).endpoint.isActive) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "failed", error: "Endpoint deactivated" },
    });
    return;
  }

  const { url, secret } = (delivery as any).endpoint;
  const payloadStr = JSON.stringify((delivery as any).payload);

  // Re-validate right before sending, not just at registration time — the
  // URL's DNS could have been re-pointed at a private/cloud-metadata IP
  // since it was registered (DNS rebinding). isSafeUrl() catches the
  // hostname-literal cases; isSafeHostname() resolves DNS and checks the
  // actual IP(s) about to be connected to.
  let urlSafe = false;
  try {
    const hostname = new URL(url).hostname;
    // requireHttps defaults to true and is intentionally NOT gated on
    // NODE_ENV — see isSafeWebhookUrl in api-gateway/handlers/webhooks.ts.
    urlSafe = isSafeUrl(url) && (await isSafeHostname(hostname));
  } catch {
    urlSafe = false;
  }
  if (!urlSafe) {
    logger.error(
      `deliverWebhook: URL for delivery ${deliveryId} no longer resolves to a safe address — refusing to send`,
      { url },
    );
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "failed", error: "URL failed SSRF re-validation" },
    });
    return;
  }

  let plainSecret: string;
  try {
    plainSecret = decryptFn(secret);
  } catch (err) {
    logger.error(
      `deliverWebhook: failed to decrypt secret for delivery ${deliveryId}`,
      { err },
    );
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "failed", error: "Secret decryption failed" },
    });
    return;
  }

  const sig = createHmac("sha256", plainSecret)
    .update(payloadStr)
    .digest("hex");
  const currentAttempts = (delivery as any).attempts + 1;

  let httpStatus = 0;
  let responseBody: string | null = null;
  let deliveryError: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const resp = await fetch(url, {
      method: "POST",
      redirect: "error", // prevent redirect-based SSRF bypassing the checks above
      headers: {
        "Content-Type": "application/json",
        "X-HRMS-Signature-256": `sha256=${sig}`,
        "X-HRMS-Event": (delivery as any).eventType,
        "X-HRMS-Delivery": deliveryId,
        "User-Agent": "HRMS-Webhooks/1.0",
      },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timer);
    httpStatus = resp.status;
    // Capture first 512 chars of body for diagnostics.
    const bodyText = await resp.text().catch(() => "");
    responseBody = bodyText.substring(0, 512);
  } catch (fetchErr: any) {
    deliveryError =
      fetchErr?.name === "AbortError"
        ? `Timeout after ${DELIVERY_TIMEOUT_MS}ms`
        : (fetchErr?.message ?? "Network error");
  }

  const succeeded = httpStatus >= 200 && httpStatus < 300;

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: succeeded ? "success" : "failed",
      httpStatus: httpStatus || null,
      attempts: currentAttempts,
      responseBody,
      deliveredAt: succeeded ? new Date() : null,
      error: deliveryError ?? (!succeeded ? `HTTP ${httpStatus}` : null),
      nextRetryAt: null, // BullMQ manages retry timing
    },
  });

  if (!succeeded) {
    logger.warn(`Webhook delivery failed: ${deliveryId}`, {
      url,
      httpStatus,
      attempt: currentAttempts,
      error: deliveryError,
    });
    // Re-throw so BullMQ retries (if attempts remaining).
    throw new Error(deliveryError ?? `HTTP ${httpStatus}`);
  }

  logger.info(`Webhook delivered: ${deliveryId} → ${url} [${httpStatus}]`, {
    eventType: (delivery as any).eventType,
    attempts: currentAttempts,
  });
}

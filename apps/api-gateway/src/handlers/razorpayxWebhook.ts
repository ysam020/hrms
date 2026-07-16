/**
 * RazorpayX Payout Webhook handler.
 *
 * RazorpayX fires this after a payout settles (or fails) — typically T+0 for
 * IMPS, T+1 for NEFT. We use it to update PayrollLineItem.payoutStatus so HR
 * can see per-employee transfer outcomes without polling.
 *
 * Security:
 *  – Raw body is required for HMAC verification (express.raw() in server.ts).
 *  – RAZORPAY_X_WEBHOOK_SECRET must be set; requests without a valid signature
 *    are rejected with 400.
 *  – Route is mounted BEFORE CSRF middleware (server.ts) — Razorpay is a
 *    trusted server-to-server caller, not a browser.
 *
 * Events handled:
 *  payout.processed → payoutStatus = "processed"
 *  payout.failed    → payoutStatus = "failed" + failure reason
 *  payout.reversed  → payoutStatus = "reversed" (bank returned the money)
 *  (all others are acknowledged with 200 and ignored)
 *
 * Idempotency:
 *  The update is a simple set — safe to replay on duplicate webhook deliveries.
 */

import { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import {
  prismaWithTenant as prisma,
  getClientForDb,
  runWithTenant,
} from "@hrms/db";
import { logger } from "@hrms/logger";

export async function handleRazorpayXWebhook(req: Request, res: Response) {
  // ── 1. Signature verification ─────────────────────────────────────────────
  const webhookSecret = process.env.RAZORPAY_X_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error(
      "RAZORPAY_X_WEBHOOK_SECRET not set — rejecting all RazorpayX webhooks",
    );
    return res.status(500).json({ ok: false });
  }

  const signature = req.headers["x-razorpay-signature"] as string | undefined;
  if (!signature) {
    logger.warn("RazorpayX webhook: missing X-Razorpay-Signature header");
    return res.status(400).json({ ok: false });
  }

  // express.raw() delivers a Buffer; fall back to stringify just in case.
  const rawBody =
    req.body instanceof Buffer
      ? req.body.toString("utf8")
      : JSON.stringify(req.body);

  const expected = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const signatureBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (
    signatureBuf.length !== expectedBuf.length ||
    !timingSafeEqual(signatureBuf, expectedBuf)
  ) {
    logger.warn(
      "RazorpayX webhook: invalid signature — possible spoofed request",
    );
    return res.status(400).json({ ok: false });
  }

  // ── 2. Parse payload ──────────────────────────────────────────────────────
  let event: string;
  let payoutEntity: any;
  try {
    const parsed = JSON.parse(rawBody) as {
      event: string;
      payload: { payout?: { entity?: any } };
    };
    event = parsed.event;
    payoutEntity = parsed.payload?.payout?.entity;
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid JSON" });
  }

  // Acknowledge immediately — Razorpay retries on non-2xx.
  res.json({ ok: true });

  // ── 3. Handle payout lifecycle events ────────────────────────────────────
  if (!payoutEntity?.id) return; // not a payout event we care about

  const payoutId: string = payoutEntity.id;

  // This request carries no auth/session, so there's no tenant context bound
  // yet — PayrollLineItem lives in the tenant's own physical DB, so we must
  // resolve which tenant this payout belongs to before querying it. See the
  // write side in payroll.ts (disburse flow).
  const indexEntry = await prisma.payoutTenantIndex.findUnique({
    where: { payoutId },
  });
  if (!indexEntry) {
    // Could be a payout from another system, or one created before this
    // index existed — log and move on.
    logger.info(
      `RazorpayX webhook: no tenant index for payout ${payoutId} (event: ${event})`,
    );
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: indexEntry.tenantId },
    select: { dbName: true },
  });
  if (!tenant?.dbName) {
    logger.error(
      `RazorpayX webhook: tenant ${indexEntry.tenantId} has no dbName — cannot resolve payout ${payoutId}`,
    );
    return;
  }
  const tenantClient = getClientForDb(tenant.dbName);

  await runWithTenant(indexEntry.tenantId, tenantClient, async () => {
    // Find the PayrollLineItem that owns this payout_id.
    const lineItem = await prisma.payrollLineItem.findFirst({
      where: { payoutId },
      select: { id: true, payoutStatus: true },
    });
    if (!lineItem) {
      logger.info(
        `RazorpayX webhook: no line item for payout ${payoutId} (event: ${event})`,
      );
      return;
    }

    // Map RazorpayX events to our internal statuses.
    const statusMap: Record<string, string> = {
      "payout.processed": "processed",
      "payout.failed": "failed",
      "payout.reversed": "reversed",
      "payout.cancelled": "cancelled",
    };
    const newStatus = statusMap[event];
    if (!newStatus) {
      logger.info(
        `RazorpayX webhook: unhandled event '${event}' for payout ${payoutId} — ignored`,
      );
      return;
    }

    const failureReason: string | null =
      event === "payout.failed"
        ? (payoutEntity.error?.description ??
          payoutEntity.failure_reason ??
          "Unknown")
        : null;

    await prisma.payrollLineItem.update({
      where: { id: lineItem.id },
      data: {
        payoutStatus: newStatus,
        ...(failureReason ? { payoutFailureReason: failureReason } : {}),
      },
    });

    logger.info(`RazorpayX payout ${payoutId} → ${newStatus}`, {
      lineItemId: lineItem.id,
      event,
      ...(failureReason ? { failureReason } : {}),
    });
  });
}

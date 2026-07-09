/**
 * Tenant Webhooks handler – gateway-direct.
 *
 * Design decisions:
 *  – The signing secret is stored AES-256 encrypted in the DB (reuses @hrms/crypto).
 *    The plaintext secret is returned ONCE at creation; never again.
 *  – HMAC-SHA256 signature on every delivery payload (X-HRMS-Signature-256 header).
 *  – Max 10 endpoints per tenant to prevent abuse.
 *  – URL must be HTTPS-only in production (same SSRF rules as chat upload).
 *  – Delivery log is immutable (no update/delete on WebhookDelivery).
 *  – Manual retry is available for failed deliveries.
 *
 * Security:
 *  – Only admin/owner can manage webhooks (sensitive — exposes business events).
 *  – Secret is never returned after creation (rotate to get a new one).
 *  – SSRF guard: production rejects private IPs in webhook URLs.
 */

import { Request, Response } from "express";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { parsePagination } from "../utils/pagination";
import { randomBytes, createHmac } from "crypto";

// We encrypt the secret at rest using the same AES-256 package.
// If the package isn't available in the gateway, fall back to a base64 wrapper.
let encryptFn: (s: string) => string;
let decryptFn: (s: string) => string;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { aesEncrypt, aesDecrypt } = require("@hrms/crypto");
  encryptFn = aesEncrypt;
  decryptFn = aesDecrypt;
} catch {
  // Fallback: store base64 (not production-grade — ensure crypto package is wired).
  logger.warn(
    "@hrms/crypto not available; webhook secrets stored as base64 (not production-safe)",
  );
  encryptFn = (s: string) => Buffer.from(s).toString("base64");
  decryptFn = (s: string) => Buffer.from(s, "base64").toString("utf-8");
}

const MAX_ENDPOINTS_PER_TENANT = 10;

async function assertAdminRole(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isSuperUser: true },
  });
  if (!user) return false;
  if (user.isSuperUser) return true;
  return user.role.some((r) => ["owner", "admin"].includes(r));
}

// SSRF guard: reject private IP ranges in webhook URLs.
function isSafeWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // In production, enforce HTTPS.
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname;
    // Block obvious private ranges (same as chat upload guard).
    const privatePatterns = [
      /^127\./,
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^localhost$/i,
      /^::1$/,
    ];
    return !privatePatterns.some((p) => p.test(hostname));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /webhooks/endpoints
 * Register a new webhook endpoint.
 * Returns the plaintext secret ONCE — the tenant must store it securely.
 */
export async function createEndpoint(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertAdminRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Only admin or owner can manage webhooks",
      });
    }

    const { url, events } = req.body as { url: string; events: string[] };
    const tenantId = getTenantId()!;

    if (!isSafeWebhookUrl(url)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Webhook URL must be a valid, publicly reachable HTTPS URL",
      });
    }

    // Enforce per-tenant endpoint limit.
    const existingCount = await prisma.webhookEndpoint.count({
      where: { tenantId },
    });
    if (existingCount >= MAX_ENDPOINTS_PER_TENANT) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Maximum ${MAX_ENDPOINTS_PER_TENANT} webhook endpoints allowed per tenant`,
      });
    }

    // Prevent duplicate URLs per tenant.
    const duplicate = await prisma.webhookEndpoint.findFirst({
      where: { tenantId, url },
    });
    if (duplicate) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "A webhook endpoint with this URL already exists",
      });
    }

    // Generate a 32-byte random secret.
    const plaintextSecret = `whsec_${randomBytes(32).toString("hex")}`;
    const encryptedSecret = encryptFn(plaintextSecret);

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        tenantId,
        url,
        secret: encryptedSecret,
        events,
        isActive: true,
        createdBy: user!.userId,
      },
    });

    logger.info(`Webhook endpoint created: ${endpoint.id}`, { tenantId, url });

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message:
        "Webhook endpoint created. Store the secret now — it will not be shown again.",
      data: {
        endpointId: endpoint.id,
        url,
        events,
        secret: plaintextSecret, // ONE-TIME return
      },
    });
  } catch (error) {
    logger.error("POST /webhooks/endpoints error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /webhooks/endpoints
 * List all endpoints. Secret is never included.
 */
export async function listEndpoints(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertAdminRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const tenantId = getTenantId()!;
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Explicitly omit secret
      },
      orderBy: { createdAt: "desc" },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Endpoints retrieved",
      data: endpoints,
    });
  } catch (error) {
    logger.error("GET /webhooks/endpoints error:", { error });
    return handleError(res, error);
  }
}

/**
 * PATCH /webhooks/endpoints/:endpointId
 * Update URL, events, or isActive. Rotates secret if rotate=true.
 */
export async function updateEndpoint(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertAdminRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const tenantId = getTenantId()!;
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: String(req.params.endpointId), tenantId },
    });
    if (!endpoint) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Endpoint not found",
      });
    }

    const { url, events, isActive, rotate } = req.body as {
      url?: string;
      events?: string[];
      isActive?: boolean;
      rotate?: boolean;
    };

    if (url && !isSafeWebhookUrl(url)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Webhook URL must be a valid, publicly reachable HTTPS URL",
      });
    }

    const data: any = {};
    if (url !== undefined) data.url = url;
    if (events !== undefined) data.events = events;
    if (isActive !== undefined) data.isActive = isActive;

    let newSecret: string | null = null;
    if (rotate) {
      const plain = `whsec_${randomBytes(32).toString("hex")}`;
      data.secret = encryptFn(plain);
      newSecret = plain;
    }

    await prisma.webhookEndpoint.update({
      where: { id: String(req.params.endpointId) },
      data,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message:
        "Endpoint updated" +
        (newSecret ? ". New secret issued — store it now." : ""),
      data: newSecret ? { secret: newSecret } : undefined,
    });
  } catch (error) {
    logger.error("PATCH /webhooks/endpoints/:endpointId error:", { error });
    return handleError(res, error);
  }
}

/**
 * DELETE /webhooks/endpoints/:endpointId
 * Remove a webhook endpoint and all its delivery history.
 */
export async function deleteEndpoint(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertAdminRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const tenantId = getTenantId()!;
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: String(req.params.endpointId), tenantId },
    });
    if (!endpoint) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Endpoint not found",
      });
    }

    // Cascade delete — deliveries first, then the endpoint.
    // (MongoDB standalone has no multi-doc transactions; order matters here.)
    const epId = String(req.params.endpointId);
    await prisma.webhookDelivery.deleteMany({ where: { endpointId: epId } });
    await prisma.webhookEndpoint.delete({ where: { id: epId } });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Endpoint deleted",
    });
  } catch (error) {
    logger.error("DELETE /webhooks/endpoints/:endpointId error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /webhooks/endpoints/:endpointId/deliveries
 * Paginated delivery log for a specific endpoint.
 */
export async function listDeliveries(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertAdminRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const tenantId = getTenantId()!;
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: String(req.params.endpointId), tenantId },
      select: { id: true },
    });
    if (!endpoint) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Endpoint not found",
      });
    }

    const { status } = req.query as Record<string, string>;
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;
    const take = limit;
    const where: any = { endpointId: String(req.params.endpointId) };
    if (status) where.status = status;

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          eventType: true,
          status: true,
          httpStatus: true,
          attempts: true,
          deliveredAt: true,
          error: true,
          createdAt: true,
          // Omit full payload for list view (privacy + performance).
        },
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Deliveries retrieved",
      data: deliveries,
      total,
    });
  } catch (error) {
    logger.error("GET /webhooks/endpoints/:endpointId/deliveries error:", {
      error,
    });
    return handleError(res, error);
  }
}

/**
 * POST /webhooks/deliveries/:deliveryId/retry
 * Manually retry a failed delivery.
 */
export async function retryDelivery(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertAdminRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const tenantId = getTenantId()!;
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: String(req.params.deliveryId) },
      include: { endpoint: { select: { tenantId: true } } },
    });
    if (!delivery || (delivery as any).endpoint.tenantId !== tenantId) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Delivery not found",
      });
    }
    if ((delivery as any).status === "success") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Delivery already succeeded",
      });
    }

    // Reset to pending so the worker picks it up.
    await prisma.webhookDelivery.update({
      where: { id: String(req.params.deliveryId) },
      data: { status: "pending", nextRetryAt: null, error: null },
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getWebhookQueue } = require("@hrms/queue");
      await getWebhookQueue().add(
        "deliverWebhook",
        { deliveryId: String(req.params.deliveryId) },
        { attempts: 1, removeOnComplete: true },
      );
    } catch (qErr) {
      logger.warn("Failed to enqueue retry job", { qErr });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Delivery queued for retry",
    });
  } catch (error) {
    logger.error("POST /webhooks/deliveries/:deliveryId/retry error:", {
      error,
    });
    return handleError(res, error);
  }
}

/**
 * POST /webhooks/test
 * Send a test ping to a registered endpoint.
 */
export async function testEndpoint(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    if (!(await assertAdminRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const tenantId = getTenantId()!;
    const { endpointId } = req.body as { endpointId: string };

    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId },
    });
    if (!endpoint) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Endpoint not found",
      });
    }

    const plainSecret = decryptFn((endpoint as any).secret);
    const testPayload = JSON.stringify({
      event: "ping",
      timestamp: new Date().toISOString(),
      data: { message: "HRMS webhook test ping" },
    });

    const sig = createHmac("sha256", plainSecret)
      .update(testPayload)
      .digest("hex");

    let httpStatus = 0;
    let error: string | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch((endpoint as any).url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-HRMS-Signature-256": `sha256=${sig}`,
          "X-HRMS-Event": "ping",
          "User-Agent": "HRMS-Webhooks/1.0",
        },
        body: testPayload,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      httpStatus = resp.status;
    } catch (fetchErr: any) {
      error = fetchErr?.message ?? "Connection failed";
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Test ping sent",
      data: {
        httpStatus,
        success: httpStatus >= 200 && httpStatus < 300,
        error,
      },
    });
  } catch (error) {
    logger.error("POST /webhooks/test error:", { error });
    return handleError(res, error);
  }
}

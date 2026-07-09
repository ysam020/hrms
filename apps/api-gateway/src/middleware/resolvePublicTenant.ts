import { Response, NextFunction, Request } from "express";
import { prisma, runWithTenant, getClientForDb } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { gatewayTenantStorage } from "./tenantContext";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

// In-memory cache: slug → { id, dbName } (avoids a DB lookup on every
// anonymous careers-page view). Mirrors authenticate.ts's dbNameCache.
const tenantBySlugCache = new Map<
  string,
  { id: string; dbName: string | null }
>();

/**
 * Resolves tenant context for public, unauthenticated routes (the careers
 * page and job-application submission) from a `:slug` URL param instead of
 * a JWT — the only other place tenant context gets established is
 * `authenticate.ts`, which anonymous visitors never go through. Establishes
 * the same two AsyncLocalStorage contexts `authenticate.ts` does, so
 * `grpcCall`'s metadata forwarding and `prismaWithTenant` both work
 * unchanged in downstream handlers.
 */
export async function resolvePublicTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";

  if (!slug || !SLUG_PATTERN.test(slug)) {
    apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: "Invalid careers link.",
    });
    return;
  }

  try {
    let tenant = tenantBySlugCache.get(slug);
    if (!tenant) {
      const row = await prisma.tenant.findUnique({
        where: { slug },
        select: { id: true, dbName: true, isActive: true },
      });
      if (!row || !row.isActive) {
        apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
          message: "This careers page doesn't exist.",
        });
        return;
      }
      tenant = { id: row.id, dbName: row.dbName };
      tenantBySlugCache.set(slug, tenant);
    }

    const tenantClient = tenant.dbName ? getClientForDb(tenant.dbName) : null;
    gatewayTenantStorage.run(
      { tenantId: tenant.id, dbName: tenant.dbName },
      () => {
        runWithTenant(tenant!.id, tenantClient, next);
      },
    );
  } catch (error: unknown) {
    logger.error("resolvePublicTenant error:", { error });
    apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

import { Response, NextFunction, Request } from "express";
import { prisma, runWithTenant, getClientForDb } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS, BoundedCache } from "@hrms/common";
import { logger } from "@hrms/logger";
import { gatewayTenantStorage } from "./tenantContext";

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

// In-memory cache: slug → { id, dbName } (avoids a DB lookup on every
// anonymous careers-page view). Mirrors authenticate.ts's dbNameCache —
// bounded LRU + idle-TTL so it doesn't accumulate entries forever.
//
// isActive is checked only on the DB read below, not on every cache hit —
// so a tenant deactivated after being cached would otherwise stay resolvable
// through this cache for as long as its careers page keeps getting hit,
// since BoundedCache's idle-TTL resets on every access rather than expiring
// on a fixed schedule. cachedAt enforces a hard ceiling on that regardless
// of access pattern, so a deactivation takes effect within a bounded window.
const SLUG_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

const tenantBySlugCache = new BoundedCache<
  string,
  { id: string; dbName: string | null; cachedAt: number }
>();

/**
 * An active tenant by its public slug, or null — shared with the public MCP
 * tools (see mcp/tools.ts), which resolve a careers page the same way.
 */
export async function lookupPublicTenant(
  slug: string,
): Promise<{ id: string; dbName: string | null } | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const cached = tenantBySlugCache.get(slug);
  if (cached && Date.now() - cached.cachedAt <= SLUG_CACHE_MAX_AGE_MS) {
    return cached;
  }
  // Missing, or past SLUG_CACHE_MAX_AGE_MS: force a fresh isActive check.
  const row = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, dbName: true, isActive: true },
  });
  if (!row || !row.isActive) return null;
  const tenant = { id: row.id, dbName: row.dbName, cachedAt: Date.now() };
  tenantBySlugCache.set(slug, tenant);
  return tenant;
}

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
    const tenant = await lookupPublicTenant(slug);
    if (!tenant) {
      apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "This careers page doesn't exist.",
      });
      return;
    }

    const tenantClient = tenant.dbName ? getClientForDb(tenant.dbName) : null;
    gatewayTenantStorage.run(
      { tenantId: tenant.id, dbName: tenant.dbName },
      () => {
        runWithTenant(tenant.id, tenantClient, next);
      },
    );
  } catch (error: unknown) {
    logger.error("resolvePublicTenant error:", { error });
    apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

import { Response } from "express";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";

// Product walkthrough progress for the signed-in person (the web app's
// apps/web/src/walkthrough). One row per tenant + user in the tenant DB; the
// identity comes only from the access token, so nobody can read or write
// anyone else's. The state is small and holds no HR data — tour statuses,
// step ids, a route — and is rebuilt field by field here before it's stored.

export const WALKTHROUGH_SCHEMA = 1;
const MAX_BYTES = 32 * 1024;
const MAX_TOURS = 64;
const MAX_IDS = 400;
const ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const STATUSES = new Set([
  "not_started",
  "running",
  "paused",
  "completed",
  "dismissed",
]);

const isoOr = (v: unknown, fallback: string) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback;

const ids = (v: unknown) =>
  Array.isArray(v)
    ? [...new Set(v.filter((x) => typeof x === "string" && ID.test(x)))].slice(
        0,
        MAX_IDS,
      )
    : [];

/**
 * Validate and rebuild a walkthrough state. Unknown fields are dropped and
 * malformed tours are left out; a body that isn't a state at all, or is
 * too large, is refused.
 */
export function sanitizeWalkthroughState(
  raw: unknown,
):
  | { ok: true; state: Record<string, unknown> }
  | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, message: "Unsupported walkthrough state." };
  if (JSON.stringify(raw).length > MAX_BYTES)
    return { ok: false, message: "Walkthrough state is too large." };
  const r = raw as Record<string, any>;
  if (
    r.schema !== WALKTHROUGH_SCHEMA ||
    !r.tours ||
    typeof r.tours !== "object"
  )
    return { ok: false, message: "Unsupported walkthrough state." };

  const now = new Date().toISOString();
  const tours: Record<string, unknown> = {};
  for (const [key, t] of Object.entries(r.tours as Record<string, any>).slice(
    0,
    MAX_TOURS,
  )) {
    if (!ID.test(key) || !t || typeof t !== "object") continue;
    if (!STATUSES.has(t.status)) continue;
    tours[key] = {
      status: t.status,
      stepId:
        typeof t.stepId === "string" && ID.test(t.stepId) ? t.stepId : null,
      seen: ids(t.seen),
      skipped: ids(t.skipped),
      lastRoute:
        typeof t.lastRoute === "string" &&
        t.lastRoute.startsWith("/") &&
        !t.lastRoute.startsWith("//")
          ? t.lastRoute.slice(0, 300)
          : null,
      updatedAt: isoOr(t.updatedAt, now),
    };
  }
  return {
    ok: true,
    state: {
      schema: WALKTHROUGH_SCHEMA,
      version: Number.isInteger(r.version) ? r.version : 0,
      active: typeof r.active === "string" && tours[r.active] ? r.active : null,
      tours,
      updatedAt: isoOr(r.updatedAt, now),
    },
  };
}

function caller(req: AuthRequest) {
  return {
    userId: req.user!.userId,
    tenantId: (getTenantId() ?? req.user!.tenantId)!,
  };
}

/** GET /walkthrough/progress → { state } (null before the first save). */
export async function getWalkthroughProgress(req: AuthRequest, res: Response) {
  try {
    const { tenantId, userId } = caller(req);
    const row = await prisma.walkthroughProgress.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { state: true },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { state: row?.state ?? null },
    });
  } catch (error: unknown) {
    logger.error("getWalkthroughProgress error:", { error });
    return handleError(res, error);
  }
}

/** PUT /walkthrough/progress — body: { state } */
export async function saveWalkthroughProgress(req: AuthRequest, res: Response) {
  try {
    const { tenantId, userId } = caller(req);
    const result = sanitizeWalkthroughState(req.body?.state);
    if (!result.ok)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: result.message,
      });
    await prisma.walkthroughProgress.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        schema: WALKTHROUGH_SCHEMA,
        state: result.state as any,
      },
      update: { schema: WALKTHROUGH_SCHEMA, state: result.state as any },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { state: result.state },
    });
  } catch (error: unknown) {
    logger.error("saveWalkthroughProgress error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /walkthrough/progress — forget all tour progress. */
export async function resetWalkthroughProgress(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { tenantId, userId } = caller(req);
    await prisma.walkthroughProgress.deleteMany({
      where: { tenantId, userId },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { state: null },
    });
  } catch (error: unknown) {
    logger.error("resetWalkthroughProgress error:", { error });
    return handleError(res, error);
  }
}

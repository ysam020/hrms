import { Response } from "express";
import { getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import {
  clearMessage,
  listPeople,
  ownPresence,
  resolveViewer,
  restoreStatus,
  setStatus,
  viewsFor,
  visiblePeople,
  type PeopleQuery,
  type WriteResult,
} from "../services/presence";
import { cleanMessage } from "../services/presenceRules";
import { HEARTBEAT_MS } from "../services/presenceConnectivity";

// Employee availability (docs/presence.md). Bodies and queries are checked
// by the zod schemas in schemas.ts before these run.
//
//   GET    /presence/me          own status + client settings
//   PUT    /presence/me          pick a status / change the message
//   POST   /presence/me/restore  back to the previous status (or Available)
//   DELETE /presence/me/message  clear the message, keep the status
//   GET    /presence?ids=…       presence of visible people, batched
//   GET    /presence/people      the Availability page's list
//
// Only the signed-in person's own status can be changed; there is no route
// that takes another person's id for a write.

/** Seconds without input before a session counts as idle (60–3600). */
export function idleAfterSeconds(): number {
  const v = Number(process.env.PRESENCE_IDLE_SECONDS);
  return Number.isFinite(v) && v >= 60 && v <= 3600 ? Math.round(v) : 300;
}

function caller(req: AuthRequest) {
  return {
    userId: req.user!.userId,
    tenantId: (getTenantId() ?? req.user!.tenantId)!,
  };
}

const sendWrite = (res: Response, r: WriteResult) =>
  apiResponse(res, RESPONSE_STATUS.SUCCESS, {
    data: { presence: r.presence, changed: r.changed },
  });

export async function getMyPresence(req: AuthRequest, res: Response) {
  try {
    const { tenantId, userId } = caller(req);
    const presence = await ownPresence(tenantId, userId);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        presence,
        config: {
          idleAfterSeconds: idleAfterSeconds(),
          heartbeatSeconds: HEARTBEAT_MS / 1000,
        },
      },
    });
  } catch (error: unknown) {
    logger.error("getMyPresence error:", { error });
    return handleError(res, error);
  }
}

export async function updateMyPresence(req: AuthRequest, res: Response) {
  try {
    const { tenantId, userId } = caller(req);
    const { availability, message, duration, timeZone } = req.body;
    const result = await setStatus(tenantId, userId, {
      availability,
      message: message === undefined ? undefined : cleanMessage(message),
      duration,
      timeZone,
    });
    return sendWrite(res, result);
  } catch (error: unknown) {
    logger.error("updateMyPresence error:", { error });
    return handleError(res, error);
  }
}

export async function restoreMyPresence(req: AuthRequest, res: Response) {
  try {
    const { tenantId, userId } = caller(req);
    return sendWrite(res, await restoreStatus(tenantId, userId));
  } catch (error: unknown) {
    logger.error("restoreMyPresence error:", { error });
    return handleError(res, error);
  }
}

export async function clearMyPresenceMessage(req: AuthRequest, res: Response) {
  try {
    const { tenantId, userId } = caller(req);
    return sendWrite(res, await clearMessage(tenantId, userId));
  } catch (error: unknown) {
    logger.error("clearMyPresenceMessage error:", { error });
    return handleError(res, error);
  }
}

/** People the caller may not see are left out, not reported as errors. */
export async function getPresenceBatch(req: AuthRequest, res: Response) {
  try {
    const { tenantId, userId } = caller(req);
    const viewer = await resolveViewer(tenantId, userId, req.user!.tenantRole);
    const people = await visiblePeople(viewer, req.query.ids as any);
    const views = await viewsFor(tenantId, people);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { presence: [...views.values()] },
    });
  } catch (error: unknown) {
    logger.error("getPresenceBatch error:", { error });
    return handleError(res, error);
  }
}

export async function getPresencePeople(req: AuthRequest, res: Response) {
  try {
    const { tenantId, userId } = caller(req);
    const q = req.query as unknown as PeopleQuery;
    const viewer = await resolveViewer(tenantId, userId, req.user!.tenantRole);
    if (q.scope === "organisation" && !viewer.orgWide)
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can see the availability of your own teams only.",
      });
    const result = await listPeople(viewer, q);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        ...result,
        page: q.page,
        limit: q.limit,
        scopes: {
          team: viewer.teammates.size > 0,
          organisation: viewer.orgWide,
        },
      },
    });
  } catch (error: unknown) {
    logger.error("getPresencePeople error:", { error });
    return handleError(res, error);
  }
}

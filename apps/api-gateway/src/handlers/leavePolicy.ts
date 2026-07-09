import { Response } from "express";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";
import { getActiveSettings, writeVersionedSettings } from "./tenantSettings";

/** GET /leave-policy — the per-leave-type policy list only, not the whole org-settings form. */
export async function getLeavePolicy(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  try {
    const active = await getActiveSettings(tenantId);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { leavePolicies: active?.leavePolicies ?? [] },
    });
  } catch (error: unknown) {
    logger.error("getLeavePolicy error:", { error });
    return handleError(res, error);
  }
}

/**
 * PUT /leave-policy
 * Body: { leavePolicies: LeavePolicy[], effectiveFrom?, note? }
 * Writes a new versioned TenantSettings row patching just leavePolicies, so
 * this page doesn't need to resubmit Attendance/HR fields it never touched.
 */
export async function updateLeavePolicy(req: AuthRequest, res: Response) {
  const { userId, tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  const superUser = await isSuperUser(userId);
  const isPrivileged =
    superUser || ["owner", "admin"].includes(req.user!.tenantRole ?? "");
  if (!isPrivileged) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can update leave policy.",
    });
  }
  try {
    const {
      leavePolicies,
      effectiveFrom: rawEffectiveFrom,
      note,
    } = req.body as {
      leavePolicies: any[];
      effectiveFrom?: string;
      note?: string;
    };

    let effectiveFrom: Date;
    if (rawEffectiveFrom) {
      effectiveFrom = new Date(rawEffectiveFrom);
      if (isNaN(effectiveFrom.getTime())) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: "Invalid effectiveFrom date.",
        });
      }
    } else {
      effectiveFrom = new Date();
    }

    const { settings, message } = await writeVersionedSettings(
      tenantId,
      userId,
      { leavePolicies },
      effectiveFrom,
      note,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { leavePolicies: settings.leavePolicies },
      message,
    });
  } catch (error: any) {
    if (error?.message && !error?.code) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: error.message,
      });
    }
    logger.error("updateLeavePolicy error:", { error });
    return handleError(res, error);
  }
}

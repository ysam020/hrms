import { Request, Response } from "express";
import { z } from "zod";
import { leaveCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, errorMessage } from "@hrms/common";
import { validateBody } from "../middleware/validate";
import { resolveUsername, isSuperUser } from "../utils/userHelpers";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const addLeaveSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
  leaveType: z.string().min(1).max(50),
  reason: z.string().max(500).optional().default(""),
  sick_leave: z.boolean().optional().default(false),
  medicalCertificate: z.string().max(500).optional().default(""),
});

const updateLeaveStatusSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  leaveId: z.string().min(1).max(100),
});

export const validateAddLeave = validateBody(addLeaveSchema);
export const validateUpdateLeaveStatus = validateBody(updateLeaveStatusSchema);

export async function addLeave(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const username = await resolveUsername(user!.userId);
    if (!username)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const { from, to, leaveType, reason, sick_leave, medicalCertificate } =
      req.body;
    const response = await leaveCall("applyLeave", {
      username,
      leaveType,
      from,
      to,
      reason: reason || "",
      sickLeave: sick_leave || false,
      medicalCertificate: medicalCertificate || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    logger.error("POST /add-leave error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getLeaveApplications(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const superUser = await isSuperUser(user!.userId);
    let username: string | undefined;

    if (superUser && req.query.username) {
      // Superusers may query any employee's leaves
      username = req.query.username as string;
    } else {
      // Everyone else can only see their own leaves
      username = (await resolveUsername(user!.userId)) ?? undefined;
    }

    const response = await leaveCall("getLeaves", {
      userId: username,
      status: req.query.status || "",
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    logger.error("GET /get-leave-applications error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function updateLeaveStatus(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { action, leaveId } = req.body;
    if (!leaveId || !action)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "leaveId and action are required",
      });

    let method: string;
    let payload: Record<string, any>;

    if (action === "approve") {
      method = "approveLeave";
      const approverUsername = await resolveUsername(user!.userId);
      payload = { id: leaveId, approvedByUsername: approverUsername };
    } else if (action === "reject") {
      method = "rejectLeave";
      payload = { id: leaveId };
    } else if (action === "cancel") {
      method = "cancelLeave";
      const username = await resolveUsername(user!.userId);
      payload = { id: leaveId, username };
    } else {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid action. Use approve, reject or cancel",
      });
    }

    const response = await leaveCall(method, payload);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    logger.error("PUT /update-leave-status error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getAvailablePaidLeaves(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const superUser = await isSuperUser(user!.userId);
    let username: string | undefined;

    if (superUser && req.params.username) {
      // Superusers may query any employee's balance
      username = String(req.params.username);
    } else {
      // Everyone else is scoped to their own balance
      username = (await resolveUsername(user!.userId)) ?? undefined;
    }

    if (!username)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const response = await leaveCall("getLeaveBalance", {
      username,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    logger.error("GET /get-available-paid-leaves error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}
